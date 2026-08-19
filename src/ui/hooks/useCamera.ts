import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createCameraManager } from '@/engine/camera/camera-manager';
import { CameraError, type CameraManager } from '@/engine/camera/camera-types';
import { checkSupport } from '@/engine/camera/support';
import { INITIAL_CONTEXT, reduce, type HeroContext } from '@/engine/state/machine';
import type { ArtModeId } from '@/content/art-modes';
import { useCapture, type UseCapture } from './useCapture';
import { useFaceTracking, type Telemetry } from './useFaceTracking';

/**
 * The React binding, and the only place the two halves meet: React owns the state
 * machine, the engine owns the stream and the pixels. Per-frame data never comes through
 * here — the render loop reads it straight from the tracker (docs/PLAN.md §3).
 */
export interface UseCamera {
  context: HeroContext;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  delegate: 'GPU' | 'CPU' | null;
  artMode: ArtModeId;
  setArtMode: (mode: ArtModeId) => void;
  ambientRef: React.RefObject<HTMLCanvasElement | null>;
  shineRef: React.RefObject<number>;
  telemetryRef: React.RefObject<Telemetry>;
  capture: UseCapture;
  begin: () => void;
  retry: () => void;
}

export function useCamera(debug: boolean): UseCamera {
  const [context, dispatch] = useReducer(reduce, INITIAL_CONTEXT);
  const videoRef = useRef<HTMLVideoElement>(null);
  const managerRef = useRef<CameraManager | null>(null);
  const delegateRef = useRef<'GPU' | 'CPU' | null>(null);

  /**
   * The worker starts loading at mount, so on a warm cache the model is ready *before*
   * the visitor clicks BEGIN. MODEL_READY then arrives while the machine is still idle,
   * where it means nothing and is dropped — and the hero sits on "getting my pencils"
   * forever with tracking visibly working behind it. Remembering readiness lets the
   * grant re-raise it.
   */
  const modelReadyRef = useRef(false);

  const {
    canvasRef,
    ambientRef,
    shineRef,
    telemetryRef,
    sourceRef,
    artMode,
    setArtMode,
    start: startTracking,
    stop: stopTracking,
  } = useFaceTracking({
    debug,
    onReady: (delegate) => {
      delegateRef.current = delegate;
      modelReadyRef.current = true;
      dispatch({ type: 'MODEL_READY' });
    },
    // Vision failing is not fatal: the camera keeps running inside the frame, just
    // without artwork. Better a plain mirror than an error page.
    onFailed: () => dispatch({ type: 'MODEL_FAILED' }),
    onPresenceChange: (present) => dispatch({ type: present ? 'FACE_FOUND' : 'FACE_LOST' }),
  });

  const attach = useCallback(
    (stream: MediaStream) => {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      // Safari sits on a black frame unless play() is called, and the call has to be
      // reachable from the user's gesture — which it is, via the BEGIN click.
      void video
        .play()
        .then(() => startTracking(video))
        .catch(() => undefined);
    },
    [startTracking],
  );

  /**
   * The manager is built here rather than in a useMemo. Disposing it is permanent, and
   * StrictMode mounts, cleans up, then mounts again — a memoized instance would survive
   * that cleanup already disposed, and every camera request afterwards would fail with
   * an unexplainable error. One manager per mount, always.
   */
  useEffect(() => {
    const manager = createCameraManager({
      onLost: () => {
        stopTracking();
        dispatch({ type: 'CAMERA_LOST' });
      },
      onSuspended: () => {
        stopTracking();
        if (videoRef.current) videoRef.current.srcObject = null;
      },
      onResumed: (stream) => attach(stream),
    });
    managerRef.current = manager;

    const support = checkSupport(navigator, window.isSecureContext);
    dispatch({ type: 'SUPPORT_CHECKED', supported: support.supported, reason: support.reason });

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, [attach, stopTracking]);

  const begin = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;

    dispatch({ type: 'BEGIN' });
    manager.request().then(
      (stream) => {
        dispatch({ type: 'CAMERA_GRANTED' });
        attach(stream);
        // If the worker finished while the visitor was still reading the intro, replay
        // that fact now that the machine can act on it. Otherwise MODEL_READY arrives
        // from the worker in its own time.
        if (modelReadyRef.current) dispatch({ type: 'MODEL_READY' });
      },
      (error: unknown) => {
        dispatch({
          type: 'CAMERA_FAILED',
          reason: error instanceof CameraError ? error.reason : 'unknown',
        });
      },
    );
  }, [attach]);

  /**
   * Capture events drive the machine rather than a separate boolean: CAPTURING blocks a
   * second shutter, and CAPTURED is what puts the print on screen. The camera keeps
   * running throughout (blueprint §23).
   */
  const capture = useCapture(
    () => sourceRef.current,
    useCallback((event: 'start' | 'done' | 'failed' | 'dismiss') => {
      if (event === 'start') dispatch({ type: 'CAPTURE' });
      else if (event === 'done') dispatch({ type: 'CAPTURE_DONE' });
      else if (event === 'failed') dispatch({ type: 'CAPTURE_FAILED' });
      else dispatch({ type: 'DISMISS_CAPTURE' });
    }, []),
  );

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
    begin();
  }, [begin]);

  return {
    context,
    videoRef,
    canvasRef,
    ambientRef,
    shineRef,
    telemetryRef,
    capture,
    delegate: delegateRef.current,
    artMode,
    setArtMode,
    begin,
    retry,
  };
}
