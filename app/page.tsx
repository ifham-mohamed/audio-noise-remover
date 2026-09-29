import { SurfaceHeader } from "@/components/app-shell";
import { IntakePanel } from "@/features/intake/intake-panel";

export default function HomePage() {
  return <div><SurfaceHeader eyebrow="New enhancement" title="Make speech easier to hear." description="A calm, local workspace for cleaning recordings and speech-bearing video. Your files stay on this device." /><IntakePanel /></div>;
}
