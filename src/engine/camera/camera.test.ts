import { describe, expect, it } from 'vitest';
import { classifyCameraError } from './errors';
import { checkSupport, isInAppBrowser } from './support';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.29.110';
const LINKEDIN =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 LinkedInApp';

function nav(userAgent: string, hasGetUserMedia = true) {
  return {
    userAgent,
    mediaDevices: hasGetUserMedia ? { getUserMedia: () => Promise.resolve({} as MediaStream) } : {},
  };
}

describe('in-app browser detection', () => {
  it('spots the webviews a portfolio link actually gets opened in', () => {
    expect(isInAppBrowser(INSTAGRAM)).toBe(true);
    expect(isInAppBrowser(LINKEDIN)).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 FBAN/FBIOS')).toBe(true);
  });

  it('does not fire on ordinary browsers', () => {
    expect(isInAppBrowser(CHROME)).toBe(false);
    expect(
      isInAppBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.4 Safari/605.1.15'),
    ).toBe(false);
  });
});

describe('checkSupport', () => {
  it('accepts a normal secure browser', () => {
    expect(checkSupport(nav(CHROME), true)).toEqual({ supported: true, reason: null });
  });

  it('reports an insecure context rather than blaming the browser', () => {
    expect(checkSupport(nav(CHROME), false)).toEqual({
      supported: false,
      reason: 'insecure_context',
    });
  });

  it('names the webview when getUserMedia is missing inside one', () => {
    expect(checkSupport(nav(INSTAGRAM, false), true)).toEqual({
      supported: false,
      reason: 'in_app_browser',
    });
  });

  it('falls back to no_device for a plain browser without the API', () => {
    expect(checkSupport(nav(CHROME, false), true).reason).toBe('no_device');
  });
});

describe('classifyCameraError', () => {
  const asError = (name: string) => Object.assign(new Error(name), { name });

  it('maps the standard rejections to reasons we have copy for', () => {
    expect(classifyCameraError(asError('NotAllowedError'), CHROME)).toBe('denied');
    expect(classifyCameraError(asError('NotFoundError'), CHROME)).toBe('no_device');
    expect(classifyCameraError(asError('OverconstrainedError'), CHROME)).toBe('no_device');
    expect(classifyCameraError(asError('NotReadableError'), CHROME)).toBe('in_use');
    expect(classifyCameraError(asError('AbortError'), CHROME)).toBe('in_use');
  });

  it('understands legacy WebKit names', () => {
    expect(classifyCameraError(asError('PermissionDeniedError'), CHROME)).toBe('denied');
    expect(classifyCameraError(asError('TrackStartError'), CHROME)).toBe('in_use');
  });

  // A webview usually rejects with NotAllowedError without ever showing a prompt.
  // Telling the visitor "you declined" when they were never asked is the worst copy
  // in the whole experience, so the webview case has to win.
  it('does not accuse a webview visitor of refusing a prompt they never saw', () => {
    expect(classifyCameraError(asError('NotAllowedError'), INSTAGRAM)).toBe('in_app_browser');
    expect(classifyCameraError(asError('NotAllowedError'), LINKEDIN)).toBe('in_app_browser');
  });

  it('degrades to unknown rather than throwing on junk', () => {
    expect(classifyCameraError('nonsense', CHROME)).toBe('unknown');
    expect(classifyCameraError(null, CHROME)).toBe('unknown');
    expect(classifyCameraError(undefined)).toBe('unknown');
  });
});
