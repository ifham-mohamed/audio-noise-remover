import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFinalJobFileStore } from "@/server/adapters/final-job-file-store";
import { createFinalJobCoordinator } from "@/server/domain/final-job-coordinator";
import { createFinalJob, finalJobSchema, formatFinalJobDiagnostic, isSupportedExperimentalFinalProfile } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import { getProcessingProfileDeclaration } from "@/shared/contracts/processing-profiles";
import type { MediaMetadata } from "@/shared/contracts/media";

const media: MediaMetadata = { sourceName: "speech.wav", sourceRef: "local:speech.wav:20:1", format: "wav", mediaKind: "audio", sizeBytes: 20, durationSeconds: 30, audioStream: { id: "audio-0", present: true, summary: "Ready" } };
const profile = defaultProcessingProfile(media.sourceRef, "audio-0");
function memoryStore() { let saved: ReturnType<typeof createFinalJob>[] = []; return { load: () => [...saved], save: (jobs: readonly ReturnType<typeof createFinalJob>[]) => { saved = [...jobs]; } }; }

describe("final job contract and coordinator", () => {
  it("rejects stage regression without changing the last accepted stage", async () => {
    const coordinator = createFinalJobCoordinator({ store: memoryStore() });
    const combined = { ...profile, stages: profile.stages.map((stage) => ({ ...stage, enabled: true })) };
    const job = await coordinator.create({ media, profile: combined });
    const event = { type: "progress" as const, jobId: job.id, phase: "Processing", progress: 0.2, elapsedMs: 100 };
    coordinator.consume(job.id, { ...event, sequence: 1, stageId: "noise-removal" });
    coordinator.consume(job.id, { ...event, sequence: 2, stageId: "voice-clarity" });
    expect(() => coordinator.consume(job.id, { ...event, sequence: 3, stageId: "noise-removal" })).toThrow(/active enabled stage/);
    expect(coordinator.get(job.id)).toMatchObject({ sequence: 2, phase: "voice-clarity" });
    expect(coordinator.consume(job.id, { ...event, sequence: 3, stageId: "loudness-normalization" })).toMatchObject({ sequence: 3, phase: "loudness-normalization" });
  });
  it("creates a typed queued final attempt and omits disabled profile stages", () => {
    const job = createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000001" });
    expect(job).toMatchObject({ kind: "final", state: "queued", id: "00000000-0000-4000-8000-000000000001" });
    expect(job.enabledStages.map((stage) => stage.id)).toEqual(["noise-removal"]);
  });

  it("keeps legacy records valid and formats diagnostics from the safe allowlist", () => {
    const legacy = createFinalJob(media, profile);
    expect(finalJobSchema.parse(legacy).executionSnapshot).toBeUndefined();
    const current = createFinalJob(media, profile, { requestId: "00000000-0000-4000-8000-000000000042", executionSnapshot: { version: 1, modelId: "candidate", modelVersion: "v1", runtime: "onnxruntime-web/wasm", qualification: "experimental; not production-qualified" } });
    const diagnostic = formatFinalJobDiagnostic(current);
    expect(diagnostic).toContain(current.id);
    expect(diagnostic).toContain("intensity=60");
    expect(diagnostic).toContain("candidate");
    expect(diagnostic).not.toContain(media.sourceName);
    expect(diagnostic).not.toContain(media.sourceRef);
    expect(diagnostic).not.toContain(profile.output.destination.targetName);
  });

  it("associates the coordinator supplied request ID with new and retried attempts", async () => {
    const coordinator = createFinalJobCoordinator({ store: memoryStore(), canExecuteFinal: () => true });
    const parent = await coordinator.create({ media, profile }, "00000000-0000-4000-8000-000000000043");
    expect(parent.requestId).toBe("00000000-0000-4000-8000-000000000043");
    coordinator.consume(parent.id, { type: "progress", jobId: parent.id, sequence: 1, phase: "noise-removal", stageId: "noise-removal", elapsedMs: 5 });
    coordinator.consume(parent.id, { type: "failed", jobId: parent.id, sequence: 2, elapsedMs: 10, failure: { code: "PROCESSING_FAILED", message: "failed" } });
    const failedParent = coordinator.get(parent.id);
    const retry = await coordinator.create({ media, profile, retryOfJobId: parent.id }, "00000000-0000-4000-8000-000000000044");
    expect(retry).toMatchObject({ retryOf: parent.id, requestId: "00000000-0000-4000-8000-000000000044", executionSnapshot: { modelId: "ceva-ip/dpdfnet2_48khz_hr", runtime: "onnxruntime-web/wasm", qualification: "experimental; not production-qualified" } });
    expect(coordinator.get(parent.id)).toEqual(failedParent);
  });

  it("does not record a denoising model for a clarity-only attempt", async () => {
    const clarityOnly = { ...profile, stages: profile.stages.map((stage) => ({ ...stage, enabled: stage.id === "voice-clarity" })) };
    const coordinator = createFinalJobCoordinator({ store: memoryStore(), canExecuteFinal: () => true });
    const job = await coordinator.create({ media, profile: clarityOnly });
    expect(job.enabledStages.map((stage) => stage.id)).toEqual(["voice-clarity"]);
    expect(job.executionSnapshot).toBeUndefined();
  });

  it("rejects an invalid profile and a source output target", () => {
    expect(() => createFinalJob(media, { ...profile, mediaRef: "other" })).toThrow();
    expect(() => createFinalJob(media, { ...profile, output: { ...profile.output, destination: { ...profile.output.destination, targetRef: "source" } } })).toThrow(/different output target/);
  });

  it("rejects registered but unavailable profiles before creating a final attempt", () => {
    const declaration = getProcessingProfileDeclaration("mixed-audio")!;
    const futureProfile = { ...profile, profileId: "mixed-audio" as const, stages: declaration.stages.map((stage) => ({ id: stage.id, enabled: true, parameters: Object.fromEntries(stage.parameters.map((parameter) => [parameter.id, parameter.defaultValue])) })) };
    expect(() => createFinalJob(media, futureProfile)).toThrow(/no qualified local adapter/i);
  });

  it("rejects a final result without validated output evidence", () => {
    const job = createFinalJob(media, profile);
    expect(() => finalJobSchema.parse({ ...job, state: "succeeded" })).toThrow(/validated output artifact/);
  });

  it("only accepts success for the supported experimental profile with a validated full-duration local WAV artifact", async () => {
    const shortMedia: MediaMetadata = { ...media, sizeBytes: 48_044, durationSeconds: 1, audioStream: { ...media.audioStream, channels: 1, sampleRate: 48_000 } };
    const shortProfile = { ...profile, mediaRef: shortMedia.sourceRef, stages: profile.stages.map((stage) => ({ ...stage, enabled: stage.id === "noise-removal" })) };
    expect(isSupportedExperimentalFinalProfile(shortMedia, shortProfile)).toBe(true);
    const coordinator = createFinalJobCoordinator({ store: memoryStore() });
    const job = await coordinator.create({ media: shortMedia, profile: shortProfile });
    coordinator.consume(job.id, { type: "progress", jobId: job.id, sequence: 1, phase: "Enhancing", stageId: "noise-removal", progress: 0.9, elapsedMs: 900 });
    const output = { artifactId: "00000000-0000-4000-8000-000000000099", fileName: "enhanced-output.wav", mimeType: "audio/wav" as const, sizeBytes: 144_044, durationSeconds: 1, mediaValidated: true as const, experimental: true as const };
    expect(coordinator.consume(job.id, { type: "succeeded", jobId: job.id, sequence: 2, elapsedMs: 1_000, output })).toMatchObject({ state: "succeeded", output });

    const incompatible = createFinalJobCoordinator({ store: memoryStore(), canExecuteFinal: () => true });
    const invalidProfile = { ...shortProfile, stages: profile.stages.map((stage) => ({ ...stage, enabled: stage.id === "noise-removal" || stage.id === "echo-reverb-reduction" })) };
    const invalidJob = await incompatible.create({ media: shortMedia, profile: invalidProfile });
    incompatible.consume(invalidJob.id, { type: "progress", jobId: invalidJob.id, sequence: 1, phase: "Enhancing", stageId: "noise-removal", progress: 0.9, elapsedMs: 900 });
    expect(() => incompatible.consume(invalidJob.id, { type: "succeeded", jobId: invalidJob.id, sequence: 2, elapsedMs: 1_000, output })).toThrow(/unsupported/);
  });

  it("supports the selected 4:57 recording but rejects audio beyond the five-minute experimental limit", () => {
    const recording: MediaMetadata = { ...media, sizeBytes: 27_200_000, durationSeconds: 297, audioStream: { ...media.audioStream, channels: 1, sampleRate: 48_000 } };
    const recordingProfile = { ...profile, mediaRef: recording.sourceRef };
    expect(isSupportedExperimentalFinalProfile(recording, recordingProfile)).toBe(true);
    expect(isSupportedExperimentalFinalProfile({ ...recording, durationSeconds: 300 }, recordingProfile)).toBe(true);
    expect(isSupportedExperimentalFinalProfile({ ...recording, durationSeconds: 300.01 }, recordingProfile)).toBe(false);
  });

  it("accepts zero-gain clarity alongside active denoising but rejects a clarity-only no-op", () => {
    const shortMedia: MediaMetadata = { ...media, sizeBytes: 48_044, durationSeconds: 1, audioStream: { ...media.audioStream, channels: 1, sampleRate: 48_000 } };
    const combined = { ...profile, mediaRef: shortMedia.sourceRef, stages: profile.stages.map((stage) => ({ ...stage, enabled: stage.id === "noise-removal" || stage.id === "voice-clarity", parameters: stage.id === "voice-clarity" ? { intensity: 0 } : stage.parameters })) };
    const clarityOnly = { ...combined, stages: combined.stages.map((stage) => ({ ...stage, enabled: stage.id === "voice-clarity" })) };
    expect(isSupportedExperimentalFinalProfile(shortMedia, combined)).toBe(true);
    expect(isSupportedExperimentalFinalProfile(shortMedia, clarityOnly)).toBe(false);
  });

  it("marks removed output while preserving history and protects active attempts during cleanup", async () => {
    const shortMedia: MediaMetadata = { ...media, sizeBytes: 48_044, durationSeconds: 1, audioStream: { ...media.audioStream, channels: 1, sampleRate: 48_000 } };
    const shortProfile = { ...profile, mediaRef: shortMedia.sourceRef, stages: profile.stages.map((stage) => ({ ...stage, enabled: stage.id === "noise-removal" })) };
    const coordinator = createFinalJobCoordinator({ store: memoryStore(), canExecuteFinal: () => true });
    const active = await coordinator.create({ media: shortMedia, profile: shortProfile });
    const completed = await coordinator.create({ media: { ...shortMedia, sourceName: "second.wav", sourceRef: "local:second.wav:20:1" }, profile: { ...shortProfile, mediaRef: "local:second.wav:20:1" } });
    coordinator.consume(completed.id, { type: "progress", jobId: completed.id, sequence: 1, phase: "Enhancing", stageId: "noise-removal", elapsedMs: 1 });
    const output = { artifactId: "00000000-0000-4000-8000-000000000099", fileName: "enhanced-output.wav", mimeType: "audio/wav" as const, sizeBytes: 144_044, durationSeconds: 1, mediaValidated: true as const, experimental: true as const };
    coordinator.consume(completed.id, { type: "succeeded", jobId: completed.id, sequence: 2, elapsedMs: 2, output });
    const result = coordinator.applyCleanup({ scope: "REMOVE_OUTPUTS", removedOutputIds: [output.artifactId], removedSourceRefs: [], deleteHistoryIds: [] });
    expect(result.skippedActive).toContain(active.id);
    expect(coordinator.get(active.id).state).toBe("queued");
    expect(coordinator.get(completed.id)).toMatchObject({ state: "succeeded", output, outputAvailability: "removed" });
  });

  it("retains terminal retry ancestry while a linked retry is active", async () => {
    const coordinator = createFinalJobCoordinator({ store: memoryStore(), canExecuteFinal: () => true });
    const parent = await coordinator.create({ media, profile });
    coordinator.consume(parent.id, { type: "progress", jobId: parent.id, sequence: 1, phase: "noise-removal", stageId: "noise-removal", elapsedMs: 5 });
    coordinator.consume(parent.id, { type: "failed", jobId: parent.id, sequence: 2, elapsedMs: 10, failure: { code: "PROCESSING_FAILED", message: "failed" } });
    const activeRetry = await coordinator.create({ media, profile, retryOfJobId: parent.id });
    const result = coordinator.applyCleanup({ scope: "CLEAR_HISTORY", removedOutputIds: [], removedSourceRefs: [], deleteHistoryIds: [parent.id] });
    expect(result.removedHistory).not.toContain(parent.id);
    expect(result.skippedAncestry).toContain(parent.id);
    expect(coordinator.get(parent.id).id).toBe(activeRetry.retryOf);
  });

  it("rejects a profile with no enabled enhancement stages", () => {
    const noOp = { ...profile, stages: profile.stages.map((stage) => ({ ...stage, enabled: false })) };
    expect(() => createFinalJob(media, noOp)).toThrow(/Enable at least one enhancement stage/);
  });

  it("persists creation and accepts only ordered events for enabled stages", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ai-noice-final-job-"));
    try {
      const filePath = path.join(directory, "final-jobs.json");
      const coordinator = createFinalJobCoordinator({ store: createFinalJobFileStore(filePath), canExecuteFinal: () => true });
      const job = await coordinator.create({ media, profile });
      expect(createFinalJobFileStore(filePath).load()).toEqual([job]);
      const progress = { type: "progress" as const, jobId: job.id, sequence: 1, stageId: "noise-removal", phase: "Denoising", progress: 0.2, elapsedMs: 120 };
      expect(coordinator.consume(job.id, progress)).toMatchObject({ state: "running", sequence: 1, progress: 0.2 });
      expect(() => coordinator.consume(job.id, { ...progress, sequence: 2, stageId: "loudness-normalization" })).toThrow(/active enabled stage/);
      expect(() => coordinator.consume(job.id, { ...progress, sequence: 2, jobId: "00000000-0000-4000-8000-000000000099" })).toThrow(/does not match/);
      expect(() => coordinator.consume(job.id, { ...progress, sequence: 2, progress: 0.1 })).toThrow(/backwards/);
      expect(coordinator.consume(job.id, { ...progress, sequence: 2, progress: undefined })).toMatchObject({ sequence: 2, progress: 0.2 });
      expect(() => coordinator.consume(job.id, { ...progress, sequence: 3, progress: 0.1 })).toThrow(/backwards/);
      expect(() => coordinator.consume(job.id, { ...progress, sequence: 3, stageId: "loudness-normalization" })).toThrow(/active enabled stage/);
      expect(coordinator.get(job.id)).toMatchObject({ sequence: 2, progress: 0.2 });
      const reopened = createFinalJobCoordinator({ store: createFinalJobFileStore(filePath), canExecuteFinal: () => true });
      expect(reopened.get(job.id)).toMatchObject({ state: "failed", sequence: 3, failure: { code: "PROCESSING_FAILED" }, enabledStages: job.enabledStages });
    } finally {
      if (!directory.startsWith(os.tmpdir())) throw new Error("Refusing to remove a test directory outside OS temp.");
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires acknowledgement before cancellation and rejects every late worker event", async () => {
    const coordinator = createFinalJobCoordinator({ store: memoryStore(), canExecuteFinal: () => true });
    const job = await coordinator.create({ media, profile });
    expect(() => coordinator.cancel(job.id)).toThrow(/active final-processing/);
    coordinator.consume(job.id, { type: "progress", jobId: job.id, sequence: 1, stageId: "noise-removal", phase: "Denoising", progress: 0.2, elapsedMs: 100 });
    expect(coordinator.cancel(job.id)).toMatchObject({ state: "cancelling", sequence: 2 });
    expect(() => coordinator.consume(job.id, { type: "progress", jobId: job.id, sequence: 3, stageId: "noise-removal", phase: "Denoising", progress: 0.3, elapsedMs: 200 })).toThrow(/late worker updates/);
    expect(() => coordinator.consume(job.id, { type: "failed", jobId: job.id, sequence: 3, elapsedMs: 200, failure: { code: "PROCESSING_FAILED", message: "late", action: "diagnostics" } })).toThrow(/late worker updates/);
    expect(coordinator.consume(job.id, { type: "cancelled", jobId: job.id, sequence: 3, elapsedMs: 100 })).toMatchObject({ state: "cancelled", sequence: 3 });
    expect(() => coordinator.consume(job.id, { type: "cancelled", jobId: job.id, sequence: 4, elapsedMs: 100 })).toThrow(/stale/);
  });

  it("recovers persisted queued and running jobs as failed and cancelling jobs as cancelled", () => {
    const seed = createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000010" });
    const queued = seed;
    const running = { ...createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000011" }), state: "running" as const, sequence: 1, phase: "noise-removal", progress: 0.4 };
    const cancelling = { ...createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000012" }), state: "cancelling" as const, sequence: 2 };
    const store = memoryStore();
    store.save([queued, running, cancelling]);
    const recovered = createFinalJobCoordinator({ store, now: () => "2026-09-30T10:00:00.000Z" });
    expect(recovered.get(queued.id)).toMatchObject({ state: "failed", sequence: 1, failure: { code: "PROCESSING_FAILED" } });
    expect(recovered.get(running.id)).toMatchObject({ state: "failed", sequence: 2, failure: { code: "PROCESSING_FAILED" } });
    expect(recovered.get(cancelling.id)).toMatchObject({ state: "cancelled", sequence: 3, recoveryNotice: expect.stringContaining("application restarted") });
    expect(store.load().map((job) => job.state)).toEqual(["failed", "failed", "cancelled"]);
  });

  it("creates retry as a new linked attempt and preserves the failed predecessor", async () => {
    const coordinator = createFinalJobCoordinator({ canExecuteFinal: () => true, store: memoryStore() });
    const first = await coordinator.create({ media, profile });
    coordinator.consume(first.id, { type: "progress", jobId: first.id, sequence: 1, phase: "noise-removal", stageId: "noise-removal", progress: 0.2, elapsedMs: 10 });
    const failed = coordinator.consume(first.id, { type: "failed", jobId: first.id, sequence: 2, elapsedMs: 20, failure: { code: "MODEL_UNAVAILABLE", message: "missing model", action: "diagnostics" } });
    const retryId = "00000000-0000-4000-8000-000000000013";
    const retry = await coordinator.create({ media: first.media, profile: first.profile, retryOfJobId: first.id, clientAttemptId: retryId });
    expect(retry).toMatchObject({ id: retryId, retryOf: first.id, state: "queued", media: first.media, profile: first.profile });
    expect(coordinator.get(first.id)).toEqual(failed);
    const exposed = coordinator.get(first.id);
    exposed.media.sourceName = "mutated.wav";
    exposed.profile.stages[0]!.enabled = false;
    expect(coordinator.get(first.id)).toEqual(failed);
    await expect(coordinator.create({ media: first.media, profile: { ...first.profile, mediaRef: "changed" }, retryOfJobId: first.id })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(coordinator.create({ media: first.media, profile: first.profile, retryOfJobId: first.id })).rejects.toThrow(/already has a linked retry/);
  });

  it("reserves a predecessor against concurrent retry creation", async () => {
    const resolvers: Array<(ready: boolean) => void> = [];
    let capabilityChecks = 0;
    const coordinator = createFinalJobCoordinator({ store: memoryStore(), canExecuteFinal: () => { capabilityChecks += 1; return capabilityChecks === 1 ? true : new Promise<boolean>((resolve) => resolvers.push(resolve)); } });
    const original = await coordinator.create({ media, profile });
    coordinator.consume(original.id, { type: "progress", jobId: original.id, sequence: 1, phase: "noise-removal", stageId: "noise-removal", progress: 0.1, elapsedMs: 10 });
    coordinator.consume(original.id, { type: "failed", jobId: original.id, sequence: 2, elapsedMs: 20, failure: { code: "PROCESSING_FAILED", message: "test failure" } });
    const retryRequest = { media: original.media, profile: original.profile, retryOfJobId: original.id };
    const firstRetry = coordinator.create({ ...retryRequest, clientAttemptId: "00000000-0000-4000-8000-000000000014" });
    await Promise.resolve(); await Promise.resolve();
    await expect(coordinator.create({ ...retryRequest, clientAttemptId: "00000000-0000-4000-8000-000000000015" })).rejects.toThrow(/already has a linked retry/);
    resolvers.forEach((resolve) => resolve(true));
    await expect(firstRetry).resolves.toMatchObject({ retryOf: original.id, state: "queued" });
  });

  it("fails closed when the experimental final executor is unavailable", async () => {
    const coordinator = createFinalJobCoordinator({ canExecuteFinal: () => false, store: memoryStore() });
    await expect(coordinator.create({ media, profile })).rejects.toMatchObject({ code: "RUNTIME_UNAVAILABLE" });
    expect(coordinator.list()).toHaveLength(0);
  });

  it("rejects media payload fields at the metadata contract boundary", async () => {
    const coordinator = createFinalJobCoordinator({ canExecuteFinal: () => true, store: memoryStore() });
    await expect(coordinator.create({ media: { ...media, bytes: "private media bytes" }, profile })).rejects.toThrow();
    expect(coordinator.list()).toHaveLength(0);
  });

  it("reserves capacity while asynchronous capability checks are pending", async () => {
    const resolvers: Array<(ready: boolean) => void> = [];
    const coordinator = createFinalJobCoordinator({ canExecuteFinal: () => new Promise((resolve) => resolvers.push(resolve)), store: memoryStore() });
    const first = coordinator.create({ media, profile }); const second = coordinator.create({ media, profile });
    await Promise.resolve(); await Promise.resolve();
    await expect(coordinator.create({ media, profile })).rejects.toMatchObject({ code: "RUNTIME_UNAVAILABLE" });
    resolvers.forEach((resolve) => resolve(true));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("rejects a repeated attempt ID without replacing the previous job", async () => {
    const id = "00000000-0000-4000-8000-000000000099";
    const store = memoryStore();
    const coordinator = createFinalJobCoordinator({ canExecuteFinal: () => true, store });
    const original = await coordinator.create({ media, profile, clientAttemptId: id });
    await expect(coordinator.create({ media, profile, clientAttemptId: id })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(coordinator.get(id)).toEqual(original);
    expect(coordinator.list()).toHaveLength(1);
  });

  it("keeps unreadable local storage inside the safe error boundary", () => {
    const brokenStore = { load: () => { throw new Error("corrupt"); }, save: () => { throw new Error("corrupt"); } };
    const coordinator = createFinalJobCoordinator({ store: brokenStore });
    expect(() => coordinator.list()).toThrowError(expect.objectContaining({ code: "STORAGE_UNAVAILABLE" }));
  });
});
