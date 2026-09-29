"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AudioLines, ChevronRight, Clock3, FileAudio, History, LockKeyhole, Menu, Settings2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiEnvelopeSchema } from "@/shared/contracts/capabilities";
import { finalJobListEnvelopeSchema } from "@/shared/contracts/final-job";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "New enhancement", icon: Sparkles },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export type ActiveJobSummary = {
  href: string;
  label: string;
  status: string;
};

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary navigation" className="flex flex-col gap-2">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("group flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm transition-colors hover:bg-[var(--surface-elevated)]", active ? "bg-[var(--surface-elevated)] text-[var(--foreground)]" : "text-[var(--muted-foreground)]")}>
            <span className={cn("h-5 w-1 rounded-full", active ? "bg-[var(--primary)]" : "bg-transparent")} aria-hidden="true" />
            <Icon className={cn("size-4", active && "text-[var(--primary)]")} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function LocalTrustBadge({ readiness }: { readiness: "checking" | "ready" | "attention" }) {
  const needsAttention = readiness === "attention";
  const label = readiness === "checking" ? "Checking local readiness" : needsAttention ? "Local setup needs attention" : "On this device";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label={label}>
          <Badge className={cn("border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]", needsAttention && "border-amber-300/30 bg-amber-300/10 text-amber-200")}>
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            <span>{label}</span>
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent>{readiness === "checking" ? "Checking this device’s local processing readiness." : needsAttention ? <span>Local setup needs attention. <Link href="/settings#diagnostics" className="font-medium text-[var(--primary)] underline">Open diagnostics</Link></span> : "Processing happens on this device. Your media, outputs, history, and logs stay local."}</TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ children, activeJob }: { children: React.ReactNode; activeJob?: ActiveJobSummary }) {
  const [readiness, setReadiness] = useState<"checking" | "ready" | "attention">("checking");
  const [localActiveJob, setLocalActiveJob] = useState<ActiveJobSummary>();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    fetch("/api/capabilities", { cache: "no-store" }).then(async (response) => {
      const envelope = apiEnvelopeSchema.parse(await response.json());
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Local readiness checks failed.");
      return envelope.data;
    }).then((data) => {
      const items = data.items ?? [];
      setReadiness(items.some((item) => item.status === "attention" || item.status === "unavailable") ? "attention" : "ready");
    }).catch(() => setReadiness("attention"));
  }, []);
  useEffect(() => {
    let alive = true; let requestInFlight = false;
    const refresh = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/final-jobs", { cache: "no-store" });
        const envelope = finalJobListEnvelopeSchema.parse(await response.json());
        if (!response.ok || !envelope.data) return;
        const job = envelope.data.find((item) => ["queued", "running", "cancelling"].includes(item.state));
        if (alive) setLocalActiveJob(job ? { href: `/processing/${job.id}`, label: job.media.sourceName, status: job.phase ? `${job.phase} · ${job.state} · ${elapsedLabel(job.elapsedMs)}` : `Final processing ${job.state} · ${elapsedLabel(job.elapsedMs)}` } : undefined);
      } catch { /* The persistent shell remains usable when local history is temporarily unavailable. */ }
      finally { requestInFlight = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 2000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const target = document.querySelector<HTMLElement>("[data-surface-heading]") ?? document.getElementById("main-content");
    target?.focus();
  }, [pathname]);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-[var(--surface-base)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface-raised)] p-5 lg:flex lg:flex-col" aria-label="Application sidebar">
          <ShellBrand />
          <div className="mt-8"><Navigation /></div>
          <ActiveJob activeJob={activeJob ?? localActiveJob} />
          <div className="mt-auto space-y-4">
            <Separator />
            <LocalTrustBadge readiness={readiness} />
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">Clear speech, kept private.</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-base)]/95 px-4 backdrop-blur md:px-7 lg:px-10">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"><Menu className="size-5" aria-hidden="true" /></Button>
                </SheetTrigger>
                <SheetContent aria-label="Mobile navigation">
                  <ShellBrand />
                  <div className="mt-8"><Navigation onNavigate={() => setMobileNavOpen(false)} /></div>
                  <ActiveJob activeJob={activeJob ?? localActiveJob} />
                  <div className="mt-auto pt-8"><LocalTrustBadge readiness={readiness} /></div>
                </SheetContent>
              </Sheet>
              <div className="lg:hidden"><ShellBrand compact /></div>
            </div>
            <div className="lg:hidden"><LocalTrustBadge readiness={readiness} /></div>
          </header>
          <main id="main-content" className="flex-1 px-4 py-8 md:px-7 md:py-10 lg:px-10" tabIndex={-1}>{children}</main>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}

function elapsedLabel(milliseconds: number) { const seconds = Math.floor(milliseconds / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

function ShellBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3", compact && "gap-2")} aria-label="Clearwave Studio home">
      <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_22%,transparent)]"><AudioLines className="size-5" aria-hidden="true" /></span>
      <span className={cn("font-semibold tracking-[-0.02em]", compact ? "text-sm" : "text-base")}>Clearwave <span className="text-[var(--primary)]">Studio</span></span>
    </Link>
  );
}

function ActiveJob({ activeJob }: { activeJob?: ActiveJobSummary }) {
  if (activeJob) {
    return (
      <div role="region" className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3" aria-label="Active jobs">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]"><Clock3 className="size-3.5" aria-hidden="true" /> Active job</div>
        <Link href={activeJob.href} className="mt-3 block rounded-[var(--radius-md)] p-2 -mx-2 hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          <span className="block truncate text-sm font-medium text-[var(--foreground)]">{activeJob.label}</span>
          <span className="mt-1 block text-xs text-[var(--primary)]">{activeJob.status}</span>
        </Link>
      </div>
    );
  }

  return (
    <div role="region" className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3" aria-label="Active jobs">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]"><Clock3 className="size-3.5" aria-hidden="true" /> No active jobs</div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Your processing runs will appear here while they work.</p>
    </div>
  );
}

export function SurfaceHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{eyebrow}</p>
      <h1 tabIndex={-1} data-surface-heading className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] md:text-4xl">{title}</h1>
      <p className="sr-only" aria-live="polite">Current surface: {title}</p>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] md:text-base">{description}</p>
    </div>
  );
}

export function RouteHint({ label, href }: { label: string; href: string }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline">{label}<ChevronRight className="size-4" aria-hidden="true" /></Link>;
}

export function EmptyMediaCard() {
  return <div className="mt-10 grid min-h-[360px] place-items-center rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-8 text-center"><div className="max-w-md"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--surface-elevated)] text-[var(--primary)]"><FileAudio className="size-7" aria-hidden="true" /></div><h2 className="mt-6 text-xl font-semibold tracking-[-0.02em]">Drop audio or video here</h2><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Start with a local file. Clearwave supports MP3, WAV, M4A, FLAC, MP4, MOV, and MKV.</p><Button className="mt-6">Browse files</Button></div></div>;
}
