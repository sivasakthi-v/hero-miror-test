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

```js
// worker.js — bind a KV namespace called COUNTS
const ALLOWED_ORIGIN = 'https://<user>.github.io'; // or the custom domain

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const cors = {
      'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // Read the totals: GET with the secret in the query string.
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.get('key') !== env.READ_KEY) return new Response('nope', { status: 403 });
      const started = (await env.COUNTS.get('experience_started')) ?? '0';
      const saved = (await env.COUNTS.get('portrait_saved')) ?? '0';
      return Response.json({ started: Number(started), saved: Number(saved) });
    }

    if (request.method !== 'POST' || origin !== ALLOWED_ORIGIN) {
      return new Response('nope', { status: 403 });
    }

    const { event } = await request.json().catch(() => ({}));
    if (event !== 'experience_started' && event !== 'portrait_saved') {
      return new Response('nope', { status: 400 });
    }

    const current = Number((await env.COUNTS.get(event)) ?? '0');
    await env.COUNTS.put(event, String(current + 1));
    return new Response(null, { status: 204, headers: cors });
  },
};
```

Nothing about the request is stored — not the IP, not the user agent, not a timestamp.
Only two integers exist in KV.

## Wiring it up

1. Deploy the worker, create the `COUNTS` KV namespace, set a `READ_KEY` secret.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → Variables**, add
   `VITE_COUNT_ENDPOINT` = the worker URL.
3. Push. The deploy workflow passes it into the build.

To read the numbers: open `https://<worker>/?key=<READ_KEY>`.

## Keeping your own visits out

Open the site as `?nocount=1` and this browser is never counted. The counter also fires at
most once per browser per event regardless, so reloading does not inflate anything.
