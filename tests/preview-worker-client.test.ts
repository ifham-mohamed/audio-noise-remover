import { afterEach, describe, expect, it, vi } from "vitest";
import { startPreviewWorker } from "@/features/preview/preview-worker-client";
import { createPreviewJob, type PreviewEvent } from "@/shared/contracts/preview";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const artifactStorage = vi.hoisted(() => ({ retainPair: vi.fn(async () => undefined), removePair: vi.fn(async () => undefined) }));
vi.mock("@/features/preview/preview-artifact-store", () => ({ retainPreviewArtifactPair: artifactStorage.retainPair, removePreviewArtifactPair: artifactStorage.removePair }));

const media: MediaMetadata = {
  sourceName: "interview.wav",
  sourceRef: "local:interview.wav:12:1",
  format: "wav",
  mediaKind: "audio",
  sizeBytes: 12,
  durationSeconds: 90,
  audioStream: { id: "audio-0", present: true, summary: "Audio stream ready" },
};

class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((message: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor(readonly url: URL, readonly options?: WorkerOptions) { WorkerDouble.instances.push(this); }
  postMessage(message: unknown) { this.posted.push(message); }
  terminate() { this.terminated = true; }
  send(data: unknown) { this.onmessage?.({ data } as MessageEvent<unknown>); }
}

function setup() {
  WorkerDouble.instances = [];
  vi.stubGlobal("Worker", WorkerDouble);
  const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 45, { id: "00000000-0000-4000-8000-000000000001" });
  const onEvent = vi.fn(async (_event: PreviewEvent) => undefined);
  const session = startPreviewWorker(job, new File(["audio"], "interview.wav", { type: "audio/wav" }), onEvent);
  return { job, onEvent, session, worker: WorkerDouble.instances[0] };
}

afterEach(() => { vi.unstubAllGlobals(); artifactStorage.retainPair.mockClear(); artifactStorage.removePair.mockClear(); });

