"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { finalJobListEnvelopeSchema, formatFinalJobDiagnostic, type FinalJob } from "@/shared/contracts/final-job";
import { FinalRetryAction } from "@/features/editor/final-retry-action";

type Filters = { status: string; mediaType: string; from: string; to: string; profile: string; search: string };
const emptyFilters: Filters = { status: "", mediaType: "", from: "", to: "", profile: "", search: "" };
const activeStates = new Set(["queued", "running", "cancelling"]);
const stateLabels: Record<FinalJob["state"], string> = { queued: "Queued", running: "Running", cancelling: "Cancelling", cancelled: "Cancelled", succeeded: "Completed", failed: "Failed" };

export function HistoryView() {
  const [jobs, setJobs] = useState<FinalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dateError, setDateError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/final-jobs", { cache: "no-store" });
      const envelope = finalJobListEnvelopeSchema.parse(await response.json());
      if (!response.ok || envelope.error || !envelope.data) throw new Error(envelope.error?.message ?? "The local history response was invalid.");
      if (version !== requestVersion.current) return;
      setJobs([...envelope.data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    } catch {
      if (version !== requestVersion.current) return;
      setError("Local history could not be loaded. Check that this device is available, then retry.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setDateError(filters.from && filters.to && filters.from > filters.to ? "The start date must be on or before the end date." : null);
  }, [filters.from, filters.to]);

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const createdAt = new Date(job.createdAt);
    const date = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;
    const profileLabel = job.enabledStages.map((stage) => stage.label).join(" ");
    const searchText = `${job.media.sourceName} ${job.media.format} ${profileLabel} ${job.state} ${stateLabels[job.state]}`.toLowerCase();
    return (!filters.status || job.state === filters.status)
      && (!filters.mediaType || job.media.mediaKind === filters.mediaType)
      && (!filters.from || date >= filters.from)
      && (!filters.to || date <= filters.to)
      && (!filters.profile || job.enabledStages.some((stage) => stage.id === filters.profile))
      && (!filters.search || searchText.includes(filters.search.trim().toLowerCase()));
  }), [jobs, filters]);

  const activeFilters = (Object.keys(filters) as (keyof Filters)[]).filter((key) => filters[key]);
  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const dateInvalid = Boolean(dateError);

  return (
    <section aria-label="Local processing history" className="mt-8">
      {loading ? <p role="status" className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-6">Loading local history…</p> : null}
      {!loading && error ? <div role="alert" className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-6"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 font-medium text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Retry</button></div> : null}

      {!loading && !error ? <>
        {jobs.length > 0 ? <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 md:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1.5 text-sm">Search history<input type="search" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} placeholder="Filename, profile, or status" className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] px-3" /></label>
            <label className="grid gap-1.5 text-sm">Status<select value={filters.status} onChange={(event) => setFilter("status", event.target.value)} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] px-3"><option value="">All statuses</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm">Media type<select value={filters.mediaType} onChange={(event) => setFilter("mediaType", event.target.value)} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] px-3"><option value="">All media types</option><option value="audio">Audio</option><option value="video">Video</option></select></label>
            <label className="grid gap-1.5 text-sm">From date<input type="date" value={filters.from} max={filters.to || undefined} aria-invalid={dateInvalid} aria-describedby={dateError ? "date-range-error" : undefined} onChange={(event) => setFilter("from", event.target.value)} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] px-3" /></label>
            <label className="grid gap-1.5 text-sm">To date<input type="date" value={filters.to} min={filters.from || undefined} aria-invalid={dateInvalid} aria-describedby={dateError ? "date-range-error" : undefined} onChange={(event) => setFilter("to", event.target.value)} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] px-3" /></label>
            <label className="grid gap-1.5 text-sm">Profile stage<select value={filters.profile} onChange={(event) => setFilter("profile", event.target.value)} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] px-3"><option value="">All profiles</option>{Array.from(new Map(jobs.flatMap((job) => job.enabledStages.map((stage) => [stage.id, stage.label] as const))).entries()).map(([id, label]) => <option key={id} value={id}>{stageLabels[id] ?? label}</option>)}</select></label>
          </div>
          {dateError ? <p id="date-range-error" role="alert" className="text-sm">{dateError}</p> : null}
          {activeFilters.length ? <div aria-label="Active filters" className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Filters:</span>{activeFilters.map((key) => <button key={key} type="button" onClick={() => setFilter(key, "")} aria-label={`Remove ${filterNames[key]} filter`} className="min-h-9 rounded-full border border-[var(--border)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{filterNames[key]}: {filterValue(key, filters[key], stateLabels)} <span aria-hidden="true">×</span></button>)}<button type="button" onClick={() => setFilters(emptyFilters)} className="min-h-9 px-2 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Clear filters</button></div> : null}
        </div> : null}

        {jobs.length === 0 ? <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-7"><h2 className="text-lg font-semibold">No enhancements yet</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Your local final processing attempts will appear here.</p><Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 font-medium text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">New enhancement</Link></div>
          : filteredJobs.length === 0 ? <div className="mt-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-7"><h2 className="text-lg font-semibold">No matching enhancements</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">Change or clear your filters to see local history.</p><button type="button" onClick={() => setFilters(emptyFilters)} className="mt-4 min-h-11 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Clear filters</button></div>
            : <ul aria-label="Final processing attempts" className="mt-5 grid gap-3">{filteredJobs.map((job) => <HistoryRow key={job.id} job={job} allJobs={jobs} />)}</ul>}
      </> : null}
    </section>
  );
}

