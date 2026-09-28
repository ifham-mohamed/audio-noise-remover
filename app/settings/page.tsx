import { SurfaceHeader } from "@/components/app-shell";

export default function SettingsPage() {
  return <div><SurfaceHeader eyebrow="Workspace" title="Settings and diagnostics." description="Control appearance, playback, output, local runtime readiness, privacy, cleanup, and accessibility." /><div className="mt-10 grid gap-4 md:grid-cols-2"><SettingCard title="Local processing" description="FFmpeg, models, storage, and CPU readiness will appear here." /><SettingCard title="Accessibility" description="Reduced motion, waveform contrast, and announcements will be configurable here." /></div></div>;
}

function SettingCard({ title, description }: { title: string; description: string }) {
  return <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5"><h2 className="font-medium">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{description}</p></section>;
}
