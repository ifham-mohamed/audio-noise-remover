import { SurfaceHeader } from "@/components/app-shell";
import { FinalJobView } from "@/features/editor/final-job-view";

export default async function FinalProcessingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div><SurfaceHeader eyebrow="Local processing" title="Final processing status" description="This page follows the authoritative state for one local final attempt." /><FinalJobView id={id} /></div>;
}
