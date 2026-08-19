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
  | 'unknown';

export type HeroEvent =
  | { type: 'SUPPORT_CHECKED'; supported: boolean }
  | { type: 'BEGIN' }
  | { type: 'CAMERA_GRANTED' }
  | { type: 'CAMERA_FAILED'; reason: CameraFailure }
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
  loading_model: { MODEL_READY: 'no_face', MODEL_FAILED: 'vision_failed' },
  // vision_failed still shows a live camera inside the frame, just without face art.
  vision_failed: { CAPTURE: 'capturing', RETRY: 'loading_model' },
  live: { FACE_LOST: 'no_face', CAPTURE: 'capturing' },
  no_face: { FACE_FOUND: 'live', CAPTURE: 'capturing' },
  capturing: { CAPTURE_DONE: 'captured', CAPTURE_FAILED: 'live' },
  captured: { DISMISS_CAPTURE: 'live', CAPTURE: 'capturing' },
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
  if (event.type === 'CAMERA_FAILED') {
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
  const failure = event.type === 'CAMERA_FAILED' ? event.reason : context.failure;
  if (next === context.state && failure === context.failure) return context;
  return { state: next, failure };
}
