import { describe, expect, it } from 'vitest';
import {
  INITIAL_CONTEXT,
  isCameraRunning,
  isFallback,
  reduce,
  transition,
  type HeroEvent,
  type HeroState,
} from './machine';

const ALL_STATES: HeroState[] = [
  'boot',
  'unsupported',
  'idle',
  'requesting',
  'denied',
  'camera_error',
  'loading_model',
  'live',
  'no_face',
  'vision_failed',
  'capturing',
  'captured',
  'stopped',
];

const ALL_EVENTS: HeroEvent[] = [
  { type: 'SUPPORT_CHECKED', supported: true, reason: null },
  { type: 'SUPPORT_CHECKED', supported: false, reason: null },
  { type: 'BEGIN' },
  { type: 'CAMERA_GRANTED' },
  { type: 'CAMERA_FAILED', reason: 'denied' },
  { type: 'CAMERA_FAILED', reason: 'no_device' },
  { type: 'CAMERA_LOST' },
  { type: 'MODEL_READY' },
  { type: 'MODEL_FAILED' },
  { type: 'FACE_FOUND' },
  { type: 'FACE_LOST' },
  { type: 'CAPTURE' },
  { type: 'CAPTURE_DONE' },
  { type: 'CAPTURE_FAILED' },
  { type: 'DISMISS_CAPTURE' },
  { type: 'RETRY' },
  { type: 'STOP' },
];

