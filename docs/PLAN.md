# "There You Are" — Architecture & Build Plan

Status: **PRE-DEV**. No code until open questions (§12) are answered.

---

## 1. Feasibility verdict

Buildable. No backend. Every browser API involved is shipping. But the blueprint carries
six technical assumptions that break in practice. The corrections below are load-bearing.

### R1 — Capture resolution cannot exceed the stream you requested

Blueprint §72/73 implies capture can pull "a more appropriate high-resolution frame".
False. `<video>` only ever yields the negotiated track resolution. A 1280×720 track
upscaled to 1600×1067 is a blurry poster.

**Fix:** request `ideal: 1920×1080` at `getUserMedia`, accept what is granted, run
*inference* on a downscaled copy (~480px wide — MediaPipe resizes to 256 internally anyway),
render the live canvas at CSS size × `min(dpr, 2)`, and render capture from the full-res
frame. Track resolution is a hard ceiling; poster size derives from it, not the reverse.

### R2 — In-app browsers are the real fallback case, not "user denied"

This portfolio gets shared on LinkedIn / Instagram / X. Those in-app webviews frequently
fail `getUserMedia` (iOS WKWebView restrictions, Android custom tabs without camera grant).
That is likely the *most common* failure path, not an edge case.

**Fix:** the fallback is a first-class designed state, plus an "open in your browser" nudge
when an in-app UA is detected. Never a dead end. (Blueprint §40 is right; its priority is wrong.)

### R3 — Coordinate mapping is the #1 bug source, and it is not "just normalize 0..1"

Blueprint §25 undersells it. Real chain: source track (e.g. 16:9) → cover-crop into the
frame aperture (3:2 desktop / 4:5 mobile) → mirror → DPR scale → canvas px. Landmarks must
travel the *identical* transform, and the capture renderer must reuse it at a different
output size. Two implementations = art drifts off the face on mobile only.

**Fix:** one pure module `transform/viewport.ts` exporting a `Viewport`; live renderer and
capture renderer both consume it; unit-tested; validated by the P2 debug overlay.

### R4 — Frame delivery to the worker

`createImageBitmap(video)` per frame allocates and costs main-thread time. Prefer
`new VideoFrame(video)` (WebCodecs, transferable, cheap) with `createImageBitmap` fallback.
Either way: **one inference in flight at a time**, drop frames while busy. MediaPipe's
`detectForVideo` requires strictly increasing timestamps — a dropped or reordered frame throws.

### R5 — Asset weight is the real perf risk, not framerate

`face_landmarker.task` ≈ 3.7MB + vision WASM ≈ 3MB. That is the hero's time-to-interactive.

**Fix:** self-host both under `/public` (also required for the privacy claim — a CDN fetch
is a third-party request), fetch them *lazily* only after the user clicks BEGIN, show honest
loading copy, add a service worker cache later. Never block first paint on them.

### R6 — Privacy copy must be precise

"Nothing is uploaded" is only true if you also self-host WASM + model and run zero analytics
on the hero. MediaPipe's own docs note utilization metrics.

**Approved wording:** *"Your camera feed is processed on your device and never leaves it."*
Do not write "nothing ever leaves your device" while an analytics script exists on the page.

### Secondary notes

- `requestVideoFrameCallback` is now in Chrome/Edge/Safari and Firefox 132+. Still ship a rAF fallback.
- No `COOP`/`COEP` needed — tasks-vision runs single-thread SIMD. Do **not** enable cross-origin
  isolation; it breaks embeds for no gain.
- GPU delegate inside a worker needs OffscreenCanvas + WebGL2. Ship a CPU-delegate fallback.
- Safari: `playsInline` + `muted` + `play()` called from the user gesture, else black video.

---

## 2. Stack (pinned, verified against npm today)

| Package | Version | Why |
|---|---|---|
| react / react-dom | 19.2.x | UI + state only |
| vite | **7.x, not 8** | 8.2 just landed; plugin lag. Revisit later. |
| typescript | **5.9.x, not 7** | TS 7 is the new native compiler — too new for a project that must not fight its tooling. |
| @mediapipe/tasks-vision | 1.0.1 | 478 landmarks + blendshapes + transform matrix, Apache-2.0 |
| motion | 13.x | DOM/UI animation only. Never the render loop. |
| zustand | 5.x | ~1kB store binding the FSM to React. Optional — see Q6. |

