import { createPreviewJob, createPreviewJobRequestSchema, PreviewJobError, previewEventSchema, type PreviewEvent, type PreviewJob } from "@/shared/contracts/preview";
import { capabilityDetector } from "@/server/adapters/capability-detector";
import { createPreviewJobFileStore, type PreviewJobStore } from "@/server/adapters/preview-job-file-store";
import type { CapabilityReport } from "@/shared/contracts/capabilities";

type Dependencies = { detectCapabilities?: () => Promise<CapabilityReport>; now?: () => string; store?: PreviewJobStore };
const MAX_ACTIVE_PREVIEWS = 4;
const terminalStates = new Set<PreviewJob["state"]>(["cancelled", "succeeded", "failed"]);

export function createPreviewCoordinator(dependencies: Dependencies = {}) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const store = dependencies.store ?? createPreviewJobFileStore();
  const jobs = new Map(store.load().map((job) => [job.id, job]));

  function commit(candidate: Map<string, PreviewJob>) {
    store.save([...candidate.values()]);
    jobs.clear();
    for (const [id, job] of candidate) jobs.set(id, job);
  }

  function reconcileInterruptedJobs() {
    const candidate = new Map(jobs);
    let changed = false;
    for (const [id, job] of candidate) {
      if (terminalStates.has(job.state)) continue;
      const wasCancelling = job.state === "cancelling";
      candidate.set(id, {
        ...job,
        state: wasCancelling ? "cancelled" : "failed",
        sequence: job.sequence + 1,
        updatedAt: now(),
        phase: wasCancelling ? "Cancelled after the app stopped" : "Interrupted",
        artifact: undefined,
        comparisonSourceArtifact: undefined,
        failure: wasCancelling ? undefined : {
          code: "PROCESSING_FAILED",
          message: "The local app stopped before this preview finished. Retry to start a new attempt.",
          action: "retry",
        },
      });
      changed = true;
    }
    if (changed) commit(candidate);
    else if (candidate.size !== jobs.size) commit(candidate);
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
    const candidate = new Map(jobs);
    candidate.set(job.id, job);
    commit(candidate);
    return job;
  }
  function get(id: string) { const job = jobs.get(id); if (!job) throw new PreviewJobError("JOB_NOT_FOUND", "This preview attempt is no longer available."); return job; }
  function change(id: string, update: (job: PreviewJob) => PreviewJob) {
    const current = get(id);
    const next = update(current);
    const candidate = new Map(jobs);
    candidate.set(id, next);
    commit(candidate);
    return next;
  }
  function consume(id: string, input: unknown) {
    const event = previewEventSchema.parse(input) as PreviewEvent;
    const current = get(id);
    if (event.jobId !== id) throw new PreviewJobError("INVALID_TRANSITION", "This preview event does not match the active attempt.");
    const cancellationSettlementGap = current.state === "cancelling" && event.type === "cancelled" && event.sequence > current.sequence;
    if (event.sequence !== current.sequence + 1 && !cancellationSettlementGap) throw new PreviewJobError("INVALID_TRANSITION", "A preview event was missing, stale, or out of order.");
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
      if (!event.comparisonSourceArtifact) throw new PreviewJobError("INVALID_TRANSITION", "A new successful preview requires its retained Before audio artifact.");
      const boundedDuration = current.range.endSeconds - current.range.startSeconds;
      if (Math.abs(event.artifact.durationSeconds - boundedDuration) > 0.05 || Math.abs(event.comparisonSourceArtifact.durationSeconds - boundedDuration) > 0.05) throw new PreviewJobError("INVALID_TRANSITION", "Before and After artifacts must match the bounded preview range.");
      return change(id, (job) => ({ ...job, state: "succeeded", sequence: event.sequence, updatedAt: stamp, elapsedMs: event.elapsedMs, progress: 1, artifact: event.artifact, comparisonSourceArtifact: event.comparisonSourceArtifact, failure: undefined }));
    }
    if (event.type === "failed") {
      return change(id, (job) => ({ ...job, state: "failed", sequence: event.sequence, updatedAt: stamp, elapsedMs: event.elapsedMs, failure: event.failure, artifact: undefined, comparisonSourceArtifact: undefined }));
    }
    if (current.state !== "cancelling") throw new PreviewJobError("INVALID_TRANSITION", "Cancellation can settle only after the coordinator receives a cancel request.");
    return change(id, (job) => ({ ...job, state: "cancelled", sequence: event.sequence, updatedAt: stamp, elapsedMs: event.elapsedMs, artifact: undefined, comparisonSourceArtifact: undefined }));
  }
  function cancel(id: string) {
    return change(id, (job) => {
      if (terminalStates.has(job.state)) return job;
      if (job.state === "cancelling") return job;
      if (job.state !== "queued" && job.state !== "running") throw new PreviewJobError("INVALID_TRANSITION", "Only an active preview can be cancelled.");
      return { ...job, state: "cancelling", updatedAt: now(), artifact: undefined, comparisonSourceArtifact: undefined };
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
    const candidate = new Map(jobs);
    candidate.set(next.id, next);
    commit(candidate);
    return next;
  }
  reconcileInterruptedJobs();
  return { create, get, consume, cancel, retry };
}
export const previewCoordinator = createPreviewCoordinator();
