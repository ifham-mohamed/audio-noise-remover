"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as Dialog from "@radix-ui/react-dialog";
import { useSettings } from "@/components/settings-context";
import { listPreviewArtifactIds, removePreviewArtifacts } from "@/features/preview/preview-artifact-store";
import { listFinalArtifactIds, listFinalSourceRefs, removeFinalOutputs, removeFinalSources } from "@/features/final/final-artifact-store";
import { cleanupPlanEnvelopeSchema, cleanupResultSchema, cleanupScopeSchema } from "@/shared/contracts/cleanup";
import type { AppSettings } from "@/shared/contracts/settings";

function Group({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { const id = `${title.replaceAll(" ", "-").toLowerCase()}-heading`; return <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5" aria-labelledby={id}><div className="mb-5"><h2 id={id} className="text-base font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{description}</p></div><div className="divide-y divide-[var(--border)]">{children}</div></section>; }
function Row({ label, description, children }: { label: string; description: string; children: React.ReactNode }) { return <div className="flex min-h-16 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 sm:max-w-[62%]"><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{description}</p></div><div className="shrink-0">{children}</div></div>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) { return <label className="relative block"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 min-w-40 appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 pr-9 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 size-4 text-[var(--muted-foreground)]" aria-hidden="true" /></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-11 w-14 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${checked ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface-elevated)]"}`}><span className={`absolute top-3 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-8" : "translate-x-1"}`} /></button>; }

export function SettingsPanel() {
  const { settings, updateSettings } = useSettings(); const [cleanup, setCleanup] = useState<"previews" | "outputs" | "history" | "all" | null>(null); const [message, setMessage] = useState(""); const [resultItems, setResultItems] = useState<{ id: string; kind: string; outcome: string; message: string }[]>([]); const [busy, setBusy] = useState(false);
  const cleanupTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openCleanup = (scope: "previews" | "outputs" | "history" | "all", event: React.MouseEvent<HTMLButtonElement>) => { cleanupTriggerRef.current = event.currentTarget; setCleanup(scope); };
  const set = (group: "appearance" | "playback" | "output" | "accessibility", key: string, value: string | boolean) => { const current = settings[group] as Record<string, string | boolean>; updateSettings({ ...settings, [group]: { ...current, [key]: value } } as AppSettings); };
  const confirmCleanup = async () => {
    if (!cleanup || busy) return;
    setBusy(true); setMessage("Checking local jobs and artifacts…");
    const scope = cleanupScopeSchema.parse(({ previews: "REMOVE_PREVIEWS", outputs: "REMOVE_OUTPUTS", history: "CLEAR_HISTORY", all: "REMOVE_ALL" } as const)[cleanup]);
    setResultItems([]);
    const failed: { id: string; kind: "preview" | "output" | "retry-source" }[] = []; const removedPreviewIds: string[] = []; const removedOutputIds: string[] = []; const removedSourceRefs: string[] = [];
    let cleanupToken: string | undefined;
    try {
      const planResponse = await fetch("/api/cleanup", { cache: "no-store" });
      const planEnvelope = cleanupPlanEnvelopeSchema.parse(await planResponse.json());
      if (!planResponse.ok || !planEnvelope.data) throw new Error(planEnvelope.error?.message ?? "Local cleanup status is unavailable.");
      const { finalJobs, previewJobs } = planEnvelope.data;
      const terminal = (state: string) => ["succeeded", "failed", "cancelled"].includes(state);
      const history = cleanup === "history";
      const plannedFinalHistoryIds = history ? finalJobs.filter((job) => terminal(job.state)).map((job) => job.id) : [];
      const plannedPreviewHistoryIds = history ? previewJobs.filter((job) => terminal(job.state)).map((job) => job.id) : [];
      const activePreviewIds = new Set(previewJobs.filter((job) => !terminal(job.state)).flatMap((job) => [job.artifact?.id, job.comparisonSourceArtifact?.id].filter((id): id is string => Boolean(id))));
      const previewIds = history ? previewJobs.filter((job) => terminal(job.state)).flatMap((job) => [job.artifact?.id, job.comparisonSourceArtifact?.id].filter((id): id is string => Boolean(id))) : cleanup === "previews" || cleanup === "all" ? (await listPreviewArtifactIds()).filter((id) => !activePreviewIds.has(id)) : [];
      const outputs = history ? finalJobs.filter((job) => terminal(job.state)).flatMap((job) => job.output?.artifactId ?? []) : cleanup === "outputs" || cleanup === "all" ? await listFinalArtifactIds() : [];
      const activeRefs = new Set(finalJobs.filter((job) => !terminal(job.state)).map((job) => job.media.sourceRef));
      const terminalRefs = new Set(finalJobs.filter((job) => terminal(job.state) && !activeRefs.has(job.media.sourceRef)).map((job) => job.media.sourceRef));
      const retainedSourceRefs = history || cleanup === "all" ? await listFinalSourceRefs() : [];
      const sources = history ? retainedSourceRefs.filter((ref) => terminalRefs.has(ref)) : cleanup === "all" ? retainedSourceRefs.filter((ref) => !activeRefs.has(ref)) : [];
      const plannedPreviewIds = [...new Set(previewIds)]; const plannedOutputIds = [...new Set(outputs)]; const plannedSourceRefs = [...new Set(sources)];
      const prepareResponse = await fetch("/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, phase: "prepare", plannedPreviewIds, plannedOutputIds, plannedSourceRefs, plannedFinalHistoryIds, plannedPreviewHistoryIds }) });
      const prepareEnvelope = await prepareResponse.json();
      if (!prepareResponse.ok || typeof prepareEnvelope.data?.token !== "string") throw new Error(prepareEnvelope.error?.message ?? "Cleanup could not safely begin; no generated files were removed.");
      const token = prepareEnvelope.data.token as string;
      cleanupToken = token;
      const previewResults = await removePreviewArtifacts(plannedPreviewIds);
      const outputResults = await removeFinalOutputs(plannedOutputIds);
      const sourceResults = await removeFinalSources(plannedSourceRefs);
      setResultItems([
        ...plannedPreviewIds.map((id) => ({ id, kind: "preview", outcome: "verification pending", message: "Checking local storage to confirm removal." })),
        ...plannedOutputIds.map((id) => ({ id, kind: "output", outcome: "verification pending", message: "Checking local storage to confirm removal." })),
        ...plannedSourceRefs.map((id) => ({ id, kind: "retry-source", outcome: "verification pending", message: "Checking local storage to confirm removal." })),
      ]);
      const [remainingPreviewIds, remainingOutputIds, remainingSourceRefs] = await Promise.all([
        plannedPreviewIds.length ? listPreviewArtifactIds() : Promise.resolve([]),
        plannedOutputIds.length ? listFinalArtifactIds() : Promise.resolve([]),
        plannedSourceRefs.length ? listFinalSourceRefs() : Promise.resolve([]),
      ]);
      const confirmRemovals = <T extends { id: string; removed: boolean }>(planned: string[], outcomes: T[], remaining: string[], kind: "preview" | "output" | "retry-source", removed: string[]) => {
        const outcomeById = new Map(outcomes.map((item) => [item.id, item.removed])); const remainingIds = new Set(remaining);
        for (const id of planned) {
          if (!remainingIds.has(id)) removed.push(id);
          else if (!failed.some((item) => item.id === id && item.kind === kind) || outcomeById.get(id) !== false) failed.push({ id, kind });
        }
      };
      confirmRemovals(plannedPreviewIds, previewResults, remainingPreviewIds, "preview", removedPreviewIds);
      confirmRemovals(plannedOutputIds, outputResults, remainingOutputIds, "output", removedOutputIds);
      confirmRemovals(plannedSourceRefs, sourceResults, remainingSourceRefs, "retry-source", removedSourceRefs);
      setResultItems([
        ...removedPreviewIds.map((id) => ({ id, kind: "preview", outcome: "removed", message: "Preview artifact removed." })),
        ...removedOutputIds.map((id) => ({ id, kind: "output", outcome: "removed", message: "Final output removed." })),
        ...removedSourceRefs.map((id) => ({ id, kind: "retry-source", outcome: "removed", message: "App-retained source copy removed." })),
        ...failed.map((item) => ({ ...item, outcome: "failed", message: "The artifact could not be removed; linked history was retained." })),
      ]);
      const response = await fetch("/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, phase: "finish", token, plannedPreviewIds, plannedOutputIds, plannedSourceRefs, plannedFinalHistoryIds, plannedPreviewHistoryIds, removedPreviewIds, removedOutputIds, removedSourceRefs, failedArtifacts: failed }) });
      const envelope = await response.json();
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Local cleanup could not be finalized safely.");
      const result = cleanupResultSchema.parse(envelope.data);
      cleanupToken = undefined;
      const failedCount = result.items.filter((item) => item.outcome === "failed").length;
      const retainedCount = result.items.filter((item) => item.kind === "history" && item.outcome === "skipped").length;
      setMessage(`${result.complete ? "Cleanup complete" : "Cleanup incomplete"}. ${result.items.filter((item) => item.outcome === "removed").length} items removed. ${result.complete ? "Active attempts were retained." : `${failedCount} item(s) failed; ${retainedCount} history item(s) were retained for active retries.`}`);
      setResultItems(result.items);
      setCleanup(null);
    } catch (error) {
      if (cleanupToken) { try { await fetch("/api/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, phase: "abort", token: cleanupToken }) }); } catch { /* The lease expires if the browser cannot reach the local server. */ } }
      setMessage(error instanceof Error ? error.message : "Local cleanup failed; review local storage and retry.");
    }
    finally { setBusy(false); }
  };
  return <div className="mt-10 grid gap-5 md:grid-cols-2">
    <Group title="Appearance" description="Shape the workspace to fit your eyes and environment."><Row label="Theme" description="Use your device preference, or choose a fixed theme."><Select label="Theme" value={settings.appearance.theme} options={[{ value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} onChange={(value) => set("appearance", "theme", value)} /></Row><Row label="Workspace density" description="Choose more breathing room or a compact layout."><Select label="Workspace density" value={settings.appearance.density} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} onChange={(value) => set("appearance", "density", value)} /></Row><Row label="Reduced motion" description="Replace animated transitions with calm, static state changes."><Toggle label="Reduced motion" checked={settings.appearance.reducedMotion} onChange={(value) => set("appearance", "reducedMotion", value)} /></Row><Row label="Waveform contrast" description="Increase waveform distinction without relying on color alone."><Select label="Waveform contrast" value={settings.appearance.waveformContrast} options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High contrast" }]} onChange={(value) => set("appearance", "waveformContrast", value)} /></Row></Group>
    <Group title="Playback" description="Make previews predictable and easy to control."><Row label="Seek interval" description="How far keyboard and transport seek buttons move."><Select label="Seek interval" value={settings.playback.seekInterval} options={["5", "10", "15", "30"].map((value) => ({ value, label: `${value} seconds` }))} onChange={(value) => set("playback", "seekInterval", value)} /></Row><Row label="Autoplay preview" description="Previews remain paused by default to avoid unexpected sound."><Toggle label="Autoplay preview" checked={settings.playback.autoplayPreview} onChange={(value) => set("playback", "autoplayPreview", value)} /></Row><Row label="Keyboard shortcuts" description="Enable Space, arrow keys, and editor shortcut commands."><Toggle label="Keyboard shortcuts" checked={settings.playback.keyboardShortcuts} onChange={(value) => set("playback", "keyboardShortcuts", value)} /></Row></Group>
    <Group title="Output" description="Set safe defaults for future enhancement jobs."><Row label="Default format" description="Audio uses 48 kHz WAV PCM 24-bit. Video preserves its container when supported."><Select label="Default format" value={settings.output.format} options={[{ value: "audio-wav", label: "Audio · WAV PCM 24-bit" }, { value: "source-video", label: "Video · source container" }, { value: "mp4", label: "Video · MP4 fallback" }]} onChange={(value) => set("output", "format", value)} /></Row><Row label="Quality" description="High keeps more detail; standard uses a smaller output when supported."><Select label="Quality" value={settings.output.quality} options={[{ value: "high", label: "High" }, { value: "standard", label: "Standard" }]} onChange={(value) => set("output", "quality", value)} /></Row><Row label="Destination" description="Choose a local destination when the browser supports it, otherwise save through the browser."><Select label="Destination" value={settings.output.destination} options={[{ value: "ask", label: "Ask each time" }, { value: "browser", label: "Browser downloads" }]} onChange={(value) => set("output", "destination", value)} /></Row><Row label="Overwrite confirmation" description="Existing files always receive an explicit warning before replacement."><Select label="Overwrite confirmation" value={settings.output.overwriteConfirmation} options={[{ value: "always", label: "Always confirm" }, { value: "ask", label: "Ask when needed" }]} onChange={(value) => set("output", "overwriteConfirmation", value)} /></Row></Group>
    <Group title="Accessibility" description="Keep controls, announcements, and focus behavior clear."><Row label="Announcements" description="Choose how much job and surface state is announced."><Select label="Announcements" value={settings.accessibility.announcements} options={[{ value: "minimal", label: "Minimal" }, { value: "standard", label: "Standard" }, { value: "verbose", label: "Verbose" }]} onChange={(value) => set("accessibility", "announcements", value)} /></Row><Row label="Focus after dialogs" description="Return focus to the triggering control, or move it to the main surface."><Select label="Focus after dialogs" value={settings.accessibility.focusBehavior} options={[{ value: "restore", label: "Restore focus" }, { value: "main", label: "Move to main content" }]} onChange={(value) => set("accessibility", "focusBehavior", value)} /></Row></Group>
    <Group title="Privacy and cleanup" description="Processing stays on this device. Original user files and browser downloads are never included."><Row label="Preview retention" description="Previews older than seven days are eligible for automatic cleanup. Clear previews removes all app-managed preview artifacts."><div className="flex gap-2"><Badge>7-day retention</Badge><Button variant="outline" size="sm" onClick={(event) => openCleanup("previews", event)}><Trash2 className="size-4" aria-hidden="true" /> Clear all previews</Button></div></Row><Row label="Generated outputs" description="Remove app-managed final outputs only; preserve history and mark successfully removed outputs unavailable."><Button variant="outline" size="sm" onClick={(event) => openCleanup("outputs", event)}><Trash2 className="size-4" aria-hidden="true" /> Clear outputs</Button></Row><Row label="History metadata" description="Remove terminal history and its linked app-managed previews, outputs, and retained retry-source copies. Active jobs remain."><Button variant="outline" size="sm" onClick={(event) => openCleanup("history", event)}><Trash2 className="size-4" aria-hidden="true" /> Clear history</Button></Row><Row label="All generated files" description="Remove app-managed previews, outputs, and retained retry-source copies; preserve history metadata."><Button variant="outline" size="sm" onClick={(event) => openCleanup("all", event)}><Trash2 className="size-4" aria-hidden="true" /> Clear all generated files</Button></Row></Group>
    <div className="md:col-span-2" aria-live="polite">{message && <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] p-3 text-sm text-[var(--primary)]"><p role="status">{message}</p>{resultItems.length > 0 && <ul aria-label="Cleanup item results" className="mt-2 list-disc space-y-1 pl-5">{resultItems.map((item, index) => <li key={`${item.kind}-${item.id}-${index}`}>{item.kind}: {item.id} — {item.outcome}. {item.message}</li>)}</ul>}</div>}</div>
    <Dialog.Root open={Boolean(cleanup)} onOpenChange={(open) => { if (!open && !busy) setCleanup(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content aria-describedby="cleanup-description" onCloseAutoFocus={(event) => { event.preventDefault(); cleanupTriggerRef.current?.focus(); }} className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-2xl focus:outline-none">
          <Dialog.Title className="text-lg font-semibold">Confirm local cleanup</Dialog.Title>
          <Dialog.Description id="cleanup-description" className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{cleanup === "previews" ? "Remove app-managed Before and After preview artifacts; keep all history." : cleanup === "outputs" ? "Remove app-managed final output bytes only; keep history and mark removed outputs unavailable." : cleanup === "history" ? "Remove terminal attempt history and its linked app-managed previews, outputs, and retry-source copies. Active jobs and required data remain." : "Remove app-managed previews, final outputs, and retained retry-source copies. Keep history and mark removed outputs unavailable."} Original user files and browser downloads are not affected.</Dialog.Description>
          <div className="mt-6 flex justify-end gap-3"><Button variant="ghost" disabled={busy} onClick={() => setCleanup(null)}>Cancel</Button><Button disabled={busy} onClick={() => void confirmCleanup()}>{busy ? "Cleaning…" : "Confirm cleanup"}</Button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
