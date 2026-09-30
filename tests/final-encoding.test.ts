import { describe, expect, it } from "vitest";
import { assertPreservedVideo, buildFinalEncodeArgs, buildVideoFingerprintArgs, parseVideoFingerprints } from "@/features/final/final-encoding";
import { defaultOutputProfile, type OutputProfile } from "@/shared/contracts/processing";
import { getFinalEncodingPlan } from "@/shared/contracts/final-output";

function valuesAfter(args: string[], flag: string) {
  return args.flatMap((value, index) => value === flag ? [args[index + 1]] : []);
}

describe("final encoding plans and stream mapping", () => {
  it.each([
    ["audio-wav", "pcm_s24le", "wav", "audio/wav", "pcm_s24le", "wav"],
    ["audio-flac", "flac", "flac", "audio/flac", "flac", "flac"],
    ["audio-mp3", "mp3", "mp3", "audio/mpeg", "libmp3lame", "mp3"],
    ["audio-m4a", "aac", "m4a", "audio/mp4", "aac", "ipod"],
  ] as const)("encodes %s at 48 kHz using only enhanced audio", (format, audioCodec, extension, mimeType, codec, muxer) => {
    const output: OutputProfile = { ...defaultOutputProfile("local:source"), format, audioCodec, audioBitrateKbps: ["mp3", "aac"].includes(audioCodec) ? 192 : undefined };
    const plan = getFinalEncodingPlan(output, "wav");
    expect(plan).toEqual({ extension, mimeType, codec, muxer, video: false });
    const args = buildFinalEncodeArgs(plan!, "/original.wav", "/enhanced.wav", `/result.${extension}`);
    expect(valuesAfter(args, "-i")).toEqual(["/enhanced.wav"]);
    expect(valuesAfter(args, "-map")).toEqual(["0:a:0"]);
    expect(valuesAfter(args, "-ar")).toEqual(["48000"]);
    expect(valuesAfter(args, "-c:a")).toEqual([codec]);
    expect(valuesAfter(args, "-f")).toEqual([muxer]);
    expect(args).toEqual(expect.arrayContaining(["-vn", "-sn", "-dn"]));
    expect(args).not.toContain("/original.wav");
    expect(args.at(-1)).toBe(`/result.${extension}`);
    expect(valuesAfter(args, "-b:a")).toEqual(["mp3", "aac"].includes(audioCodec) ? ["192k"] : []);
    if (format === "audio-flac") {
      expect(valuesAfter(args, "-sample_fmt")).toEqual(["s32"]);
      expect(valuesAfter(args, "-compression_level")).toEqual(["5"]);
    }
    if (format === "audio-m4a") expect(valuesAfter(args, "-movflags")).toEqual(["+faststart"]);
  });

  it.each([
    ["mp4", "video/mp4", "mp4"], ["mov", "video/quicktime", "mov"], ["mkv", "video/x-matroska", "matroska"],
  ] as const)("preserves every %s video stream and includes only the enhanced selected audio", (sourceFormat, mimeType, muxer) => {
    const output: OutputProfile = { ...defaultOutputProfile("local:source", "video", sourceFormat), format: "source-video", videoCodec: "source" };
    const plan = getFinalEncodingPlan(output, sourceFormat);
    expect(plan).toEqual({ extension: sourceFormat, mimeType, codec: "aac", muxer, video: true });
    const args = buildFinalEncodeArgs(plan!, `/original.${sourceFormat}`, "/selected-second-enhanced.wav", `/result.${sourceFormat}`);
    expect(valuesAfter(args, "-i")).toEqual([`/original.${sourceFormat}`, "/selected-second-enhanced.wav"]);
    expect(valuesAfter(args, "-map")).toEqual(["0:v", "1:a:0"]);
    expect(valuesAfter(args, "-c:v")).toEqual(["copy"]);
    expect(args).toContain("-copyts");
    expect(valuesAfter(args, "-avoid_negative_ts")).toEqual(["disabled"]);
    expect(valuesAfter(args, "-c:a")).toEqual(["aac"]);
    expect(valuesAfter(args, "-b:a")).toEqual(["192k"]);
    expect(valuesAfter(args, "-metadata:s:a:0")).toEqual(["title=Enhanced speech"]);
    expect(valuesAfter(args, "-disposition:a:0")).toEqual(["default"]);
    expect(valuesAfter(args, "-f")).toEqual([muxer]);
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("h264");
    expect(args).not.toContain("-shortest");
  });

  it("uses original video stream copy for explicit MP4 output from MOV", () => {
    const output: OutputProfile = { ...defaultOutputProfile("local:source", "video", "mov"), format: "mp4", videoCodec: "source" };
    const plan = getFinalEncodingPlan(output, "mov");
    expect(plan).toMatchObject({ extension: "mp4", mimeType: "video/mp4", muxer: "mp4", video: true });
    const args = buildFinalEncodeArgs(plan!, "/original.mov", "/enhanced.wav", "/result.mp4");
    expect(valuesAfter(args, "-c:v")).toEqual(["copy"]);
    expect(valuesAfter(args, "-movflags")).toEqual(["+faststart"]);
  });

  it.each([
    { format: "audio-wav", audioCodec: "aac" },
    { format: "audio-flac", audioCodec: "mp3" },
    { format: "audio-mp3", audioCodec: "mp3", audioBitrateKbps: 128 },
    { format: "audio-m4a", audioCodec: "aac", audioBitrateKbps: undefined },
  ] as const)("rejects incompatible audio settings %# without a fallback", (settings) => {
    expect(getFinalEncodingPlan({ ...defaultOutputProfile("local:source"), ...settings }, "wav")).toBeUndefined();
  });

  it("rejects unsupported source-video containers and invalid AAC bitrate", () => {
    const output: OutputProfile = { ...defaultOutputProfile("local:source", "video", "mov"), format: "source-video", videoCodec: "source" };
    expect(getFinalEncodingPlan(output, "avi")).toBeUndefined();
    expect(getFinalEncodingPlan({ ...output, audioBitrateKbps: 128 }, "mov")).toBeUndefined();
  });
});

