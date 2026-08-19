# There You Are

An interactive self-portrait experience for Siva Serafino's portfolio. The visitor's camera
is read on-device, their face is drawn into a hand-made portrait, and they can keep the result.

**The camera feed never leaves the device.** No backend, no upload, no third-party script —
the vision model and WASM are self-hosted. The only thing collected anywhere is an anonymous
count of how many people started the experience ([`docs/COUNTER.md`](docs/COUNTER.md)).

## Docs

- [`docs/PLAN.md`](docs/PLAN.md) — feasibility, architecture, standards, phases
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — locked decisions (D1–D14) and open questions
- [`docs/COUNTER.md`](docs/COUNTER.md) — the anonymous visit counter and its worker

## Setup

```bash
npm install
npm run assets   # downloads the ~27MB model + wasm into public/ (not committed)
npm run dev
```

`localhost` counts as a secure context, so the camera works in dev without HTTPS.
Testing on a real phone over the LAN needs an HTTPS tunnel.

## Commands

```bash
npm run check    # tsc + eslint + vitest — the gate before every commit
npm run build    # production build
npm run test     # unit tests only
npm run format   # prettier
```

## Deploy

Push to `main`. GitHub Actions runs `npm run check`, fetches the vision assets, builds with
the correct base path and publishes to GitHub Pages.

Two optional repo variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Purpose |
|---|---|
| `VITE_COUNT_ENDPOINT` | Worker URL for the anonymous counter. Unset = no counting at all. |
| `VITE_BASE_OVERRIDE` | Set to `/` once a custom domain is attached. |

## Architecture in one line

React owns application state; a framework-agnostic engine under `src/engine/` owns the
pixels. The engine may never import React — ESLint enforces it.

## Status

**Phase 0 complete** — scaffold, design tokens, copy system, hero state machine (10 tests),
GitHub Pages pipeline, asset fetcher, counter module.

**Phase 1 next** — camera manager, permission UX, responsive aperture at 3:2 and 4:5, and the
viewport transform that everything else depends on.
