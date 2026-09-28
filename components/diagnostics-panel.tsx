"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, Cpu, HardDrive, Laptop, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiEnvelopeSchema, capabilityReportSchema, buildDiagnosticText, type CapabilityItem, type CapabilityReport } from "@/shared/contracts/capabilities";
import { cn } from "@/lib/utils";

type DiagnosticsPanelProps = { initialReport?: CapabilityReport };

export function detectBrowserItems(): CapabilityItem[] {
  if (typeof window === "undefined") return [];
  const browserWindow = window as Window & { showDirectoryPicker?: unknown; webkitAudioContext?: unknown };
  const hasDirectoryPicker = typeof browserWindow.showDirectoryPicker === "function";
  const hasAudio = typeof window.AudioContext === "function" || typeof browserWindow.webkitAudioContext === "function";
  const hasMediaSource = typeof window.MediaSource === "function";
  const hasClipboard = typeof navigator.clipboard?.writeText === "function";
  return [
    { id: "browser-directory", label: "Directory access", status: hasDirectoryPicker ? "ready" : "limited", summary: hasDirectoryPicker ? "The browser can choose local directories." : "The browser will use a supported save/download fallback.", code: hasDirectoryPicker ? undefined : "BROWSER_LIMITATION" },
    { id: "browser-audio", label: "Browser audio", status: hasAudio ? "ready" : "unavailable", summary: hasAudio ? "Audio preview APIs are available." : "Audio preview APIs are unavailable.", code: hasAudio ? undefined : "BROWSER_LIMITATION" },
    { id: "browser-media", label: "Media playback", status: hasMediaSource ? "ready" : "limited", summary: hasMediaSource ? "Media playback is supported." : "Audio-first playback fallback will be used.", code: hasMediaSource ? undefined : "BROWSER_LIMITATION" },
    { id: "browser-clipboard", label: "Copy diagnostics", status: hasClipboard ? "ready" : "limited", summary: hasClipboard ? "The report can be copied to the clipboard." : "A selectable report will be shown instead.", code: hasClipboard ? undefined : "BROWSER_LIMITATION" },
  ];
}

export function mergeBrowserCapabilities(report: CapabilityReport): CapabilityReport {
  return capabilityReportSchema.parse({ ...report, items: [...report.items.filter((item) => !item.id.startsWith("browser-")), ...detectBrowserItems()] });
}

const statusLabels = { ready: "Ready", attention: "Needs attention", unavailable: "Unavailable", limited: "Limited" } as const;
const statusStyles = { ready: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", attention: "border-amber-300/30 bg-amber-300/10 text-amber-200", unavailable: "border-rose-300/30 bg-rose-300/10 text-rose-200", limited: "border-violet-300/30 bg-violet-300/10 text-violet-200" } as const;

function StatusIcon({ status }: { status: CapabilityItem["status"] }) {
  if (status === "ready") return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (status === "limited") return <TriangleAlert className="size-4" aria-hidden="true" />;
  return <AlertTriangle className="size-4" aria-hidden="true" />;
}

function CapabilityCard({ item }: { item: CapabilityItem }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[var(--primary)]"><StatusIcon status={item.status} /></span>
          <div><h3 className="font-medium">{item.label}</h3><p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">{item.summary}</p></div>
        </div>
        <Badge className={cn("shrink-0", statusStyles[item.status])}>{statusLabels[item.status]}</Badge>
      </div>
      {item.version ? <p className="mt-3 font-mono text-xs text-[var(--muted-foreground)]">Version {item.version}</p> : null}
      {item.actionLabel ? <p className="mt-3 text-xs font-medium text-[var(--primary)]">Next: {item.actionLabel}</p> : null}
    </article>
  );
}

