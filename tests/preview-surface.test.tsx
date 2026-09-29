import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewSurface } from "@/features/editor/preview-surface";
import { createPreviewJob, previewJobSchema } from "@/shared/contracts/preview";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const media: MediaMetadata = {
  sourceName: "interview.wav",
  sourceRef: "local:interview.wav:12:1",
  format: "wav",
  mediaKind: "audio",
  sizeBytes: 12,
  durationSeconds: 90,
  audioStream: { id: "audio-0", present: true, summary: "Audio stream ready" },
};

function jobWith(state: "running" | "cancelling" | "cancelled" | "failed") {
  const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 45, { id: "00000000-0000-4000-8000-000000000001" });
  return previewJobSchema.parse({
    ...job,
    state,
    sequence: 1,
    phase: state === "running" ? "Preparing local preview" : undefined,
    progress: state === "running" ? 0.4 : undefined,
    elapsedMs: 1250,
    failure: state === "failed" ? { code: "MODEL_UNAVAILABLE", message: "A local model is not configured.", action: "settings" } : undefined,
  });
}

describe("preview lifecycle accessibility", () => {
  it("announces phase, determinate progress, and elapsed time while running", () => {
    render(<PreviewSurface job={jobWith("running")} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing local preview · 40% · 0:01 elapsed");
    expect(screen.getByRole("progressbar", { name: "Preview progress" })).toHaveAttribute("value", "0.4");
  });

  it("announces cancellation in progress until the coordinator settles it", () => {
    render(<PreviewSurface job={jobWith("cancelling")} cancelling />);
    expect(screen.getByRole("status")).toHaveTextContent("Cancelling… finishing the current step");
    expect(screen.getByText("Cancelling preview")).toBeInTheDocument();
  });

  it("exposes safe failure guidance and a keyboard-operable retry/settings action", () => {
    const retry = vi.fn();
    render(<PreviewSurface job={jobWith("failed")} onRetry={retry} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preview failed: A local model is not configured.");
    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute("href", "/settings");
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("announces cancellation and never shows a playable or successful artifact", () => {
    render(<PreviewSurface job={jobWith("cancelled")} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preview cancelled");
    expect(screen.getByText(/No preview artifact was kept/)).toBeInTheDocument();
    expect(screen.queryByText(/Validated preview artifact/)).not.toBeInTheDocument();
  });
});
