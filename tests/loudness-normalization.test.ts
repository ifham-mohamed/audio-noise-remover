import { describe, expect, it } from "vitest";
import { applyLoudnessNormalization, measureIntegratedLoudness, LOUDNESS_NORMALIZATION_VERSION } from "@/features/processing/loudness-normalization";

const RATE = 48_000;
function tone(hz = 997, peak = 0.1, seconds = 2, phase = 0) {
  return Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => peak * Math.sin(2 * Math.PI * hz * i / RATE + phase));
}
function join(...parts: Float32Array[]) {
  const result = new Float32Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

describe("mono BS.1770 loudness normalization", () => {
  it("matches the ITU 997 Hz full-scale mono reference (-3.01 LKFS) and gain scaling", () => {
    const full = measureIntegratedLoudness(tone(997, 1), RATE);
    const quiet = measureIntegratedLoudness(tone(), RATE);
    expect(full.integratedLufs).toBeCloseTo(-3.01, 1);
    expect(quiet.integratedLufs! - full.integratedLufs!).toBeCloseTo(-20, 4);
    expect(full.blockCount).toBe(17);
    expect(full.gatedBlockCount).toBe(17);
  });

  it("matches independently calculated steady-state K filter frequency response", () => {
    // Evaluate each published biquad H(e^jw), independent of the time filter.
    function energyGain(hz: number, b: number[], a: number[]) {
      const w = 2 * Math.PI * hz / RATE;
      const power = (c: number[]) => {
        const real = c.reduce((s, v, i) => s + v * Math.cos(w * i), 0);
        const imaginary = c.reduce((s, v, i) => s - v * Math.sin(w * i), 0);
        return real * real + imaginary * imaginary;
      };
      return power(b) / power(a);
    }
    for (const hz of [40, 100, 1_000, 4_000, 12_000]) {
      const power = 0.1 ** 2 / 2
        * energyGain(hz, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
        * energyGain(hz, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
      expect(measureIntegratedLoudness(tone(hz), RATE).integratedLufs!).toBeCloseTo(-0.691 + 10 * Math.log10(power), 1);
    }
  });

  it("gates silent and quiet passages rather than averaging programme RMS", () => {
    const loud = tone(997, 0.1, 4);
    const alone = measureIntegratedLoudness(loud, RATE);
    const mixed = measureIntegratedLoudness(join(loud, tone(997, 0.001, 4), new Float32Array(4 * RATE)), RATE);
    expect(mixed.integratedLufs!).toBeCloseTo(alone.integratedLufs!, 0);
    expect(mixed.gatedBlockCount).toBeLessThan(mixed.blockCount / 2);
    const belowGate = measureIntegratedLoudness(tone(997, 0.0001), RATE);
    expect(belowGate.status).toBe("below-gate");
    expect(belowGate.integratedLufs).toBeNull();
    expect(belowGate.gatedBlockCount).toBe(0);
  });

  it("uses complete 400 ms blocks and omits incomplete trailing blocks only from loudness", () => {
    const short = measureIntegratedLoudness(tone(997, 0.1, 0.4 - 1 / RATE), RATE);
    expect(short.status).toBe("short-input");
    expect(short.integratedLufs).toBeNull();
    expect(measureIntegratedLoudness(tone(997, 0.1, 0.4), RATE).blockCount).toBe(1);
    const signal = join(tone(997, 0.1, 0.4), new Float32Array([2]));
    expect(measureIntegratedLoudness(signal, RATE).integratedLufs).toBeCloseTo(-23.01, 1);
    const normalized = applyLoudnessNormalization(signal, RATE, -16);
    expect(normalized.metrics.headroomLimited).toBe(true);
    expect(normalized.samples[normalized.samples.length - 1]).toBeLessThan(10 ** (-1 / 20));
  });

  it("normalizes both upward and downward at target endpoints, preserving source and length", () => {
    for (const [peak, target] of [[0.02, -12], [0.8, -24], [0.1, -16]] as const) {
      const input = tone(997, peak);
      const original = input.slice();
      const result = applyLoudnessNormalization(input, RATE, target);
      expect(result.samples).not.toBe(input);
      expect(input).toEqual(original);
      expect(result.samples.length).toBe(input.length);
      expect(result.metrics.version).toBe(LOUDNESS_NORMALIZATION_VERSION);
      expect(result.metrics.achievedLufs).toBeCloseTo(target, 2);
      expect(result.metrics.achievedLufs).toBe(measureIntegratedLoudness(result.samples, RATE).integratedLufs);
      expect(result.metrics.targetUnmet).toBe(false);
      expect(result.metrics.output.conservativeTruePeakDbtp!).toBeLessThanOrEqual(-1);
      expect(result.samples.every(Number.isFinite)).toBe(true);
      const index = 777;
      expect(result.samples[index]! / input[index]!).toBeCloseTo(10 ** (result.metrics.appliedGainDb / 20), 5);
    }
  }, 20_000);

  it("reports headroom-constrained actual LUFS and applies linear attenuation without clipping", () => {
    const input = tone(997, 0.01);
    input[32_001] = 1.8;
    const result = applyLoudnessNormalization(input, RATE, -12);
    expect(result.metrics.headroomLimited).toBe(true);
    expect(result.metrics.targetUnmet).toBe(true);
    expect(result.metrics.targetUnmetReason).toBe("headroom");
    expect(result.metrics.achievedLufs!).toBeLessThan(-12.1);
    expect(result.metrics.output.conservativeTruePeakDbtp!).toBeLessThanOrEqual(-1);
    expect(result.metrics.output.samplePeak).toBeLessThan(10 ** (-1 / 20));
    expect(result.samples[32_001]! / input[32_001]!).toBeCloseTo(result.samples[777]! / input[777]!, 5);
  });

  it("detects intersample peaks missed by sample maxima and protects short boundary transients", () => {
    // 12 kHz at pi/4: stored samples peak at sqrt(1/2), reconstructed sine at 1.
    const measurement = measureIntegratedLoudness(tone(12_000, 1, 1, Math.PI / 4), RATE);
    expect(measurement.samplePeak).toBeCloseTo(Math.SQRT1_2, 5);
    expect(measurement.estimatedTruePeakDbtp!).toBeGreaterThan(-0.1);
    expect(measurement.estimatedTruePeakDbtp!).toBeGreaterThan(20 * Math.log10(measurement.samplePeak) + 2.9);
    for (const signal of [new Float32Array([2]), new Float32Array([1, 1, -1, -1]), tone(12_000, 2, 0.02, Math.PI / 4)]) {
      const result = applyLoudnessNormalization(signal, RATE, -12);
      expect(result.metrics.output.conservativeTruePeakDbtp!).toBeLessThanOrEqual(-1);
      expect(result.metrics.achievedLufs).toBeNull();
      expect(result.metrics.appliedGainDb).toBeLessThan(0);
      expect(result.metrics.targetUnmetReason).toBe("unmeasurable");
    }
  });

  it("copies silence/short/sub-gate input without boosting and explicitly reports unmeasurable LUFS", () => {
    for (const signal of [new Float32Array(RATE), tone(997, 0.1, 0.1), tone(997, 0.0001)]) {
      const result = applyLoudnessNormalization(signal, RATE, -16);
      expect(result.samples).toEqual(signal);
      expect(result.samples).not.toBe(signal);
      expect(result.metrics.appliedGainDb).toBe(0);
      expect(result.metrics.achievedLufs).toBeNull();
      expect(result.metrics.targetUnmet).toBe(true);
    }
    const silence = measureIntegratedLoudness(new Float32Array(RATE), RATE);
    expect(silence.status).toBe("silence");
    expect(silence.estimatedTruePeakDbtp).toBeNull();
  }, 20_000);

  it("skips silence interpolation while preserving counts, progress and final cancellation", () => {
    const signal = new Float32Array(RATE);
    const progress: number[] = [];
    const measurement = measureIntegratedLoudness(signal, RATE, { onProgress: (p) => progress.push(p) });
    expect(measurement).toEqual({
      integratedLufs: null, status: "silence", blockCount: 7, gatedBlockCount: 0,
      samplePeak: 0, estimatedTruePeakDbtp: null, conservativeTruePeakDbtp: null,
    });
    // No FIR work checkpoints between the full scan and gate completion.
    expect(progress.some((p) => p > 0.6 && p < 1)).toBe(false);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1]!)).toBe(true);
    const controller = new AbortController();
    expect(() => measureIntegratedLoudness(signal, RATE, {
      signal: controller.signal, onProgress: (p) => { if (p === 1) controller.abort(); },
    })).toThrow(expect.objectContaining({ code: "CANCELLED" }));
    // A final nonzero or invalid sample must prevent an incorrect silence shortcut.
    signal[signal.length - 1] = 0.01;
    expect(measureIntegratedLoudness(signal, RATE).samplePeak).toBeGreaterThan(0);
    signal[signal.length - 1] = NaN;
    expect(() => measureIntegratedLoudness(signal, RATE)).toThrow(/non-finite/);
  });

  it("compares peak estimation and headroom with independent analytic waveforms sampled at 16x", () => {
    // The reference evaluates known continuous waveforms, without FIR coefficients
    // or the meter's interpolation algorithm. Smooth endpoints suppress tail effects.
    const length = 960;
    for (const hz of [6_000, 12_000, 18_000]) {
      const waveform = (position: number) =>
        0.5 * (1 - Math.cos(2 * Math.PI * position / length))
        * Math.sin(2 * Math.PI * hz * position / RATE + Math.PI / 4);
      const signal = Float32Array.from({ length }, (_, i) => waveform(i));
      let referencePeak = 0;
      for (let i = 0; i <= length * 16; i++) referencePeak = Math.max(referencePeak, Math.abs(waveform(i / 16)));
      const referenceDbtp = 20 * Math.log10(referencePeak);
      const measurement = measureIntegratedLoudness(signal, RATE);
      expect(Math.abs(measurement.estimatedTruePeakDbtp! - referenceDbtp)).toBeLessThan(0.35);
      expect(measurement.conservativeTruePeakDbtp!).toBeGreaterThanOrEqual(referenceDbtp);
      const normalized = applyLoudnessNormalization(signal, RATE, -16);
      const independentlyPredictedOutputDbtp = referenceDbtp + normalized.metrics.appliedGainDb;
      expect(independentlyPredictedOutputDbtp).toBeLessThanOrEqual(-1);
    }
  });

  it("rejects empty/non-finite/wrong-format PCM, stereo metadata and unsupported parameters", () => {
    expect(() => measureIntegratedLoudness(new Float32Array(), RATE)).toThrow(/non-empty/);
    expect(() => measureIntegratedLoudness(new Float64Array([0]) as unknown as Float32Array, RATE)).toThrow(/Float32Array/);
    for (const value of [NaN, Infinity, -Infinity]) {
      const signal = tone(); signal[signal.length - 1] = value;
      expect(() => measureIntegratedLoudness(signal, RATE)).toThrow(/non-finite/);
    }
    for (const rate of [44_100, NaN, 0]) expect(() => measureIntegratedLoudness(tone(), rate)).toThrow(/48 kHz/);
    for (const channels of [0, 2, NaN]) expect(() => measureIntegratedLoudness(tone(), RATE, { channels })).toThrow(/mono/);
    for (const target of [-24.1, -11.9, -9, Infinity, NaN]) expect(() => applyLoudnessNormalization(tone(), RATE, target)).toThrow(/-24 and -12/);
    for (const chunkSize of [0, 1.5, 48_001, NaN]) expect(() => measureIntegratedLoudness(tone(), RATE, { chunkSize })).toThrow(/checkpoint/);
  });

  it("reports monotonic bounded progress and produces identical PCM across checkpoint sizes", () => {
    const progress: number[] = [];
    const input = tone(997, 0.1, 0.51);
    const a = applyLoudnessNormalization(input, RATE, -16, { chunkSize: 137, onProgress: (p) => progress.push(p) });
    const b = applyLoudnessNormalization(input, RATE, -16, { chunkSize: 48_000 });
    expect(a).toEqual(b);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]!))).toBe(true);
  });

  it("throws CANCELLED before work, during analysis/gain/remeasurement and at completion without editing input", () => {
    for (const threshold of [0, 0.05, 0.3, 0.5, 0.8, 1]) {
      const controller = new AbortController();
      const input = tone(997, 0.1, 0.5);
      const original = input.slice();
      let returned = false;
      expect(() => {
        applyLoudnessNormalization(input, RATE, -16, { signal: controller.signal, onProgress: (p) => { if (p >= threshold) controller.abort(); } });
        returned = true;
      }).toThrow(expect.objectContaining({ name: "AbortError", code: "CANCELLED" }));
      expect(returned).toBe(false);
      expect(input).toEqual(original);
    }
    const controller = new AbortController(); controller.abort();
    expect(() => applyLoudnessNormalization(tone(), RATE, -16, { signal: controller.signal })).toThrow(/cancelled/);
    expect(() => applyLoudnessNormalization(tone(), RATE, -16, { onProgress: () => { throw new Error("worker cancelled"); } })).toThrow(/worker cancelled/);
  });
});