describe('hero machine', () => {
  it('walks the happy path from boot to a saved portrait', () => {
    const path: HeroEvent[] = [
      { type: 'SUPPORT_CHECKED', supported: true, reason: null },
      { type: 'BEGIN' },
      { type: 'CAMERA_GRANTED' },
      { type: 'MODEL_READY' },
      { type: 'FACE_FOUND' },
      { type: 'CAPTURE' },
      { type: 'CAPTURE_DONE' },
    ];
    const end = path.reduce(reduce, INITIAL_CONTEXT);
    expect(end.state).toBe('captured');
  });

  it('lands in the model-loading state before it can ever be live', () => {
    let state: HeroState = 'requesting';
    state = transition(state, { type: 'CAMERA_GRANTED' });
    expect(state).toBe('loading_model');
    // no_face first: a granted camera does not imply a detected face.
    expect(transition(state, { type: 'MODEL_READY' })).toBe('no_face');
  });

  describe('late and stale camera events', () => {
    // Regression: a superseded getUserMedia rejection used to eject a live visitor
    // onto the denial screen while their camera was still running.
    const liveish: HeroState[] = ['live', 'no_face', 'captured', 'capturing', 'vision_failed'];

    it('ignores a CAMERA_FAILED that arrives after a camera is already working', () => {
      for (const state of liveish) {
        expect(transition(state, { type: 'CAMERA_FAILED', reason: 'denied' })).toBe(state);
        expect(transition(state, { type: 'CAMERA_FAILED', reason: 'unknown' })).toBe(state);
      }
    });

    it('ignores CAMERA_FAILED before a request was even made', () => {
      expect(transition('idle', { type: 'CAMERA_FAILED', reason: 'denied' })).toBe('idle');
      expect(transition('boot', { type: 'CAMERA_FAILED', reason: 'denied' })).toBe('boot');
    });

    it('survives the double-tapped BEGIN race end to end', () => {
      // tap, tap, second request wins, first request's rejection lands late.
      const events: HeroEvent[] = [
        { type: 'SUPPORT_CHECKED', supported: true, reason: null },
        { type: 'BEGIN' },
        { type: 'BEGIN' },
        { type: 'CAMERA_GRANTED' },
        { type: 'MODEL_READY' },
        { type: 'FACE_FOUND' },
        { type: 'CAMERA_FAILED', reason: 'denied' }, // the loser rejecting, far too late
      ];
      const end = events.reduce(reduce, INITIAL_CONTEXT);
      expect(end.state).toBe('live');
      expect(end.failure).toBeNull();
    });

    it('does record a stream that dies mid-session, with its own reason', () => {
      for (const state of liveish.filter((s) => s !== 'capturing')) {
        expect(transition(state, { type: 'CAMERA_LOST' })).toBe('camera_error');
      }
      const ctx = reduce({ state: 'live', failure: null }, { type: 'CAMERA_LOST' });
      expect(ctx).toEqual({ state: 'camera_error', failure: 'lost' });
    });

    it('clears the failure reason once a camera is granted', () => {
      const denied = [
        { type: 'SUPPORT_CHECKED', supported: true, reason: null },
        { type: 'BEGIN' },
        { type: 'CAMERA_FAILED', reason: 'denied' },
      ] satisfies HeroEvent[];
      const afterDenial = denied.reduce(reduce, INITIAL_CONTEXT);
      expect(afterDenial).toEqual({ state: 'denied', failure: 'denied' });

      const recovered = (
        [{ type: 'RETRY' }, { type: 'CAMERA_GRANTED' }] satisfies HeroEvent[]
      ).reduce(reduce, afterDenial);
      expect(recovered).toEqual({ state: 'loading_model', failure: null });
    });
  });

  it('separates a denial from a device/environment failure', () => {
    expect(transition('requesting', { type: 'CAMERA_FAILED', reason: 'denied' })).toBe(
      'denied',
    );
    expect(transition('requesting', { type: 'CAMERA_FAILED', reason: 'in_app_browser' })).toBe(
      'camera_error',
    );
    expect(transition('requesting', { type: 'CAMERA_FAILED', reason: 'no_device' })).toBe(
      'camera_error',
    );
  });

  it('keeps the camera alive after a capture (blueprint §23)', () => {
    expect(transition('captured', { type: 'DISMISS_CAPTURE' })).toBe('live');
    expect(isCameraRunning('captured')).toBe(true);
  });

  it('degrades to a plain camera when vision fails, instead of dead-ending', () => {
    const state = transition('loading_model', { type: 'MODEL_FAILED' });
    expect(state).toBe('vision_failed');
    expect(isCameraRunning(state)).toBe(true);
    expect(transition(state, { type: 'CAPTURE' })).toBe('capturing');
  });

  it('treats STOP and unsupported as global', () => {
    for (const state of ALL_STATES) {
      expect(transition(state, { type: 'STOP' })).toBe('stopped');
      expect(
        transition(state, { type: 'SUPPORT_CHECKED', supported: false, reason: null }),
      ).toBe('unsupported');
    }
  });

  it('ignores events that are not meaningful in the current state', () => {
    expect(transition('idle', { type: 'FACE_FOUND' })).toBe('idle');
    expect(transition('boot', { type: 'CAPTURE' })).toBe('boot');
    expect(transition('unsupported', { type: 'BEGIN' })).toBe('unsupported');
  });

  it('never reaches an unknown state from any state/event pair', () => {
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        expect(ALL_STATES).toContain(transition(state, event));
      }
    }
  });

  it('gives every fallback state a recorded reason to render copy from', () => {
    const ctx = (
      [
        { type: 'SUPPORT_CHECKED', supported: true, reason: null },
        { type: 'BEGIN' },
        { type: 'CAMERA_FAILED', reason: 'in_app_browser' },
      ] satisfies HeroEvent[]
    ).reduce(reduce, INITIAL_CONTEXT);
    expect(isFallback(ctx.state)).toBe(true);
    expect(ctx.failure).toBe('in_app_browser');
  });

  // Regression: on a warm cache the model finishes loading before the visitor clicks
  // BEGIN, so MODEL_READY lands in `idle` and is dropped. The hero then sat on
  // "getting my pencils" forever with tracking plainly working behind it. The machine
  // is right to ignore it here — the hook replays it on CAMERA_GRANTED.
  it('ignores MODEL_READY that arrives before there is a camera', () => {
    expect(transition('idle', { type: 'MODEL_READY' })).toBe('idle');
    expect(transition('requesting', { type: 'MODEL_READY' })).toBe('requesting');
    // ...and still accepts it once the camera exists.
    expect(transition('loading_model', { type: 'MODEL_READY' })).toBe('no_face');
  });

  // Regression: making CAMERA_FAILED state-guarded silently swallowed the reason that
  // the support check reported at boot, so "no camera on this device" and "you are
  // inside the Instagram browser" both rendered as "I cannot tell you why".
  it('keeps the reason the support check reported', () => {
    for (const reason of ['no_device', 'in_app_browser', 'insecure_context'] as const) {
      const ctx = reduce(INITIAL_CONTEXT, {
        type: 'SUPPORT_CHECKED',
        supported: false,
        reason,
      });
      expect(ctx).toEqual({ state: 'unsupported', failure: reason });
      expect(isFallback(ctx.state)).toBe(true);
    }
  });

  it('returns the same object when nothing changed, so subscribers do not churn', () => {
    const ctx = reduce(INITIAL_CONTEXT, {
      type: 'SUPPORT_CHECKED',
      supported: true,
      reason: null,
    });
    expect(reduce(ctx, { type: 'FACE_FOUND' })).toBe(ctx);
  });
});
