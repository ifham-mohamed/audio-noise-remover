import { describe, expect, it } from "vitest";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import { createPreviewJob, getPreviewRange, MAX_PREVIEW_DURATION_SECONDS, PreviewJobError, previewJobSchema } from "@/shared/contracts/preview";
import { createPreviewCoordinator } from "@/server/domain/preview-coordinator";
import type { MediaMetadata } from "@/shared/contracts/media";

const media: MediaMetadata = {
  sourceName: "interview.wav",
  sourceRef: "local:interview.wav:12:1",
  format: "wav",
  mediaKind: "audio",
  sizeBytes: 12,
  durationSeconds: 90,
  audioStream: { id: "audio-0", present: true, summary: "Audio stream ready" },
};

describe("bounded preview job contract", () => {
  it("creates a queued preview with an immutable normalized profile snapshot", () => {
    const profile = defaultProcessingProfile(media.sourceRef, "audio-0", "audio", "wav");
    const job = createPreviewJob(media, profile, 45, { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-09-29T00:00:00.000Z", modelVersions: { "noise-removal": "1.2.0" } });
    expect(job).toMatchObject({ id: "00000000-0000-4000-8000-000000000001", kind: "preview", state: "prepared", profile, range: { startSeconds: 30, endSeconds: 60 } });
    expect(job.modelVersions).toEqual({ "noise-removal": "1.2.0" });
    expect(previewJobSchema.parse(job)).toEqual(job);
  });

  it("centers the maximum preview around the playhead and shifts it inside media boundaries", () => {
    expect(getPreviewRange(0, 90)).toEqual({ startSeconds: 0, endSeconds: MAX_PREVIEW_DURATION_SECONDS });
    expect(getPreviewRange(89, 90)).toEqual({ startSeconds: 60, endSeconds: 90 });
    expect(getPreviewRange(3, 8)).toEqual({ startSeconds: 0, endSeconds: 8 });
  });

  it("preserves the selected video audio stream and video output semantics", () => {
    const video: MediaMetadata = {
      sourceName: "meeting.mov",
      sourceRef: "local:meeting.mov:24:1",
      format: "mov",
      mediaKind: "video",
      sizeBytes: 24,
      durationSeconds: 90,
      audioStream: { id: "commentary", present: true, summary: "Commentary" },
      audioStreams: [
        { id: "main", present: true, summary: "Main mix" },
        { id: "commentary", present: true, summary: "Commentary" },
      ],
      selectedAudioStreamId: "commentary",
    };
    const profile = defaultProcessingProfile(video.sourceRef, "commentary", "video", "mov");
    const job = createPreviewJob(video, profile, 40, { id: "00000000-0000-4000-8000-000000000003" });
    expect(job.media.selectedAudioStreamId).toBe("commentary");
    expect(job.profile.selectedAudioStreamId).toBe("commentary");
    expect(job.profile.output).toMatchObject({ mediaKind: "video", format: "source-video", audioCodec: "aac", audioBitrateKbps: 192 });
  });

  it("rejects empty duration, invalid profiles, mismatched media, and source output targets", () => {
    expect(() => getPreviewRange(0, 0)).toThrowError(PreviewJobError);
    expect(() => createPreviewJob(undefined, defaultProcessingProfile(media.sourceRef, "audio-0"), 1)).toThrowError(/readable local audio stream/);
    expect(() => createPreviewJob(media, {}, 1)).toThrowError(/enhancement and output settings/);
    expect(() => createPreviewJob({ ...media, audioStream: { ...media.audioStream, present: false } }, defaultProcessingProfile(media.sourceRef, "audio-0"), 1)).toThrowError(/does not contain a readable audio stream/);
    expect(() => createPreviewJob(media, defaultProcessingProfile("local:other", "audio-0"), 1)).toThrowError(/no longer matches/);
    const unsafe = defaultProcessingProfile(media.sourceRef, "audio-0");
    unsafe.output.destination.targetRef = "source";
    expect(() => createPreviewJob(media, unsafe, 1)).toThrowError(/original source cannot/);
  });

  it("creates a new request identity for a changed profile", () => {
    const profile = defaultProcessingProfile(media.sourceRef, "audio-0");
    const first = createPreviewJob(media, profile, 20, { id: "00000000-0000-4000-8000-000000000001" });
    profile.stages[0] = { ...profile.stages[0], enabled: false };
    const second = createPreviewJob(media, profile, 20, { id: "00000000-0000-4000-8000-000000000002" });
    expect(second.id).not.toBe(first.id);
    expect(second.profile.stages[0].enabled).toBe(false);
    expect(first.profile.stages[0].enabled).toBe(true);
  });

  it("creates the validated job through the coordinator with capability versions", async () => {
    const coordinator = createPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [
      { id: "ffmpeg", label: "FFmpeg", status: "ready", summary: "Available", version: "9.0" },
      { id: "models", label: "Speech models", status: "ready", summary: "Available", version: "model-1" },
      { id: "storage", label: "Local storage", status: "ready", summary: "Writable" },
    ] }) });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    expect(job.kind).toBe("preview");
    expect(job.state).toBe("prepared");
    expect(job.modelVersions).toEqual({ "speech-model": "model-1" });
  });

  it("does not create an active-stage job when the local speech model is not ready", async () => {
    const coordinator = createPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [
      { id: "ffmpeg", label: "FFmpeg", status: "ready", summary: "Available" },
      { id: "models", label: "Speech models", status: "attention", summary: "Local model setup needs attention." },
      { id: "storage", label: "Local storage", status: "ready", summary: "Writable" },
    ] }) });
    await expect(coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });

  it("does not create a job when FFmpeg is unavailable", async () => {
    const coordinator = createPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [
      { id: "ffmpeg", label: "FFmpeg", status: "unavailable", summary: "FFmpeg is unavailable." },
      { id: "models", label: "Speech models", status: "ready", summary: "Available", version: "model-1" },
      { id: "storage", label: "Local storage", status: "ready", summary: "Writable" },
    ] }) });
    await expect(coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 })).rejects.toMatchObject({ code: "RUNTIME_UNAVAILABLE" });
  });
});
