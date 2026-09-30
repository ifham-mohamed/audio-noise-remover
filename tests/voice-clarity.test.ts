import { describe, expect, it } from "vitest";
import { applyVoiceClarity, createVoiceClarityCoefficients, voiceClarityGainDb, VOICE_CLARITY_CENTER_HZ, VOICE_CLARITY_MAX_PEAK, VOICE_CLARITY_Q } from "@/features/processing/voice-clarity";

function sineRms(samples: Float32Array) {
  const start = 4_800;
  let energy = 0;
  for (let i = start; i < samples.length; i++) {
    energy += samples[i]! ** 2;
  }
  return Math.sqrt(energy / (samples.length - start));
}

function tone(frequency: number, peak = 0.1) {
  return Float32Array.from({ length: 48_000 }, (_, i) => peak * Math.sin((2 * Math.PI * frequency * i) / 48_000));
}

describe("bounded voice clarity presence EQ", () => {
  it("maps the full intensity range to 0–4 dB and finite 3 kHz/Q 0.8 coefficients", () => {
    expect([voiceClarityGainDb(0), voiceClarityGainDb(50), voiceClarityGainDb(100)]).toEqual([0, 2, 4]);
    const coefficients = createVoiceClarityCoefficients(48_000, 100);
    expect(coefficients.gainDb).toBe(4);
    expect(Object.values(coefficients).every(Number.isFinite)).toBe(true);
    expect(VOICE_CLARITY_CENTER_HZ).toBe(3_000);
    expect(VOICE_CLARITY_Q).toBe(0.8);
    expect(() => voiceClarityGainDb(Number.NaN)).toThrow();
    expect(() => createVoiceClarityCoefficients(6_000, 50)).toThrow();
  });

  it("boosts presence by no more than 4 dB and leaves distant frequencies near unity", () => {
    const input = tone(VOICE_CLARITY_CENTER_HZ);
    const output = applyVoiceClarity(input, 48_000, 100);
    const measuredDb = 20 * Math.log10(sineRms(output) / sineRms(input));
    expect(measuredDb).toBeGreaterThan(3.85);
    expect(measuredDb).toBeLessThanOrEqual(4.05);
    for (const frequency of [300, 10_000]) {
      const before = applyVoiceClarity(tone(frequency), 48_000, 0);
      const after = applyVoiceClarity(tone(frequency), 48_000, 100);
      const gainDb = 20 * Math.log10(sineRms(after) / sineRms(before));
      expect(Math.abs(gainDb)).toBeLessThan(0.8);
    }
  });

  it("clamps output safely, rejects non-finite samples, and produces no clipping", () => {
    const output = applyVoiceClarity(tone(3_000, 0.99), 48_000, 100);
    let peak = 0;
    for (const sample of output) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeLessThanOrEqual(VOICE_CLARITY_MAX_PEAK);
    expect(output.every(Number.isFinite)).toBe(true);
    const invalid = new Float32Array([0, Number.NaN, 0]);
    expect(() => applyVoiceClarity(invalid, 48_000, 50)).toThrow(/non-finite/);
    const original = tone(3_000);
    expect(applyVoiceClarity(original, 48_000, 0)).not.toBe(original);
  });
});