const filterNames: Record<keyof Filters, string> = { status: "Status", mediaType: "Media type", from: "From", to: "To", profile: "Profile", search: "Search" };
function filterValue(key: keyof Filters, value: string, labels: Record<string, string>) { if (key === "status") return labels[value] ?? value; if (key === "profile") return stageLabels[value] ?? value; return value; }
const stageLabels: Record<string, string> = { "noise-removal": "Noise removal", "voice-clarity": "Voice clarity", "loudness-normalization": "Loudness normalization", "echo-reverb-reduction": "Echo/reverb reduction" };

function HistoryRow({ job, allJobs }: { job: FinalJob; allJobs: FinalJob[] }) {
  const attemptDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.createdAt));
  const duration = `${Math.floor(job.media.durationSeconds / 60)}:${String(Math.floor(job.media.durationSeconds % 60)).padStart(2, "0")}`;
  const profile = job.enabledStages.map((stage) => stageLabels[stage.id] ?? stage.label).join(", ") || "No enabled stages";
  const ancestors: FinalJob[] = [];
  let parentId = job.retryOf;
  let missingParentId: string | undefined;
  const visitedIds = new Set([job.id]);
  while (parentId) {
    if (visitedIds.has(parentId)) break;
    visitedIds.add(parentId);
    const parent = allJobs.find((candidate) => candidate.id === parentId);
    if (!parent) { missingParentId = parentId; break; }
    ancestors.unshift(parent);
    parentId = parent.retryOf;
  }
  const descendants: FinalJob[] = [];
  const seen = new Set([job.id]);
  let frontier = [job.id];
  while (frontier.length) {
    const next = allJobs.filter((candidate) => candidate.retryOf && frontier.includes(candidate.retryOf) && !seen.has(candidate.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const attempt of next) { seen.add(attempt.id); descendants.push(attempt); }
    frontier = next.map((attempt) => attempt.id);
  }
  const lineage = [...new Map([...ancestors, job, ...descendants].map((attempt) => [attempt.id, attempt])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const hasLineage = Boolean(job.retryOf || descendants.length);
  const selectedStreamId = job.media.selectedAudioStreamId ?? job.profile.selectedAudioStreamId ?? job.media.audioStream.id;
  const selectedStream = job.media.audioStreams?.find((stream) => stream.id === selectedStreamId)
    ?? (job.media.audioStream.id === selectedStreamId ? job.media.audioStream : undefined);
  const diagnostic = formatFinalJobDiagnostic(job);
  return <li id={`history-${job.id}`} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-base font-semibold">{job.media.sourceName}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">{job.media.mediaKind === "audio" ? "Audio" : "Video"} · {job.media.format.toUpperCase()} · {duration}</p></div><span role="status" className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm">{stateLabels[job.state]}</span></div><dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2"><div><dt className="text-[var(--muted-foreground)]">Attempt date</dt><dd>{attemptDate}</dd></div><div><dt className="text-[var(--muted-foreground)]">Profile</dt><dd>{profile}</dd></div></dl>{activeStates.has(job.state) ? <Link href={`/processing/${job.id}`} aria-label={`View run for ${job.media.sourceName}`} className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">View run</Link> : null}
    <details className="mt-4 border-t border-[var(--border)] pt-3"><summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Attempt details</summary><div className="mt-3 space-y-4 text-sm">
      <section><h3 className="font-semibold">Enabled stages and parameters</h3><ul className="mt-1 list-disc pl-5">{job.profile.stages.filter((stage) => stage.enabled).map((stage) => <li key={stage.id}>{stageLabels[stage.id] ?? stage.id}: {Object.entries(stage.parameters).map(([key, value]) => `${key} ${value}`).join(", ")}</li>)}</ul></section>
      <section><h3 className="font-semibold">Input</h3><p>{job.media.format.toUpperCase()} · {job.media.sizeBytes} bytes · {job.media.durationSeconds} seconds</p><p>{selectedStream ? `Selected audio stream: ${selectedStreamId}${selectedStream.channels ? ` · ${selectedStream.channels} channel(s)` : ""}${selectedStream.sampleRate ? ` · ${selectedStream.sampleRate} Hz` : ""}${selectedStream.channelLayout ? ` · ${selectedStream.channelLayout}` : ""}` : `Selected audio stream ${selectedStreamId ?? "Not recorded"}: metadata unavailable.`}</p></section>
      {job.state === "succeeded" && job.output ? <section><h3 className="font-semibold">Output</h3>{job.outputAvailability === "removed" ? <p role="status">Output removed · {job.output.fileName} · {job.output.mimeType} · {job.output.sizeBytes} bytes · {job.output.durationSeconds} seconds</p> : job.outputAvailability === "removing" ? <p role="status">Output cleanup incomplete or interrupted · {job.output.fileName} · availability is being checked</p> : <p>{job.output.fileName} · {job.output.mimeType} · {job.output.sizeBytes} bytes · {job.output.durationSeconds} seconds · validated{job.output.experimental ? " · experimental processing" : ""}</p>}</section> : job.state === "succeeded" && job.outputAvailability === "removed" ? <section><h3 className="font-semibold">Output</h3><p role="status">Output removed</p></section> : null}
      <section><h3 className="font-semibold">Execution</h3>{job.executionSnapshot ? <p>Configured model {job.executionSnapshot.modelId} ({job.executionSnapshot.modelVersion}); {job.executionSnapshot.runtime}; {job.executionSnapshot.qualification}.</p> : <p>Execution details: Not recorded.</p>}</section>
      <section><h3 className="font-semibold">Attempt identifiers and terminal reason</h3><p>Job ID: <code>{job.id}</code></p><p>Request ID: {job.requestId ?? "Not recorded"}</p><p>{job.failure ? `Failure code: ${job.failure.code}` : job.state === "cancelled" ? "Terminal reason: Cancelled" : job.state === "succeeded" ? "Terminal reason: Completed" : job.recoveryNotice ? "Terminal reason: Recovered after restart" : `Terminal reason: ${stateLabels[job.state]} (not terminal)`}</p></section>
      {hasLineage ? <section><h3 className="font-semibold">Linked attempts, oldest first</h3><ol className="mt-1 list-decimal pl-5">{lineage.map((attempt) => <li key={attempt.id}><Link className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" href={`/processing/${attempt.id}`}>{attempt.id}</Link> — {stateLabels[attempt.state]} — {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(attempt.createdAt))}{attempt.id === job.id ? " (this attempt)" : ""}</li>)}</ol>{missingParentId ? <p role="status">Previous attempt {missingParentId} is unavailable in local history.</p> : null}</section> : null}
      <DiagnosticCopy text={diagnostic} />
      {job.state === "failed" || job.state === "cancelled" ? <FinalRetryAction job={job} /> : null}
    </div></details></li>;
}

function DiagnosticCopy({ text }: { text: string }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setFallback(false); setCopied(false); setMessage("Attempt diagnostics copied. They contain IDs and processing details only.");
    } catch {
      setFallback(true); setCopied(false); setMessage("Clipboard unavailable. Select the safe diagnostics below and copy them.");
    }
  }
  return <section><h3 className="font-semibold">Safe diagnostics</h3><button type="button" onClick={() => void copy()} className="mt-2 min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Copy attempt diagnostics</button><p role="status" aria-live="polite" className="mt-2">{message}</p>{fallback ? <><textarea aria-label="Selectable safe attempt diagnostics" readOnly value={text} onFocus={(event) => event.currentTarget.select()} onCopy={() => setCopied(true)} rows={Math.min(12, text.split("\n").length)} className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] p-3 font-mono text-xs" /><p role="status">{copied ? "Diagnostics selected for copying." : "Select the text, then use your device’s copy command."}</p></> : null}</section>;
}
