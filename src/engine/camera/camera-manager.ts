import { CAMERA_CONSTRAINTS, CameraError, type CameraEvents, type CameraManager } from './camera-types';
import { classifyCameraError } from './errors';

/** How long the tab may sit hidden before we release the camera (DECISIONS.md D14). */
const SUSPEND_AFTER_MS = 30_000;

/**
 * Owns the MediaStream and nothing else. No rendering, no React, no face logic.
 *
 * Two rules earn their keep here:
 *  1. One request in flight at a time. A double-tapped BEGIN must not open two streams
 *     — the second would leave the first orphaned with its camera light on.
 *  2. Tracks are stopped when the visitor leaves for a while, and re-acquired when they
 *     come back. A camera light burning behind a forgotten tab is unacceptable for a
 *     page whose whole promise is that it is trustworthy with a camera.
 */
export function createCameraManager(events: CameraEvents): CameraManager {
  let stream: MediaStream | null = null;
  let pending: Promise<MediaStream> | null = null;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let suspended = false;
  let disposed = false;

  function attachTrackListeners(target: MediaStream): void {
    for (const track of target.getTracks()) {
      track.addEventListener('ended', handleTrackEnded);
    }
  }

  function detachTrackListeners(target: MediaStream): void {
    for (const track of target.getTracks()) {
      track.removeEventListener('ended', handleTrackEnded);
    }
  }

  function handleTrackEnded(): void {
    // Only a genuine loss: a track we stopped ourselves has its listeners removed first.
    if (disposed || suspended) return;
    stream = null;
    events.onLost();
  }

  function stopTracks(): void {
    if (!stream) return;
    detachTrackListeners(stream);
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }

  async function acquire(): Promise<MediaStream> {
    try {
      const next = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (disposed) {
        for (const track of next.getTracks()) track.stop();
        throw new CameraError('unknown');
      }
      stream = next;
      attachTrackListeners(next);
      return next;
    } catch (error) {
      if (error instanceof CameraError) throw error;
      throw new CameraError(classifyCameraError(error, navigator.userAgent));
    }
  }

  function request(): Promise<MediaStream> {
    if (stream) return Promise.resolve(stream);
    // Share the in-flight promise so a second tap joins the first request instead of
    // starting a competing one.
    pending ??= acquire().finally(() => {
      pending = null;
    });
    return pending;
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      if (!stream || suspendTimer) return;
      // A quick tab-switch should not tear the stream down and re-prompt on return.
      suspendTimer = setTimeout(() => {
        suspendTimer = null;
        if (!stream) return;
        suspended = true;
        stopTracks();
        events.onSuspended();
      }, SUSPEND_AFTER_MS);
      return;
    }

    if (suspendTimer) {
      clearTimeout(suspendTimer);
      suspendTimer = null;
    }
    if (!suspended) return;
    suspended = false;
    // Permission persists for the origin, so this re-acquires without a new prompt.
    void request().then(
      (resumed) => events.onResumed(resumed),
      () => events.onLost(),
    );
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    request,
    stop(): void {
      if (suspendTimer) {
        clearTimeout(suspendTimer);
        suspendTimer = null;
      }
      suspended = false;
      stopTracks();
    },
    getStream: () => stream,
    getSettings: () => stream?.getVideoTracks()[0]?.getSettings() ?? null,
    dispose(): void {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (suspendTimer) clearTimeout(suspendTimer);
      stopTracks();
    },
  };
}
