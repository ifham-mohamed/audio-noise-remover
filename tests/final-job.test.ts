import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFinalJobFileStore } from "@/server/adapters/final-job-file-store";
import { createFinalJobCoordinator } from "@/server/domain/final-job-coordinator";
import { createFinalJob, finalJobSchema } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const media: MediaMetadata = { sourceName: "speech.wav", sourceRef: "local:speech.wav:20:1", format: "wav", mediaKind: "audio", sizeBytes: 20, durationSeconds: 30, audioStream: { id: "audio-0", present: true, summary: "Ready" } };
const profile = defaultProcessingProfile(media.sourceRef, "audio-0");
function memoryStore() { let saved: ReturnType<typeof createFinalJob>[] = []; return { load: () => [...saved], save: (jobs: readonly ReturnType<typeof createFinalJob>[]) => { saved = [...jobs]; } }; }

describe("final job contract and coordinator", () => {
  it("creates a typed queued final attempt and omits disabled profile stages", () => {
    const job = createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000001" });
    expect(job).toMatchObject({ kind: "final", state: "queued", id: "00000000-0000-4000-8000-000000000001" });
    expect(job.enabledStages.map((stage) => stage.id)).toEqual(["noise-removal", "voice-clarity"]);
  });

  it("rejects an invalid profile and a source output target", () => {
    expect(() => createFinalJob(media, { ...profile, mediaRef: "other" })).toThrow();
    expect(() => createFinalJob(media, { ...profile, output: { ...profile.output, destination: { ...profile.output.destination, targetRef: "source" } } })).toThrow(/different output target/);
  });

  it("rejects a final result without validated output evidence", () => {
    const job = createFinalJob(media, profile);
    expect(() => finalJobSchema.parse({ ...job, state: "succeeded" })).toThrow(/validated output artifact/);
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
      expect(reopened.get(job.id)).toMatchObject({ state: "running", sequence: 2, progress: 0.2, enabledStages: job.enabledStages });
    } finally {
      if (!directory.startsWith(os.tmpdir())) throw new Error("Refusing to remove a test directory outside OS temp.");
      rmSync(directory, { recursive: true, force: true });
    }
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

  it("keeps unreadable local storage inside the safe error boundary", () => {
    const brokenStore = { load: () => { throw new Error("corrupt"); }, save: () => { throw new Error("corrupt"); } };
    const coordinator = createFinalJobCoordinator({ store: brokenStore });
    expect(() => coordinator.list()).toThrowError(expect.objectContaining({ code: "STORAGE_UNAVAILABLE" }));
  });
});
