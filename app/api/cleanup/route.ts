import { NextResponse } from "next/server";
import { cleanupRequestSchema, cleanupResultSchema } from "@/shared/contracts/final-job";
import { cleanupPlanEnvelopeSchema } from "@/shared/contracts/cleanup";
import { finalJobCoordinator } from "@/server/domain/final-job-coordinator";
import { previewCoordinator } from "@/server/domain/preview-coordinator";
import { assertLocalCleanupToken, beginLocalCleanup, cancelLocalCleanup, finishLocalCleanup } from "@/server/domain/local-cleanup-gate";

export async function GET() {
  const requestId = crypto.randomUUID();
  try { return NextResponse.json(cleanupPlanEnvelopeSchema.parse({ data: { finalJobs: finalJobCoordinator.list(), previewJobs: previewCoordinator.list() }, error: null, requestId }), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ data: null, error: { code: "CLEANUP_UNAVAILABLE", message: "Local cleanup status is unavailable." }, requestId }, { status: 503 }); }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let leaseToken: string | undefined;
  let errorStatus = 400;
  try {
    const command = cleanupRequestSchema.parse(await request.json());
    errorStatus = 500;
    if ((command.scope === "REMOVE_PREVIEWS" && (command.plannedOutputIds.length || command.plannedSourceRefs.length)) || (command.scope === "REMOVE_OUTPUTS" && (command.plannedPreviewIds.length || command.plannedSourceRefs.length))) throw new Error("The planned artifacts do not match the selected cleanup scope.");
    if (command.phase === "prepare") {
      leaseToken = beginLocalCleanup({ scope: command.scope, plannedPreviewIds: command.plannedPreviewIds, plannedOutputIds: command.plannedOutputIds, plannedSourceRefs: command.plannedSourceRefs, plannedFinalHistoryIds: command.plannedFinalHistoryIds, plannedPreviewHistoryIds: command.plannedPreviewHistoryIds });
      const finalJobs = finalJobCoordinator.list();
      const previewJobs = previewCoordinator.list();
      const terminal = (state: string) => ["succeeded", "failed", "cancelled"].includes(state);
      const activeSources = new Set(finalJobs.filter((job) => !terminal(job.state)).map((job) => job.media.sourceRef));
      const activePreviewArtifactIds = new Set(previewJobs.filter((job) => !terminal(job.state)).flatMap((job) => [job.artifact?.id, job.comparisonSourceArtifact?.id].filter((id): id is string => Boolean(id))));
      if (command.plannedSourceRefs.some((ref) => activeSources.has(ref)) || command.plannedPreviewIds.some((id) => activePreviewArtifactIds.has(id))) {
        cancelLocalCleanup(leaseToken); leaseToken = undefined;
        return NextResponse.json({ data: null, error: { code: "CLEANUP_CONFLICT", message: "A selected local artifact is needed by an active job. Nothing was removed; wait for that job to finish and try again." }, requestId }, { status: 409 });
      }
      finalJobCoordinator.markOutputsAvailability(command.plannedOutputIds, "removing");
      return NextResponse.json({ data: { token: leaseToken }, error: null, requestId }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!command.token) throw new Error("The cleanup session token is required.");
    assertLocalCleanupToken(command.token);
    leaseToken = command.token;
    if (command.phase === "abort") {
      cancelLocalCleanup(command.token); leaseToken = undefined;
      return NextResponse.json({ data: { aborted: true }, error: null, requestId }, { headers: { "Cache-Control": "no-store" } });
    }
    assertLocalCleanupToken(command.token, { scope: command.scope, plannedPreviewIds: command.plannedPreviewIds, plannedOutputIds: command.plannedOutputIds, plannedSourceRefs: command.plannedSourceRefs, plannedFinalHistoryIds: command.plannedFinalHistoryIds, plannedPreviewHistoryIds: command.plannedPreviewHistoryIds });
    const planned = [
      ...command.plannedPreviewIds.map((id) => `preview:${id}`),
      ...command.plannedOutputIds.map((id) => `output:${id}`),
      ...command.plannedSourceRefs.map((id) => `retry-source:${id}`),
    ].sort();
    const reported = [
      ...command.removedPreviewIds.map((id) => `preview:${id}`),
      ...command.removedOutputIds.map((id) => `output:${id}`),
      ...command.removedSourceRefs.map((id) => `retry-source:${id}`),
      ...command.failedArtifacts.map((item) => `${item.kind}:${item.id}`),
    ].sort();
    if (planned.length !== reported.length || planned.some((item, index) => item !== reported[index])) throw new Error("Cleanup results do not match the prepared local artifact list.");
    const failed = new Set(command.failedArtifacts.map((item) => item.id));
    const finalJobs = finalJobCoordinator.list();
    const active = finalJobs.filter((job) => !["succeeded", "failed", "cancelled"].includes(job.state));
    const terminal = finalJobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.state));
    const removedOutputs = new Set(command.removedOutputIds);
    const eligibleHistory = terminal.filter((job) => command.plannedFinalHistoryIds.includes(job.id) && !failed.has(job.id) && (!job.output || removedOutputs.has(job.output.artifactId)) && !failed.has(job.output?.artifactId ?? "") && !failed.has(job.media.sourceRef));
    let removed: ReturnType<typeof finalJobCoordinator.applyCleanup> = { removedHistory: [], skippedActive: [], skippedAncestry: [] };
    let finalHistoryFailed = false;
    try { removed = finalJobCoordinator.applyCleanup({ scope: command.scope, removedOutputIds: command.removedOutputIds, failedOutputIds: command.failedArtifacts.filter((item) => item.kind === "output").map((item) => item.id), removedSourceRefs: command.removedSourceRefs, deleteHistoryIds: command.scope === "CLEAR_HISTORY" ? eligibleHistory.map((job) => job.id) : [] }); }
    catch { finalHistoryFailed = true; }
    const previewTerminal = previewCoordinator.list().filter((job) => ["succeeded", "failed", "cancelled"].includes(job.state));
    const previewActive = previewCoordinator.list().filter((job) => !["succeeded", "failed", "cancelled"].includes(job.state));
    const previewEligible = previewTerminal.filter((job) => command.plannedPreviewHistoryIds.includes(job.id) && (() => {
      const ids = [job.artifact?.id, job.comparisonSourceArtifact?.id].filter((id): id is string => Boolean(id));
      return !failed.has(job.id) && ids.every((id) => !failed.has(id));
    })());
    let previewRemoved: { removed: string[]; skipped: string[] } = { removed: [], skipped: [] };
    let previewHistoryFailed = false;
    try { previewRemoved = command.scope === "CLEAR_HISTORY" ? previewCoordinator.removeTerminal(previewEligible.map((job) => job.id)) : previewRemoved; }
    catch { previewHistoryFailed = true; }
    const items = [
      ...command.removedPreviewIds.map((id) => ({ id, kind: "preview" as const, outcome: "removed" as const, message: "Preview artifact removed." })),
      ...command.removedOutputIds.map((id) => ({ id, kind: "output" as const, outcome: "removed" as const, message: "Final output removed." })),
      ...command.removedSourceRefs.map((id) => ({ id, kind: "retry-source" as const, outcome: "removed" as const, message: "App-retained source copy removed." })),
      ...command.failedArtifacts.map((item) => ({ id: item.id, kind: item.kind, outcome: "failed" as const, message: "Local artifact removal failed; linked history was retained." })),
      ...active.map((job) => ({ id: job.id, kind: "active-skip" as const, outcome: "skipped" as const, message: "Active attempt and its required data were retained." })),
      ...previewActive.map((job) => ({ id: job.id, kind: "active-skip" as const, outcome: "skipped" as const, message: "Active preview and its required data were retained." })),
      ...removed.removedHistory.map((id) => ({ id, kind: "history" as const, outcome: "removed" as const, message: "Terminal history removed." })),
      ...removed.skippedAncestry.map((id) => ({ id, kind: "history" as const, outcome: "skipped" as const, message: "History retained because an active retry depends on this attempt." })),
      ...previewRemoved.removed.map((id) => ({ id, kind: "history" as const, outcome: "removed" as const, message: "Terminal preview history removed." })),
      ...previewRemoved.skipped.map((id) => ({ id, kind: "history" as const, outcome: "skipped" as const, message: "History retained because an active retry depends on this attempt." })),
      ...(finalHistoryFailed ? [{ id: "final-history", kind: "history" as const, outcome: "failed" as const, message: "Final attempt history could not be updated. Reload history to confirm the current state." }] : []),
      ...(previewHistoryFailed ? [{ id: "preview-history", kind: "history" as const, outcome: "failed" as const, message: "Preview history could not be updated. Reload history to confirm the current state." }] : []),
    ];
    const complete = command.failedArtifacts.length === 0 && removed.skippedAncestry.length === 0 && previewRemoved.skipped.length === 0 && !finalHistoryFailed && !previewHistoryFailed;
    finishLocalCleanup(command.token);
    leaseToken = undefined;
    return NextResponse.json({ data: cleanupResultSchema.parse({ scope: command.scope, items, complete }), error: null, requestId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    if (leaseToken) {
      // Leave an interrupted output marked "removing" rather than claiming it remains available.
      cancelLocalCleanup(leaseToken);
    }
    return NextResponse.json({ data: null, error: { code: "CLEANUP_FAILED", message: "Local cleanup could not be finalized safely. Known artifact outcomes may be incomplete; review them and retry cleanup." }, requestId }, { status: errorStatus });
  }
}
