import type { CameraFailure } from '@/engine/state/machine';

/**
 * Requested at 1920×1080 deliberately (docs/PLAN.md R1): the track resolution is a hard
 * ceiling on the captured poster, and it cannot be raised later. Inference runs on a
 * downscaled copy, so a big stream costs us nothing there.
 *
 * No audio, ever. The experience does not need a microphone, and asking for one turns a
 * reasonable request into an alarming one.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: false,
};

export interface CameraEvents {
  /** The stream ended on its own — unplugged, revoked, or taken by another app. */
  onLost: () => void;
  /** Tracks were stopped because the tab was hidden (DECISIONS.md D14). */
  onSuspended: () => void;
  /** Tracks were re-acquired after the visitor came back. */
  onResumed: (stream: MediaStream) => void;
}

export interface CameraManager {
  request(): Promise<MediaStream>;
  stop(): void;
  getStream(): MediaStream | null;
  getSettings(): MediaTrackSettings | null;
  dispose(): void;
}

export class CameraError extends Error {
  readonly reason: CameraFailure;

  constructor(reason: CameraFailure) {
    super(`camera unavailable: ${reason}`);
    this.name = 'CameraError';
    this.reason = reason;
  }
}
