import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPreviewJobFileStore } from "@/server/adapters/preview-job-file-store";
import { createPreviewCoordinator } from "@/server/domain/preview-coordinator";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const media: MediaMetadata = {
  sourceName: "local-fixture.wav",
  sourceRef: "local:fixture:12:1",
  format: "wav",
  mediaKind: "audio",
  sizeBytes: 12,
  durationSeconds: 90,
  audioStream: { id: "audio-0", present: true, summary: "Audio stream ready" },
};

const detectCapabilities = async () => ({
  generatedAt: "2026-09-29T00:00:00.000Z",
  requestId: "local-test",
  runtime: { nodeVersion: "test", os: "test", architecture: "test" },
  items: [],
});

function withTemporaryStore(run: (filePath: string) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ai-noice-preview-jobs-"));
    try {
      await run(path.join(directory, "preview-jobs.json"));
    } finally {
      if (!directory.startsWith(os.tmpdir())) throw new Error("Refusing to remove a preview-job test directory outside the OS temp folder.");
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

describe("local preview job persistence", () => {
  it("recovers interrupted jobs after restart without retaining media bytes", withTemporaryStore(async (filePath) => {
    const store = createPreviewJobFileStore(filePath);
    const firstRun = createPreviewCoordinator({ store, detectCapabilities });
    const request = { media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 30 };

    const running = await firstRun.create(request);
    firstRun.consume(running.id, { type: "progress", jobId: running.id, sequence: 1, phase: "Decoding", progress: 0.3, elapsedMs: 20 });
    const cancelling = await firstRun.create(request);
    firstRun.cancel(cancelling.id);
    const terminal = await firstRun.create(request);
    firstRun.consume(terminal.id, { type: "failed", jobId: terminal.id, sequence: 1, elapsedMs: 25, failure: { code: "MODEL_UNAVAILABLE", message: "No qualified model", action: "settings" } });

    const restarted = createPreviewCoordinator({ store: createPreviewJobFileStore(filePath), detectCapabilities, now: () => "2026-09-29T01:00:00.000Z" });
    expect(restarted.get(running.id)).toMatchObject({ state: "failed", sequence: 2, artifact: undefined, failure: { code: "PROCESSING_FAILED", action: "retry" } });
    expect(restarted.get(cancelling.id)).toMatchObject({ state: "cancelled", sequence: 1, artifact: undefined, failure: undefined });
    expect(restarted.get(terminal.id)).toMatchObject({ state: "failed", sequence: 1, failure: { code: "MODEL_UNAVAILABLE" } });

    const retry = await restarted.retry(running.id);
    expect(retry).toMatchObject({ state: "queued", retryOf: running.id });
    expect(restarted.get(running.id)).toMatchObject({ state: "failed", sequence: 2 });
    expect(readFileSync(filePath, "utf8")).not.toContain("LOCAL_AUDIO_PAYLOAD");
  }));

  it("fails closed on corrupt persisted state instead of silently replacing it", withTemporaryStore(async (filePath) => {
    const original = "{invalid local job state";
    const { writeFileSync } = await import("node:fs");
    writeFileSync(filePath, original, "utf8");
    expect(() => createPreviewJobFileStore(filePath).load()).toThrow(/could not be read or parsed/);
    expect(readFileSync(filePath, "utf8")).toBe(original);
  }));

  it("keeps terminal preview history beyond the former in-memory cap", withTemporaryStore(async (filePath) => {
    const store = createPreviewJobFileStore(filePath);
    const coordinator = createPreviewCoordinator({ store, detectCapabilities });
    for (let index = 0; index < 60; index += 1) {
      const job = await coordinator.create({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0"), currentTimeSeconds: 30 });
      coordinator.consume(job.id, { type: "failed", jobId: job.id, sequence: 1, elapsedMs: 1, failure: { code: "MODEL_UNAVAILABLE", message: "No qualified model", action: "settings" } });
    }
    expect(createPreviewJobFileStore(filePath).load()).toHaveLength(60);
  }));
});
