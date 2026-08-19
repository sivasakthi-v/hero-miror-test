/**
 * Posterisation as an SVG filter, referenced from `ctx.filter`.
 *
 * The obvious implementation — getImageData, quantise every channel, putImageData —
 * measured at 68ms per frame on a 1200×800 canvas. That is 15fps for one look, and the
 * cost is unavoidable in JavaScript: it is millions of round-trips across the CPU/GPU
 * boundary every frame.
 *
 * `feComponentTransfer` with a discrete table does exactly the same maths on the GPU,
 * as part of the draw that was already happening. Same picture, no measurable cost.
 *
 * Not every engine supports `url(#…)` in a canvas filter (Safari historically does not),
 * so support is feature-detected and the look degrades to its un-posterised grade rather
 * than falling back to something that would drop the frame rate.
 */

const NS = 'http://www.w3.org/2000/svg';
const registered = new Set<number>();
let host: SVGSVGElement | null = null;
let supported: boolean | null = null;

function ensureHost(): SVGSVGElement {
  if (host) return host;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  document.body.appendChild(svg);
  host = svg;
  return svg;
}

/** Evenly spaced levels: the table a screen-print would quantise to. */
function levelTable(levels: number): string {
  return Array.from({ length: levels }, (_, i) => (i / (levels - 1)).toFixed(4)).join(' ');
}

export function posterizeFilterId(levels: number): string {
  const id = `tya-posterize-${levels}`;
  if (registered.has(levels)) return id;

  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', id);
  // Operate on the raw sRGB values; linearRGB would quantise perceptually oddly.
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const transfer = document.createElementNS(NS, 'feComponentTransfer');
  for (const channel of ['feFuncR', 'feFuncG', 'feFuncB']) {
    const func = document.createElementNS(NS, channel);
    func.setAttribute('type', 'discrete');
    func.setAttribute('tableValues', levelTable(levels));
    transfer.appendChild(func);
  }

  filter.appendChild(transfer);
  ensureHost().appendChild(filter);
  registered.add(levels);
  return id;
}

export function supportsSvgCanvasFilter(): boolean {
  if (supported !== null) return supported;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return (supported = false);
    const id = posterizeFilterId(4);
    ctx.filter = `url(#${id})`;
    // Engines that do not support it silently reset the property to "none".
    supported = ctx.filter !== 'none' && ctx.filter !== '';
  } catch {
    supported = false;
  }
  return supported;
}
