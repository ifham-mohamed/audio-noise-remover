import { describe, expect, it } from "vitest";
import { applyEchoReverbReduction, ECHO_REVERB_REDUCTION_VERSION, echoReverbReductionDeclaration } from "@/features/processing/echo-reverb-reduction";

const RATE = 48_000;
const at = (seconds: number) => Math.round(seconds * RATE);
function energy(x: Float32Array, start = 0, end = x.length): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += x[i] ** 2;
  return sum;
}
const db = (ratio: number) => 10 * Math.log10(ratio);
// Compare stored Float32 bits directly, including signed zero, without the
// assertion library constructing a deep comparison of every sample.
function sameBits(left: Float32Array, right: Float32Array): boolean {
  if (left.length !== right.length) return false;
  const leftBits = new Uint32Array(left.buffer, left.byteOffset, left.length);
  const rightBits = new Uint32Array(right.buffer, right.byteOffset, right.length);
  return leftBits.every((value, i) => value === rightBits[i]);
}
function fixture(reflections = [[0.08, 0.34], [0.137, -0.23], [0.211, 0.15], [0.297, 0.08]]) {
  const dry = new Float32Array(at(2.4));
  // Harmonic voiced bursts with changing fundamental, formant-shaped partials,
  // and short deterministic unvoiced onsets. Not a recorded-speech benchmark.
  let seed = 73;
  for (const [burst, start] of [0.1, 0.85, 1.6].entries()) {
    let phase = 0;
    for (let i = 0; i < at(0.22); i++) {
      const t = i / RATE;
      phase += 2 * Math.PI * (117 + burst * 19 + 15 * t) / RATE;
      const envelope = Math.min(1, t / 0.015, (0.22 - t) / 0.025);
      let voiced = 0;
      for (let h = 1; h <= 26; h++) {
        const frequency = h * (117 + burst * 19);
        const formant = Math.exp(-(((frequency - 700) / 350) ** 2)) + 0.6 * Math.exp(-(((frequency - 1700) / 500) ** 2));
        voiced += Math.sin(h * phase + h * 0.13) * (0.1 + formant) / h;
      }
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const unvoiced = ((seed / 2 ** 32) * 2 - 1) * 0.03 * Math.exp(-t / 0.025);
      dry[at(start) + i] = envelope * (0.25 * voiced + unvoiced);
    }
  }
  const wet = dry.slice();
  for (const [delay, gain] of reflections) {
    for (let i = at(delay); i < wet.length; i++) wet[i] += gain * dry[i - at(delay)];
  }
  return { dry, wet };
}
function evidence(dry: Float32Array, wet: Float32Array, output: Float32Array) {
  let beforeTail = 0, afterTail = 0, beforeDirect = 0, afterDirect = 0, errorBefore = 0, errorAfter = 0;
  for (const start of [0.1, 0.85, 1.6]) {
    beforeTail += energy(wet, at(start + 0.25), at(start + 0.52));
    afterTail += energy(output, at(start + 0.25), at(start + 0.52));
    beforeDirect += energy(dry, at(start + 0.02), at(start + 0.06));
    afterDirect += energy(output, at(start + 0.02), at(start + 0.06));
  }
  for (let i = 0; i < dry.length; i++) {
    errorBefore += (wet[i] - dry[i]) ** 2;
    errorAfter += (output[i] - dry[i]) ** 2;
  }
  return { tailReductionDb: db(beforeTail / afterTail), directLossDb: db(beforeDirect / afterDirect), errorImprovementDb: db(errorBefore / errorAfter) };
}

