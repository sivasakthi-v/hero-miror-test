/**
 * Visit counter — DECISIONS.md D13.
 *
 * NOT analytics. There is no third-party script, no cookie, no fingerprint, no page
 * views, no session, no referrer, no user agent, no IP retained by us. One anonymous
 * increment, once per browser, when someone actually starts the camera experience —
 * so Siva can answer "has anyone other than me tried this?".
 *
 * Disabled entirely unless VITE_COUNT_ENDPOINT is set at build time. Off in dev.
 */

const STORAGE_KEY = 'tya.counted.v1';

export type CountEvent = 'experience_started' | 'portrait_saved';

/** Read lazily so a build-time env change (and tests) are picked up honestly. */
function endpoint(): string | undefined {
  const value = import.meta.env.VITE_COUNT_ENDPOINT as string | undefined;
  return value && value.length > 0 ? value : undefined;
}

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Storage being unavailable (private mode, blocked cookies) means we cannot dedupe,
 * so we do not count at all. Better a missing number than an inflated one.
 */
function storageAvailable(): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, localStorage.getItem(STORAGE_KEY) ?? '[]');
    return true;
  } catch {
    return false;
  }
}

function markCounted(event: CountEvent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...readSeen(), event])]));
  } catch {
    /* storage blocked — we already refuse to count in that case */
  }
}

/** `?nocount=1` keeps Siva's own visits out of his own numbers. */
function optedOut(): boolean {
  return new URLSearchParams(location.search).has('nocount');
}

/** Guards against a double dispatch inside a single page load. */
const inFlight = new Set<CountEvent>();

export function count(event: CountEvent): void {
  const url = endpoint();
  if (!url || optedOut() || inFlight.has(event)) return;
  if (!storageAvailable() || readSeen().includes(event)) return;

  inFlight.add(event);
  const body = JSON.stringify({ event });

  // Beacon first: it cannot delay the experience and survives the tab closing.
  if (typeof navigator.sendBeacon === 'function') {
    if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
      markCounted(event);
      return;
    }
  }

  /**
   * Only mark once something actually left the machine. Marking up front (the
   * obvious way to write this) permanently burns the one chance this browser has:
   * a beacon that fails offline would flag the visitor as counted forever, and the
   * count would quietly miss exactly the flaky-mobile visitors it exists to find.
   */
  void fetch(url, { method: 'POST', body, keepalive: true, mode: 'no-cors' })
    .then(() => markCounted(event))
    .catch(() => undefined)
    .finally(() => inFlight.delete(event));
}
