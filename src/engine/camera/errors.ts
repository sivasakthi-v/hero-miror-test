import type { CameraFailure } from '@/engine/state/machine';
import { isInAppBrowser } from './support';

/**
 * getUserMedia rejects with a DOMException whose `name` is the only reliable signal —
 * the message is browser-specific prose. Mapping it to our own reasons is what lets the
 * fallback screen say something true instead of "something went wrong".
 */
export function classifyCameraError(error: unknown, userAgent = ''): CameraFailure {
  const name =
    error instanceof DOMException || error instanceof Error ? error.name : String(error);

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // legacy name, still seen in older WebKit
    case 'SecurityError':
      // An in-app webview often reports a denial the visitor was never shown. Telling
      // them "you said no" when no prompt appeared is the worst possible copy, so the
      // webview case wins here.
      return isInAppBrowser(userAgent) ? 'in_app_browser' : 'denied';

    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'no_device';

    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in_use';

    default:
      return 'unknown';
  }
}