export function DiagnosticsPanel({ initialReport }: DiagnosticsPanelProps) {
  const [report, setReport] = useState<CapabilityReport | undefined>(initialReport);
  const [browserItems, setBrowserItems] = useState<CapabilityItem[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!initialReport);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">("idle");

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/capabilities", { cache: "no-store" });
      const envelope = apiEnvelopeSchema.parse(await response.json());
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Local readiness checks failed.");
      setReport(mergeBrowserCapabilities(envelope.data));
    } catch {
      setError("Local readiness checks could not be completed. Try Refresh again; browser capability details remain available below.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setBrowserItems(detectBrowserItems()); if (!initialReport) void load(); else setReport(mergeBrowserCapabilities(initialReport)); }, [initialReport]);

  const groups = useMemo(() => {
    const items = report?.items ?? [];
    const browser = report?.items.filter((item) => item.id.startsWith("browser-")) ?? browserItems;
    return [
      { title: "Runtime", icon: Cpu, ids: ["compute"] },
      { title: "Media tools", icon: ShieldCheck, ids: ["ffmpeg"] },
      { title: "Models", icon: Laptop, ids: ["models"] },
      { title: "Storage", icon: HardDrive, ids: ["storage"] },
      { title: "Browser", icon: Laptop, ids: browser.map((item) => item.id) },
    ].map((group) => ({ ...group, items: group.title === "Browser" ? browser : items.filter((item) => group.ids.includes(item.id)) })).filter((group) => group.items.length > 0);
  }, [browserItems, report]);

  const attention = report?.items.filter((item) => item.status === "attention" || item.status === "unavailable") ?? [];
  const reportText = report ? buildDiagnosticText(report) : "Diagnostics are still loading.";

  async function copyDiagnostics() {
    if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(reportText); setCopyState("copied"); return; } catch { /* use fallback */ }
    }
    setCopyState("fallback");
  }

  return (
    <section id="diagnostics" aria-labelledby="diagnostics-title" className="mt-10">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Local processing</p><h2 id="diagnostics-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Readiness and diagnostics</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">Everything here describes this device only. Media and diagnostic content are never sent to a remote service.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" /> Refresh</Button><Button variant="outline" onClick={() => void copyDiagnostics()} disabled={!report}><Clipboard className="size-4" aria-hidden="true" /> {copyState === "copied" ? "Copied" : "Copy diagnostics"}</Button></div>
      </div>
      {attention.length > 0 ? <div role="status" className="mt-6 flex gap-3 rounded-[var(--radius-lg)] border border-amber-300/30 bg-amber-300/10 p-4 text-sm"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-200" aria-hidden="true" /><div><p className="font-medium text-amber-100">Local setup needs attention</p><p className="mt-1 leading-6 text-amber-100/80">{attention.map((item) => item.label).join(", ")} need review before final processing. Your media selection and draft remain safe.</p></div></div> : null}
      {error ? <div role="alert" className="mt-6 rounded-[var(--radius-lg)] border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-100">{error}</div> : null}
      {loading && !report ? <p className="mt-8 text-sm text-[var(--muted-foreground)]" role="status">Checking this device…</p> : null}
      {report ? <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 font-mono text-xs text-[var(--muted-foreground)]">Runtime: {report.runtime.nodeVersion} · {report.runtime.os} · {report.runtime.architecture}</p> : null}
      <div className="mt-8 space-y-8">{groups.map((group) => <section key={group.title} aria-labelledby={`group-${group.title.toLowerCase()}`}><div className="mb-3 flex items-center gap-2"><group.icon className="size-4 text-[var(--primary)]" aria-hidden="true" /><h3 id={`group-${group.title.toLowerCase()}`} className="text-sm font-semibold">{group.title}</h3></div><div className="grid gap-3 md:grid-cols-2">{group.items.map((item) => <CapabilityCard key={item.id} item={item} />)}</div></section>)}</div>
      {copyState === "fallback" ? <div className="mt-6"><label htmlFor="diagnostic-report" className="text-sm font-medium">Select and copy this redacted report</label><textarea id="diagnostic-report" readOnly value={reportText} className="mt-2 min-h-36 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 font-mono text-xs leading-5 text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" /></div> : null}
    </section>
  );
}
