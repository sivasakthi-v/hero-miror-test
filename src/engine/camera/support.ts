import type { CameraFailure } from '@/engine/state/machine';

/**
 * What the browser can do, decided before we ask for anything.
 *
 * The interesting case is not "no camera" — it is the in-app browser (docs/PLAN.md R2).
 * A portfolio link gets opened inside LinkedIn, Instagram and Facebook far more often
 * than people expect, and those webviews frequently refuse getUserMedia outright. That
 * is the most likely way a real visitor meets this experience broken, so it gets its own
 * detection and its own copy rather than a generic error.
 */

export interface CameraSupport {
  supported: boolean;
  reason: CameraFailure | null;
}

/**
 * UA sniffing is unreliable in general, but these webviews announce themselves clearly
 * and there is no feature test for "this browser will refuse the camera" — the refusal
 * only shows up after asking, which is exactly the prompt we are trying not to waste.
 */
const IN_APP_PATTERNS = [
  /\bFBAN\b|\bFBAV\b|\bFB_IAB\b/i, // Facebook
  /\bInstagram\b/i,
  /\bLinkedInApp\b/i,
  /\bTwitter\b/i,
  /\bSnapchat\b/i,
  /\bLine\//i,
  /\bMicroMessenger\b/i, // WeChat
];

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_PATTERNS.some((re) => re.test(userAgent));
}

export function checkSupport(
  nav: Pick<Navigator, 'userAgent'> & { mediaDevices?: Partial<MediaDevices> },
  secureContext: boolean,
): CameraSupport {
  // A secure context is required for getUserMedia to exist at all; on http:// the API
  // is simply absent, which would otherwise read as "your browser is too old".
  if (!secureContext) return { supported: false, reason: 'insecure_context' };
  if (typeof nav.mediaDevices?.getUserMedia !== 'function') {
    return {
      supported: false,
      reason: isInAppBrowser(nav.userAgent) ? 'in_app_browser' : 'no_device',
    };
  }
  return { supported: true, reason: null };
}
