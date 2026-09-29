import { createFinalJobFileStore, type FinalJobStore } from "@/server/adapters/final-job-file-store";
import { createFinalJob, createFinalJobRequestSchema, FinalJobError, finalJobEventSchema, type FinalJob, type FinalJobEvent } from "@/shared/contracts/final-job";

type Dependencies = { store?: FinalJobStore; canExecuteFinal?: () => boolean | Promise<boolean>; now?: () => string };
const MAX_ACTIVE = 2;
const terminal = new Set<FinalJob["state"]>(["cancelled", "succeeded", "failed"]);
export function createFinalJobCoordinator(dependencies: Dependencies = {}) {
  const store = dependencies.store ?? createFinalJobFileStore();
  const now = dependencies.now ?? (() => new Date().toISOString());
  let storeReady = true;
  let storedJobs: FinalJob[] = [];
  try { storedJobs = store.load(); } catch { storeReady = false; }
  const jobs = new Map<string, FinalJob>(storedJobs.map((job) => [job.id, job]));
  let pendingCreates = 0;
  function assertStoreReady() { if (!storeReady) throw new FinalJobError("STORAGE_UNAVAILABLE", "The local final-job store could not be read. Resolve the local storage issue before processing."); }
  function commit(candidate: Map<string, FinalJob>) { store.save([...candidate.values()]); jobs.clear(); for (const [id, job] of candidate) jobs.set(id, job); }
  function assertCapacity() { if ([...jobs.values()].filter((job) => !terminal.has(job.state)).length + pendingCreates >= MAX_ACTIVE) throw new FinalJobError("RUNTIME_UNAVAILABLE", "Two final processing jobs are already active. Wait for one to finish before starting another."); }
  async function create(input: unknown) {
    assertStoreReady();
    const request = createFinalJobRequestSchema.parse(input);
    assertCapacity();
    pendingCreates += 1;
    try {
      if (!(await (dependencies.canExecuteFinal ?? (() => false))())) throw new FinalJobError("RUNTIME_UNAVAILABLE", "Experimental final export is not available yet. This build has no verified full-file final executor and output path; bounded preview is separate. Your source remains unchanged.");
      const job = createFinalJob(request.media, request.profile);
      const candidate = new Map(jobs); candidate.set(job.id, job); commit(candidate); return job;
    } finally { pendingCreates -= 1; }
  }
  function get(id: string) { assertStoreReady(); const job = jobs.get(id); if (!job) throw new FinalJobError("JOB_NOT_FOUND", "This final processing attempt is no longer available."); return job; }
  function list() { assertStoreReady(); return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  function consume(id: string, input: unknown) {
    assertStoreReady();
    const event = finalJobEventSchema.parse(input) as FinalJobEvent;
    const current = get(id);
    if (event.jobId !== id) throw new FinalJobError("INVALID_TRANSITION", "This update does not match the final processing attempt.");
    if (terminal.has(current.state) || event.sequence !== current.sequence + 1) throw new FinalJobError("INVALID_TRANSITION", "This final processing update is stale, regressive, or out of order.");
    if (event.elapsedMs < current.elapsedMs) throw new FinalJobError("INVALID_TRANSITION", "Final processing elapsed time cannot move backwards.");
    const stamp = now();
    if (event.type === "progress") {
      const stageIndex = current.enabledStages.findIndex((stage) => stage.id === event.stageId);
      const previousStageIndex = current.enabledStages.findIndex((stage) => stage.id === current.phase);
      const stageChanged = stageIndex !== previousStageIndex;
      if (stageIndex < 0 || stageIndex > previousStageIndex + 1 || current.state === "cancelling") throw new FinalJobError("INVALID_TRANSITION", "The final processing update is not valid for the active enabled stage.");
      const previousProgress = stageChanged ? undefined : current.progress;
      if (previousProgress !== undefined && event.progress !== undefined && event.progress < previousProgress) throw new FinalJobError("INVALID_TRANSITION", "Final processing progress cannot move backwards within an enabled stage.");
      const next = { ...current, state: "running" as const, sequence: event.sequence, updatedAt: stamp, phase: event.stageId, progress: event.progress ?? previousProgress, elapsedMs: event.elapsedMs };
      const candidate = new Map(jobs); candidate.set(id, next); commit(candidate); return next;
    }
    const next = { ...current, state: "failed" as const, sequence: event.sequence, updatedAt: stamp, elapsedMs: event.elapsedMs, progress: undefined, failure: event.failure };
    const candidate = new Map(jobs); candidate.set(id, next); commit(candidate); return next;
  }
  return { create, get, list, consume };
}
export const finalJobCoordinator = createFinalJobCoordinator();
