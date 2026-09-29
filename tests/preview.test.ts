import { describe, expect, it } from "vitest";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import { createPreviewJob, getPreviewRange, MAX_PREVIEW_DURATION_SECONDS, PreviewJobError, previewJobSchema } from "@/shared/contracts/preview";
import { createPreviewCoordinator } from "@/server/domain/preview-coordinator";
import type { PreviewJobStore } from "@/server/adapters/preview-job-file-store";
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

function createTestPreviewCoordinator(dependencies: Omit<Parameters<typeof createPreviewCoordinator>[0], "store"> = {}) {
  let stored: import("@/shared/contracts/preview").PreviewJob[] = [];
  const store: PreviewJobStore = { load: () => [...stored], save: (jobs) => { stored = [...jobs]; } };
  return createPreviewCoordinator({ ...dependencies, store });
}

describe("bounded preview job contract", () => {
  it("creates a queued preview with an immutable normalized profile snapshot", () => {
    const profile = defaultProcessingProfile(media.sourceRef, "audio-0", "audio", "wav");
    const job = createPreviewJob(media, profile, 45, { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-09-29T00:00:00.000Z", modelVersions: { "noise-removal": "1.2.0" } });
    expect(job).toMatchObject({ id: "00000000-0000-4000-8000-000000000001", kind: "preview", state: "queued", sequence: 0, profile, range: { startSeconds: 30, endSeconds: 60 } });
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
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [
      { id: "ffmpeg", label: "FFmpeg", status: "ready", summary: "Available", version: "9.0" },
      { id: "models", label: "Speech models", status: "ready", summary: "Available", version: "model-1" },
      { id: "storage", label: "Local storage", status: "ready", summary: "Writable" },
    ] }) });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    expect(job.kind).toBe("preview");
    expect(job.state).toBe("queued");
    expect(job.modelVersions).toEqual({ "speech-model": "model-1" });
  });

  it("keeps missing model capability visible to the worker while creating an attempt", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [
      { id: "ffmpeg", label: "FFmpeg", status: "ready", summary: "Available" },
      { id: "models", label: "Speech models", status: "attention", summary: "Local model setup needs attention." },
      { id: "storage", label: "Local storage", status: "ready", summary: "Writable" },
    ] }) });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    expect(job.state).toBe("queued");
    expect(job.modelVersions).toEqual({});
  });

  it("creates a job attempt so runtime failures can be recorded as terminal jobs", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [
      { id: "ffmpeg", label: "FFmpeg", status: "unavailable", summary: "FFmpeg is unavailable." },
      { id: "models", label: "Speech models", status: "ready", summary: "Available", version: "model-1" },
      { id: "storage", label: "Local storage", status: "ready", summary: "Writable" },
    ] }) });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    expect(job.state).toBe("queued");
  });

  it("sequences progress, cancellation and terminal cleanup; rejects late success", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [] }), now: () => "2026-09-29T00:00:01.000Z" });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    const running = coordinator.consume(job.id, { type: "progress", jobId: job.id, sequence: 1, phase: "Preparing", progress: 0.25, elapsedMs: 100 });
    expect(running).toMatchObject({ state: "running", progress: 0.25, sequence: 1 });
    expect(() => coordinator.consume(job.id, { type: "progress", jobId: job.id, sequence: 2, phase: "Regressive", progress: 0.1, elapsedMs: 110 })).toThrow(/move backwards/);
    expect(coordinator.cancel(job.id)).toMatchObject({ state: "cancelling" });
    const cancelled = coordinator.consume(job.id, { type: "cancelled", jobId: job.id, sequence: 2, elapsedMs: 120 });
    expect(cancelled).toMatchObject({ state: "cancelled", artifact: undefined });
    expect(() => coordinator.consume(job.id, { type: "succeeded", jobId: job.id, sequence: 3, elapsedMs: 130, artifact: { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: 12, durationSeconds: 10 } })).toThrow(/already finished/);
  });

  it("persists comparison source metadata on success while allowing legacy jobs without it", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [] }) });
    const paired = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    const after = { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: 12, durationSeconds: 30 };
    const before = { id: "00000000-0000-4000-8000-000000000003", mimeType: "audio/wav", sizeBytes: 12, durationSeconds: 30 };
    expect(coordinator.consume(paired.id, { type: "succeeded", jobId: paired.id, sequence: 1, elapsedMs: 50, artifact: after, comparisonSourceArtifact: before })).toMatchObject({ state: "succeeded", artifact: after, comparisonSourceArtifact: before });

    const legacy = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    expect(() => coordinator.consume(legacy.id, { type: "succeeded", jobId: legacy.id, sequence: 1, elapsedMs: 50, artifact: after })).toThrow(/requires its retained Before audio artifact/);
    const priorPersistedSuccess = previewJobSchema.parse({ ...legacy, state: "succeeded", sequence: 1, artifact: after });
    expect(priorPersistedSuccess).toMatchObject({ state: "succeeded", artifact: after });
    expect(priorPersistedSuccess).not.toHaveProperty("comparisonSourceArtifact");
  });

  it("requires the Before artifact for new successes and rejects mismatched or terminal pairs", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [] }) });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    const after = { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: 12, durationSeconds: 30.04 };
    const before = { id: "00000000-0000-4000-8000-000000000003", mimeType: "audio/wav", sizeBytes: 12, durationSeconds: 30.08 };
    expect(() => coordinator.consume(job.id, { type: "succeeded", jobId: job.id, sequence: 1, elapsedMs: 5, artifact: after, comparisonSourceArtifact: before })).toThrow(/match the bounded preview range/);
    const failedPair = { ...job, state: "failed" as const, artifact: undefined, comparisonSourceArtifact: before, failure: { code: "PROCESSING_FAILED" as const, message: "failed" } };
    expect(previewJobSchema.safeParse(failedPair).success).toBe(false);
  });

  it("settles cancellation after in-flight progress is rejected", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [] }) });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    coordinator.cancel(job.id);
    expect(() => coordinator.consume(job.id, { type: "progress", jobId: job.id, sequence: 1, phase: "Late progress", progress: 0.2, elapsedMs: 1 })).toThrow(/cancelling/);
    expect(coordinator.consume(job.id, { type: "cancelled", jobId: job.id, sequence: 2, elapsedMs: 2 })).toMatchObject({ state: "cancelled", sequence: 2 });
  });

  it("rejects sequence gaps unless cancellation discarded an in-flight progress event", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [] }) });
    const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    expect(() => coordinator.consume(job.id, { type: "progress", jobId: job.id, sequence: 2, phase: "Skipped", progress: 0.2, elapsedMs: 1 })).toThrow(/missing, stale, or out of order/);
    coordinator.cancel(job.id);
    expect(coordinator.consume(job.id, { type: "cancelled", jobId: job.id, sequence: 3, elapsedMs: 2 })).toMatchObject({ state: "cancelled", sequence: 3 });
  });

  it("enforces the active-job limit when capability checks resolve concurrently", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => { await gate; return { generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [] }; } });
    const requests = Array.from({ length: 5 }, () => coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 }));
    release();
    const results = await Promise.allSettled(requests);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("creates a linked retry only from failed or cancelled attempts", async () => {
    const coordinator = createTestPreviewCoordinator({ detectCapabilities: async () => ({ generatedAt: "2026-09-29T00:00:00.000Z", requestId: "local-test", runtime: { nodeVersion: "test", os: "test", architecture: "test" }, items: [] }) });
    const first = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 25 });
    coordinator.consume(first.id, { type: "failed", jobId: first.id, sequence: 1, elapsedMs: 5, failure: { code: "MODEL_UNAVAILABLE", message: "No model", action: "settings" } });
    const second = await coordinator.retry(first.id);
    expect(second.id).not.toBe(first.id);
    expect(second.retryOf).toBe(first.id);
    expect(coordinator.get(first.id)).toMatchObject({ state: "failed", sequence: 1 });
    await expect(coordinator.retry(second.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