Dev: `vitest`, `eslint` (flat config), `prettier`, `@types/*`.

**Not installed until proven necessary:** three, @react-three/fiber, postprocessing, gsap,
tailwind, any icon library, any UI kit.

---

## 3. Architecture

Hard boundary (blueprint §83 — agreed, this is the correct call):

```
  React  ──►  owns: app state, FSM, permission UI, copy, nav, capture button, layout
     │
     │ (start / stop / config only — never per-frame)
     ▼
  Engine (framework-agnostic, zero React imports)
     ├─ camera/     MediaStream lifecycle
     ├─ vision/     worker client, smoothing, anchors, expressions
     ├─ transform/  viewport math (pure, tested)
     ├─ render/     layer stack → canvas 2D
     └─ capture/    offscreen re-render at poster size → PNG blob
```

Rules:

- Engine never imports React. Enforced by eslint `no-restricted-imports`.
- React never reads landmarks. It reads *coarse* signals only (`faceFound: boolean`,
  `expression: enum`) through a throttled subscription (≤10Hz), so no per-frame re-renders.
- Face state lives in a mutable singleton read directly by the render loop.

Per-frame flow:

```
rVFC(video) → if worker idle: VideoFrame → worker → landmarks/blendshapes
                                                  → normalize → smooth → faceState (mutable)
rAF         → render(faceState, viewport, theme) → canvas
```

Inference and render are **decoupled loops**. Render always uses the latest available face
state and never waits. Inference throttled to 24–30fps; render runs at display refresh.

Layer stack (identical order live and capture):

`background → video → color treatment → glow → face art → graffiti → frame → grain → signature*`
(*signature is capture-only)

---

## 4. State machine

One typed FSM, hand-rolled (~100 LOC), no XState dependency.

```
BOOT → UNSUPPORTED            (no mediaDevices / no canvas)
     → IDLE                   (permission UI shown)
        → REQUESTING → DENIED | ERROR | STREAMING
     STREAMING → LOADING_MODEL → LIVE
                               → VISION_FAILED   (camera still shown, art degraded)
     LIVE ↔ NO_FACE
     LIVE → CAPTURING → CAPTURED → LIVE
     any  → STOPPED           (unmount / tab hidden)
```

Every terminal-ish state has designed copy and a way forward. No boolean soup.

---

## 5. Performance budgets

| Metric | Target | Degrade action |
|---|---|---|
| First paint (no camera) | < 1.0s | — |
| Model + WASM load (after BEGIN) | < 2.5s on 4G | honest progress copy |
| Inference | 24–30fps desktop, 15–24 mobile | drop tier |
| Render | 60fps / display refresh | drop tier |
| Live canvas | CSS px × min(dpr, 2) | cap at 1.5 on lite |

Quality tiers `high | balanced | lite`, chosen by *measured* rolling frame time — never by
`isMobile`. Hysteresis so it cannot oscillate. Tier controls grain, glow blur, sticker count,
inference rate, face-art complexity. It never touches the camera itself.

---

## 6. Folder structure (revised from blueprint §19)

Change vs blueprint: `rendering/ art/ vision/ camera/` collapse under `src/engine/` so the
React boundary is physically obvious and a Next.js migration is a folder move.

```
src/
  app/          App.tsx, providers, routes
  ui/           React components — hero/, camera/, primitives/
  engine/
    camera/     camera-manager.ts, camera-types.ts
    vision/     landmarker-client.ts, anchors.ts, smoothing.ts, expression.ts, types.ts
    transform/  viewport.ts, mirror.ts            (pure, unit-tested)
    render/     compositor.ts, layers/*.ts, quality.ts
    capture/    capture-renderer.ts, poster-layout.ts, download.ts
    state/      machine.ts, store.ts
  content/      copy.ts, art-registry.ts, graffiti-layout.ts   (data, not JSX)
  styles/       tokens.css, globals.css
  workers/      face-landmarker.worker.ts
  lib/          lerp.ts, clamp.ts, rng.ts, ua.ts
public/
  models/face_landmarker.task
  wasm/         self-hosted tasks-vision wasm
  artwork/  fonts/  textures/
docs/
```

