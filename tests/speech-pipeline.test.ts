import { describe, expect, it } from "vitest";
import { runSpeechPipeline } from "@/features/processing/speech-pipeline";

describe("shared preview and final speech pipeline", () => {
  it("runs independently selected DSP stages in declared order and records actual measurements", async () => {
    const input = Float32Array.from({ length: 48_000 }, (_, index) => 0.03 * Math.sin(2 * Math.PI * 3000 * index / 48000));
    const phases: string[] = [], fractions: number[] = [];
    const result = await runSpeechPipeline(input, [
      { id: "echo-reverb-reduction", enabled: true, parameters: { intensity: 40 } },
      { id: "loudness-normalization", enabled: true, parameters: { targetLufs: -16 } },
      { id: "voice-clarity", enabled: true, parameters: { intensity: 50 } },
    ], { onProgress: (stage, fraction) => { if (phases.at(-1) !== stage) phases.push(stage); fractions.push(fraction); } });
    expect(phases).toEqual(["voice-clarity", "loudness-normalization", "echo-reverb-reduction"]);
    expect(fractions.every((fraction, index) => index === 0 || fraction >= fractions[index - 1]!)).toBe(true);
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.length).toBeLessThanOrEqual(303);
    expect(result.samples.length).toBe(input.length);
    expect(result.samples.some((sample) => !Number.isFinite(sample) || Math.abs(sample) >= 1)).toBe(false);
    expect(result.metrics["loudness-normalization"]?.achievedLufs).toBeTypeOf("number");
    expect(result.metrics["echo-reverb-reduction"]?.experimental).toBe(true);
    expect(Object.keys(result.metrics)).not.toContain("noise-removal");
  });
  it("rejects an unknown enabled adapter and propagates cancellation", async () => {
    const input = new Float32Array(48_000);
    await expect(runSpeechPipeline(input, [{ id: "made-up", enabled: true, parameters: { intensity: 50 } }])).rejects.toThrow(/adapter/);
    const controller = new AbortController(); controller.abort();
    await expect(runSpeechPipeline(input, [{ id: "loudness-normalization", enabled: true, parameters: { targetLufs: -16 } }], { signal: controller.signal })).rejects.toThrow();
  });
});
