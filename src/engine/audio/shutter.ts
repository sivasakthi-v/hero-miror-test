/**
 * The shutter sound, synthesised rather than loaded.
 *
 * A real mechanical shutter is two events a few milliseconds apart — the blades opening
 * and the mirror slapping back — which is why a single click sounds like a UI beep and
 * two sound like a camera. Both are built here from a noise burst and a low thump.
 *
 * Synthesis over a sample file for three reasons: no asset to download, nothing to
 * decode before the first press, and no third-party request on a page that promises
 * none. It is a few hundred bytes of code against a few tens of kilobytes of audio.
 */

let context: AudioContext | null = null;

/**
 * Created on the first press, never at load. Browsers suspend an AudioContext that is
 * constructed without a user gesture, and a suspended context that later resumes is how
 * you get a click arriving half a second late.
 */
function getContext(): AudioContext | null {
  if (context) return context;
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

/** A short burst of filtered noise: the blades. */
function click(ctx: AudioContext, at: number, duration: number, gain: number, frequency: number): void {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Decaying white noise. The exponent is what separates a click from a hiss.
    const decay = Math.pow(1 - i / frames, 8);
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 0.9;

  const amp = ctx.createGain();
  amp.gain.value = gain;

  source.connect(filter).connect(amp).connect(ctx.destination);
  source.start(at);
  source.stop(at + duration);
}

/** A low, short thump: the body of the camera. */
function thump(ctx: AudioContext, at: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, at);
  osc.frequency.exponentialRampToValueAtTime(60, at + 0.06);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(0.09, at + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);

  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.1);
}

/**
 * Deliberately quiet. Nobody asked for sound on a portfolio, so it has to be the volume
 * of a real shutter heard across a room — noticed, never startling. It is also skipped
 * entirely for visitors who ask for reduced motion, who are frequently asking for less
 * sensory load in general.
 */
export function playShutter(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);

  const now = ctx.currentTime;
  click(ctx, now, 0.035, 0.16, 2600); // blades open
  thump(ctx, now + 0.004);
  click(ctx, now + 0.052, 0.045, 0.11, 1800); // blades close
}

/** Released when the hero unmounts; an open AudioContext holds an audio device awake. */
export function disposeShutter(): void {
  void context?.close().catch(() => undefined);
  context = null;
}