---

## 7. Code standards

- TS `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No `any`.
  No non-null `!` outside proven-invariant lines carrying a comment.
- Files kebab-case; React components `PascalCase.tsx`; one component per file.
- Engine modules: pure where possible; explicit `dispose()` on anything holding a stream,
  worker, or canvas. Every `addEventListener` has a matching removal.
- No magic numbers in render code — tunables live in `content/` or a per-layer `tuning.ts`.
- Copy strings never inline in JSX → `content/copy.ts`.
- Art positions never inline in JSX → `content/graffiti-layout.ts` (blueprint §35, agreed).
- Comments explain *why*. Render math gets an ASCII diagram comment.
- Conventional commits, small vertical slices.
- Lint gates: no React import under `src/engine/**`; no `useState` in render-loop files.

---

## 8. Testing

Targeted, not TDD-everywhere:

- `transform/viewport` — unit tests across all aspect / crop / mirror / dpr combos. **Mandatory.**
- `vision/smoothing`, `vision/anchors` — unit tests against recorded landmark fixtures.
- `state/machine` — exhaustive transition tests.
- Everything visual — manual, through a `?debug=1` overlay (landmark dots, anchors, fps, tier).
- Device matrix at Phase 5.

---

## 9. Privacy / security / deploy

- HTTPS mandatory (localhost counts as a secure context for dev).
- Headers: `Permissions-Policy: camera=(self)`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Never embed the hero in a third-party iframe.
- Self-hosted model + WASM. Zero third-party requests on the hero route.
- Stop all tracks on unmount, on exit, and on `visibilitychange → hidden` (configurable).
- No frame data ever touches the network. No imagery in localStorage.
- Analytics, if any, load only *below* the hero — and the privacy copy adjusts accordingly.

---

## 10. Accessibility

- The hero is an enhancement. A real `<h1>` + positioning statement exist in the DOM regardless.
- Full keyboard path: BEGIN → CAPTURE → SAVE → skip-to-work.
- `prefers-reduced-motion`: kill float / wobble / parallax; keep face rendering, smoothed and calm.
- Canvas carries a meaningful `aria-label`; decorative SVG is `aria-hidden`.
- AA contrast on all copy over the dark ground, including copy sitting over video.

---

## 11. Phases + acceptance criteria

**P0 — Scaffold** (~0.5d). Vite + TS + lint + vitest, design tokens, empty hero shell, FSM stub.
*Done when:* `npm run dev` and `npm run check` are clean; hero renders static copy; no camera yet.

**P1 — Camera + transform** (1–2d). camera-manager, permission UX, responsive aperture, mirror,
`?debug=1` grid.
*Done when:* correct cover-crop at 3:2 and 4:5 on Chrome / Safari / iOS / Android with no stretch;
denied, no-camera, and in-app-browser states all reachable and designed.

**P2 — Vision** (~2d). Worker, self-hosted model, single-in-flight inference, smoothing, anchors,
debug landmark overlay.
*Done when:* the face oval locks to the face with no visible jitter or lag at all three aspect
ratios, mirrored correctly. **Blocking gate — no artwork until this is exact.**

**P3 — Artistic proof** (2–4d, asset-dependent). Pencil contour, cheek, eye spark, brow, glow, grain.
*Done when:* a stranger says "that's pretty", not "cool tracking".

**P4 — Experience** (2–3d). Copy sequence, graffiti layout engine, expression triggers,
capture → poster → PNG.
*Done when:* a stranger completes camera → capture → save with zero instruction.

**P5 — Perf + matrix** (1–2d). Quality tiers; device testing across Mac, Windows laptop, iPhone,
Android, iPad; Chrome / Safari / Firefox / Edge; plus LinkedIn and Instagram in-app browsers.

**P6 — Shell** (later). Work / About / Experiments / Contact, SEO, optional Next.js migration.

---

## 12. Open questions

Answered — see [`DECISIONS.md`](./DECISIONS.md) (D1–D12), which supersedes anything above
that conflicts with it. Remaining non-blocking questions are tracked there under
"Open, non-blocking".