describe("preview worker client", () => {
  it("hands the selected file to a same-origin module worker and relays ordered events", async () => {
    const { job, onEvent, worker } = setup();
    expect(worker.options).toMatchObject({ type: "module", name: `preview-${job.id}` });
    expect(worker.posted[0]).toMatchObject({ type: "start", jobId: job.id, file: expect.any(File), range: job.range, audioStreamIndex: 0 });

    worker.send({ type: "progress", jobId: job.id, sequence: 1, phase: "Preparing local preview", progress: 0, elapsedMs: 1 });
    worker.send({ type: "progress", jobId: job.id, sequence: 2, phase: "Decoding local audio", progress: 0.5, elapsedMs: 25 });
    worker.send({ type: "failed", jobId: job.id, sequence: 3, elapsedMs: 30, failure: { code: "MODEL_UNAVAILABLE", message: "Model unavailable", action: "settings" } });
    worker.send({ type: "succeeded", jobId: job.id, sequence: 4, elapsedMs: 31, artifact: { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: 12, durationSeconds: 10 } });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(3));
    expect(onEvent.mock.calls.map(([event]) => event.sequence)).toEqual([1, 2, 3]);
    expect(worker.terminated).toBe(true);
  });

  it("ignores malformed, wrong-job, duplicate, and out-of-order events", async () => {
    const { job, onEvent, worker } = setup();
    worker.send({ type: "progress", jobId: "00000000-0000-4000-8000-000000000099", sequence: 1, phase: "Wrong job", progress: 0.2, elapsedMs: 1 });
    worker.send({ type: "progress", jobId: job.id, sequence: 2, phase: "Skipped sequence", progress: 0.4, elapsedMs: 2 });
    worker.send({ type: "progress", jobId: job.id, sequence: 1, phase: "Preparing", progress: 0.2, elapsedMs: 3 });
    worker.send({ type: "progress", jobId: job.id, sequence: 1, phase: "Duplicate", progress: 0.3, elapsedMs: 4 });
    worker.send({ type: "failed", jobId: job.id, sequence: 2, elapsedMs: 5, failure: { code: "MODEL_UNAVAILABLE", message: "Unavailable" } });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    expect(onEvent.mock.calls.map(([event]) => event.sequence)).toEqual([1, 2]);
    expect(worker.terminated).toBe(true);
  });

  it("retains validated enhancement bytes before reporting success to the coordinator", async () => {
    const { job, onEvent, worker } = setup();
    const blob = new Blob(["enhanced wav"], { type: "audio/wav" });
    const artifact = { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: blob.size, durationSeconds: 1 };
    const sourceBlob = new Blob(["source wav"], { type: "audio/wav" });
    const sourceArtifact = { id: "00000000-0000-4000-8000-000000000003", mimeType: "audio/wav", sizeBytes: sourceBlob.size, durationSeconds: 1 };
    artifactStorage.retainPair.mockImplementationOnce(async () => {
      expect(onEvent).not.toHaveBeenCalled();
    });
    worker.send({ type: "succeeded", jobId: job.id, sequence: 1, elapsedMs: 31, artifact, comparisonSourceArtifact: sourceArtifact, artifactBlob: blob, comparisonSourceBlob: sourceBlob, artifactSource: "enhancement-adapter" });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(artifactStorage.retainPair).toHaveBeenCalledWith(sourceArtifact, sourceBlob, artifact, blob);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "succeeded", artifact, comparisonSourceArtifact: sourceArtifact }));
    expect(Object.keys(onEvent.mock.calls[0][0])).not.toContain("artifactBlob");
    expect(worker.terminated).toBe(true);
  });

  it("refuses worker success without enhanced artifact bytes and provenance", async () => {
    const { job, onEvent, worker } = setup();
    const artifact = { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: 100, durationSeconds: 1 };
    worker.send({ type: "succeeded", jobId: job.id, sequence: 1, elapsedMs: 31, artifact });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "failed", sequence: 1, failure: expect.objectContaining({ code: "PROCESSING_FAILED" }) }));
    expect(artifactStorage.retainPair).not.toHaveBeenCalled();
  });

  it("cleans up any partial local retention and reports failure when validation or storage fails", async () => {
    const { job, onEvent, worker } = setup();
    const blob = new Blob(["enhanced wav"], { type: "audio/wav" });
    const artifact = { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: blob.size, durationSeconds: 1 };
    const sourceBlob = new Blob(["source wav"], { type: "audio/wav" });
    const sourceArtifact = { id: "00000000-0000-4000-8000-000000000003", mimeType: "audio/wav", sizeBytes: sourceBlob.size, durationSeconds: 1 };
    artifactStorage.retainPair.mockRejectedValueOnce(new Error("validation failed after partial write"));
    worker.send({ type: "succeeded", jobId: job.id, sequence: 1, elapsedMs: 31, artifact, comparisonSourceArtifact: sourceArtifact, artifactBlob: blob, comparisonSourceBlob: sourceBlob, artifactSource: "enhancement-adapter" });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(artifactStorage.removePair).toHaveBeenCalledWith([artifact.id, sourceArtifact.id]);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "failed", sequence: 1, failure: expect.objectContaining({ code: "PROCESSING_FAILED" }) }));
  });

  it("deletes retained bytes if the coordinator rejects the success event", async () => {
    WorkerDouble.instances = [];
    vi.stubGlobal("Worker", WorkerDouble);
    const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 45, { id: "00000000-0000-4000-8000-000000000001" });
    const blob = new Blob(["enhanced wav"], { type: "audio/wav" });
    const artifact = { id: "00000000-0000-4000-8000-000000000002", mimeType: "audio/wav", sizeBytes: blob.size, durationSeconds: 1 };
    const sourceBlob = new Blob(["source wav"], { type: "audio/wav" });
    const sourceArtifact = { id: "00000000-0000-4000-8000-000000000003", mimeType: "audio/wav", sizeBytes: sourceBlob.size, durationSeconds: 1 };
    const onEvent = vi.fn(async () => false);
    const session = startPreviewWorker(job, new File(["audio"], "interview.wav", { type: "audio/wav" }), onEvent);
    const workerInstance = WorkerDouble.instances.at(-1)!;
    workerInstance.send({ type: "succeeded", jobId: job.id, sequence: 1, elapsedMs: 31, artifact, comparisonSourceArtifact: sourceArtifact, artifactBlob: blob, comparisonSourceBlob: sourceBlob, artifactSource: "enhancement-adapter" });
    await session.cancel();
    expect(artifactStorage.removePair).toHaveBeenCalledWith([artifact.id, sourceArtifact.id]);
  });

  it("waits for worker cleanup and terminal cancellation before resolving cancel", async () => {
    const { job, onEvent, session, worker } = setup();
    let settled = false;
    const cancelDone = session.cancel().then(() => { settled = true; });
    expect(worker.posted.at(-1)).toEqual({ type: "cancel" });
    await Promise.resolve();
    expect(settled).toBe(false);
    worker.send({ type: "cancelled", jobId: job.id, sequence: 1, elapsedMs: 2 });
    await cancelDone;
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "cancelled", jobId: job.id }));
    expect(worker.terminated).toBe(true);
  });

  it("discards in-flight progress after cancellation while preserving the terminal sequence", async () => {
    const { job, onEvent, session, worker } = setup();
    worker.send({ type: "progress", jobId: job.id, sequence: 1, phase: "Decoding", progress: 0.2, elapsedMs: 1 });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    const stopped = session.cancel();
    worker.send({ type: "progress", jobId: job.id, sequence: 2, phase: "Decoding", progress: 0.5, elapsedMs: 2 });
    worker.send({ type: "cancelled", jobId: job.id, sequence: 3, elapsedMs: 3 });
    await stopped;
    expect(onEvent.mock.calls.map(([event]) => [event.type, event.sequence])).toEqual([["progress", 1], ["cancelled", 3]]);
    expect(worker.posted.filter((message) => (message as { type?: string }).type === "cancel")).toHaveLength(1);
  });

  it("reports a worker construction failure as a safe terminal runtime error", async () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("worker unavailable"); } });
    const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 45, { id: "00000000-0000-4000-8000-000000000001" });
    const onEvent = vi.fn(async (_event: PreviewEvent) => undefined);
    const session = startPreviewWorker(job, new File(["audio"], "interview.wav"), onEvent);
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "failed", failure: expect.objectContaining({ code: "RUNTIME_UNAVAILABLE", action: "diagnostics" }) })));
    await session.cancel();
  });

  it("settles the job when posting the start message throws", async () => {
    class ThrowingWorker extends WorkerDouble {
      postMessage(message: unknown) {
        if ((message as { type?: string }).type === "start") throw new DOMException("Could not clone message", "DataCloneError");
        super.postMessage(message);
      }
    }
    vi.stubGlobal("Worker", ThrowingWorker);
    const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 45, { id: "00000000-0000-4000-8000-000000000001" });
    const onEvent = vi.fn(async (_event: PreviewEvent) => undefined);
    const session = startPreviewWorker(job, new File(["audio"], "interview.wav"), onEvent);
    await session.cancel();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "failed", jobId: job.id, sequence: 1, failure: expect.objectContaining({ code: "RUNTIME_UNAVAILABLE" }) }));
    expect(WorkerDouble.instances[0].terminated).toBe(true);
  });

  it("turns a worker crash into a sequenced safe failure", async () => {
    const { job, onEvent, worker } = setup();
    worker.send({ type: "progress", jobId: job.id, sequence: 1, phase: "Preparing", progress: 0, elapsedMs: 1 });
    worker.onerror?.();
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
    expect(onEvent.mock.calls[1][0]).toMatchObject({ type: "failed", sequence: 2, failure: { code: "RUNTIME_UNAVAILABLE" } });
    expect(worker.terminated).toBe(true);
  });
});
