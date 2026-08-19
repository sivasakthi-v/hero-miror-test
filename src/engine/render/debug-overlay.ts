import { backingSize, projectNormalized, type Viewport } from '@/engine/transform/viewport';
import { FACE_OVAL } from '@/engine/vision/mesh';
import type { FaceState, Landmark } from '@/engine/vision/types';

/**
 * The P2 gate made visible (docs/PLAN.md §11, blueprint §59).
 *
 * Before a single artistic stroke exists, this draws the face oval and the named anchors
 * through the real transform. If the outline sits on the face at both 3:2 and 4:5, and
 * moves the right way when you lean, then tracking, cropping, mirroring and scaling are
 * all correct — and the art built on top inherits that. If we skipped straight to pencil
 * strokes, every one of those four could be wrong and we would be debugging aesthetics
 * instead of maths.
 */



export interface DebugStyle {
  oval: string;
  anchor: string;
  text: string;
}

const DEFAULT_STYLE: DebugStyle = {
  oval: 'rgba(95, 141, 255, 0.9)',
  anchor: 'rgba(255, 122, 69, 0.95)',
  text: 'rgba(243, 240, 232, 0.75)',
};

export function resizeCanvas(canvas: HTMLCanvasElement, viewport: Viewport): void {
  const { width, height } = backingSize(viewport);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function drawDebugFace(
  ctx: CanvasRenderingContext2D,
  face: FaceState,
  viewport: Viewport,
  style: DebugStyle = DEFAULT_STYLE,
): void {
  const { dpr } = viewport;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  if (!face.present || face.landmarks.length === 0) {
    ctx.restore();
    return;
  }

  // Face oval, drawn from MediaPipe's own connection list rather than hand-listed
  // indices, so it stays correct if the mesh is ever renumbered.
  ctx.strokeStyle = style.oval;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [start, end] of FACE_OVAL) {
    const a = face.landmarks[start];
    const b = face.landmarks[end];
    if (!a || !b) continue;
    const p = projectNormalized(a, viewport);
    const q = projectNormalized(b, viewport);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();

  // Named anchors: if these land on the wrong features, the art will too.
  if (face.anchors) {
    ctx.fillStyle = style.anchor;
    for (const point of Object.values(face.anchors) as Landmark[]) {
      const p = projectNormalized(point, viewport);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = style.text;
  ctx.font = '11px ui-monospace, monospace';
  const e = face.expression;
  ctx.fillText(
    `smile ${e.smile.toFixed(2)}  open ${e.mouthOpen.toFixed(2)}  brow ${e.browLift.toFixed(2)}  eye ${e.eyeOpen.toFixed(2)}`,
    10,
    viewport.height - 10,
  );

  ctx.restore();
}
