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

  it("returns stable errors before probing unsupported and empty files", async () => {
    const unsupported = await inspectLocalMedia(new File(["content"], "notes.txt"));
    const empty = await inspectLocalMedia(new File([], "empty.wav"));

    expect(unsupported).toMatchObject({ status: "error", code: "UNSUPPORTED_MEDIA" });
    expect(empty).toMatchObject({ status: "error", code: "CORRUPT_MEDIA" });
  });
});
