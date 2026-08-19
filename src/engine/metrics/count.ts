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

const ENDPOINT = import.meta.env.VITE_COUNT_ENDPOINT as string | undefined;
const STORAGE_KEY = 'tya.counted.v1';

export type CountEvent = 'experience_started' | 'portrait_saved';

function alreadyCounted(event: CountEvent): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    return seen.includes(event);
  } catch {
    // Private mode / storage blocked. Better to skip the count than to over-count.
    return true;
  }
}

function markCounted(event: CountEvent): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...seen, event])]));
  } catch {
    /* storage blocked — nothing to do */
  }
}

/** `?nocount=1` keeps Siva's own visits out of his own numbers. */
function optedOut(): boolean {
  return new URLSearchParams(location.search).has('nocount');
}

export function count(event: CountEvent): void {
  if (!ENDPOINT || optedOut() || alreadyCounted(event)) return;
  markCounted(event);

  const body = JSON.stringify({ event });
  // Beacon so it cannot delay or block the experience, and survives a tab close.
  const sent =
    typeof navigator.sendBeacon === 'function' &&
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));

  if (!sent) {
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(
      () => undefined,
    );
  }
}
