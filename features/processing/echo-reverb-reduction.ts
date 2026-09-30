import FFT from "fft.js";

export const ECHO_REVERB_REDUCTION_VERSION = "spectral-late-tail-v1-experimental";
export const echoReverbReductionDeclaration = {
  version: ECHO_REVERB_REDUCTION_VERSION,
  qualification: "experimental",
  input: { sampleRate: 48_000, channels: 1, format: "float32" },
  output: { sampleRate: 48_000, channels: 1, format: "float32" },
  requiredCapabilities: ["cpu"],
  supportsCancellation: true,
  intensity: { min: 0, max: 100 },
} as const;

export type EchoReverbReductionOptions = {
  intensity: number;
  signal?: AbortSignal;
  /** Local stage fraction, 0..1. The coordinator owns job progress/state. */
  onProgress?: (fraction: number) => void;
};

export type EchoReverbReductionResult = {
  samples: Float32Array;
  metrics: {
    algorithmVersion: typeof ECHO_REVERB_REDUCTION_VERSION;
    qualification: "experimental";
    framesProcessed: number;
    meanSpectralGain: number;
    headroomScale: number;
  };
};

const SIZE = 2048;
const HOP = 512;
const BINS = SIZE / 2 + 1;
// 64 ms separation protects the initial/direct arrival. Energy decays 60 dB
// in 900 ms; this is a fixed prior, NOT a measured room RT60.
const DELAY_FRAMES = 6;
const DECAY = Math.exp((-6 * Math.LN10 * HOP) / (48_000 * 0.9));
const MIN_GAIN = 0.55;
const MAX_PEAK = 0.999;

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Echo/reverb reduction cancelled.");
    error.name = "AbortError";
    throw Object.assign(error, { code: "CANCELLED" as const });
  }
}

/**
 * Single-channel spectral late-tail suppression, not acoustic echo cancellation
 * or blind room inversion. Reduces weak delayed energy in bins with a stronger
 * recent history. Strong/novel bins retain unity gain; no phase reconstruction.
 * Whole-buffer CPU processing; input is immutable. See docs for limitations.
 */
export async function applyEchoReverbReduction(
  input: Float32Array,
  sampleRate: number,
  options: EchoReverbReductionOptions,
): Promise<EchoReverbReductionResult> {
  if (!(input instanceof Float32Array)) throw new TypeError("Expected mono Float32Array PCM.");
  if (sampleRate !== 48_000) throw new RangeError("Echo/reverb reduction requires 48 kHz mono PCM.");
  if (!Number.isFinite(options.intensity) || options.intensity < 0 || options.intensity > 100) {
    throw new RangeError("Echo/reverb intensity must be between 0 and 100.");
  }
  checkCancellation(options.signal);
  options.onProgress?.(0);
  for (let i = 0; i < input.length; i++) {
    if (!Number.isFinite(input[i]) || Math.abs(input[i]) > 1) {
      throw new RangeError("Expected finite normalized PCM in [-1, 1].");
    }
    if (i % 262_144 === 262_143) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkCancellation(options.signal);
    }
  }
  const finish = (samples: Float32Array, framesProcessed: number, meanSpectralGain: number, headroomScale: number): EchoReverbReductionResult => {
    checkCancellation(options.signal);
    options.onProgress?.(1);
    checkCancellation(options.signal);
    return { samples, metrics: { algorithmVersion: ECHO_REVERB_REDUCTION_VERSION, qualification: "experimental", framesProcessed, meanSpectralGain, headroomScale } };
  };
  if (options.intensity === 0 || input.length === 0) return finish(input.slice(), 0, 1, 1);

  const fft = new FFT(SIZE);
  const frame = new Float64Array(SIZE);
  const spectrum = new Float64Array(SIZE * 2);
  const inverse = new Float64Array(SIZE * 2);
  const window = Float64Array.from({ length: SIZE }, (_, i) => Math.sin(Math.PI * (i + 0.5) / SIZE));
  const windowSquared = window.map((value) => value ** 2);
  const suppressionStrength = (options.intensity / 100) * (1 - MIN_GAIN);
  const history = Array.from({ length: DELAY_FRAMES }, () => new Float64Array(BINS));
  const envelope = new Float64Array(BINS);
  const previousGain = new Float64Array(BINS).fill(1);
  const sum = new Float64Array(input.length);
  const weights = new Float64Array(input.length);
  const count = Math.ceil((input.length + SIZE - HOP) / HOP);
  let gainSum = 0;
  for (let f = 0; f < count; f++) {
    checkCancellation(options.signal);
    const start = f * HOP - (SIZE - HOP);
    for (let i = 0; i < SIZE; i++) frame[i] = (input[start + i] ?? 0) * window[i];
    fft.realTransform(spectrum, frame);
    const delayed = history[f % DELAY_FRAMES];
    for (let k = 0; k < BINS; k++) {
      const power = spectrum[2 * k] ** 2 + spectrum[2 * k + 1] ** 2;
      // A decaying historical peak estimates possible late energy. Suppression
      // requires current power < half that peak; rising speech is protected.
      const late = delayed[k];
      const dominance = late > 1e-16 ? Math.max(0, 1 - power / (0.5 * late)) : 0;
      const target = 1 - suppressionStrength * dominance;
      // Immediate release to unity protects onsets; smoothed attenuation avoids
      // abruptly modulating the spectrum as a tail begins.
      const gain = target >= previousGain[k] ? target : 0.65 * target + 0.35 * previousGain[k];
      previousGain[k] = gain;
      gainSum += gain;
      spectrum[2 * k] *= gain;
      spectrum[2 * k + 1] *= gain;
      envelope[k] = Math.max(power, envelope[k] * DECAY);
      delayed[k] = envelope[k];
    }
    fft.completeSpectrum(spectrum);
    fft.inverseTransform(inverse, spectrum);
    for (let i = 0; i < SIZE; i++) {
      const index = start + i;
      if (index >= 0 && index < input.length) {
        sum[index] += inverse[2 * i] * window[i];
        weights[index] += windowSquared[i];
      }
    }
    if ((f + 1) % 16 === 0) {
      options.onProgress?.(0.9 * (f + 1) / count);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkCancellation(options.signal);
    }
  }
  let peak = 0;
  for (let i = 0; i < sum.length; i++) {
    sum[i] /= weights[i];
    if (!Number.isFinite(sum[i])) throw new Error("PROCESSING_FAILED: non-finite reconstructed PCM.");
    peak = Math.max(peak, Math.abs(sum[i]));
    if (i % 262_144 === 262_143) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkCancellation(options.signal);
    }
  }
  // Uniform headroom scaling, never sample clipping. Metrics make its effect
  // distinguishable from frequency/time-selective suppression.
  const scale = peak > MAX_PEAK ? MAX_PEAK / peak : 1;
  const output = new Float32Array(input.length);
  for (let i = 0; i < output.length; i++) {
    output[i] = sum[i] * scale;
    if (i % 262_144 === 262_143) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkCancellation(options.signal);
    }
  }
  return finish(output, count, count ? gainSum / (count * BINS) : 1, scale);
}
