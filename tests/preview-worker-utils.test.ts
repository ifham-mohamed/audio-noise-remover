import { describe, expect, it } from "vitest";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import { createPreviewJob, MAX_PREVIEW_INPUT_BYTES } from "@/shared/contracts/preview";
import { buildPreviewDecodeArgs, getPreviewAudioStreamIndex, isPreviewInputSizeAllowed, isPreviewResourceExhaustion } from "@/features/preview/preview-worker-utils";
import type { MediaMetadata } from "@/shared/contracts/media";

const video: MediaMetadata = {
  sourceName: "meeting.mov",
  sourceRef: "local:meeting.mov:1024:1",
  format: "mov",
  mediaKind: "video",
  sizeBytes: 1024,
  durationSeconds: 90,
  audioStream: { id: "main", present: true, summary: "Main mix" },
  audioStreams: [
    { id: "main", present: true, summary: "Main mix" },
    { id: "commentary", present: true, summary: "Commentary" },
  ],
  selectedAudioStreamId: "commentary",
};

describe("preview worker utilities", () => {
  it("maps the selected non-first audio track to its FFmpeg audio-stream index", () => {
    const profile = defaultProcessingProfile(video.sourceRef, "commentary", "video", "mov");
    const job = createPreviewJob(video, profile, 40);
    const streamIndex = getPreviewAudioStreamIndex(job);

    expect(streamIndex).toBe(1);
    const args = buildPreviewDecodeArgs(job.range, streamIndex, "/input.mov", "/preview.wav");
    expect(args).toContain("0:a:1");
    expect(args.slice(args.indexOf("-ac"), args.indexOf("-ac") + 2)).toEqual(["-ac", "1"]);
  });

  it("uses the only known track when detailed stream enumeration is unavailable", () => {
    const audio = { ...video, mediaKind: "audio" as const, format: "wav" as const, audioStreams: undefined, selectedAudioStreamId: undefined };
    const job = createPreviewJob(audio, defaultProcessingProfile(audio.sourceRef, "main", "audio", "wav"), 40);
    expect(getPreviewAudioStreamIndex(job)).toBe(0);
  });

  it("accepts inputs up to 256 MiB and rejects empty, invalid, and oversized inputs", () => {
    expect(MAX_PREVIEW_INPUT_BYTES).toBe(256 * 1024 * 1024);
    expect(isPreviewInputSizeAllowed(1)).toBe(true);
    expect(isPreviewInputSizeAllowed(MAX_PREVIEW_INPUT_BYTES)).toBe(true);
    expect(isPreviewInputSizeAllowed(MAX_PREVIEW_INPUT_BYTES + 1)).toBe(false);
    expect(isPreviewInputSizeAllowed(0)).toBe(false);
    expect(isPreviewInputSizeAllowed(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("recognizes memory and browser quota failures without classifying ordinary errors as resource exhaustion", () => {
    expect(isPreviewResourceExhaustion(new RangeError("Array buffer allocation failed"))).toBe(true);
    expect(isPreviewResourceExhaustion(new DOMException("Storage full", "QuotaExceededError"))).toBe(true);
    expect(isPreviewResourceExhaustion(new Error("Unsupported codec"))).toBe(false);
  });
});
