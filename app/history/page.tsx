import { SurfaceHeader } from "@/components/app-shell";

export default function HistoryPage() {
  return <div><SurfaceHeader eyebrow="Local library" title="Your enhancement history." description="Processed runs, outputs, and diagnostics will stay available here on this device." /><div className="mt-10 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-8"><p className="text-sm font-medium">No enhancements yet.</p><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Add a local file to create your first result.</p></div></div>;
}
