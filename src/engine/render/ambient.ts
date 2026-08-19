import type { ArtMode } from '@/content/art-modes';

/**
 * The light behind the frame.
 *
 * Colours are sampled from the visitor's own camera image and blended with the look's
 * palette, so the glow around the frame belongs to the same room as the person in it —
 * a warm lamp behind them warms the page. A fixed gradient would look painted on; this
 * makes the page feel like it is reacting to where they are.
 *
 * Drifts slowly and interpolates toward new samples, because a backdrop that tracks the
 * camera exactly would flicker with every shadow that crosses the lens.
 */

const BLEND = 0.04;

export interface AmbientField {
  update(samples: string[], mode: ArtMode, dtMs: number): void;
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, time: number): void;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseRgb(value: string): Rgb {
  const match = /(\d+)\D+(\d+)\D+(\d+)/.exec(value);
  if (!match) return { r: 0, g: 0, b: 0 };
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function css(color: Rgb, alpha: number): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

export function createAmbientField(): AmbientField {
  // Four corners, matching the quadrants sampleAmbient returns.
  let current: Rgb[] = [
    { r: 20, g: 20, b: 28 },
    { r: 20, g: 20, b: 28 },
    { r: 20, g: 20, b: 28 },
    { r: 20, g: 20, b: 28 },
  ];

  return {
    update(samples, mode, dtMs) {
      const palette = mode.ambient.map(hexToRgb);
      const rate = Math.min(1, BLEND * (dtMs / 16.67));

      current = current.map((existing, i) => {
        const sampled = samples[i] ? parseRgb(samples[i]) : existing;
        // Push the sampled colour toward the look's palette, so a beige room still
        // reads as "neon" or "dream" rather than washing the whole design out.
        const themed = mix(sampled, palette[i % palette.length]!, 0.62);
        return mix(existing, themed, rate);
      });
    },

    draw(ctx, width, height, time) {
      ctx.clearRect(0, 0, width, height);

      // Two slow orbits, so the light breathes without ever looking animated.
      const drift = Math.sin(time / 9000) * 0.06;
      const drift2 = Math.cos(time / 11000) * 0.06;
      const spots: [number, number, Rgb][] = [
        [0.28 + drift, 0.3 + drift2, current[0]!],
        [0.74 - drift2, 0.26 + drift, current[1]!],
        [0.24 - drift, 0.76 - drift2, current[2]!],
        [0.78 + drift2, 0.78 - drift, current[3]!],
      ];

      for (const [x, y, color] of spots) {
        const radius = Math.max(width, height) * 0.55;
        const gradient = ctx.createRadialGradient(
          x * width,
          y * height,
          0,
          x * width,
          y * height,
          radius,
        );
        gradient.addColorStop(0, css(color, 0.5));
        gradient.addColorStop(0.55, css(color, 0.14));
        gradient.addColorStop(1, css(color, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
    },
  };
}
