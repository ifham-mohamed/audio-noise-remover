import { beforeEach, describe, expect, it, vi } from "vitest";

const coordinatorMock = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), consume: vi.fn() }));
vi.mock("@/server/domain/final-job-coordinator", () => ({ finalJobCoordinator: coordinatorMock }));
import { GET, POST } from "@/app/api/final-jobs/route";
import { POST as updateJob } from "@/app/api/final-jobs/[id]/route";
import { createFinalJob } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import { getProcessingProfileDeclaration } from "@/shared/contracts/processing-profiles";
import type { MediaMetadata } from "@/shared/contracts/media";

const media: MediaMetadata = { sourceName: "speech.wav", sourceRef: "local:speech.wav:20:1", format: "wav", mediaKind: "audio", sizeBytes: 20, durationSeconds: 30, audioStream: { id: "audio-0", present: true, summary: "Ready" } };
const profile = defaultProcessingProfile(media.sourceRef, "audio-0");
describe("final job metadata API", () => {
  beforeEach(() => { coordinatorMock.create.mockReset(); coordinatorMock.list.mockReset(); });
  it("returns the standard envelope when a job is created", async () => {
    const job = createFinalJob(media, profile, { id: "00000000-0000-4000-8000-000000000001" }); coordinatorMock.create.mockResolvedValue(job);
    const response = await POST(new Request("http://localhost/api/final-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile }) }));
    const body = await response.json();
    expect(response.status).toBe(201); expect(body).toMatchObject({ data: { id: job.id, kind: "final", state: "queued" }, error: null, requestId: expect.any(String) }); expect(coordinatorMock.create).toHaveBeenCalledWith({ media, profile }, body.requestId);
  });
  it("rejects file bytes and never forwards the payload to the coordinator", async () => {
    const response = await POST(new Request("http://localhost/api/final-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile, fileBytes: "private media bytes" }) }));
    expect(response.status).toBe(400); expect(coordinatorMock.create).not.toHaveBeenCalled(); expect(JSON.stringify(await response.json())).not.toContain("private media bytes");
  });
  it("does not accept a caller supplied request ID", async () => {
    const response = await POST(new Request("http://localhost/api/final-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile, requestId: "00000000-0000-4000-8000-000000000099" }) }));
    expect(response.status).toBe(400);
    expect(coordinatorMock.create).not.toHaveBeenCalled();
  });
  it("returns unavailable-profile failure rather than creating a future-profile attempt", async () => {
    const declaration = getProcessingProfileDeclaration("music")!;
    const futureProfile = { ...profile, profileId: "music" as const, stages: declaration.stages.map((stage) => ({ id: stage.id, enabled: true, parameters: Object.fromEntries(stage.parameters.map((parameter) => [parameter.id, parameter.defaultValue])) })) };
    coordinatorMock.create.mockImplementation(async ({ media: inputMedia, profile: inputProfile }) => createFinalJob(inputMedia, inputProfile));
    const response = await POST(new Request("http://localhost/api/final-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile: futureProfile }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ data: null, error: { code: "MODEL_UNAVAILABLE" } });
  });
  it("lists persisted jobs in the standard envelope without caching", async () => {
    const job = createFinalJob(media, profile); coordinatorMock.list.mockReturnValue([job]);
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(await response.json()).toMatchObject({ data: [{ id: job.id, kind: "final" }], error: null, requestId: expect.any(String) });
  });

  it("bounds final-job event request bodies before parsing", async () => {
    const response = await updateJob(new Request("http://localhost/api/final-jobs/job", { method: "POST", body: "x".repeat(20 * 1024) }), { params: Promise.resolve({ id: "job" }) });
    expect(response.status).toBe(413);
    expect(coordinatorMock.consume).not.toHaveBeenCalled();
  });
});
