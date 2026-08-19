/**
 * Downloads the MediaPipe face model and copies the tasks-vision WASM into public/.
 *
 * These are ~7MB and are NOT committed (see .gitignore) — they are fetched here on a
 * fresh checkout and in CI. They must be self-hosted rather than loaded from a CDN so
 * the hero makes zero third-party requests (docs/PLAN.md R5, R6).
 *
 * Usage: node scripts/fetch-vision-assets.mjs
 */
import { createWriteStream } from 'node:fs';
import { mkdir, cp, stat, readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MODEL_DEST = path.join(root, 'public', 'models', 'face_landmarker.task');
const WASM_SRC = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_DEST = path.join(root, 'public', 'wasm');

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchModel() {
  if (await exists(MODEL_DEST)) {
    const { size } = await stat(MODEL_DEST);
    console.log(`model already present (${(size / 1e6).toFixed(1)} MB) — skipping`);
    return;
  }
  await mkdir(path.dirname(MODEL_DEST), { recursive: true });
  console.log(`downloading ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`model download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(MODEL_DEST));
  const { size } = await stat(MODEL_DEST);
  console.log(`model saved (${(size / 1e6).toFixed(1)} MB)`);
}

/**
 * tasks-vision ships three ~12MB variants. FilesetResolver.forVisionTasks only ever
 * loads the SIMD build, or the nosimd build on browsers without WASM SIMD. The
 * `module_internal` pair belongs to the graph API we do not use, so it is dropped —
 * 12MB less to push to the host on every deploy.
 */
const WASM_KEEP = /^vision_wasm_(nosimd_)?internal\.(js|wasm)$/;

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    throw new Error('@mediapipe/tasks-vision is not installed — run npm install first');
  }
  await mkdir(WASM_DEST, { recursive: true });
  const names = (await readdir(WASM_SRC)).filter((n) => WASM_KEEP.test(n));
  if (names.length === 0) throw new Error('no wasm files matched — did tasks-vision change?');
  for (const name of names) {
    await cp(path.join(WASM_SRC, name), path.join(WASM_DEST, name));
  }
  console.log(`wasm copied (${names.join(', ')})`);
}

await fetchModel();
await copyWasm();
console.log('vision assets ready');
