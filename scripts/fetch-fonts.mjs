/**
 * Downloads Instrument Serif and Instrument Sans from Google Fonts into public/fonts.
 *
 * Self-hosted rather than <link>ed, for the same reason as the vision model: the hero
 * promises no third-party requests, and a webfont request tells Google's servers who
 * opened the page and when. These files are small enough to commit.
 *
 * Usage: node scripts/fetch-fonts.mjs
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(root, 'public', 'fonts');

const FAMILIES = [
  { css: 'Instrument+Serif:ital@0;1', file: 'instrument-serif' },
  { css: 'Instrument+Sans:ital,wght@0,400..700;1,400..700', file: 'instrument-sans' },
];

// A modern UA string is required: Google serves woff2 only to browsers it recognises,
// and older formats to everything else.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchFamily({ css, file }) {
  const url = `https://fonts.googleapis.com/css2?family=${css}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`font css failed: ${res.status} for ${css}`);
  const sheet = await res.text();

  // Latin only. The full set includes several unicode ranges we do not need, and each
  // is another file the visitor downloads.
  const blocks = sheet.split('@font-face').filter((b) => b.includes('woff2'));
  const wanted = blocks.filter((b) => !b.includes('unicode-range') || b.includes('U+0000-00FF'));
  const chosen = wanted.length > 0 ? wanted : blocks;

  const faces = [];
  for (const [index, block] of chosen.entries()) {
    const src = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block)?.[1];
    if (!src) continue;
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? 'normal';
    const weight = /font-weight:\s*([\d\s]+)/.exec(block)?.[1]?.trim() ?? '400';

    const name = `${file}-${style}-${index}.woff2`;
    const dest = path.join(DEST, name);
    if (!(await exists(dest))) {
      const font = await fetch(src, { headers: { 'User-Agent': UA } });
      if (!font.ok) throw new Error(`font download failed: ${font.status}`);
      await writeFile(dest, Buffer.from(await font.arrayBuffer()));
    }
    faces.push({ name, style, weight });
    console.log(`  ${name} (${style} ${weight})`);
  }
  return faces;
}

await mkdir(DEST, { recursive: true });
const result = {};
for (const family of FAMILIES) {
  console.log(family.file);
  result[family.file] = await fetchFamily(family);
}
console.log('fonts ready');
