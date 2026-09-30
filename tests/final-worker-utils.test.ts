import { describe, expect, it } from "vitest";
import { assertFinalDecodedDuration, inspectWavChannelCount } from "@/features/final/final-worker-utils";

function wavHeader(channels: number, withJunk = false) {
  const prefix = withJunk ? 12 : 0;
  const bytes = new Uint8Array(44 + prefix);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVE");
  if (withJunk) { text(12, "JUNK"); view.setUint32(16, 4, true); }
  const fmt = 12 + prefix;
  text(fmt, "fmt "); view.setUint32(fmt + 4, 16, true); view.setUint16(fmt + 8, 1, true); view.setUint16(fmt + 10, channels, true); view.setUint32(fmt + 12, 48_000, true); view.setUint32(fmt + 16, 48_000 * channels * 2, true); view.setUint16(fmt + 20, channels * 2, true); view.setUint16(fmt + 22, 16, true);
  return bytes;
}

describe("final WAV channel gate", () => {
  it("rejects over-limit and mismatched decoded audio before it can be published", () => {
    expect(() => assertFinalDecodedDuration(300.01, 300, 300)).toThrow(/exceeds the safe 300-second experimental limit/);
    expect(() => assertFinalDecodedDuration(300, 299, 300)).toThrow(/does not match the selected source/);
    expect(() => assertFinalDecodedDuration(Number.NaN, 300, 300)).toThrow(/exceeds the safe 300-second experimental limit/);
    expect(() => assertFinalDecodedDuration(300, 300, 300)).not.toThrow();
  });

  it("accepts mono and stereo headers and finds fmt after bounded ancillary chunks", () => {
    expect(inspectWavChannelCount(wavHeader(1))).toBe(1);
    expect(inspectWavChannelCount(wavHeader(2, true))).toBe(2);
  });
  it("rejects unsupported channel counts and malformed or incomplete headers", () => {
    expect(() => inspectWavChannelCount(wavHeader(3))).toThrow(/mono or stereo/);
    expect(() => inspectWavChannelCount(wavHeader(0))).toThrow(/mono or stereo/);
    expect(() => inspectWavChannelCount(new Uint8Array(20))).toThrow(/RIFF\/WAVE/);
  });
});
