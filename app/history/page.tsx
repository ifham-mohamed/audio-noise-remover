import { SurfaceHeader } from "@/components/app-shell";
import { HistoryView } from "@/features/history/history-view";

export default function HistoryPage() {
  return <div><SurfaceHeader eyebrow="Local library" title="Your enhancement history." description="Browse final processing attempts saved on this device. Your media stays local." /><HistoryView /></div>;
}
