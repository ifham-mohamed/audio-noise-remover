import { describe, expect, it } from "vitest";
import { formatFromFileName, kindFromFormat, mediaInspectionSchema, supportedMediaFormats } from "@/shared/contracts/media";
import { inspectLocalMedia } from "@/features/intake/media-inspection";

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
});
