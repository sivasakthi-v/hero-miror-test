import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFramed } from './frame-guard';

describe('frame guard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows a top-level window', () => {
    const win = {} as Window;
    vi.stubGlobal('window', { top: win, self: win });
    expect(isFramed()).toBe(false);
  });

  it('detects a same-origin iframe', () => {
    vi.stubGlobal('window', { top: {} as Window, self: {} as Window });
    expect(isFramed()).toBe(true);
  });

  it('treats a cross-origin parent that throws on access as framed', () => {
    // A hostile embedder is exactly the case where reading window.top throws, so
    // the guard must fail closed rather than fall through to rendering.
    vi.stubGlobal('window', {
      get top(): Window {
        throw new DOMException('blocked a frame', 'SecurityError');
      },
      self: {} as Window,
    });
    expect(isFramed()).toBe(true);
  });
});
