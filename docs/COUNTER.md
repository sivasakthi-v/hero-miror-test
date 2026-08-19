# The visit counter

Goal: answer *"has anyone other than me actually tried this?"* — nothing more.

No third-party analytics, no cookies, no page views, no sessions, no fingerprinting.
One anonymous increment, once per browser, when someone starts the camera experience.
See `src/engine/metrics/count.ts` and DECISIONS.md D13.

It is **off** unless `VITE_COUNT_ENDPOINT` is set at build time, so dev and any
un-configured build send nothing at all.

## Why not Google Analytics / Plausible / Cloudflare Analytics

The hero's promise is that nothing about the visitor leaves their machine. A third-party
script contradicts the spirit of that even when it is technically privacy-friendly, and it
would force the on-screen copy to hedge. A counter we own, on our own endpoint, sending a
single string, keeps the claim clean and true.

## The endpoint (Cloudflare Worker, free tier)

GitHub Pages is static and cannot count anything, so the counter needs one tiny endpoint.
A Cloudflare Worker with a KV namespace covers this at zero cost.

Increments go through a **Durable Object**, not plain KV. A KV read-modify-write loses
concurrent increments — ten people opening the link in the same second all read `0` and
all write `1`, so the number reads `1` exactly when traffic is interesting. A Durable
Object serialises writes, so the count is real.

```js
// worker.js
const ALLOWED_ORIGIN = 'https://<user>.github.io'; // or the custom domain
const EVENTS = new Set(['experience_started', 'portrait_saved']);

export class Counter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { event, read } = await request.json();

    if (read) {
      const all = await this.state.storage.list();
      return Response.json(Object.fromEntries(all));
    }

    // Serialised by the Durable Object runtime — no lost updates.
    const current = (await this.state.storage.get(event)) ?? 0;
    await this.state.storage.put(event, current + 1);
    return new Response(null, { status: 204 });
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = origin === ALLOWED_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const stub = env.COUNTER.get(env.COUNTER.idFromName('totals'));

    // Read the totals. The secret travels in the Authorization header, never in the
    // URL — query strings land in browser history, server logs and Referer headers.
    if (request.method === 'GET') {
      if (request.headers.get('Authorization') !== `Bearer ${env.READ_KEY}`) {
        return new Response('nope', { status: 401 });
      }
      return stub.fetch('https://counter/', {
        method: 'POST',
        body: JSON.stringify({ read: true }),
      });
    }

    if (request.method !== 'POST' || !allowed) return new Response('nope', { status: 403 });

    const { event } = await request.json().catch(() => ({}));
    if (!EVENTS.has(event)) return new Response('nope', { status: 400 });

    await stub.fetch('https://counter/', { method: 'POST', body: JSON.stringify({ event }) });
    return new Response(null, { status: 204, headers: cors });
  },
};
```

Nothing about the request is stored — not the IP, not the user agent, not a timestamp.
Two integers exist, and nothing else.

### What this counter is not

The `Origin` check stops a browser on another site from incrementing it; it stops nothing
else, because any script can send whatever `Origin` it likes. Treat the number as
*"at least this many people"*, not as an audited figure. It is not worth hardening
further for two vanity integers — but do not later reuse this pattern for anything that
matters.

## Wiring it up

1. Deploy the worker, bind the `COUNTER` Durable Object namespace, set a `READ_KEY` secret.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → Variables**, add
   `VITE_COUNT_ENDPOINT` = the worker URL.
3. Push. The deploy workflow passes it into the build.

To read the numbers:

```bash
curl -H "Authorization: Bearer <READ_KEY>" https://<worker>/
```

## Keeping your own visits out

Open the site as `?nocount=1` and this browser is never counted. The counter also fires at
most once per browser per event regardless, so reloading does not inflate anything.
