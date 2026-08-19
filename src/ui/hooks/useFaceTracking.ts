import { useCallback, useEffect, useRef, useState } from 'react';
import { ART_MODES, randomArtMode, type ArtModeId } from '@/content/art-modes';
import { renderFrame, type QualityTier } from '@/engine/render/compositor';
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
  artMode: ArtModeId;
  setArtMode: (mode: ArtModeId) => void;
  start: (video: HTMLVideoElement) => void;
  stop: () => void;
}

export interface FaceTrackingCallbacks {
  onReady: (delegate: 'GPU' | 'CPU') => void;
  onFailed: (message: string) => void;
  onPresenceChange: (present: boolean) => void;
  debug: boolean;
}

/** How long the drawing takes to appear once a face arrives (blueprint beat 02). */
const REVEAL_MS = 1400;

/** Rolling frame time above this drops a tier; below the lower one, we climb back. */
const TIER_DOWN_MS = 26;
const TIER_UP_MS = 14;

export function useFaceTracking(callbacks: FaceTrackingCallbacks): UseFaceTracking {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const handlers = useRef(callbacks);
  handlers.current = callbacks;

  // One mode per page load, then stable for the visit (DECISIONS.md D7).
  const [artMode, setArtMode] = useState<ArtModeId>(() => randomArtMode());
  const artModeRef = useRef(artMode);
  artModeRef.current = artMode;

  const revealStartRef = useRef<number | null>(null);
  const tierRef = useRef<QualityTier>('high');
  const frameTimeRef = useRef(16);
  const lastFrameAtRef = useRef(0);

  const renderLoop = useCallback((now: number) => {
    frameRef.current = requestAnimationFrame(renderLoop);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!canvas || !video || !tracker || video.videoWidth === 0) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Rolling average, not the last frame: one slow frame is noise, a slow second is a
    // signal. Hysteresis between the two thresholds stops the tier oscillating.
    if (lastFrameAtRef.current > 0) {
      frameTimeRef.current = frameTimeRef.current * 0.9 + (now - lastFrameAtRef.current) * 0.1;
    }
    lastFrameAtRef.current = now;
    if (frameTimeRef.current > TIER_DOWN_MS && tierRef.current !== 'lite') {
      tierRef.current = tierRef.current === 'high' ? 'balanced' : 'lite';
    } else if (frameTimeRef.current < TIER_UP_MS && tierRef.current !== 'high') {
      tierRef.current = tierRef.current === 'lite' ? 'balanced' : 'high';
    }

    const face = tracker.getState();

    // The reveal runs once, from the first sighting. Re-running it every time someone
    // leans out of frame would turn a nice moment into a flicker.
    if (face.present && revealStartRef.current === null) revealStartRef.current = now;
    const progress =
      revealStartRef.current === null
        ? 0
        : Math.min((now - revealStartRef.current) / REVEAL_MS, 1);

    const viewport = createViewport({
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      width: rect.width,
      height: rect.height,
      devicePixelRatio: window.devicePixelRatio,
      mirrored: true,
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderFrame(canvas, ctx, {
      face,
      viewport,
      mode: ART_MODES[artModeRef.current],
      progress,
      time: now,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      tier: tierRef.current,
      debug: handlers.current.debug,
    });
  }, []);

  useEffect(() => {
    const tracker = createFaceTracker({
      onReady: (delegate) => handlers.current.onReady(delegate),
      onFailed: (message) => handlers.current.onFailed(message),
      onPresenceChange: (present) => handlers.current.onPresenceChange(present),
    });
    trackerRef.current = tracker;
    frameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      tracker.dispose();
      trackerRef.current = null;
    };
  }, [renderLoop]);

  const start = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;
    trackerRef.current?.start(video);
  }, []);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
  }, []);

  return { canvasRef, artMode, setArtMode, start, stop };
}
