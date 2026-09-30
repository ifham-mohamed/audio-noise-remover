import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreviewComparison } from "@/features/editor/preview-comparison";
import type { PreviewJob } from "@/shared/contracts/preview";
import { getStageDeclaration } from "@/shared/contracts/processing-profiles";

function formatTime(value: number) { const minutes = Math.floor(value / 60); const seconds = Math.floor(value % 60); return `${minutes}:${seconds.toString().padStart(2, "0")}`; }
function formatElapsed(value: number) { const seconds = Math.floor(value / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
const stateLabels: Record<PreviewJob["state"], string> = { queued: "Preview queued", running: "Preview in progress", cancelling: "Cancelling preview", cancelled: "Preview cancelled", succeeded: "Preview ready", failed: "Preview failed" };

export function PreviewSurface({ job, stale = false, cancelling = false, onRetry }: { job: PreviewJob; stale?: boolean; cancelling?: boolean; onRetry?: () => void }) {
  const activeStages = job.profile.stages.filter((stage) => stage.enabled);
  const stageSummary = activeStages.map((stage) => {
    const declaration = getStageDeclaration(job.profile.profileId, stage.id);
    const parameters = Object.entries(stage.parameters).map(([key, value]) => {
      const metadata = declaration?.parameters.find((parameter) => parameter.id === key);
      const formattedValue = metadata?.unit === "LUFS" ? `${value} LUFS` : metadata?.unit.startsWith("%") ? `${value}%` : `${value}${metadata?.unit ? ` ${metadata.unit}` : ""}`;
      return { label: metadata?.label ?? key, value: formattedValue };
    });
    const stageLabel = declaration?.label ?? stage.id;
    const summary = parameters.length === 1 ? parameters[0]?.value : parameters.map((parameter) => `${parameter.label}: ${parameter.value}`).join(", ");
    return `${stageLabel}: ${summary || "No parameter values"}`;
  }).join(" · ");
  const outputSummary = `${job.profile.output.format.replaceAll("-", " ")} · ${job.profile.output.quality} quality · ${job.profile.output.destination.targetName}`;
  const status = cancelling ? "Cancelling… finishing the current step" : job.state === "running" ? `${job.phase ?? "Processing preview"}${job.progress === undefined ? "" : ` · ${Math.round(job.progress * 100)}%`} · ${formatElapsed(job.elapsedMs)} elapsed` : `${stateLabels[job.state]}${job.state === "succeeded" ? " — experimental model; not production-qualified" : ""}${job.state === "failed" && job.failure ? `: ${job.failure.message}` : ""}`;

  return <section className="mt-6 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--secondary)_35%,transparent)] bg-[var(--surface-raised)] p-5" aria-labelledby="preview-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--secondary)]">Bounded sample · {formatTime(job.range.endSeconds - job.range.startSeconds)}</p><h2 id="preview-title" className="mt-1 text-xl font-semibold">Preview</h2></div><Badge>{stale ? "Older profile" : stateLabels[job.state]}</Badge></div>
    <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Range {job.range.startSeconds.toFixed(2)}–{job.range.endSeconds.toFixed(2)} seconds · {job.media.mediaKind === "video" ? "selected video audio track" : "local audio"}. {stale ? "This attempt captured the profile shown below." : "This attempt captures the current enhancement profile."} It is not a final output.</p>
    <p className="mt-3 text-sm"><span className="font-medium">Stages:</span> {stageSummary || "No enhancement stages enabled"}</p><p className="mt-2 text-sm"><span className="font-medium">Output:</span> {outputSummary}</p>
    {job.state === "running" && job.progress !== undefined && <progress aria-label="Preview progress" value={job.progress} max={1} className="mt-4 h-2 w-full accent-[var(--primary)]" />}
    {job.state === "succeeded" && job.artifact && <p className="mt-3 text-sm">Experimental model preview ready · Validated enhanced audio · {job.artifact.durationSeconds.toFixed(1)} seconds · {job.artifact.sizeBytes.toLocaleString()} bytes. This model has not passed the production quality gate.</p>}
    {job.state === "succeeded" && job.artifact && !stale && <PreviewComparison job={job} />}
    {job.state === "succeeded" && stale && <p className="mt-3 text-sm text-amber-200">This comparison is no longer current. Create a new preview to compare the selected stream and range for the current profile.</p>}
    {job.state === "failed" && job.failure && <div className="mt-4 rounded-md border border-rose-300/30 p-4"><p className="text-sm">{job.failure.message}</p><div className="mt-3 flex flex-wrap gap-2">{job.failure.action === "retry" && <Button type="button" variant="outline" onClick={onRetry}>Retry preview</Button>}{job.failure.action === "settings" && <Link className="inline-flex min-h-11 items-center rounded-md px-3 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" href="/settings">Open settings</Link>}{job.failure.action === "effects" && <Link className="inline-flex min-h-11 items-center rounded-md px-3 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" href="#effects-title">Review enhancement stages</Link>}{job.failure.action === "diagnostics" && <Link className="inline-flex min-h-11 items-center rounded-md px-3 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" href="/settings#diagnostics">Open diagnostics</Link>}{job.failure.action !== "retry" && <Button type="button" variant="outline" onClick={onRetry}>Retry preview</Button>}</div></div>}
    {job.state === "cancelled" && <div className="mt-3"><p className="text-sm">No preview artifact was kept. Retry creates a new attempt linked to this one.</p><Button type="button" variant="outline" className="mt-3" onClick={onRetry}>Retry preview</Button></div>}
    {job.state === "queued" && <p className="mt-3 text-sm text-[var(--muted-foreground)]">Waiting for local preview processing to start.</p>}
    <p className="sr-only" role="status" aria-live="polite">{status}</p>
    <p className="mt-3 text-sm text-[var(--muted-foreground)]">Your media bytes stay in the browser worker, and the original remains unchanged.</p>
    {stale && <p className="mt-3 text-sm text-amber-200">The enhancement profile or selected range has changed. Create another preview to evaluate the current settings.</p>}
  </section>;
}
