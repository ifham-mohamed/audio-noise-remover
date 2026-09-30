/** Bounded, local presence EQ for canonical interleaved float PCM. */
export const VOICE_CLARITY_VERSION = "presence-peaking-eq-v1";
export const VOICE_CLARITY_CENTER_HZ = 3_000;
export const VOICE_CLARITY_Q = 0.8;
export const VOICE_CLARITY_MAX_GAIN_DB = 4;
export const VOICE_CLARITY_MAX_PEAK = 0.98;

export type VoiceClarityCoefficients = { b0: number; b1: number; b2: number; a1: number; a2: number; gainDb: number };

export function voiceClarityGainDb(intensity: number): number {
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100) throw new RangeError("Voice clarity intensity must be between 0 and 100.");
  return (intensity / 100) * VOICE_CLARITY_MAX_GAIN_DB;
}

export function createVoiceClarityCoefficients(sampleRate: number, intensity: number): VoiceClarityCoefficients {
  if (!Number.isFinite(sampleRate) || sampleRate <= VOICE_CLARITY_CENTER_HZ * 2) throw new RangeError("Voice clarity requires a sample rate above 6 kHz.");
  const gainDb = voiceClarityGainDb(intensity);
  const A = 10 ** (gainDb / 40);
  const omega = (2 * Math.PI * VOICE_CLARITY_CENTER_HZ) / sampleRate;
  const alpha = Math.sin(omega) / (2 * VOICE_CLARITY_Q);
  const a0 = 1 + alpha / A;
  const coefficients = {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * Math.cos(omega)) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * Math.cos(omega)) / a0,
    a2: (1 - alpha / A) / a0,
    gainDb,
  };
  if (!Object.values(coefficients).every(Number.isFinite)) throw new RangeError("Voice clarity produced invalid filter coefficients.");
  return coefficients;
}

export function applyVoiceClarity(input: Float32Array, sampleRate: number, intensity: number): Float32Array {
  if (!(input instanceof Float32Array) || input.length === 0) throw new TypeError("Voice clarity requires non-empty float PCM.");
  for (const sample of input) if (!Number.isFinite(sample)) throw new TypeError("Voice clarity input contains a non-finite sample.");
  const c = createVoiceClarityCoefficients(sampleRate, intensity);
  if (intensity === 0) return input.slice();
  const output = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, peak = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!;
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    if (!Number.isFinite(y)) throw new TypeError("Voice clarity produced a non-finite sample.");
    output[i] = y;
    peak = Math.max(peak, Math.abs(y));
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  const headroomScale = peak > VOICE_CLARITY_MAX_PEAK ? VOICE_CLARITY_MAX_PEAK / peak : 1;
  for (let i = 0; i < output.length; i++) {
    const sample = output[i]! * headroomScale;
    if (!Number.isFinite(sample)) throw new TypeError("Voice clarity produced a non-finite sample.");
    output[i] = Math.max(-VOICE_CLARITY_MAX_PEAK, Math.min(VOICE_CLARITY_MAX_PEAK, sample));
  }
  return output;
}
