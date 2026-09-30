import { describe, expect, it, vi } from "vitest";
import { formatFromFileName, kindFromFormat, MAX_MEDIA_INSPECTION_BYTES, mediaInspectionSchema, supportedMediaFormats } from "@/shared/contracts/media";
import { inspectLocalMedia } from "@/features/intake/media-inspection";
import { containerWasRecognized, getAudioStreamCount, parseDecodableAudioStreams, parseFfmpegProbeLog } from "@/features/intake/media-inspection-utils";

describe("media contract", () => {
  it("recognizes every supported format and its media kind", () => {
    expect(supportedMediaFormats).toEqual(["mp3", "wav", "m4a", "flac", "mp4", "mov", "mkv"]);
    expect(formatFromFileName("Interview.WAV")).toBe("wav");
    expect(kindFromFormat("mov")).toBe("video");
    expect(kindFromFormat("flac")).toBe("audio");
  });

  it("validates ready and error inspection results", () => {
    expect(mediaInspectionSchema.parse({ status: "error", code: "NO_AUDIO_STREAM", message: "No audio." }).status).toBe("error");
    expect(mediaInspectionSchema.safeParse({ status: "ready", metadata: { sourceName: "clip.mp4", sourceRef: "local:clip", format: "mp4", mediaKind: "video", sizeBytes: 20, durationSeconds: 3, audioStream: { present: true, summary: "Audio track" } } }).success).toBe(true);
  });

  it("accepts stream identity and technical metadata for video review", () => {
    const parsed = mediaInspectionSchema.parse({ status: "ready", metadata: { sourceName: "meeting.mp4", sourceRef: "local:meeting", format: "mp4", mediaKind: "video", sizeBytes: 200, durationSeconds: 12, audioStream: { id: "main", label: "Main mix", present: true, summary: "AAC stereo", channels: 2, channelLayout: "stereo", sampleRate: 48000 }, audioStreams: [{ id: "main", label: "Main mix", present: true, summary: "AAC stereo" }, { id: "commentary", label: "Commentary", present: true, summary: "AAC mono" }], selectedAudioStreamId: "commentary" } });
    expect(parsed.status === "ready" && parsed.metadata.selectedAudioStreamId).toBe("commentary");
  });

  it("rejects a selected stream that is not advertised", () => {
    expect(mediaInspectionSchema.safeParse({ status: "ready", metadata: { sourceName: "meeting.mp4", sourceRef: "local:meeting", format: "mp4", mediaKind: "video", sizeBytes: 200, durationSeconds: 12, audioStream: { id: "main", present: true, summary: "AAC stereo" }, audioStreams: [{ id: "main", present: true, summary: "AAC stereo" }], selectedAudioStreamId: "missing" } }).success).toBe(false);
  });

  it("returns stable errors before probing unsupported and empty files", async () => {
    const unsupported = await inspectLocalMedia(new File(["content"], "notes.txt"));
    const empty = await inspectLocalMedia(new File([], "empty.wav"));

    expect(unsupported).toMatchObject({ status: "error", code: "UNSUPPORTED_MEDIA" });
    expect(empty).toMatchObject({ status: "error", code: "CORRUPT_MEDIA" });
  });

  it("fails safely before allocating worker memory for files above the local inspection limit", async () => {
    const oversized = new File(["x"], "large.wav");
    Object.defineProperty(oversized, "size", { value: MAX_MEDIA_INSPECTION_BYTES + 1 });
    await expect(inspectLocalMedia(oversized)).resolves.toMatchObject({ status: "error", code: "MEDIA_TOO_LARGE" });
  });

  it("terminates a browser probe worker that does not respond before its deadline", async () => {
    let worker: HangingWorker | undefined;
    class HangingWorker {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() { worker = this; }
    }
    vi.stubGlobal("Worker", HangingWorker);
    vi.useFakeTimers();
    try {
      const result = inspectLocalMedia(new File(["x"], "clip.wav"));
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(result).resolves.toMatchObject({ status: "error", code: "INSPECTION_UNAVAILABLE" });
      expect(worker?.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("parses actual FFmpeg container, duration, and audio stream details", () => {
    const log = [
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mp4':",
      "  Duration: 00:00:12.50, start: 0.000000, bitrate: 128 kb/s",
      "  Stream #0:0: Video: h264, 1920x1080",
      "  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp",
    ].join("\n");

    expect(parseFfmpegProbeLog(log, "mp4")).toMatchObject({
      durationSeconds: 12.5,
      audioStream: { id: "ffmpeg-stream-1", ffmpegAudioOrdinal: 0, present: true, sampleRate: 48000, channels: 2, channelLayout: "stereo", summary: "aac (LC), 48,000 Hz, stereo" },
    });
    expect(parseFfmpegProbeLog(log.replace("mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"), "mp4")).toBeUndefined();
  });

  it("identifies and parses a later real audio stream in a multi-stream container", () => {
    const log = [
      "Input #0, matroska,webm, from 'multi.mkv':",
      "  Duration: 00:00:01.00",
      "  Stream #0:0: Video: h264",
      "  Stream #0:1: Audio: ac3, 48000 Hz, stereo",
      "  Stream #0:2: Audio: aac (LC), 48000 Hz, mono",
    ].join("\n");

    expect(getAudioStreamCount(log)).toBe(2);
    expect(parseFfmpegProbeLog(log, "mkv", 1)?.audioStream).toMatchObject({ id: "ffmpeg-stream-2", summary: "aac (LC), 48,000 Hz, mono", channels: 1 });
    expect(parseDecodableAudioStreams(log, "mkv", new Set([0, 1])).map(({ audioStream }) => [audioStream.id, audioStream.ffmpegAudioOrdinal])).toEqual([["ffmpeg-stream-1", 0], ["ffmpeg-stream-2", 1]]);
  });

  it("does not treat a valid video container without audio as a successful probe", () => {
    const log = ["Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'silent.mp4':", "  Duration: 00:00:01.00", "  Stream #0:0: Video: mpeg4"].join("\n");
    expect(getAudioStreamCount(log)).toBe(0);
    expect(parseFfmpegProbeLog(log, "mp4")).toBeUndefined();
    expect(containerWasRecognized(log, "mp4")).toBe(true);
    expect(containerWasRecognized("/inspect.mp4: Invalid data found when processing input", "mp4")).toBe(false);
  });
});
