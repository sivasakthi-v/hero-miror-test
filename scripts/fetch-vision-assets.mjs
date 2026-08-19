/**
 * Downloads the MediaPipe face model and copies the tasks-vision WASM into public/.
 *
 * These are ~27MB and are NOT committed (see .gitignore) — they are fetched here on a
 * fresh checkout and in CI. They must be self-hosted rather than loaded from a CDN so
 * the hero makes zero third-party requests (docs/PLAN.md R5, R6).
 *
 * Usage: node scripts/fetch-vision-assets.mjs
 */
import { createWriteStream } from 'node:fs';
import { mkdir, cp, stat, readdir, rename, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * Integrity pin. We download over HTTPS from Google, but "we trusted TLS" is not an
 * integrity story — this asset is executed by the vision runtime on every visitor's
 * machine. A mismatch means either the upstream model changed (verify deliberately,
 * then update these two constants) or something is wrong. Either way: stop.
 */
const MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const MODEL_BYTES = 3758596;

const MODEL_DEST = path.join(root, 'public', 'models', 'face_landmarker.task');
const MODEL_TMP = `${MODEL_DEST}.part`;
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

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function verify(file) {
  const { size } = await stat(file);
  if (size !== MODEL_BYTES) {
    throw new Error(`model is ${size} bytes, expected ${MODEL_BYTES} — download incomplete`);
  }
  const digest = await sha256(file);
  if (digest !== MODEL_SHA256) {
    throw new Error(
      `model sha256 ${digest} does not match the pin ${MODEL_SHA256}.\n` +
        'If the upstream model was updated on purpose, verify the new file and update ' +
        'MODEL_SHA256 / MODEL_BYTES in this script.',
    );
  }
}

async function fetchModel() {
  if (await exists(MODEL_DEST)) {
    // A previous run may have been killed mid-stream. Never trust "the file is there".
    try {
      await verify(MODEL_DEST);
      console.log(`model already present and verified (${(MODEL_BYTES / 1e6).toFixed(1)} MB)`);
      return;
    } catch (error) {
      console.warn(`existing model rejected (${error.message}) — refetching`);
      await rm(MODEL_DEST, { force: true });
    }
  }

  await mkdir(path.dirname(MODEL_DEST), { recursive: true });
  await rm(MODEL_TMP, { force: true });
  console.log(`downloading ${MODEL_URL}`);

  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`model download failed: ${res.status}`);

  // Stream to a .part file and only publish it under the real name once verified, so
  // an interrupted download can never masquerade as a good one on the next run.
  await pipeline(Readable.fromWeb(res.body), createWriteStream(MODEL_TMP));
  try {
    await verify(MODEL_TMP);
  } catch (error) {
    await rm(MODEL_TMP, { force: true });
    throw error;
  }
  await rename(MODEL_TMP, MODEL_DEST);
  console.log(`model saved and verified (${(MODEL_BYTES / 1e6).toFixed(1)} MB)`);
}

/**
 * Copy every variant. tasks-vision ships three ~12MB builds and picks one at runtime:
 * `vision_wasm_internal` (classic, SIMD), `vision_wasm_nosimd_internal` (older CPUs)
 * and `vision_wasm_module_internal` (ES module).
 *
 * Do not "optimise" this by dropping the module build. Our worker is `type: 'module'`,
 * and importing the classic glue from an ES module leaves its factory module-scoped
 * instead of global — MediaPipe then fails with "ModuleFactory not set", which reads
 * like a corrupt download rather than a missing file. Each client downloads exactly one
 * variant regardless; only the deploy artifact carries all three.
 */
async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    throw new Error('@mediapipe/tasks-vision is not installed — run npm install first');
  }
  await mkdir(WASM_DEST, { recursive: true });
  const names = await readdir(WASM_SRC);
  if (names.length === 0) throw new Error('no wasm files found — did tasks-vision change?');
  await cp(WASM_SRC, WASM_DEST, { recursive: true });
  console.log(`wasm copied (${names.length} files)`);
}

await fetchModel();
await copyWasm();
console.log('vision assets ready');
