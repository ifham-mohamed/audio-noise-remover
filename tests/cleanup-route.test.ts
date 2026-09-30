import { beforeEach, describe, expect, it, vi } from "vitest";

const coordinatorMocks = vi.hoisted(() => ({
  final: { list: vi.fn(), applyCleanup: vi.fn(), markOutputsAvailability: vi.fn() },
  preview: { list: vi.fn(), removeTerminal: vi.fn() },
}));
vi.mock("@/server/domain/final-job-coordinator", () => ({ finalJobCoordinator: coordinatorMocks.final }));
vi.mock("@/server/domain/preview-coordinator", () => ({ previewCoordinator: coordinatorMocks.preview }));

import { GET, POST } from "@/app/api/cleanup/route";
import { createFinalJob } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const media: MediaMetadata = { sourceName: "speech.wav", sourceRef: "local:speech.wav:20:1", format: "wav", mediaKind: "audio", sizeBytes: 20, durationSeconds: 30, audioStream: { id: "audio-0", present: true, summary: "Ready" } };
const profile = defaultProcessingProfile(media.sourceRef, "audio-0");

describe("local cleanup API", () => {
  beforeEach(() => {
    coordinatorMocks.final.list.mockReset();
    coordinatorMocks.final.applyCleanup.mockReset().mockReturnValue({ removedHistory: [], skippedActive: [], skippedAncestry: [] });
    coordinatorMocks.final.markOutputsAvailability.mockReset();
    coordinatorMocks.preview.list.mockReset().mockReturnValue([]);
    coordinatorMocks.preview.removeTerminal.mockReset().mockReturnValue({ removed: [], skipped: [] });
  });

  it("returns a runtime-validated cleanup plan without caching", async () => {
    coordinatorMocks.final.list.mockReturnValue([]);
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ data: { finalJobs: [], previewJobs: [] }, error: null, requestId: expect.any(String) });
  });

  it("retains linked history when the browser reports a generated-file deletion failure", async () => {
    const outputId = "00000000-0000-4000-8000-000000000095";
    const job = { ...createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000001" }), state: "succeeded" as const, output: { artifactId: outputId, fileName: "result.wav", mimeType: "audio/wav" as const, sizeBytes: 144_044, durationSeconds: 30, mediaValidated: true as const, experimental: true as const } };
    coordinatorMocks.final.list.mockReturnValue([job]);
    const prepare = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", phase: "prepare", plannedOutputIds: [outputId] }) }));
    const { data: { token } } = await prepare.json();
    const response = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", phase: "finish", token, plannedOutputIds: [outputId], failedArtifacts: [{ id: outputId, kind: "output" }] }) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(coordinatorMocks.final.applyCleanup).toHaveBeenCalledWith(expect.objectContaining({ scope: "CLEAR_HISTORY", deleteHistoryIds: [], failedOutputIds: [outputId] }));
    expect(body.data).toMatchObject({ complete: false, items: [{ id: outputId, outcome: "failed" }] });
  });

  it("rejects unknown fields instead of accepting unsafe cleanup commands", async () => {
    const response = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", paths: ["C:/user/original.wav"] }) }));
    expect(response.status).toBe(400);
    expect(coordinatorMocks.final.applyCleanup).not.toHaveBeenCalled();
  });

  it("passes only terminal records to coordinator-owned history removal", async () => {
    const job = { ...createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000002" }), state: "failed" as const, failure: { code: "PROCESSING_FAILED" as const, message: "failed" } };
    coordinatorMocks.final.list.mockReturnValue([job]);
    coordinatorMocks.final.applyCleanup.mockReturnValue({ removedHistory: [job.id], skippedActive: [], skippedAncestry: [] });
    const prepare = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", phase: "prepare", plannedFinalHistoryIds: [job.id] }) }));
    const { data: { token } } = await prepare.json();
    const response = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", phase: "finish", token, plannedFinalHistoryIds: [job.id] }) }));
    expect(response.status).toBe(200);
    expect(coordinatorMocks.final.applyCleanup).toHaveBeenCalledWith(expect.objectContaining({ deleteHistoryIds: [job.id] }));
    expect((await response.json()).data).toMatchObject({ complete: true, items: [{ id: job.id, outcome: "removed" }] });
  });

  it("blocks the plan when an active job depends on a selected retry source", async () => {
    coordinatorMocks.final.list.mockReturnValue([{ state: "running", media: { sourceRef: "local:active-source" } }]);
    const response = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", phase: "prepare", plannedSourceRefs: ["local:active-source"] }) }));
    expect(response.status).toBe(409);
    expect(coordinatorMocks.final.markOutputsAvailability).not.toHaveBeenCalled();
  });

  it("returns an itemized incomplete result if preview history persistence fails after final history succeeds", async () => {
    coordinatorMocks.final.list.mockReturnValue([]);
    coordinatorMocks.preview.removeTerminal.mockImplementation(() => { throw new Error("disk unavailable"); });
    const prepare = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", phase: "prepare" }) }));
    const { data: { token } } = await prepare.json();
    const response = await POST(new Request("http://localhost/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "CLEAR_HISTORY", phase: "finish", token }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ complete: false, items: [{ id: "preview-history", outcome: "failed" }] });
  });
});
