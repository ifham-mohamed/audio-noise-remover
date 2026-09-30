import {
  createFinalJobFileStore,
  type FinalJobStore,
} from "@/server/adapters/final-job-file-store";
import {
  createFinalJob,
  createFinalJobRequestSchema,
  FinalJobError,
  finalJobEventSchema,
  isSupportedExperimentalFinalProfile,
  type FinalJob,
  type FinalJobEvent,
} from "@/shared/contracts/final-job";
import modelManifest from "@/models/manifest.json";
import { assertLocalCleanupInactive } from "@/server/domain/local-cleanup-gate";

type Dependencies = {
  store?: FinalJobStore;
  canExecuteFinal?: () => boolean | Promise<boolean>;
  now?: () => string;
};
const MAX_ACTIVE = 2;
const terminal = new Set<FinalJob["state"]>([
  "cancelled",
  "succeeded",
  "failed",
]);
function cloneJob(job: FinalJob): FinalJob { return structuredClone(job); }
export function createFinalJobCoordinator(dependencies: Dependencies = {}) {
  const store = dependencies.store ?? createFinalJobFileStore();
  const now = dependencies.now ?? (() => new Date().toISOString());
  let storeReady = true;
  let storedJobs: FinalJob[] = [];
  try {
    storedJobs = store.load();
  } catch {
    storeReady = false;
  }
  let recoveredAnything = false;
  const restored = storedJobs.map((stored) => {
    const job = cloneJob(stored);
    if (job.state === "cancelling") { recoveredAnything = true; return { ...job, state: "cancelled" as const, sequence: job.sequence + 1, updatedAt: now(), progress: undefined, recoveryNotice: "The local application restarted while cancellation was finishing. No final output was retained." }; }
    if (job.state === "queued" || job.state === "running") { recoveredAnything = true; return { ...job, state: "failed" as const, sequence: job.sequence + 1, updatedAt: now(), progress: undefined, failure: { code: "PROCESSING_FAILED" as const, message: "The local application restarted before this attempt finished. Retry to start a new linked attempt.", action: "diagnostics" as const } }; }
    return job;
  });
  const jobs = new Map<string, FinalJob>(restored.map((job) => [job.id, job]));
  if (storeReady && recoveredAnything) {
    try { store.save(restored); } catch { storeReady = false; }
  }
  let pendingCreates = 0;
  const pendingAttemptIds = new Set<string>();
  const pendingRetryParents = new Set<string>();
  function assertStoreReady() {
    if (!storeReady)
      throw new FinalJobError(
        "STORAGE_UNAVAILABLE",
        "The local final-job store could not be read. Resolve the local storage issue before processing.",
      );
  }
  function commit(candidate: Map<string, FinalJob>) {
    store.save([...candidate.values()].map(cloneJob));
    jobs.clear();
    for (const [id, job] of candidate) jobs.set(id, cloneJob(job));
  }
  function assertCapacity() {
    if (
      [...jobs.values()].filter((job) => !terminal.has(job.state)).length +
        pendingCreates >=
      MAX_ACTIVE
    )
      throw new FinalJobError(
        "RUNTIME_UNAVAILABLE",
        "Two final processing jobs are already active. Wait for one to finish before starting another.",
      );
  }
  async function create(input: unknown, requestId?: string) {
    assertStoreReady();
    assertLocalCleanupInactive();
    const request = createFinalJobRequestSchema.parse(input);
    const previous = request.retryOfJobId ? get(request.retryOfJobId) : undefined;
    if (previous) {
      if (previous.state !== "failed" && previous.state !== "cancelled") throw new FinalJobError("INVALID_TRANSITION", "Only a failed or cancelled attempt can be retried.");
      if (JSON.stringify(previous.media) !== JSON.stringify(request.media) || JSON.stringify(previous.profile) !== JSON.stringify(request.profile)) throw new FinalJobError("INVALID_TRANSITION", "A retry must preserve the previous attempt’s original media and processing profile.");
      if (pendingRetryParents.has(previous.id) || [...jobs.values()].some((candidate) => candidate.retryOf === previous.id)) throw new FinalJobError("INVALID_TRANSITION", "This attempt already has a linked retry. Retry the latest failed or cancelled attempt instead.");
    }
    if (request.clientAttemptId && (jobs.has(request.clientAttemptId) || pendingAttemptIds.has(request.clientAttemptId)))
      throw new FinalJobError("INVALID_TRANSITION", "This final attempt identifier was already used. Start a new attempt instead.");
    assertCapacity();
    pendingCreates += 1;
    if (request.clientAttemptId) pendingAttemptIds.add(request.clientAttemptId);
    if (request.retryOfJobId) pendingRetryParents.add(request.retryOfJobId);
    try {
      const canExecute =
        dependencies.canExecuteFinal ??
        (() =>
          isSupportedExperimentalFinalProfile(request.media, request.profile));
      if (!(await canExecute()))
        throw new FinalJobError(
          "RUNTIME_UNAVAILABLE",
          "This experimental build supports only short WAV audio with noise removal enabled and WAV output. Unsupported formats, longer files, and other effects fail safely; your source remains unchanged.",
        );
      const job = createFinalJob(request.media, request.profile, {
        id: request.clientAttemptId,
        retryOf: request.retryOfJobId,
        requestId,
        executionSnapshot: { version: 1, modelId: modelManifest.modelId, modelVersion: modelManifest.version, runtime: "onnxruntime-web/wasm", qualification: "experimental; not production-qualified" },
      });
      const candidate = new Map(jobs);
      candidate.set(job.id, job);
      commit(candidate);
      return cloneJob(job);
    } finally {
      pendingCreates -= 1;
      if (request.clientAttemptId) pendingAttemptIds.delete(request.clientAttemptId);
      if (request.retryOfJobId) pendingRetryParents.delete(request.retryOfJobId);
    }
  }
  function get(id: string) {
    assertStoreReady();
    const job = jobs.get(id);
    if (!job)
      throw new FinalJobError(
        "JOB_NOT_FOUND",
        "This final processing attempt is no longer available.",
      );
    return cloneJob(job);
  }
  function list() {
    assertStoreReady();
    return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(cloneJob);
  }
  function applyCleanup(input: { scope: "REMOVE_PREVIEWS" | "REMOVE_OUTPUTS" | "CLEAR_HISTORY" | "REMOVE_ALL"; removedOutputIds: string[]; failedOutputIds?: string[]; removedSourceRefs: string[]; deleteHistoryIds: string[] }) {
    assertStoreReady();
    const candidate = new Map(jobs); const removedHistory: string[] = []; const skippedActive: string[] = [];
    const protectedAncestry = new Set<string>();
    for (const job of candidate.values()) {
      if (terminal.has(job.state)) continue;
      let ancestor = job.retryOf;
      while (ancestor && !protectedAncestry.has(ancestor)) {
        protectedAncestry.add(ancestor);
        ancestor = candidate.get(ancestor)?.retryOf;
      }
    }
    const removedOutputs = new Set(input.removedOutputIds);
    const failedOutputIds = new Set(input.failedOutputIds ?? []);
    for (const [id, current] of candidate) {
      if (terminal.has(current.state)) continue;
      skippedActive.push(id);
    }
    for (const [id, current] of candidate) {
      if (!terminal.has(current.state)) continue;
      const outputRemoved = current.output && removedOutputs.has(current.output.artifactId);
      const outputFailed = current.output && failedOutputIds.has(current.output.artifactId);
      if ((input.scope === "REMOVE_OUTPUTS" || input.scope === "REMOVE_ALL") && outputRemoved) candidate.set(id, { ...current, outputAvailability: "removed", updatedAt: now() });
      else if (outputFailed) candidate.set(id, { ...current, outputAvailability: "available", updatedAt: now() });
      if ((input.scope === "CLEAR_HISTORY") && input.deleteHistoryIds.includes(id)) {
        if (protectedAncestry.has(id)) continue;
        candidate.delete(id); removedHistory.push(id);
      }
    }
    if (removedHistory.length || removedOutputs.size || failedOutputIds.size) commit(candidate);
    return { removedHistory, skippedActive, skippedAncestry: [...protectedAncestry].filter((id) => input.deleteHistoryIds.includes(id)) };
  }
  function markOutputsAvailability(ids: string[], availability: "removing" | "available") {
    assertStoreReady();
    const targets = new Set(ids); const candidate = new Map(jobs); let changed = false;
    for (const [id, current] of candidate) {
      if (current.output && targets.has(current.output.artifactId) && terminal.has(current.state)) {
        candidate.set(id, { ...current, outputAvailability: availability, updatedAt: now() }); changed = true;
      }
    }
    if (changed) commit(candidate);
  }
  function cancel(id: string) {
    assertStoreReady();
    const current = get(id);
    if (current.state !== "running") throw new FinalJobError("INVALID_TRANSITION", "Only an active final-processing attempt can be cancelled.");
    const next = { ...current, state: "cancelling" as const, sequence: current.sequence + 1, updatedAt: now() };
    const candidate = new Map(jobs);
    candidate.set(id, next);
    commit(candidate);
    return cloneJob(next);
  }
  function consume(id: string, input: unknown) {
    assertStoreReady();
    const event = finalJobEventSchema.parse(input) as FinalJobEvent;
    const current = get(id);
    if (event.jobId !== id)
      throw new FinalJobError(
        "INVALID_TRANSITION",
        "This update does not match the final processing attempt.",
      );
    if (terminal.has(current.state) || event.sequence !== current.sequence + 1)
      throw new FinalJobError(
        "INVALID_TRANSITION",
        "This final processing update is stale, regressive, or out of order.",
      );
    if (event.elapsedMs < current.elapsedMs)
      throw new FinalJobError(
        "INVALID_TRANSITION",
        "Final processing elapsed time cannot move backwards.",
      );
    if (current.state === "cancelling" && event.type !== "cancelled") throw new FinalJobError("INVALID_TRANSITION", "A cancellation is being finalized; late worker updates are ignored.");
    if (event.type === "cancelled") {
      if (current.state !== "cancelling") throw new FinalJobError("INVALID_TRANSITION", "Cancellation can be finalized only after the coordinator acknowledges the request.");
      const next = { ...current, state: "cancelled" as const, sequence: event.sequence, updatedAt: now(), elapsedMs: event.elapsedMs, progress: undefined };
      const candidate = new Map(jobs);
      candidate.set(id, next);
      commit(candidate);
      return cloneJob(next);
    }
    const stamp = now();
    if (event.type === "succeeded") {
      const outputName = event.output.fileName;
      if (
        current.state !== "running" ||
        !isSupportedExperimentalFinalProfile(current.media, current.profile) ||
        outputName !== current.profile.output.destination.targetName ||
        outputName.toLowerCase() === current.media.sourceName.toLowerCase() ||
        /[\\/<>:"|?*\u0000-\u001f]/.test(outputName) ||
        !outputName.toLowerCase().endsWith(".wav") ||
        Math.abs(event.output.durationSeconds - current.media.durationSeconds) > 0.05
      )
        throw new FinalJobError(
          "INVALID_TRANSITION",
          "This final attempt cannot expose an unsupported, unsafe, or mismatched output artifact.",
        );
      const next = {
        ...current,
        state: "succeeded" as const,
        sequence: event.sequence,
        updatedAt: stamp,
        elapsedMs: event.elapsedMs,
        progress: 1,
        output: event.output,
      };
      const candidate = new Map(jobs);
      candidate.set(id, next);
      commit(candidate);
      return cloneJob(next);
    }
    if (event.type === "progress") {
      const stageIndex = current.enabledStages.findIndex(
        (stage) => stage.id === event.stageId,
      );
      const previousStageIndex = current.enabledStages.findIndex(
        (stage) => stage.id === current.phase,
      );
      const stageChanged = stageIndex !== previousStageIndex;
      if (
        stageIndex < 0 ||
        stageIndex > previousStageIndex + 1 ||
        current.state === "cancelling"
      )
        throw new FinalJobError(
          "INVALID_TRANSITION",
          "The final processing update is not valid for the active enabled stage.",
        );
      const previousProgress = stageChanged ? undefined : current.progress;
      if (
        previousProgress !== undefined &&
        event.progress !== undefined &&
        event.progress < previousProgress
      )
        throw new FinalJobError(
          "INVALID_TRANSITION",
          "Final processing progress cannot move backwards within an enabled stage.",
        );
      const next = {
        ...current,
        state: "running" as const,
        sequence: event.sequence,
        updatedAt: stamp,
        phase: event.stageId,
        progress: event.progress ?? previousProgress,
        elapsedMs: event.elapsedMs,
      };
      const candidate = new Map(jobs);
      candidate.set(id, next);
      commit(candidate);
      return next;
    }
    const next = {
      ...current,
      state: "failed" as const,
      sequence: event.sequence,
      updatedAt: stamp,
      elapsedMs: event.elapsedMs,
      progress: undefined,
      failure: event.failure,
    };
    const candidate = new Map(jobs);
    candidate.set(id, next);
    commit(candidate);
    return cloneJob(next);
  }
  return { create, get, list, cancel, consume, applyCleanup, markOutputsAvailability };
}
export const finalJobCoordinator = createFinalJobCoordinator();
