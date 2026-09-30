/** Local CPU-only, whole-buffer mono normalization. See docs/loudness-normalization.md. */
export const LOUDNESS_NORMALIZATION_VERSION = "bs1770-mono-gain-v1";
export const LOUDNESS_SAMPLE_RATE = 48_000;
export const LOUDNESS_MIN_TARGET_LUFS = -24;
export const LOUDNESS_MAX_TARGET_LUFS = -12;
export const LOUDNESS_MAX_TRUE_PEAK_DBTP = -1;
export const LOUDNESS_PEAK_RESERVE_DB = 1;
export const LOUDNESS_TARGET_TOLERANCE_LU = 0.1;
const HOP = 4_800;
const BLOCK = 4 * HOP;
const PEAK_LIMIT = 10 ** (LOUDNESS_MAX_TRUE_PEAK_DBTP / 20);
const ABSOLUTE_GATE = 10 ** ((-70 + 0.691) / 10);

export type LoudnessOptions = {
  /** Metadata must describe mono. Interleaved stereo cannot be inferred from samples. */
  channels?: number;
  signal?: AbortSignal;
  /** Synchronous cooperative checkpoint; may abort signal or throw. Never mutate PCM. */
  onProgress?: (fraction: number) => void;
  /** Checkpoint interval in samples, 1..48000; default 4800. */
  chunkSize?: number;
};
export type LoudnessMeasurement = {
  integratedLufs: number | null;
  status: "measured" | "silence" | "below-gate" | "short-input";
  blockCount: number;
  gatedBlockCount: number;
  samplePeak: number;
  /** Four-times windowed-sinc estimate, including zero-padded boundary tails. */
  estimatedTruePeakDbtp: number | null;
  /** Estimate plus 1 dB reserve; not a certified continuous-time bound. */
  conservativeTruePeakDbtp: number | null;
};
export type LoudnessNormalizationResult = {
  samples: Float32Array;
  metrics: {
    version: typeof LOUDNESS_NORMALIZATION_VERSION;
    targetLufs: number;
    input: LoudnessMeasurement;
    output: LoudnessMeasurement;
    achievedLufs: number | null;
    appliedGainDb: number;
    headroomLimited: boolean;
    targetUnmet: boolean;
    targetUnmetReason: "headroom" | "unmeasurable" | "measurement-gate" | null;
  };
};

function checkpoint(options: LoudnessOptions, progress: number) {
  const check = () => {
    if (options.signal?.aborted) {
      const error = new Error("Loudness normalization cancelled.") as Error & { code: string };
      error.name = "AbortError";
      error.code = "CANCELLED";
      throw error;
    }
  };
  check();
  options.onProgress?.(progress);
  check();
}

function validate(input: Float32Array, sampleRate: number, options: LoudnessOptions) {
  if (!(input instanceof Float32Array) || input.length === 0) throw new TypeError("Loudness normalization requires non-empty Float32Array PCM.");
  if (sampleRate !== LOUDNESS_SAMPLE_RATE) throw new RangeError("Loudness normalization requires canonical 48 kHz PCM.");
  if ((options.channels ?? 1) !== 1) throw new RangeError("Loudness normalization supports mono only.");
  const chunk = options.chunkSize ?? HOP;
  if (!Number.isInteger(chunk) || chunk < 1 || chunk > LOUDNESS_SAMPLE_RATE) throw new RangeError("Loudness checkpoint interval must be 1..48000 samples.");
  return chunk;
}

const lufs = (energy: number) => -0.691 + 10 * Math.log10(energy);
const db = (peak: number) => peak > 0 ? 20 * Math.log10(peak) : null;

// Three fractional phases of a 24-tap Hann-windowed sinc, DC-normalized.
// Integer samples are checked separately. Finite FIR / 4x sampling is an estimate.
const RADIUS = 12;
const peakPhases = [0.25, 0.5, 0.75].map((phase) => {
  const taps = Array.from({ length: 2 * RADIUS }, (_, i) => {
    const distance = phase - (i - RADIUS + 1);
    const sinc = Math.sin(Math.PI * distance) / (Math.PI * distance);
    return sinc * (0.5 + 0.5 * Math.cos(Math.PI * distance / RADIUS));
  });
  const sum = taps.reduce((a, b) => a + b, 0);
  return taps.map((tap) => tap / sum);
});

/** BS.1770-5 Annex 1 at 48 kHz, channel weight 1; only complete 400 ms blocks.
 * Null LUFS denotes insufficient duration or no blocks above the -70 LUFS gate.
 * Complexity O(n), storage O(n / 4800). Callback progress is monotonic 0..1.
 */
