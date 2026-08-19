import { deriveAnchors, deriveExpression, NEUTRAL_EXPRESSION } from './anchors';
import { smoothExpression, smoothLandmarks } from './smoothing';
import type { FaceState, WorkerRequest, WorkerResponse } from './types';

/**
 * Main-thread half of the face pipeline.
 *
 * Holds the latest face state in a mutable object that the render loop reads directly.
 * It is deliberately not React state: at 30 results a second, routing this through a
 * component would re-render the tree 30 times a second to move a pencil line
 * (docs/PLAN.md §3).
 */

/**
 * Inference input width. The model resizes to 256 internally, so anything beyond this is
 * work thrown away — and shrinking on the main thread costs less than shipping a 1080p
 * bitmap to the worker every frame. Landmarks come back normalised, so the downscale is
 * invisible to everything downstream (docs/PLAN.md R1).
 */
const INFERENCE_WIDTH = 480;

/** 24-30fps is plenty for a face. A 120Hz display must not drag ML along with it. */
const MIN_INFERENCE_INTERVAL_MS = 1000 / 30;

/**
 * Budget for the whole vision boot: ~7MB of wasm plus model over a slow connection.
 * Generous, but finite — an unbounded wait is indistinguishable from a hang.
 */
const INIT_TIMEOUT_MS = 20_000;

/** How long a face may be missing before we admit it is gone. */
const FACE_LOST_GRACE_MS = 400;

export interface FaceTracker {
  start(video: HTMLVideoElement): void;
  stop(): void;
  getState(): FaceState;
  dispose(): void;
}

export interface FaceTrackerEvents {
  onReady: (delegate: 'GPU' | 'CPU') => void;
  onFailed: (message: string) => void;
  onPresenceChange: (present: boolean) => void;
}

export function createFaceTracker(events: FaceTrackerEvents): FaceTracker {
  const base = import.meta.env.BASE_URL;
  const worker = new Worker(new URL('../../workers/face-landmarker.worker.ts', import.meta.url), {
    type: 'module',
  });

  const state: FaceState = {
    present: false,
    landmarks: [],
    anchors: null,
    expression: NEUTRAL_EXPRESSION,
    timestamp: 0,
  };

  let video: HTMLVideoElement | null = null;
  let running = false;
  let busy = false;
  let disposed = false;
  let lastSentAt = 0;
  let lastResultAt = 0;
  let lastSeenAt = 0;
  /** detectForVideo throws on a timestamp that does not advance. */
  let lastTimestamp = -1;
  let rafId: number | null = null;
  let frameCallbackId: number | null = null;

  worker.postMessage({
    type: 'init',
    wasmPath: `${base}wasm`,
    modelPath: `${base}models/face_landmarker.task`,
  } satisfies WorkerRequest);

  let ready = false;

  function fail(message: string): void {
    if (ready || disposed) return;
    ready = true;
    events.onFailed(message);
  }

  /**
   * A worker that throws before it can reply — a bad model path, no WebGL, a CSP that
   * blocks the wasm — would otherwise leave the hero on "getting my pencils" forever
   * with nothing in the console. Both of these failures are silent by default, so both
   * are made loud here.
   */
  worker.onerror = (event) => fail(event.message || 'face worker failed to start');
  worker.onmessageerror = () => fail('face worker sent a message we could not read');

  const initTimer = setTimeout(() => {
    fail('face model did not load in time');
  }, INIT_TIMEOUT_MS);

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === 'ready') {
      ready = true;
      clearTimeout(initTimer);
      events.onReady(message.delegate);
      return;
    }
    if (message.type === 'error') {
      // A per-frame failure must not kill the experience; only report it if we never
      // got going at all.
      if (!ready) {
        clearTimeout(initTimer);
        fail(message.message);
      }
      busy = false;
      return;
    }

    busy = false;
    const now = performance.now();
    const dt = lastResultAt === 0 ? 16 : now - lastResultAt;
    lastResultAt = now;

    if (message.landmarks && message.landmarks.length > 0) {
      state.landmarks = smoothLandmarks(
        state.present ? state.landmarks : null,
        message.landmarks,
        dt,
      );
      state.anchors = deriveAnchors(state.landmarks);
      state.expression = smoothExpression(
        state.expression,
        deriveExpression(message.blendshapes),
        dt,
      );
      state.timestamp = message.timestamp;
      lastSeenAt = now;
      if (!state.present) {
        state.present = true;
        events.onPresenceChange(true);
      }
      return;
    }

    // A face is not "lost" the instant one frame misses it — people blink, turn, and the
    // detector drops a frame now and then. Without the grace period the copy would
    // flicker between "there you are" and "come back" while someone sits still.
    if (state.present && now - lastSeenAt > FACE_LOST_GRACE_MS) {
      state.present = false;
      state.anchors = null;
      events.onPresenceChange(false);
    }
  };

  async function pump(): Promise<void> {
    if (!running || busy || disposed || !video) return;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const now = performance.now();
    if (now - lastSentAt < MIN_INFERENCE_INTERVAL_MS) return;
    lastSentAt = now;

    // Strictly increasing, even if two frames land inside the same millisecond.
    const timestamp = Math.max(Math.round(now), lastTimestamp + 1);
    lastTimestamp = timestamp;

    busy = true;
    try {
      const height = Math.round((video.videoHeight / video.videoWidth) * INFERENCE_WIDTH);
      const bitmap = await createImageBitmap(video, {
        resizeWidth: INFERENCE_WIDTH,
        resizeHeight: height,
        resizeQuality: 'low',
      });
      if (disposed) {
        bitmap.close();
        return;
      }
      worker.postMessage({ type: 'detect', bitmap, timestamp } satisfies WorkerRequest, [bitmap]);
    } catch {
      // The frame vanished mid-grab (track ended, tab hid). Skip it.
      busy = false;
    }
  }

  function scheduleNext(): void {
    if (!running || !video) return;

    // requestVideoFrameCallback fires on the video's own cadence rather than the
    // display's, so we sample frames that actually exist (docs/PLAN.md §33).
    if ('requestVideoFrameCallback' in video) {
      frameCallbackId = video.requestVideoFrameCallback(() => {
        void pump();
        scheduleNext();
      });
      return;
    }
    rafId = requestAnimationFrame(() => {
      void pump();
      scheduleNext();
    });
  }

  return {
    start(element: HTMLVideoElement): void {
      video = element;
      running = true;
      scheduleNext();
    },
    stop(): void {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (frameCallbackId !== null && video && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
      rafId = null;
      frameCallbackId = null;
    },
    getState: () => state,
    dispose(): void {
      disposed = true;
      clearTimeout(initTimer);
      this.stop();
      worker.postMessage({ type: 'close' } satisfies WorkerRequest);
      worker.terminate();
    },
  };
}
