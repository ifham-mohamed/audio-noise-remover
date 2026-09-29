import { createPreviewJob, createPreviewJobRequestSchema, PreviewJobError, previewEventSchema, type PreviewEvent, type PreviewJob } from "@/shared/contracts/preview";
import { capabilityDetector } from "@/server/adapters/capability-detector";
import type { CapabilityReport } from "@/shared/contracts/capabilities";

type Dependencies = { detectCapabilities?: () => Promise<CapabilityReport>; now?: () => string };
const MAX_RETAINED_TERMINAL_PREVIEWS = 50;
const MAX_ACTIVE_PREVIEWS = 4;
const terminalStates = new Set<PreviewJob["state"]>(["cancelled", "succeeded", "failed"]);

export function createPreviewCoordinator(dependencies: Dependencies = {}) {
  const jobs = new Map<string, PreviewJob>();
  const now = dependencies.now ?? (() => new Date().toISOString());
  function pruneTerminalJobs() {
    const terminal = [...jobs.values()].filter((job) => terminalStates.has(job.state)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    while (terminal.length > MAX_RETAINED_TERMINAL_PREVIEWS) jobs.delete(terminal.shift()!.id);
  }
  function assertActiveCapacity() {
    const active = [...jobs.values()].filter((job) => !terminalStates.has(job.state)).length;
    if (active >= MAX_ACTIVE_PREVIEWS) throw new PreviewJobError("RUNTIME_UNAVAILABLE", "Too many local previews are active. Wait for one to finish or cancel it before starting another.");
  }
  async function create(input: unknown): Promise<PreviewJob> {
    const request = createPreviewJobRequestSchema.parse(input);
    assertActiveCapacity();
    const report = await (dependencies.detectCapabilities ?? (() => capabilityDetector.detect()))();
    assertActiveCapacity();
    const models = report.items.find((item) => item.id === "models");
    const job = createPreviewJob(request.media, request.profile, request.currentTimeSeconds, { modelVersions: models?.version ? { "speech-model": models.version } : {} });
    jobs.set(job.id, job);
    pruneTerminalJobs();
    return job;
  }
  function get(id: string) { const job = jobs.get(id); if (!job) throw new PreviewJobError("JOB_NOT_FOUND", "This preview attempt is no longer available."); return job; }
  function change(id: string, update: (job: PreviewJob) => PreviewJob) { const current = get(id); const next = update(current); jobs.set(id, next); return next; }
  function consume(id: string, input: unknown) {
    const event = previewEventSchema.parse(input) as PreviewEvent;
    const current = get(id);
    if (event.jobId !== id) throw new PreviewJobError("INVALID_TRANSITION", "This preview event does not match the active attempt.");
    // In-flight progress rejected during cancellation can leave sequence gaps.
    if (event.sequence <= current.sequence) throw new PreviewJobError("INVALID_TRANSITION", "A preview progress event was stale or out of order.");
    if (terminalStates.has(current.state)) throw new PreviewJobError("INVALID_TRANSITION", "This preview attempt has already finished.");
    const stamp = now();
    if (event.type === "progress") {
      if (current.state === "cancelling") throw new PreviewJobError("INVALID_TRANSITION", "Progress cannot resume while the preview is cancelling.");
      if (current.progress !== undefined && event.progress !== undefined && event.progress < current.progress) throw new PreviewJobError("INVALID_TRANSITION", "Preview progress cannot move backwards.");
      const next = change(id, (job) => ({ ...job, state: "running", sequence: event.sequence, updatedAt: stamp, phase: event.phase, progress: event.progress, elapsedMs: event.elapsedMs }));
      return next;
    }
    if (event.type === "succeeded") {
      if (current.state === "cancelling") throw new PreviewJobError("INVALID_TRANSITION", "A cancelling preview cannot succeed.");
      return change(id, (job) => ({ ...job, state: "succeeded", sequence: event.sequence, updatedAt: stamp, elapsedMs: event.elapsedMs, progress: 1, artifact: event.artifact, failure: undefined }));
    }
    if (event.type === "failed") {
      const next = change(id, (job) => ({ ...job, state: "failed", sequence: event.sequence, updatedAt: stamp, elapsedMs: event.elapsedMs, failure: event.failure, artifact: undefined }));
      pruneTerminalJobs();
      return next;
    }
    if (current.state !== "cancelling") throw new PreviewJobError("INVALID_TRANSITION", "Cancellation can settle only after the coordinator receives a cancel request.");
    const next = change(id, (job) => ({ ...job, state: "cancelled", sequence: event.sequence, updatedAt: stamp, elapsedMs: event.elapsedMs, artifact: undefined }));
    pruneTerminalJobs();
    return next;
  }
  function cancel(id: string) {
    return change(id, (job) => {
      if (terminalStates.has(job.state)) return job;
      if (job.state === "cancelling") return job;
      if (job.state !== "queued" && job.state !== "running") throw new PreviewJobError("INVALID_TRANSITION", "Only an active preview can be cancelled.");
      return { ...job, state: "cancelling", updatedAt: now(), artifact: undefined };
    });
  }
  async function retry(id: string) {
    const previous = get(id);
    if (previous.state !== "cancelled" && previous.state !== "failed") throw new PreviewJobError("INVALID_TRANSITION", "Only a failed or cancelled preview can be retried.");
    assertActiveCapacity();
    const report = await (dependencies.detectCapabilities ?? (() => capabilityDetector.detect()))();
    assertActiveCapacity();
    const models = report.items.find((item) => item.id === "models");
    const next = createPreviewJob(previous.media, previous.profile, (previous.range.startSeconds + previous.range.endSeconds) / 2, { modelVersions: models?.version ? { "speech-model": models.version } : {}, retryOf: previous.id });
    jobs.set(next.id, next);
    pruneTerminalJobs();
    return next;
  }
  return { create, get, consume, cancel, retry };
}
export const previewCoordinator = createPreviewCoordinator();
