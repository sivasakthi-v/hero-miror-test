import { useCallback, useEffect, useRef, useState } from 'react';
import { ART_MODES, randomArtMode, type ArtModeId } from '@/content/art-modes';
import { createAmbientField } from '@/engine/render/ambient';
import { renderFrame, type QualityTier } from '@/engine/render/compositor';
import { createParticleField, type ParticleField } from '@/engine/render/particles';
import { createSceneSampler } from '@/engine/render/exposure';
import { createReactionState, updateReactions } from '@/engine/render/reactions';
import { createViewport } from '@/engine/transform/viewport';
import { nextExpressionState, type ExpressionState } from '@/engine/vision/expression';
import { createFaceTracker, type FaceTracker } from '@/engine/vision/landmarker-client';

/**
 * Owns the render loop. Runs at display refresh and always draws the newest face state
 * available — it never waits for inference, which runs on its own slower clock. The two
 * loops being decoupled is what keeps the picture smooth while the model runs at 30fps
 * (docs/PLAN.md §33).
 */
export interface UseFaceTracking {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ambientRef: React.RefObject<HTMLCanvasElement | null>;
  artMode: ArtModeId;
  setArtMode: (mode: ArtModeId) => void;
  /** 0..1 specular sweep across the frame, lit by a smile. */
  shineRef: React.RefObject<number>;
  /** Live signals for the debug HUD — tuning thresholds needs real numbers, not guesses. */
  telemetryRef: React.RefObject<Telemetry>;
  start: (video: HTMLVideoElement) => void;
  stop: () => void;
}

export interface Telemetry {
  expression: ExpressionState;
  smile: number;
  sadness: number;
  surprise: number;
  particles: number;
  gain: number;
  luma: number;
  tier: QualityTier;
}

export interface FaceTrackingCallbacks {
  onReady: (delegate: 'GPU' | 'CPU') => void;
  onFailed: (message: string) => void;
  onPresenceChange: (present: boolean) => void;
  debug: boolean;
}

/** How long the treatment takes to arrive once a face appears (blueprint beat 02). */
const REVEAL_MS = 1200;

/** Rolling frame time above this drops a tier; below the lower one, we climb back. */
const TIER_DOWN_MS = 26;
const TIER_UP_MS = 14;

/** The ambient sample is a getImageData call — 8fps is plenty for a slow colour wash. */
const AMBIENT_INTERVAL_MS = 125;

