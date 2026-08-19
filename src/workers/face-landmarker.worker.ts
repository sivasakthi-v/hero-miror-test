/// <reference lib="webworker" />
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { WorkerRequest, WorkerResponse } from '@/engine/vision/types';

/**
 * Face inference, off the main thread.
 *
 * Nothing here touches the DOM or React — it receives an ImageBitmap, returns numbers.
 * Keeping it in a worker is what stops a 20ms inference from eating a frame of the
 * render loop (docs/PLAN.md §24).
 *
 * The WASM and the model are loaded from our own origin, never a CDN. That is what makes
 * "your camera feed never leaves your device" literally true rather than nearly true:
 * with a CDN, a third party would at minimum learn that you opened this page.
 */

let landmarker: FaceLandmarker | null = null;

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

interface Attempt {
  /**
   * Selects MediaPipe's ES-module wasm build (`vision_wasm_module_internal.js`) over the
   * classic one. This worker is `type: 'module'`, and importing the classic glue from a
   * module leaves its factory module-scoped rather than global — MediaPipe then fails
   * with "ModuleFactory not set", which reads like a corrupt download and sends you
   * hunting through file paths instead. It is the second, easily-missed argument to
   * forVisionTasks.
   */
  moduleBuild: boolean;
  delegate: 'GPU' | 'CPU';
}

/**
 * Ordered by preference. GPU on the module build is the normal path; CPU covers workers
 * without WebGL2 (older devices, some Linux setups); the classic build is a last resort
 * for browsers old enough to lack WASM SIMD, for which no module variant is shipped.
 */
const ATTEMPTS: Attempt[] = [
  { moduleBuild: true, delegate: 'GPU' },
  { moduleBuild: true, delegate: 'CPU' },
  { moduleBuild: false, delegate: 'CPU' },
];

async function createLandmarker(
  wasmPath: string,
  modelPath: string,
  attempt: Attempt,
): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath, attempt.moduleBuild);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate: attempt.delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    // Blendshapes drive the expression states (blueprint §47) and cost little.
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
}

async function init(wasmPath: string, modelPath: string): Promise<void> {
  let last: unknown = null;

  for (const attempt of ATTEMPTS) {
    try {
      landmarker = await createLandmarker(wasmPath, modelPath, attempt);
      post({ type: 'ready', delegate: attempt.delegate });
      return;
    } catch (error) {
      last = error;
    }
  }

  post({ type: 'error', message: last instanceof Error ? last.message : String(last) });
}

function detect(bitmap: ImageBitmap, timestamp: number): void {
  if (!landmarker) {
    bitmap.close();
    return;
  }

  try {
    const result = landmarker.detectForVideo(bitmap, timestamp);
    const face = result.faceLandmarks[0];
    const shapes = result.faceBlendshapes[0];

    post({
      type: 'result',
      timestamp,
      landmarks: face ?? null,
      blendshapes: shapes
        ? Object.fromEntries(shapes.categories.map((c) => [c.categoryName, c.score]))
        : null,
    });
  } catch (error) {
    // detectForVideo throws on a non-monotonic timestamp. Report rather than die: the
    // client drops the frame and the next one succeeds.
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    // Always release the bitmap — a leak here is a few MB per frame.
    bitmap.close();
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      void init(message.wasmPath, message.modelPath);
      break;
    case 'detect':
      detect(message.bitmap, message.timestamp);
      break;
    case 'close':
      landmarker?.close();
      landmarker = null;
      self.close();
      break;
  }
};
