/**
 * Hero state machine — docs/PLAN.md §4.
 *
 * One explicit FSM instead of a spray of booleans (cameraLoaded, faceDetected,
 * capturing, isReady...). Every state that a visitor can land in must have designed
 * copy and a way forward; the type system is what forces us to notice new ones.
 *
 * No dependencies. No React. Runs in a worker, a test, or a page.
 */

export type HeroState =
  | 'boot'
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'denied'
  | 'camera_error'
  | 'loading_model'
  | 'live'
  | 'no_face'
  | 'vision_failed'
  | 'capturing'
  | 'captured'
  | 'stopped';

/** Why the camera could not be used. Drives which fallback copy we show. */
export type CameraFailure =
  | 'denied' // user said no, or a previous denial is remembered
  | 'no_device' // no camera hardware at all
  | 'in_use' // another app holds the camera
  | 'insecure_context' // not HTTPS
  | 'in_app_browser' // LinkedIn/Instagram webview — see docs/PLAN.md R2
  | 'lost' // the stream ended mid-session (unplugged, revoked, OS took it)
  | 'unknown';

export type HeroEvent =
  | { type: 'SUPPORT_CHECKED'; supported: boolean }
  | { type: 'BEGIN' }
  | { type: 'CAMERA_GRANTED' }
  | { type: 'CAMERA_FAILED'; reason: CameraFailure }
  /** The stream we already had went away. Distinct from never getting one. */
  | { type: 'CAMERA_LOST' }
  | { type: 'MODEL_READY' }
  | { type: 'MODEL_FAILED' }
  | { type: 'FACE_FOUND' }
  | { type: 'FACE_LOST' }
  | { type: 'CAPTURE' }
  | { type: 'CAPTURE_DONE' }
  | { type: 'CAPTURE_FAILED' }
  | { type: 'DISMISS_CAPTURE' }
  | { type: 'RETRY' }
  | { type: 'STOP' };

export type HeroEventType = HeroEvent['type'];

/**
 * Transition table. A missing entry means "this event is not meaningful here" and is
 * ignored rather than throwing — events arrive from async sources (camera, worker,
 * user) and a late one must never be able to crash the hero.
 */
const TRANSITIONS: Readonly<Record<HeroState, Partial<Record<HeroEventType, HeroState>>>> = {
  boot: { SUPPORT_CHECKED: 'idle' },
  unsupported: {},
  idle: { BEGIN: 'requesting' },
  requesting: { CAMERA_GRANTED: 'loading_model', CAMERA_FAILED: 'denied' },
  denied: { RETRY: 'requesting' },
  camera_error: { RETRY: 'requesting' },
  loading_model: { MODEL_READY: 'no_face', MODEL_FAILED: 'vision_failed', CAMERA_LOST: 'camera_error' },
  // vision_failed still shows a live camera inside the frame, just without face art.
  vision_failed: { CAPTURE: 'capturing', RETRY: 'loading_model', CAMERA_LOST: 'camera_error' },
  live: { FACE_LOST: 'no_face', CAPTURE: 'capturing', CAMERA_LOST: 'camera_error' },
  no_face: { FACE_FOUND: 'live', CAPTURE: 'capturing', CAMERA_LOST: 'camera_error' },
  capturing: { CAPTURE_DONE: 'captured', CAPTURE_FAILED: 'live' },
  captured: { DISMISS_CAPTURE: 'live', CAPTURE: 'capturing', CAMERA_LOST: 'camera_error' },
  stopped: { RETRY: 'idle' },
};

/** States where the visitor is looking at a running camera. */
export function isCameraRunning(state: HeroState): boolean {
  return (
    state === 'loading_model' ||
    state === 'live' ||
    state === 'no_face' ||
    state === 'vision_failed' ||
    state === 'capturing' ||
    state === 'captured'
  );
}

/** States that must offer the visitor a designed way onward without a camera. */
export function isFallback(state: HeroState): boolean {
  return state === 'unsupported' || state === 'denied' || state === 'camera_error';
}

export function transition(state: HeroState, event: HeroEvent): HeroState {
  // STOP and support-failure are global: they win from anywhere.
  if (event.type === 'STOP') return 'stopped';
  if (event.type === 'SUPPORT_CHECKED' && !event.supported) return 'unsupported';

  /**
   * CAMERA_FAILED is only meaningful while we are asking for a camera. getUserMedia
   * rejections arrive asynchronously, so a superseded request (double-tapped BEGIN, or
   * a retry that lost the race) can reject *after* a later request has already
   * succeeded. Honouring it from anywhere would drop a visitor with a working, live
   * camera onto the "no worries" fallback. A stream that dies mid-session is a
   * different event with different copy: CAMERA_LOST.
   */
  if (event.type === 'CAMERA_FAILED') {
    if (state !== 'requesting') return state;
    return event.reason === 'denied' ? 'denied' : 'camera_error';
  }

  return TRANSITIONS[state][event.type] ?? state;
}

export interface HeroContext {
  readonly state: HeroState;
  readonly failure: CameraFailure | null;
}

export const INITIAL_CONTEXT: HeroContext = { state: 'boot', failure: null };

export function reduce(context: HeroContext, event: HeroEvent): HeroContext {
  const next = transition(context.state, event);
  const failure = nextFailure(context, event, next);
  if (next === context.state && failure === context.failure) return context;
  return { state: next, failure };
}

function nextFailure(
  context: HeroContext,
  event: HeroEvent,
  next: HeroState,
): CameraFailure | null {
  // Only record a reason for a failure the machine actually acted on — an ignored
  // late rejection must not leave denial copy behind a working camera.
  if (event.type === 'CAMERA_FAILED') {
    return next === context.state ? context.failure : event.reason;
  }
  if (event.type === 'CAMERA_LOST' && next === 'camera_error') return 'lost';
  // A granted camera clears the past. Without this, a visitor who denies, retries and
  // succeeds keeps `failure: 'denied'` forever, and anything keyed off the reason
  // rather than the state renders the fallback over a live stream.
  if (event.type === 'CAMERA_GRANTED') return null;
  return context.failure;
}
