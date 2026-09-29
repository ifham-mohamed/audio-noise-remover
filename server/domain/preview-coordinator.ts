import { createPreviewJob, createPreviewJobRequestSchema, PreviewJobError, type PreviewJob } from "@/shared/contracts/preview";
import { capabilityDetector } from "@/server/adapters/capability-detector";
import type { CapabilityReport } from "@/shared/contracts/capabilities";

type PreviewCoordinatorDependencies = { detectCapabilities?: () => Promise<CapabilityReport> };

export function createPreviewCoordinator(dependencies: PreviewCoordinatorDependencies = {}) {
  const detectCapabilities = dependencies.detectCapabilities ?? (() => capabilityDetector.detect());

  return {
    async create(input: unknown): Promise<PreviewJob> {
      const request = createPreviewJobRequestSchema.parse(input);
      const report = await detectCapabilities();
      const ffmpeg = report.items.find((item) => item.id === "ffmpeg");
      const models = report.items.find((item) => item.id === "models");
      const storage = report.items.find((item) => item.id === "storage");

      if (!ffmpeg || ffmpeg.status !== "ready") throw new PreviewJobError("RUNTIME_UNAVAILABLE", ffmpeg?.summary ?? "Local media processing is unavailable. Open diagnostics and try again.");
      if (request.profile.stages.some((stage) => stage.enabled) && (!models || models.status !== "ready")) throw new PreviewJobError("MODEL_UNAVAILABLE", models?.summary ?? "A local speech model is unavailable. Open diagnostics and try again.");
      if (storage?.code === "DISK_SPACE_LOW") throw new PreviewJobError("DISK_SPACE_LOW", storage.summary);
      if (!storage || storage.status !== "ready") throw new PreviewJobError("STORAGE_UNAVAILABLE", storage?.summary ?? "Local storage is unavailable. Open diagnostics and try again.");

      const modelVersions: Record<string, string> = models?.version ? { "speech-model": models.version } : {};
      return createPreviewJob(request.media, request.profile, request.currentTimeSeconds, { modelVersions });
    },
  };
}

export const previewCoordinator = createPreviewCoordinator();
