import { useCallback, useEffect, useRef } from 'react';
import { drawDebugFace, resizeCanvas } from '@/engine/render/debug-overlay';
import { createViewport } from '@/engine/transform/viewport';
import { createFaceTracker, type FaceTracker } from '@/engine/vision/landmarker-client';

/**
 * Owns the render loop. Runs at display refresh and always draws the newest face state
 * available — it never waits for inference, which runs on its own slower clock. The two
 * loops being decoupled is what keeps the drawing smooth while the model runs at 30fps
 * (docs/PLAN.md §33).
 */
export interface UseFaceTracking {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  start: (video: HTMLVideoElement) => void;
  stop: () => void;
}

export interface FaceTrackingCallbacks {
  onReady: (delegate: 'GPU' | 'CPU') => void;
  onFailed: (message: string) => void;
  onPresenceChange: (present: boolean) => void;
  debug: boolean;
}

export function useFaceTracking(callbacks: FaceTrackingCallbacks): UseFaceTracking {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<number | null>(null);
  // Callbacks live in a ref so a re-render never tears down the worker.
  const handlers = useRef(callbacks);
  handlers.current = callbacks;

  const renderFrame = useCallback(() => {
    frameRef.current = requestAnimationFrame(renderFrame);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!canvas || !video || !tracker || video.videoWidth === 0) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const viewport = createViewport({
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      width: rect.width,
      height: rect.height,
      devicePixelRatio: window.devicePixelRatio,
      mirrored: true,
    });

    resizeCanvas(canvas, viewport);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (handlers.current.debug) {
      drawDebugFace(ctx, tracker.getState(), viewport);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    const tracker = createFaceTracker({
      onReady: (delegate) => handlers.current.onReady(delegate),
      onFailed: (message) => handlers.current.onFailed(message),
      onPresenceChange: (present) => handlers.current.onPresenceChange(present),
    });
    trackerRef.current = tracker;
    frameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      tracker.dispose();
      trackerRef.current = null;
    };
  }, [renderFrame]);

  const start = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;
    trackerRef.current?.start(video);
  }, []);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
  }, []);

  return { canvasRef, start, stop };
}
