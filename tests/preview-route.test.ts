import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import { createPreviewJob, previewJobEnvelopeSchema } from "@/shared/contracts/preview";
import type { MediaMetadata } from "@/shared/contracts/media";

const coordinatorMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/server/domain/preview-coordinator", () => ({ previewCoordinator: coordinatorMock }));

import { POST } from "@/app/api/preview-jobs/route";

const media: MediaMetadata = {
  sourceName: "interview.wav",
  sourceRef: "local:interview.wav:12:1",
  format: "wav",
  mediaKind: "audio",
  sizeBytes: 12,
  durationSeconds: 90,
  audioStream: { id: "audio-0", present: true, summary: "Audio stream ready" },
};

describe("preview job API", () => {
  beforeEach(() => coordinatorMock.create.mockReset());

  it("returns a validated prepared job envelope after awaiting the coordinator", async () => {
    const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 45, { id: "00000000-0000-4000-8000-000000000001" });
    coordinatorMock.create.mockResolvedValue(job);
    const request = new Request("http://localhost/api/preview-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile: job.profile, currentTimeSeconds: 45 }) });
    const response = await POST(request);
    const envelope = previewJobEnvelopeSchema.parse(await response.json());
    expect(response.status).toBe(201);
    expect(envelope.data).toEqual(job);
    expect(envelope.error).toBeNull();
    expect(coordinatorMock.create).toHaveBeenCalledWith({ media, profile: job.profile, currentTimeSeconds: 45 });
  });
});
