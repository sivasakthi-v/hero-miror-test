import { mulberry32 } from '@/lib/rng';
import type { Viewport } from '@/engine/transform/viewport';
import type { QualityTier } from './compositor';

/**
 * Particles for the expression reactions: glitter on a smile, rain for sadness, confetti
 * for a thumbs-up, hearts on a timer.
 *
 * One flat pool, no allocation per particle. A render loop that allocates is a render
 * loop that stutters every time the collector runs — and stutter is exactly what makes
 * an effect feel cheap. The pool is sized once by quality tier and reused forever;
 * emitting revives a dead slot instead of pushing.
 */

export type ParticleKind = 'glitter' | 'rain' | 'confetti' | 'heart';

interface Particle {
  alive: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
}

const POOL_SIZE: Record<QualityTier, number> = { high: 220, balanced: 120, lite: 0 };

export interface ParticleField {
  emit(kind: ParticleKind, count: number, viewport: Viewport, color: string): void;
  update(dtMs: number, viewport: Viewport): void;
  draw(ctx: CanvasRenderingContext2D): void;
  clear(): void;
  readonly liveCount: number;
}

export function createParticleField(tier: QualityTier): ParticleField {
  const size = POOL_SIZE[tier];
  const pool: Particle[] = Array.from({ length: size }, () => ({
    alive: false,
    kind: 'glitter',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    rotation: 0,
    spin: 0,
    color: '#fff',
  }));

  const random = mulberry32(0xc0ffee);
  let live = 0;

  function spawn(): Particle | null {
    for (const particle of pool) if (!particle.alive) return particle;
    // Pool exhausted: drop the request rather than growing. A capped effect is better
    // than an effect that can tank the frame rate when someone grins for a while.
    return null;
  }

  return {
    get liveCount() {
      return live;
    },

    emit(kind, count, viewport, color) {
      for (let i = 0; i < count; i++) {
        const particle = spawn();
        if (!particle) return;
        particle.alive = true;
        particle.kind = kind;
        particle.color = color;
        particle.rotation = random() * Math.PI * 2;

        switch (kind) {
          case 'glitter':
            // Around the frame edge, not over the face — the person stays the subject.
            {
              const edge = random();
              const along = random();
              particle.x = edge < 0.5 ? along * viewport.width : random() * viewport.width;
              particle.y = edge < 0.5 ? (random() < 0.5 ? 0 : viewport.height) : along * viewport.height;
              particle.vx = (random() - 0.5) * 0.02;
              particle.vy = (random() - 0.5) * 0.02;
              particle.maxLife = 700 + random() * 700;
              particle.size = 2 + random() * 3;
              particle.spin = (random() - 0.5) * 0.004;
            }
            break;

          case 'rain':
            particle.x = random() * viewport.width;
            particle.y = -10 - random() * viewport.height * 0.4;
            particle.vx = -0.02;
            particle.vy = 0.35 + random() * 0.25;
            particle.maxLife = 2600;
            particle.size = 6 + random() * 10;
            particle.spin = 0;
            break;

          case 'confetti':
            particle.x = random() * viewport.width;
            particle.y = -12;
            particle.vx = (random() - 0.5) * 0.12;
            particle.vy = 0.12 + random() * 0.14;
            particle.maxLife = 3200;
            particle.size = 4 + random() * 5;
            particle.spin = (random() - 0.5) * 0.012;
            break;

          case 'heart':
            particle.x = random() * viewport.width;
            particle.y = viewport.height + 10;
            particle.vx = (random() - 0.5) * 0.03;
            particle.vy = -(0.04 + random() * 0.05);
            particle.maxLife = 2800;
            particle.size = 7 + random() * 7;
            particle.spin = (random() - 0.5) * 0.002;
            break;
        }

        particle.life = particle.maxLife;
        live++;
      }
    },

    update(dtMs, viewport) {
      // Clamped: after a tab has been hidden, dt can be seconds, and un-clamped physics
      // would teleport every particle off-screen in a single frame.
      const dt = Math.min(dtMs, 50);
      for (const p of pool) {
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          live--;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        if (p.kind === 'confetti') p.vy += 0.00012 * dt; // gravity
        if (p.kind === 'heart') p.x += Math.sin(p.life / 300) * 0.02 * dt; // drift
        if (p.y > viewport.height + 40 || p.y < -60) {
          p.alive = false;
          live--;
        }
      }
    },

    draw(ctx) {
      for (const p of pool) {
        if (!p.alive) continue;
        // Fade in and out rather than popping; the tails are what read as "sparkle".
        const t = p.life / p.maxLife;
        const alpha = Math.min(1, t * 3) * Math.min(1, (1 - t) * 6 + 0.2);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;

        switch (p.kind) {
          case 'glitter':
            drawSparkle(ctx, p.size);
            break;
          case 'rain':
            ctx.globalAlpha = alpha * 0.5;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-1, p.size);
            ctx.stroke();
            break;
          case 'confetti':
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            break;
          case 'heart':
            drawHeart(ctx, p.size);
            break;
        }
        ctx.restore();
      }
    },

    clear() {
      for (const p of pool) p.alive = false;
      live = 0;
    },
  };
}

/** A four-point star. Reads as a sparkle where a circle reads as a dot. */
function drawSparkle(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const inner = size * 0.28;
    ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
    ctx.lineTo(Math.cos(angle + Math.PI / 4) * inner, Math.sin(angle + Math.PI / 4) * inner);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 16;
  ctx.beginPath();
  ctx.moveTo(0, 4 * s);
  ctx.bezierCurveTo(-8 * s, -4 * s, -3 * s, -10 * s, 0, -4 * s);
  ctx.bezierCurveTo(3 * s, -10 * s, 8 * s, -4 * s, 0, 4 * s);
  ctx.closePath();
  ctx.fill();
}
