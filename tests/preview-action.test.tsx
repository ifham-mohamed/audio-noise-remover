import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewAction } from "@/features/editor/preview-action";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";
import { createPreviewJob } from "@/shared/contracts/preview";

const workerCancel = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/features/preview/preview-worker-client", () => ({ startPreviewWorker: vi.fn(() => ({ cancel: workerCancel })) }));

const media: MediaMetadata = {
  sourceName: "interview.wav",
  sourceRef: "local:interview.wav:12:1",
  format: "wav",
  mediaKind: "audio",
  sizeBytes: 12,
  durationSeconds: 75,
  audioStream: { id: "audio-0", present: true, summary: "Audio stream ready" },
};
const file = new File(["local audio"], "interview.wav", { type: "audio/wav" });

function stubPreviewApi() {
  let attempt = 0;
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { media: MediaMetadata; profile: ReturnType<typeof defaultProcessingProfile>; currentTimeSeconds: number };
    const suffix = String(++attempt).padStart(12, "0");
    const job = createPreviewJob(body.media, body.profile, body.currentTimeSeconds, { id: `00000000-0000-4000-8000-${suffix}` });
    return { ok: true, json: async () => ({ data: job, error: null, requestId: "test-request" }) };
  });
  vi.stubGlobal("fetch", request);
  return request;
}

afterEach(() => { cleanup(); workerCancel.mockClear(); vi.unstubAllGlobals(); });

describe("preview action", () => {
  it("creates and labels a bounded preview request for the active profile", async () => {
    const request = stubPreviewApi();
    const user = userEvent.setup();
    render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={37} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Preview", level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Range 22\.00–52\.00 seconds/)).toBeInTheDocument();
    expect(screen.getByText(/not a final output/)).toBeInTheDocument();
    expect(screen.getByText(/noise removal: 60%/i)).toBeInTheDocument();
    expect(screen.getByText("audio wav · high quality · enhanced-output.wav")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Preview queued");
    expect(request).toHaveBeenCalledWith("/api/preview-jobs", expect.objectContaining({ method: "POST" }));
  });

  it("marks a preview stale when its normalized profile changes and creates a fresh request", async () => {
    stubPreviewApi();
    const user = userEvent.setup();
    const { rerender } = render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={0} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    const changed = defaultProcessingProfile(media.sourceRef, "audio-0");
    changed.stages = changed.stages.map((stage) => ({ ...stage, enabled: false }));
    rerender(<PreviewAction file={file} media={media} profile={changed} currentTimeSeconds={0} />);
    expect(screen.getByText("Older profile")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(screen.getByText(/No enhancement stages enabled/)).toBeInTheDocument());
  });

  it("marks a preview stale when the playhead moves to a different bounded window", async () => {
    stubPreviewApi();
    const user = userEvent.setup();
    const profile = defaultProcessingProfile(media.sourceRef, "audio-0");
    const { rerender } = render(<PreviewAction file={file} media={media} profile={profile} currentTimeSeconds={20} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    rerender(<PreviewAction file={file} media={media} profile={profile} currentTimeSeconds={50} />);
    expect(screen.getByText("Older profile")).toBeInTheDocument();
    expect(screen.getByText(/captured the profile shown below/)).toBeInTheDocument();
  });

  it("does not create a request when no media duration is available", async () => {
    const request = stubPreviewApi();
    const user = userEvent.setup();
    render(<PreviewAction media={{ ...media, durationSeconds: 0 }} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={0} />);
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByRole("heading", { name: "Preview", level: 2 })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("stops the active local worker when the preview surface unmounts", async () => {
    stubPreviewApi();
    const user = userEvent.setup();
    const view = render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={10} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel preview" })).toBeInTheDocument());
    view.unmount();
    await waitFor(() => expect(workerCancel).toHaveBeenCalledOnce());
  });
});
