// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { decodeFloatWav, packFloatWavForFfmpeg } from "@/features/preview/dpdfnet-signal";
import { buildFinalEncodeArgs, buildVideoFingerprintArgs, assertPreservedVideo, parseVideoFingerprints } from "@/features/final/final-encoding";
import { assertEncodedAudioTimeline, assertPreservedVideoTimeline, assertSupportedSourceTimeline, buildTimedAudioDecodeArgs, createPcmTimingProbe, createVideoTimingProbe, UnsupportedVideoTiming } from "@/features/final/final-video-timing";
import { defaultOutputProfile } from "@/shared/contracts/processing";
import { getFinalEncodingPlan } from "@/shared/contracts/final-output";

type Core = {
  exec(...args: string[]): void; ret: number; reset(): void;
  setLogger(logger: (event: { message: string }) => void): void;
  FS: { writeFile(path: string, bytes: Uint8Array): void; readFile(path: string): Uint8Array };
};
let core: Core;
beforeAll(async () => {
  // Load the same checked-in WASM as the workers, without starting browser servers.
  const script = pathToFileURL(path.resolve("public/ffmpeg/ffmpeg-core.js")).href;
  const wasmURL = pathToFileURL(path.resolve("public/ffmpeg/ffmpeg-core.wasm")).href;
  Object.defineProperty(globalThis, "self", { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { href: "http://localhost/ffmpeg/ffmpeg-core.js" } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  // Bypass Vite's transformation of the generated Emscripten module.
  const { default: createCore } = await import(/* @vite-ignore */ script) as { default: (options: unknown) => Promise<Core> };
  core = await createCore({ wasmBinary: new Uint8Array(await readFile(new URL(wasmURL))), mainScriptUrlOrBlob: `http://localhost/ffmpeg/ffmpeg-core.js#${Buffer.from(JSON.stringify({ wasmURL, workerURL: "" })).toString("base64")}` });
}, 30_000);
afterAll(() => { core?.reset(); });

function run(args: string[], probe?: { log(message: string): void }) {
  core.setLogger(({ message }) => probe?.log(message));
  core.exec("-nostdin", "-y", ...args);
  expect(core.ret, args.join(" ")).toBe(0);
}
async function loadFixture(name: string, destination: string) {
  const bytes = new Uint8Array(await readFile(path.resolve("tests/fixtures/preview", name)));
  core.FS.writeFile(destination, bytes);
  return bytes;
}
function videoProbe(input: string, hashPath: string) {
  const probe = createVideoTimingProbe();
  run(buildVideoFingerprintArgs(input, hashPath), probe);
  return { timeline: probe.finish(), hashes: parseVideoFingerprints(core.FS.readFile(hashPath)) };
}
function audioProbe(input: string, ordinal: number, decoded: string) {
  const probe = createPcmTimingProbe();
  run(buildTimedAudioDecodeArgs(input, ordinal, decoded, 300), probe);
  const samples = decodeFloatWav(core.FS.readFile(decoded));
  return { timeline: probe.finish(samples.length), samples };
}

describe("actual bundled-core video timing gate", () => {
  it.each(["mp4", "mov", "mkv"])("accepts and preserves normal %s timing, including AAC priming", async (format) => {
    const sourcePath = `/normal.${format}`;
    const source = await loadFixture(`tone.${format}`, sourcePath);
    const video = videoProbe(sourcePath, "/before.hash");
    const audio = audioProbe(sourcePath, 0, "/source.wav");
    const muxer = format === "mkv" ? "matroska" : format;
    const offset = assertSupportedSourceTimeline(video.timeline, audio.timeline, muxer);
    const enhanced = audio.samples.map((sample) => sample * 0.99);
    core.FS.writeFile("/enhanced.wav", packFloatWavForFfmpeg(enhanced));
    const profile = { ...defaultOutputProfile("local:normal", "video", format), videoCodec: "source" as const };
    const plan = getFinalEncodingPlan(profile, format)!;
    run(buildFinalEncodeArgs(plan, sourcePath, "/enhanced.wav", `/output.${format}`, offset));
    const outputAudio = audioProbe(`/output.${format}`, 0, "/output.wav");
    assertEncodedAudioTimeline(outputAudio.timeline, plan.muxer, audio.timeline.firstSample);
    expect(Math.abs(outputAudio.samples.length - audio.samples.length) / 48_000).toBeLessThan(0.05);
    const outputVideo = videoProbe(`/output.${format}`, "/after.hash");
    assertPreservedVideo(video.hashes, outputVideo.hashes);
    assertPreservedVideoTimeline(video.timeline, outputVideo.timeline);
    expect(core.FS.readFile(sourcePath)).toEqual(source);
  });

  it("accepts a normal second audio track and preserves its ordinal", async () => {
    await loadFixture("two-usable-audio-mkv.mkv", "/two.mkv");
    const video = videoProbe("/two.mkv", "/two.hash");
    const audio = audioProbe("/two.mkv", 1, "/second.wav");
    expect(() => assertSupportedSourceTimeline(video.timeline, audio.timeline, "matroska")).not.toThrow();
  });

  it.each([0.03, 0.5])("rejects a selected second audio track delayed by %s seconds before encoding", async (delay) => {
    await loadFixture("tone.mp4", "/base.mp4");
    run(["-copyts", "-i", "/base.mp4", "-itsoffset", String(delay), "-i", "/base.mp4", "-map", "0:v", "-map", "0:a", "-map", "1:a", "-c", "copy", "-avoid_negative_ts", "disabled", "-f", "matroska", "/delayed.mkv"]);
    const source = Uint8Array.from(core.FS.readFile("/delayed.mkv"));
    const video = videoProbe("/delayed.mkv", "/delayed.hash");
    // The first usable track must not disguise the selected second track's offset.
    const audio = audioProbe("/delayed.mkv", 1, "/delayed.wav");
    expect(audio.timeline.firstSample).toBeGreaterThan(48);
    expect(() => assertSupportedSourceTimeline(video.timeline, audio.timeline, "matroska")).toThrow(UnsupportedVideoTiming);
    expect(core.FS.readFile("/delayed.mkv")).toEqual(source);
  });

  it("rejects a nonzero common audio/video origin instead of independently rebasing it", async () => {
    await loadFixture("tone.mp4", "/base.mp4");
    run(["-copyts", "-itsoffset", "5", "-i", "/base.mp4", "-map", "0:v", "-map", "0:a", "-c", "copy", "-avoid_negative_ts", "disabled", "-f", "matroska", "/common.mkv"]);
    const video = videoProbe("/common.mkv", "/common.hash");
    const audio = audioProbe("/common.mkv", 0, "/common.wav");
    expect(video.timeline[0][0].pts).toBe(5);
    expect(audio.timeline.firstSample).toBeGreaterThan(4 * 48_000);
    expect(() => assertSupportedSourceTimeline(video.timeline, audio.timeline, "matroska")).toThrow(/nonzero timeline origins/);
  });

  it("detects the old Matroska remux shift even though video hashes still match", async () => {
    await loadFixture("tone.mkv", "/legacy.mkv");
    const video = videoProbe("/legacy.mkv", "/legacy-before.hash");
    const audio = audioProbe("/legacy.mkv", 0, "/legacy.wav");
    // Force the old auto-shift policy, since FFmpeg CLI globals can survive exec.
    run(["-i", "/legacy.mkv", "-i", "/legacy.wav", "-map", "0:v", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-avoid_negative_ts", "make_non_negative", "-f", "matroska", "/legacy-output.mkv"]);
    const output = videoProbe("/legacy-output.mkv", "/legacy-after.hash");
    assertPreservedVideo(video.hashes, output.hashes);
    expect(() => assertPreservedVideoTimeline(video.timeline, output.timeline)).toThrow(/timestamps changed/);
    expect(audio.samples.length).toBeGreaterThan(0);
  });

  it.each(["mp4", "mov", "mkv"])("preserves an actual audio burst's presentation time in %s", async (format) => {
    await loadFixture("tone.mp4", "/marker-video.mp4");
    // A single bounded burst has an unambiguous energy centroid, unlike a steady
    // periodic tone. Use the existing zero-origin video packets as its clock.
    const marker = new Float32Array(48_000);
    for (let sample = 0; sample < 5760; sample++) marker[14_400 + sample] = 0.3 * Math.sin(2 * Math.PI * 1000 * sample / 48_000) * Math.sin(Math.PI * sample / 5760) ** 2;
    core.FS.writeFile("/marker.wav", packFloatWavForFfmpeg(marker));
    const sourcePath = `/marker-source.${format}`, outputPath = `/marker-output.${format}`;
    run(["-copyts", "-i", "/marker-video.mp4", "-i", "/marker.wav", "-map", "0:v", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-avoid_negative_ts", "disabled", sourcePath]);
    const sourceVideo = videoProbe(sourcePath, "/marker-before.hash");
    const sourceAudio = audioProbe(sourcePath, 0, "/marker-source.wav");
    const muxer = format === "mkv" ? "matroska" : format;
    const offset = assertSupportedSourceTimeline(sourceVideo.timeline, sourceAudio.timeline, muxer);
    core.FS.writeFile("/marker-enhanced.wav", packFloatWavForFfmpeg(sourceAudio.samples.map((sample) => sample * 0.99)));
    const plan = getFinalEncodingPlan({ ...defaultOutputProfile("local:marker", "video", format), videoCodec: "source" }, format)!;
    run(buildFinalEncodeArgs(plan, sourcePath, "/marker-enhanced.wav", outputPath, offset));
    const outputAudio = audioProbe(outputPath, 0, "/marker-check.wav");
    assertEncodedAudioTimeline(outputAudio.timeline, muxer, sourceAudio.timeline.firstSample);
    const outputVideo = videoProbe(outputPath, "/marker-after.hash");
    assertPreservedVideoTimeline(sourceVideo.timeline, outputVideo.timeline);
    assertPreservedVideo(sourceVideo.hashes, outputVideo.hashes);
    const centroidTime = (audio: ReturnType<typeof audioProbe>) => {
      let energy = 0, weighted = 0;
      for (let sample = 0; sample < audio.samples.length; sample++) {
        const power = audio.samples[sample] ** 2;
        energy += power; weighted += sample * power;
      }
      expect(energy).toBeGreaterThan(1);
      return (audio.timeline.firstSample + weighted / energy) / 48_000;
    };
    expect(Math.abs(centroidTime(outputAudio) - centroidTime(sourceAudio))).toBeLessThan(0.002);
  });
});

describe("bounded timestamp evidence parsing", () => {
  const pcm = (pts: number, duration = 1024) => `muxer <- type:audio pkt_pts:${pts} pkt_pts_time:0 pkt_dts:${pts} pkt_dts_time:0 duration:${duration} duration_time:0 size:${duration * 4}`;
  it("rejects missing evidence and PCM discontinuities", () => {
    expect(() => createVideoTimingProbe().finish()).toThrow(UnsupportedVideoTiming);
    expect(() => createPcmTimingProbe().finish(0)).toThrow(UnsupportedVideoTiming);
    const probe = createPcmTimingProbe();
    probe.log(pcm(0)); probe.log(pcm(2048));
    expect(() => probe.finish(2048)).toThrow(/discontinuous/);
  });
  it("rejects incomplete or malformed PCM logs and mismatched sample counts", () => {
    const probe = createPcmTimingProbe(); probe.log(pcm(0));
    expect(() => probe.finish(1025)).toThrow(UnsupportedVideoTiming);
    const malformed = createPcmTimingProbe(); malformed.log(pcm(0).replace("pkt_pts:0", "pkt_pts:NOPTS"));
    expect(() => malformed.finish(1024)).toThrow(UnsupportedVideoTiming);
  });
  it("rejects unavailable video PTS instead of treating it as zero", () => {
    const probe = createVideoTimingProbe();
    probe.log("Input #0, matroska, from '/source':\n  Stream #0:0: Video: mpeg4\nOutput #0, streamhash:\nstream #0:\n duration=0.5\n dts=0 pts=N/A");
    expect(() => probe.finish()).toThrow(UnsupportedVideoTiming);
  });
  it("does not mistake arbitrary encoded audio offsets for AAC priming", () => {
    expect(() => assertEncodedAudioTimeline({ firstSample: 432, sampleCount: 48_000 }, "mp4")).toThrow(UnsupportedVideoTiming);
    expect(() => assertEncodedAudioTimeline({ firstSample: 0, sampleCount: 48_000 }, "matroska")).toThrow(UnsupportedVideoTiming);
  });
  it("uses copyts and selected audio ordinal without seeking or normalizing timestamps", () => {
    const args = buildTimedAudioDecodeArgs("/source.mkv", 1, "/decoded.wav", 300);
    expect(args).toContain("-copyts"); expect(args).toContain("-debug_ts");
    expect(args[args.indexOf("-map") + 1]).toBe("0:a:1");
    expect(args).not.toContain("-start_at_zero"); expect(args).not.toContain("-ss");
  });
  it("keeps the input fixture hash unchanged after probing", async () => {
    const source = await loadFixture("tone.mov", "/unchanged.mov");
    videoProbe("/unchanged.mov", "/unchanged.hash"); audioProbe("/unchanged.mov", 0, "/unchanged.wav");
    const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    expect(digest(core.FS.readFile("/unchanged.mov"))).toBe(digest(source));
  });
});
