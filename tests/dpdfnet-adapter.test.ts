import { describe, expect, it } from "vitest";
import { initialDpdfnetState } from "@/features/preview/dpdfnet-adapter";
import { DPDFNET_WINDOW_LENGTH, reconstructDpdfnetAudio, spectralFrame, spectralFrameCount, transform960 } from "@/features/preview/dpdfnet-signal";

describe("pinned DPDFNet2 adapter parity", () => {
  it("reads nonzero normalization state from ONNX custom metadata", () => {
    const varint = (input: number) => {
      const output: number[] = [];
      let value = input;
      do { const part = value % 128; value = Math.floor(value / 128); output.push(part | (value ? 0x80 : 0)); } while (value);
      return output;
    };
    const field = (number: number, text: Uint8Array) => [number * 8 + 2, ...varint(text.length), ...text];
    const encoder = new TextEncoder();
    const entry = (key: string, value: string) => {
      const inner = Uint8Array.from([...field(1, encoder.encode(key)), ...field(2, encoder.encode(value))]);
      return field(14, inner);
    };
    const model = Uint8Array.from([
      ...entry("state_size", "56436"),
      ...entry("erb_norm_state_size", "481"),
      ...entry("spec_norm_state_size", "96"),
      ...entry("erb_norm_init", Array(481).fill("1.25").join(",")),
      ...entry("spec_norm_init", Array(96).fill("-0.5").join(",")),
    ]);
    const state = initialDpdfnetState(model);
    expect(state).toHaveLength(56_436);
    expect(state.subarray(0, 481).every((value) => value === 1.25)).toBe(true);
    expect(state.subarray(481, 577).every((value) => value === -0.5)).toBe(true);
    expect(state.subarray(577).every((value) => value === 0)).toBe(true);
  });

  it("matches a direct 960-point Vorbis/reflect DFT at the model's real, low and Nyquist bins", () => {
    const samples = Float32Array.from({ length: 1920 }, (_, index) => Math.sin(index * 0.031) * 0.3);
    const actual = spectralFrame(samples, 0);
    for (const bin of [0, 1, 23, 480]) {
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < DPDFNET_WINDOW_LENGTH; index++) {
        const sine = Math.sin(Math.PI * (index + 0.5) / DPDFNET_WINDOW_LENGTH);
        const window = Math.sin(Math.PI * sine * sine / 2);
        const sample = samples[Math.abs(index - 480)] * window;
        const phase = 2 * Math.PI * bin * index / DPDFNET_WINDOW_LENGTH;
        real += sample * Math.cos(phase);
        imaginary -= sample * Math.sin(phase);
      }
      expect(actual[bin * 2]).toBeCloseTo(real, 3);
      expect(actual[bin * 2 + 1]).toBeCloseTo(imaginary, 3);
    }
  });

  it("round-trips the 960-point transform and compensates the publisher's four-hop latency", () => {
    const complex = new Float32Array(DPDFNET_WINDOW_LENGTH * 2);
    for (let index = 0; index < DPDFNET_WINDOW_LENGTH; index++) complex[index * 2] = Math.sin(index * 0.07);
    const spectrum = transform960(complex);
    const restored = transform960(spectrum, true);
    for (let index = 0; index < complex.length; index++) expect(restored[index]).toBeCloseTo(complex[index], 4);

    const input = Float32Array.from({ length: 4800 }, (_, index) => Math.sin(index * 0.015) * 0.3);
    const padded = new Float32Array(input.length + DPDFNET_WINDOW_LENGTH);
    padded.set(input);
    const frames = Array.from({ length: spectralFrameCount(input.length) }, (_, index) => spectralFrame(padded, index));
    const output = reconstructDpdfnetAudio(frames, input.length);
    for (const index of [0, 100, 1000, 2800]) expect(output[index]).toBeCloseTo(input[index + 1920], 3);
    expect(output.slice(-960).every((value) => value === 0)).toBe(true);
  });
});
