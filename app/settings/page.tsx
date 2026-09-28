import { SurfaceHeader } from "@/components/app-shell";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return <div><SurfaceHeader eyebrow="Workspace" title="Settings and diagnostics." description="Control appearance, playback, output, local runtime readiness, privacy, cleanup, and accessibility." /><SettingsPanel /><DiagnosticsPanel /></div>;
}
