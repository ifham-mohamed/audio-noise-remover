import { Badge } from "@/components/ui/badge";
import type { PreviewJob } from "@/shared/contracts/preview";

function formatTime(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PreviewSurface({ job, stale = false }: { job: PreviewJob; stale?: boolean }) {
  const activeStages = job.profile.stages.filter((stage) => stage.enabled);
  const stageSummary = activeStages.map((stage) => stage.id === "loudness-normalization"
    ? `Loudness normalization: ${stage.parameters.targetLufs} LUFS`
    : `${stage.id.replaceAll("-", " ")}: ${stage.parameters.intensity}%`).join(" · ");
  const outputSummary = `${job.profile.output.format.replaceAll("-", " ")} · ${job.profile.output.quality} quality · ${job.profile.output.destination.targetName}`;

  return <section className="mt-6 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--secondary)_35%,transparent)] bg-[var(--surface-raised)] p-5" aria-labelledby="preview-title" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--secondary)]">Bounded sample · {formatTime(job.range.endSeconds - job.range.startSeconds)}</p>
        <h2 id="preview-title" className="mt-1 text-xl font-semibold">Preview</h2>
      </div>
      <Badge>{stale ? "Older profile" : "Preview request prepared"}</Badge>
    </div>
    <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Range {job.range.startSeconds.toFixed(2)}–{job.range.endSeconds.toFixed(2)} seconds · {job.media.mediaKind === "video" ? "selected video audio track" : "local audio"}. {stale ? "This request captured the profile shown below." : "This request captures the current enhancement profile."} It is not a final output.</p>
    <p className="mt-3 text-sm"><span className="font-medium">Stages:</span> {stageSummary || "No enhancement stages enabled"}</p>
    <p className="mt-2 text-sm"><span className="font-medium">Output:</span> {outputSummary}</p>
    <p className="mt-3 text-sm text-[var(--muted-foreground)]">This request is prepared for local processing. No enhanced audio has been produced yet. Your media bytes stay in the browser, and the original remains unchanged.</p>
    {stale && <p className="mt-3 text-sm text-amber-200">The enhancement profile has changed. Create another preview to evaluate the current settings.</p>}
    <p className="sr-only" role="status">{stale ? "This preview is from an older profile." : "Preview request prepared."}</p>
  </section>;
}
