import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createCameraManager } from '@/engine/camera/camera-manager';
import { CameraError, type CameraManager } from '@/engine/camera/camera-types';
import { checkSupport } from '@/engine/camera/support';
import { INITIAL_CONTEXT, reduce, type HeroContext } from '@/engine/state/machine';

/**
 * The React binding, and the only place the two halves meet: React owns the state
 * machine, the engine owns the stream. Per-frame data never comes through here — that
 * belongs to the render loop (docs/PLAN.md §3).
 */
export interface UseCamera {
  context: HeroContext;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  begin: () => void;
  retry: () => void;
}

export function useCamera(): UseCamera {
  const [context, dispatch] = useReducer(reduce, INITIAL_CONTEXT);
  const videoRef = useRef<HTMLVideoElement>(null);
  const managerRef = useRef<CameraManager | null>(null);

  const attach = useCallback((stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // Safari sits on a black frame unless play() is called, and the call has to be
    // reachable from the user's gesture — which it is, via the BEGIN click.
    void video.play().catch(() => undefined);
  }, []);

  /**
   * The manager is built here rather than in a useMemo. Disposing it is permanent, and
   * StrictMode mounts, cleans up, then mounts again — a memoized instance would survive
   * that cleanup already disposed, and every camera request afterwards would fail with
   * an unexplainable error. One manager per mount, always.
   */
  useEffect(() => {
    const manager = createCameraManager({
      onLost: () => dispatch({ type: 'CAMERA_LOST' }),
      onSuspended: () => {
        if (videoRef.current) videoRef.current.srcObject = null;
      },
      onResumed: (stream) => attach(stream),
    });
    managerRef.current = manager;

    const support = checkSupport(navigator, window.isSecureContext);
    dispatch({
      type: 'SUPPORT_CHECKED',
      supported: support.supported,
      reason: support.reason,
    });

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, [attach]);

  const begin = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;

    dispatch({ type: 'BEGIN' });
    manager.request().then(
      (stream) => {
        dispatch({ type: 'CAMERA_GRANTED' });
        attach(stream);
        /**
         * P1 stand-in. There is no face model yet, so the machine is walked straight
         * past LOADING_MODEL to prove the camera path end to end. P2 replaces this with
         * the real MediaPipe load, and MODEL_READY starts meaning what it says.
         */
        dispatch({ type: 'MODEL_READY' });
      },
      (error: unknown) => {
        dispatch({
          type: 'CAMERA_FAILED',
          reason: error instanceof CameraError ? error.reason : 'unknown',
        });
      },
    );
  }, [attach]);

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
    begin();
  }, [begin]);

  return { context, videoRef, begin, retry };
}
