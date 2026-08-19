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
  { type: 'SUPPORT_CHECKED', supported: true },
  { type: 'SUPPORT_CHECKED', supported: false },
  { type: 'BEGIN' },
  { type: 'CAMERA_GRANTED' },
  { type: 'CAMERA_FAILED', reason: 'denied' },
  { type: 'CAMERA_FAILED', reason: 'no_device' },
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
      { type: 'SUPPORT_CHECKED', supported: true },
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

  it('separates a denial from a device/environment failure', () => {
    expect(transition('requesting', { type: 'CAMERA_FAILED', reason: 'denied' })).toBe('denied');
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
      expect(transition(state, { type: 'SUPPORT_CHECKED', supported: false })).toBe('unsupported');
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
    const ctx = reduce(
      reduce(INITIAL_CONTEXT, { type: 'SUPPORT_CHECKED', supported: true }),
      { type: 'CAMERA_FAILED', reason: 'in_app_browser' },
    );
    expect(isFallback(ctx.state)).toBe(true);
    expect(ctx.failure).toBe('in_app_browser');
  });

  it('returns the same object when nothing changed, so subscribers do not churn', () => {
    const ctx = reduce(INITIAL_CONTEXT, { type: 'SUPPORT_CHECKED', supported: true });
    expect(reduce(ctx, { type: 'FACE_FOUND' })).toBe(ctx);
  });
});
