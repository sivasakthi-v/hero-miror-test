import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The counter's whole job is one number, so its failure paths matter more than its
 * happy path. These tests run against stubbed browser globals rather than a DOM
 * environment — the module only touches localStorage, location, navigator and fetch.
 */

const ENDPOINT = 'https://counter.example.workers.dev';

function makeStorage(initial: Record<string, string> = {}, blocked = false) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => {
      if (blocked) throw new Error('storage blocked');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error('storage blocked');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

interface Harness {
  beacon: ReturnType<typeof vi.fn>;
  fetchMock: ReturnType<typeof vi.fn>;
  storage: ReturnType<typeof makeStorage>;
}

async function load(options: {
  endpoint?: string | undefined;
  search?: string;
  beaconResult?: boolean | 'missing';
  fetchResult?: 'ok' | 'reject';
  storage?: ReturnType<typeof makeStorage>;
}): Promise<{ count: (e: 'experience_started') => void } & Harness> {
  vi.resetModules();
  vi.stubEnv('VITE_COUNT_ENDPOINT', options.endpoint ?? '');

  const storage = options.storage ?? makeStorage();
  const beacon = vi.fn().mockReturnValue(options.beaconResult === true);
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      options.fetchResult === 'reject'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(new Response(null, { status: 204 })),
    );

  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('location', { search: options.search ?? '' });
  vi.stubGlobal(
    'navigator',
    options.beaconResult === 'missing' ? {} : { sendBeacon: beacon },
  );
  vi.stubGlobal('fetch', fetchMock);

  const mod = await import('./count');
  return { count: mod.count, beacon, fetchMock, storage };
}

const STORAGE_KEY = 'tya.counted.v1';

describe('count', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends nothing at all when no endpoint is configured', async () => {
    const h = await load({ endpoint: undefined, beaconResult: true });
    h.count('experience_started');
    expect(h.beacon).not.toHaveBeenCalled();
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.storage.data.get(STORAGE_KEY)).toBeUndefined();
  });

  it('counts once, then never again from the same browser', async () => {
    const h = await load({ endpoint: ENDPOINT, beaconResult: true });
    h.count('experience_started');
    h.count('experience_started');
    h.count('experience_started');
    expect(h.beacon).toHaveBeenCalledTimes(1);
    expect(h.storage.data.get(STORAGE_KEY)).toContain('experience_started');
  });

  it('respects ?nocount=1 so Siva stays out of his own numbers', async () => {
    const h = await load({ endpoint: ENDPOINT, search: '?nocount=1', beaconResult: true });
    h.count('experience_started');
    expect(h.beacon).not.toHaveBeenCalled();
  });

  it('falls back to fetch when the beacon is refused', async () => {
    const h = await load({ endpoint: ENDPOINT, beaconResult: false, fetchResult: 'ok' });
    h.count('experience_started');
    await vi.waitFor(() => expect(h.fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(h.storage.data.get(STORAGE_KEY)).toContain('experience_started'),
    );
  });

  it('works where sendBeacon does not exist', async () => {
    const h = await load({ endpoint: ENDPOINT, beaconResult: 'missing', fetchResult: 'ok' });
    h.count('experience_started');
    await vi.waitFor(() => expect(h.fetchMock).toHaveBeenCalledTimes(1));
  });

  // The regression that mattered: marking before sending burned the browser's one
  // chance, so a visitor who was offline at that moment was never counted at all.
  it('does NOT mark the visit when delivery fails, so the next visit retries', async () => {
    const storage = makeStorage();
    const first = await load({
      endpoint: ENDPOINT,
      beaconResult: false,
      fetchResult: 'reject',
      storage,
    });
    first.count('experience_started');
    await vi.waitFor(() => expect(first.fetchMock).toHaveBeenCalled());
    expect(storage.data.get(STORAGE_KEY) ?? '[]').not.toContain('experience_started');

    // Same browser, next visit, network back.
    const second = await load({ endpoint: ENDPOINT, beaconResult: true, storage });
    second.count('experience_started');
    expect(second.beacon).toHaveBeenCalledTimes(1);
  });

  it('refuses to count when storage is blocked, rather than counting every reload', async () => {
    const h = await load({
      endpoint: ENDPOINT,
      beaconResult: true,
      storage: makeStorage({}, true),
    });
    expect(() => h.count('experience_started')).not.toThrow();
    expect(h.beacon).not.toHaveBeenCalled();
  });

  it('survives garbage in localStorage without throwing or double counting', async () => {
    const storage = makeStorage({ [STORAGE_KEY]: '{"not":"an array"}' });
    const h = await load({ endpoint: ENDPOINT, beaconResult: true, storage });
    expect(() => h.count('experience_started')).not.toThrow();
    expect(h.beacon).toHaveBeenCalledTimes(1);
    expect(storage.data.get(STORAGE_KEY)).toBe('["experience_started"]');
  });

  it('sends only the event name — no identifiers of any kind', async () => {
    const h = await load({ endpoint: ENDPOINT, beaconResult: false, fetchResult: 'ok' });
    h.count('experience_started');
    await vi.waitFor(() => expect(h.fetchMock).toHaveBeenCalled());
    const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.body).toBe('{"event":"experience_started"}');
  });
});