export function useFaceTracking(callbacks: FaceTrackingCallbacks): UseFaceTracking {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ambientRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const shineRef = useRef(0);
  const handlers = useRef(callbacks);
  handlers.current = callbacks;

  // One look per page load, then stable for the visit (DECISIONS.md D7).
  const [artMode, setArtMode] = useState<ArtModeId>(() => randomArtMode());
  const artModeRef = useRef(artMode);
  artModeRef.current = artMode;

  const revealStartRef = useRef<number | null>(null);
  const tierRef = useRef<QualityTier>('high');
  const frameTimeRef = useRef(16);
  const lastFrameAtRef = useRef(0);
  const lastAmbientAtRef = useRef(0);
  const particlesRef = useRef<ParticleField | null>(null);
  const ambientFieldRef = useRef(createAmbientField());
  const sceneRef = useRef(createSceneSampler());
  const telemetryRef = useRef<Telemetry>({
    expression: 'neutral', smile: 0, sadness: 0, surprise: 0,
    particles: 0, gain: 1, luma: 0.5, tier: 'high',
  });
  const reactionRef = useRef(createReactionState(0));
  const expressionRef = useRef<ExpressionState>('neutral');

  const renderLoop = useCallback((now: number) => {
    frameRef.current = requestAnimationFrame(renderLoop);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!canvas || !video || !tracker || video.videoWidth === 0) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dt = lastFrameAtRef.current === 0 ? 16 : now - lastFrameAtRef.current;
    // Rolling average, not the last frame: one slow frame is noise, a slow second is a
    // signal. Hysteresis between the two thresholds stops the tier oscillating.
    if (lastFrameAtRef.current > 0) frameTimeRef.current = frameTimeRef.current * 0.9 + dt * 0.1;
    lastFrameAtRef.current = now;

    if (frameTimeRef.current > TIER_DOWN_MS && tierRef.current !== 'lite') {
      tierRef.current = tierRef.current === 'high' ? 'balanced' : 'lite';
      particlesRef.current = createParticleField(tierRef.current);
    } else if (frameTimeRef.current < TIER_UP_MS && tierRef.current !== 'high') {
      tierRef.current = tierRef.current === 'lite' ? 'balanced' : 'high';
      particlesRef.current = createParticleField(tierRef.current);
    }
    particlesRef.current ??= createParticleField(tierRef.current);

    const face = tracker.getState();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mode = ART_MODES[artModeRef.current];

    // One pixel readback per interval feeds both auto-exposure and the ambient backdrop.
    if (now - lastAmbientAtRef.current > AMBIENT_INTERVAL_MS) {
      lastAmbientAtRef.current = now;
      const analysis = sceneRef.current.sample(video);
      ambientFieldRef.current.update(analysis.quadrants, mode, AMBIENT_INTERVAL_MS);
    }
    const scene = sceneRef.current.current;

    // The reveal runs once, from the first sighting. Re-running it every time someone
    // leans out of frame would turn a nice moment into a flicker.
    if (face.present && revealStartRef.current === null) revealStartRef.current = now;
    const progress =
      revealStartRef.current === null ? 0 : Math.min((now - revealStartRef.current) / REVEAL_MS, 1);

    const viewport = createViewport({
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      width: rect.width,
      height: rect.height,
      devicePixelRatio: window.devicePixelRatio,
      mirrored: true,
    });

    if (face.present) {
      expressionRef.current = nextExpressionState(expressionRef.current, {
        smile: face.expression.smile,
        sadness: face.expression.sadness,
        surprise: face.expression.surprise,
      });
    } else {
      expressionRef.current = 'neutral';
    }

    updateReactions({
      state: reactionRef.current,
      expression: expressionRef.current,
      mode,
      field: particlesRef.current,
      viewport,
      now,
      dtMs: dt,
      reducedMotion,
    });
    shineRef.current = reactionRef.current.shine;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderFrame(canvas, ctx, {
      video,
      face,
      viewport,
      mode,
      particles: particlesRef.current,
      progress,
      time: now,
      reducedMotion,
      tier: tierRef.current,
      scene,
      debug: handlers.current.debug,
    });

    // The backdrop: drawn from the colours sampled above.
    const ambientCanvas = ambientRef.current;
    if (ambientCanvas && tierRef.current !== 'lite') {
      const ambientRect = ambientCanvas.getBoundingClientRect();
      const w = Math.round(ambientRect.width / 2);
      const h = Math.round(ambientRect.height / 2);
      if (w > 0 && h > 0) {
        if (ambientCanvas.width !== w || ambientCanvas.height !== h) {
          ambientCanvas.width = w;
          ambientCanvas.height = h;
        }
        const actx = ambientCanvas.getContext('2d');
        // Half resolution: it is a blurred wash, and nobody can see the difference.
        if (actx) ambientFieldRef.current.draw(actx, w, h, now);
      }
    }

    telemetryRef.current = {
      expression: expressionRef.current,
      smile: face.expression.smile,
      sadness: face.expression.sadness,
      surprise: face.expression.surprise,
      particles: particlesRef.current.liveCount,
      gain: scene.gain,
      luma: scene.luma,
      tier: tierRef.current,
    };
  }, []);

  useEffect(() => {
    const tracker = createFaceTracker({
      onReady: (delegate) => handlers.current.onReady(delegate),
      onFailed: (message) => handlers.current.onFailed(message),
      onPresenceChange: (present) => handlers.current.onPresenceChange(present),
    });
    trackerRef.current = tracker;
    reactionRef.current = createReactionState(performance.now());
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

  return { canvasRef, ambientRef, artMode, setArtMode, shineRef, telemetryRef, start, stop };
}