export function measureIntegratedLoudness(input: Float32Array, sampleRate: number, options: LoudnessOptions = {}): LoudnessMeasurement {
  const chunk = validate(input, sampleRate, options);
  checkpoint(options, 0);
  const blocks: number[] = [];
  const segments = [0, 0, 0, 0];
  let segmentEnergy = 0, samplePeak = 0;
  let x1 = 0, x2 = 0, shelf1 = 0, shelf2 = 0, high1 = 0, high2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!;
    if (!Number.isFinite(x)) throw new TypeError("Loudness input contains a non-finite sample.");
    samplePeak = Math.max(samplePeak, Math.abs(x));
    // ITU-R BS.1770-5 Tables 1 and 2, zero initial filter state.
    const shelf = 1.53512485958697 * x - 2.69169618940638 * x1 + 1.19839281085285 * x2
      + 1.69065929318241 * shelf1 - 0.73248077421585 * shelf2;
    const high = shelf - 2 * shelf1 + shelf2 + 1.99004745483398 * high1 - 0.99007225036621 * high2;
    x2 = x1; x1 = x; shelf2 = shelf1; shelf1 = shelf; high2 = high1; high1 = high;
    segmentEnergy += high * high;
    if ((i + 1) % HOP === 0) {
      const segment = (i + 1) / HOP - 1;
      segments[segment % 4] = segmentEnergy;
      segmentEnergy = 0;
      if (segment >= 3) blocks.push(segments.reduce((a, b) => a + b, 0) / BLOCK);
    }
    if ((i + 1) % chunk === 0) checkpoint(options, 0.6 * (i + 1) / input.length);
  }
  checkpoint(options, 0.6);
  // Evaluate reconstructed tails as well as the media span. No filter output is
  // written into the audio: normalization applies one constant gain only.
  let estimatedPeak = samplePeak;
  // The validated full scan proves exact silence has zero reconstructed peak.
  // Skip its costly FIR pass; nonzero (even sub-gate) PCM still needs it.
  const span = samplePeak === 0 ? 0 : input.length + 2 * RADIUS;
  for (let step = 0; step < span; step++) {
    const position = step - RADIUS;
    for (const taps of peakPhases) {
      let value = 0;
      for (let tap = 0; tap < taps.length; tap++) {
        const index = position + tap - RADIUS + 1;
        if (index >= 0 && index < input.length) value += input[index]! * taps[tap]!;
      }
      estimatedPeak = Math.max(estimatedPeak, Math.abs(value));
    }
    if ((step + 1) % chunk === 0) checkpoint(options, 0.6 + 0.4 * (step + 1) / span);
  }
  let absoluteSum = 0, absoluteCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    const energy = blocks[i]!;
    if (energy > ABSOLUTE_GATE) { absoluteSum += energy; absoluteCount++; }
    if (i % chunk === 0) checkpoint(options, 1);
  }
  const gate = Math.max(ABSOLUTE_GATE, absoluteCount ? absoluteSum / absoluteCount / 10 : ABSOLUTE_GATE);
  let gatedSum = 0, gatedBlockCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    const energy = blocks[i]!;
    if (energy > gate) { gatedSum += energy; gatedBlockCount++; }
    if (i % chunk === 0) checkpoint(options, 1);
  }
  const integratedLufs = gatedBlockCount ? lufs(gatedSum / gatedBlockCount) : null;
  const estimatedTruePeakDbtp = db(estimatedPeak);
  checkpoint(options, 1);
  return {
    integratedLufs, status: samplePeak === 0 ? "silence" : input.length < BLOCK ? "short-input" : integratedLufs === null ? "below-gate" : "measured",
    blockCount: blocks.length, gatedBlockCount, samplePeak, estimatedTruePeakDbtp,
    conservativeTruePeakDbtp: estimatedTruePeakDbtp === null ? null : estimatedTruePeakDbtp + LOUDNESS_PEAK_RESERVE_DB,
  };
}

/** Fresh PCM, same length/format. No compression/limiter/clamping or source edits.
 * Synchronous: worker message cancellation requires a yielding caller or a
 * checkpoint callback checking shared cancellation state. AbortSignal alone
 * cannot receive new event-loop messages during this call. No result on abort.
 */
export function applyLoudnessNormalization(input: Float32Array, sampleRate: number, targetLufs: number, options: LoudnessOptions = {}): LoudnessNormalizationResult {
  if (!Number.isFinite(targetLufs) || targetLufs < LOUDNESS_MIN_TARGET_LUFS || targetLufs > LOUDNESS_MAX_TARGET_LUFS) throw new RangeError("Loudness target must be between -24 and -12 LUFS.");
  const chunk = validate(input, sampleRate, options);
  const scoped = (start: number, size: number): LoudnessOptions => ({ ...options, onProgress: (p) => checkpoint(options, start + size * p) });
  const before = measureIntegratedLoudness(input, sampleRate, scoped(0, 0.4));
  const desiredDb = before.integratedLufs === null ? 0 : targetLufs - before.integratedLufs;
  const capDb = before.conservativeTruePeakDbtp === null ? Infinity : LOUDNESS_MAX_TRUE_PEAK_DBTP - before.conservativeTruePeakDbtp;
  // Tiny rounding reserve ensures Float32 storage cannot cross the sample cap.
  const appliedGainDb = Math.min(desiredDb, capDb - 0.00001);
  const headroomLimited = appliedGainDb < desiredDb - 0.0001;
  const gain = 10 ** (appliedGainDb / 20);
  const samples = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    samples[i] = input[i]! * gain;
    if (!Number.isFinite(samples[i]) || Math.abs(samples[i]!) > PEAK_LIMIT) throw new Error("Loudness normalization produced unsafe PCM.");
    if ((i + 1) % chunk === 0) checkpoint(options, 0.4 + 0.2 * (i + 1) / input.length);
  }
  checkpoint(options, 0.6);
  // Re-measure actual Float32 output: absolute gating can change with gain.
  const after = measureIntegratedLoudness(samples, sampleRate, scoped(0.6, 0.4));
  const targetUnmet = after.integratedLufs === null || Math.abs(after.integratedLufs - targetLufs) > LOUDNESS_TARGET_TOLERANCE_LU;
  checkpoint(options, 1);
  return { samples, metrics: {
    version: LOUDNESS_NORMALIZATION_VERSION, targetLufs, input: before, output: after,
    achievedLufs: after.integratedLufs, appliedGainDb, headroomLimited, targetUnmet,
    targetUnmetReason: !targetUnmet ? null : before.integratedLufs === null || after.integratedLufs === null ? "unmeasurable" : headroomLimited ? "headroom" : "measurement-gate",
  } };
}
