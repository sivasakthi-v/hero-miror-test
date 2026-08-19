/** Normalised against the full source frame, 0..1. Never in pixels — see transform/viewport. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Semantic points the art code is allowed to know about (blueprint §28). */
export interface FaceAnchors {
  leftEye: Landmark;
  rightEye: Landmark;
  leftBrow: Landmark;
  rightBrow: Landmark;
  noseTip: Landmark;
  mouthCenter: Landmark;
  leftCheek: Landmark;
  rightCheek: Landmark;
  forehead: Landmark;
  chin: Landmark;
  leftJaw: Landmark;
  rightJaw: Landmark;
}

export interface Expression {
  smile: number;
  mouthOpen: number;
  browLift: number;
  eyeOpen: number;
  /** Composite signals — a frown alone also means concentration. See vision/expression. */
  sadness: number;
  surprise: number;
}

export interface FaceState {
  present: boolean;
  /** All 478 points, smoothed. The renderer reads these; React never does. */
  landmarks: Landmark[];
  anchors: FaceAnchors | null;
  expression: Expression;
  /** performance.now() of the frame these came from. */
  timestamp: number;
}

// ---- worker protocol ----

export type WorkerRequest =
  | { type: 'init'; wasmPath: string; modelPath: string }
  | { type: 'detect'; bitmap: ImageBitmap; timestamp: number }
  | { type: 'close' };

export type WorkerResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'error'; message: string }
  | {
      type: 'result';
      timestamp: number;
      landmarks: Landmark[] | null;
      blendshapes: Record<string, number> | null;
    };