describe("experimental spectral late-tail suppression", () => {
  it("passes reflection attenuation and direct speech gates at maximum intensity", async () => {
    const { dry, wet } = fixture();
    const original = wet.slice();
    const { samples, metrics } = await applyEchoReverbReduction(wet, RATE, { intensity: 100 });
    const measured = evidence(dry, wet, samples);
    console.info("echo/reverb synthetic evidence", measured);
    expect(measured.tailReductionDb).toBeGreaterThan(2);
    expect(Math.abs(measured.directLossDb)).toBeLessThan(1);
    expect(measured.errorImprovementDb).toBeGreaterThan(0.5);
    expect(samples.length).toBe(wet.length);
    expect(sameBits(wet, original)).toBe(true);
    expect(metrics.headroomScale).toBe(1);
    expect(metrics.algorithmVersion).toBe(ECHO_REVERB_REDUCTION_VERSION);
    expect(echoReverbReductionDeclaration.qualification).toBe("experimental");
    expect(samples.every((x) => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);
  });

  it("provides a bit-exact copied bypass and increasing tail reduction", async () => {
    const { dry, wet } = fixture();
    const reductions = [];
    for (const intensity of [0, 25, 50, 100]) {
      const { samples } = await applyEchoReverbReduction(wet, RATE, { intensity });
      if (intensity === 0) { expect(sameBits(samples, wet)).toBe(true); expect(samples).not.toBe(wet); }
      reductions.push(evidence(dry, wet, samples).tailReductionDb);
    }
    expect(reductions[0]).toBe(0);
    for (let i = 1; i < reductions.length; i++) expect(reductions[i]).toBeGreaterThan(reductions[i - 1]);
    const edges = new Float32Array([0.5, 0, -0, 1, -1, 0.5]).subarray(1, 5);
    const bypass = await applyEchoReverbReduction(edges, RATE, { intensity: 0 });
    expect(sameBits(bypass.samples, edges)).toBe(true);
    expect(bypass.samples.buffer).not.toBe(edges.buffer);
  }, 20_000); // Four complete passes share CPU with browser/integration tests.

  it.each([
    { name: "single 120ms echo", reflections: [[0.12, 0.4]] },
    { name: "three positive reflections", reflections: [[0.095, 0.3], [0.183, 0.18], [0.281, 0.1]] },
    { name: "dense decaying late reflections", reflections: Array.from({ length: 32 }, (_, i) => [0.065 + i * 0.0113, 0.12 * Math.exp(-i / 9) * (i % 3 === 0 ? -1 : 1)]) },
  ])("establishes benefit on $name", async ({ name, reflections }) => {
    const { dry, wet } = fixture(reflections);
    const { samples, metrics } = await applyEchoReverbReduction(wet, RATE, { intensity: 100 });
    const measured = evidence(dry, wet, samples);
    console.info(name, measured);
    expect(measured.tailReductionDb).toBeGreaterThan(2);
    expect(measured.errorImprovementDb).toBeGreaterThan(0.5);
    expect(Math.abs(measured.directLossDb)).toBeLessThan(1);
    expect(metrics.headroomScale).toBe(1);
  });

  it("protects novel frequency content while suppressing a simultaneous late bin", async () => {
    const input = Float32Array.from({ length: at(0.4) }, (_, i) => {
      const t = i / RATE;
      const old = t < 0.15 ? 0.3 : 0.04;
      return old * Math.sin(2 * Math.PI * 750 * t) + (t >= 0.15 ? 0.2 * Math.sin(2 * Math.PI * 2250 * t) : 0);
    });
    const { samples } = await applyEchoReverbReduction(input, RATE, { intensity: 100 });
    const amplitude = (x: Float32Array, hz: number) => {
      let real = 0, imaginary = 0;
      for (let i = at(0.18); i < at(0.22); i++) {
        real += x[i] * Math.cos(2 * Math.PI * hz * i / RATE);
        imaginary += x[i] * Math.sin(2 * Math.PI * hz * i / RATE);
      }
      return Math.hypot(real, imaginary);
    };
    expect(db((amplitude(input, 750) / amplitude(samples, 750)) ** 2)).toBeGreaterThan(2);
    expect(Math.abs(db((amplitude(input, 2250) / amplitude(samples, 2250)) ** 2))).toBeLessThan(0.1);
  });

  it("preserves sustained clean speech energy and measures clean error", async () => {
    const { dry } = fixture();
    const { samples } = await applyEchoReverbReduction(dry, RATE, { intensity: 100 });
    let error = 0;
    for (let i = 0; i < dry.length; i++) error += (samples[i] - dry[i]) ** 2;
    const snr = db(energy(dry) / error);
    console.info("echo/reverb clean synthetic SNR dB", snr);
    expect(snr).toBeGreaterThan(20);
    expect(Math.abs(db(energy(samples) / energy(dry)))).toBeLessThan(1);
    const tone = Float32Array.from({ length: at(0.5) }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 440 * i / RATE));
    const result = await applyEchoReverbReduction(tone, RATE, { intensity: 100 });
    expect(Math.abs(db(energy(result.samples) / energy(tone)))).toBeLessThan(0.1);
  });

  it("handles empty, silence, DC, impulse, short buffers and full-scale edges without clipping", async () => {
    for (const input of [new Float32Array(), new Float32Array(5000), new Float32Array(1).fill(1), new Float32Array(71).fill(-1), Float32Array.from({ length: 4097 }, (_, i) => i === 0 || i === 4096 ? 1 : 0), new Float32Array(5000).fill(0.25)]) {
      const result = await applyEchoReverbReduction(input, RATE, { intensity: 100 });
      expect(result.samples.length).toBe(input.length);
      expect(result.samples.every((x) => Number.isFinite(x) && Math.abs(x) <= 0.9990001)).toBe(true);
    }
  });

  it("rejects unsupported rates, intensities, and invalid PCM even on bypass", async () => {
    for (const intensity of [-1, 101, NaN, Infinity]) await expect(applyEchoReverbReduction(new Float32Array(1), RATE, { intensity })).rejects.toThrow(/intensity/i);
    await expect(applyEchoReverbReduction(new Float32Array(1), 44100, { intensity: 50 })).rejects.toThrow(/48 kHz/);
    for (const x of [NaN, Infinity, 1.01]) await expect(applyEchoReverbReduction(new Float32Array([x]), RATE, { intensity: 0 })).rejects.toThrow(/PCM/);
  });

  it("reports monotonic progress and honours pre-start, timer, and completion cancellation", async () => {
    const { wet } = fixture();
    const progress: number[] = [];
    await applyEchoReverbReduction(wet, RATE, { intensity: 50, onProgress: (p) => progress.push(p) });
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]))).toBe(true);
    const pre = new AbortController(); pre.abort();
    await expect(applyEchoReverbReduction(wet, RATE, { intensity: 50, signal: pre.signal })).rejects.toMatchObject({ code: "CANCELLED", name: "AbortError" });
    const timer = new AbortController();
    const pending = applyEchoReverbReduction(wet, RATE, { intensity: 50, signal: timer.signal });
    setTimeout(() => timer.abort(), 0);
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    const completion = new AbortController();
    await expect(applyEchoReverbReduction(wet, RATE, { intensity: 50, signal: completion.signal, onProgress: (p) => { if (p === 1) completion.abort(); } })).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