describe("video preservation evidence", () => {
  const first = `0,v,SHA256=${"a".repeat(64)}`;
  const second = `1,v,SHA256=${"b".repeat(64)}`;
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("hashes all original video packets while excluding audio, subtitles, and data", () => {
    const args = buildVideoFingerprintArgs("/original.mkv", "/video.sha256");
    expect(valuesAfter(args, "-map")).toEqual(["0:v"]);
    expect(valuesAfter(args, "-c:v")).toEqual(["copy"]);
    expect(valuesAfter(args, "-f")).toEqual(["streamhash"]);
    expect(valuesAfter(args, "-hash")).toEqual(["sha256"]);
    expect(args).toContain("-copyts");
    expect(args).toContain("-dump");
    expect(args).not.toContain("-hex");
    expect(args).toEqual(expect.arrayContaining(["-an", "-sn", "-dn"]));
  });

  it("accepts ordered fingerprints for multiple streams, comments, and CRLF", () => {
    const fingerprints = parseVideoFingerprints(bytes(`#format: streamhash\r\n${first}\r\n${second}\r\n`));
    expect(fingerprints).toEqual([first, second]);
    expect(() => assertPreservedVideo(fingerprints, [...fingerprints])).not.toThrow();
  });

  it.each(["", "#comment only", `1,v,SHA256=${"a".repeat(64)}`, `0,a,SHA256=${"a".repeat(64)}`, "0,v,SHA256=invalid", `${first}\n${first}`])("rejects missing, malformed, or unordered evidence %#", (text) => {
    expect(() => parseVideoFingerprints(bytes(text))).toThrow("Video stream fingerprint validation failed.");
  });

  it.each([{ after: [first] }, { after: [second, first] }, { after: [first, `1,v,SHA256=${"c".repeat(64)}`] }])("fails closed when video packets or stream count/order change %#", ({ after }) => {
    expect(() => assertPreservedVideo([first, second], after)).toThrow("No final output was published.");
  });
});
