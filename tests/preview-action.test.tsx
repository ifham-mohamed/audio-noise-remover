import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewAction } from "@/features/editor/preview-action";
import { PreviewSurface } from "@/features/editor/preview-surface";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";
import { createPreviewJob } from "@/shared/contracts/preview";

const workerCancel = vi.hoisted(() => vi.fn(async () => undefined));
const workerRelay = vi.hoisted(() => ({ current: undefined as undefined | ((event: { type: string; jobId: string; sequence: number; elapsedMs: number }) => Promise<boolean>) }));
vi.mock("@/features/preview/preview-worker-client", () => ({ startPreviewWorker: vi.fn((_job: unknown, _file: unknown, onEvent: typeof workerRelay.current) => { workerRelay.current = onEvent; return { cancel: workerCancel }; }) }));

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

function stubPreviewApi(cancelGate?: Promise<void>) {
  let attempt = 0;
  let currentJob: ReturnType<typeof createPreviewJob> | undefined;
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { media: MediaMetadata; profile: ReturnType<typeof defaultProcessingProfile>; currentTimeSeconds: number; command?: string; event?: { type: string; sequence: number } };
    if (url === "/api/preview-jobs") {
      const suffix = String(++attempt).padStart(12, "0");
      currentJob = createPreviewJob(body.media, body.profile, body.currentTimeSeconds, { id: `00000000-0000-4000-8000-${suffix}` });
    } else if (body.command === "cancel" && currentJob) {
      if (cancelGate) await cancelGate;
      currentJob = { ...currentJob, state: "cancelling" };
    } else if (body.command === "retry" && currentJob) {
      const previous = currentJob;
      const suffix = String(++attempt).padStart(12, "0");
      currentJob = createPreviewJob(previous.media, previous.profile, (previous.range.startSeconds + previous.range.endSeconds) / 2, { id: `00000000-0000-4000-8000-${suffix}`, retryOf: previous.id });
    } else if (body.command === "event" && body.event?.type === "cancelled" && currentJob) {
      currentJob = { ...currentJob, state: "cancelled", sequence: body.event.sequence };
    }
    return { ok: true, json: async () => ({ data: currentJob, error: null, requestId: "test-request" }) };
  });
  vi.stubGlobal("fetch", request);
  return request;
}

afterEach(() => { cleanup(); workerCancel.mockClear(); workerRelay.current = undefined; vi.unstubAllGlobals(); });

describe("preview action", () => {
  it("explains new stages and excerpt-only loudness without promising model qualification", () => {
    render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={0} />);
    expect(screen.getByText(/experimental conservative reflection suppression/)).toHaveTextContent("gated integrated measurement with peak-constrained gain");
    expect(screen.getByText(/Preview loudness reflects this excerpt/)).toBeInTheDocument();
    expect(screen.getByText(/has not passed the production quality gate/)).toBeInTheDocument();
  });
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

  it("disables duplicate preview starts while the current attempt is queued", async () => {
    const request = stubPreviewApi();
    const user = userEvent.setup();
    render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={37} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    const previewButton = screen.getByRole("button", { name: "Preview" });
    expect(previewButton).toBeDisabled();
    await user.click(previewButton);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("marks a preview stale when its normalized profile changes and prevents another active attempt", async () => {
    stubPreviewApi();
    const user = userEvent.setup();
    const { rerender } = render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={0} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    const changed = defaultProcessingProfile(media.sourceRef, "audio-0");
    changed.stages = changed.stages.map((stage) => ({ ...stage, enabled: false }));
    rerender(<PreviewAction file={file} media={media} profile={changed} currentTimeSeconds={0} />);
    expect(screen.getByText("Older profile")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
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
    const request = stubPreviewApi();
    const user = userEvent.setup();
    const view = render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={10} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel preview" })).toBeInTheDocument());
    view.unmount();
    await waitFor(() => expect(workerCancel).toHaveBeenCalledOnce());
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/preview-jobs\//), expect.objectContaining({ body: JSON.stringify({ command: "cancel" }) })));
  });

  it("relays a user cancellation through worker settlement to a terminal job", async () => {
    const request = stubPreviewApi();
    const user = userEvent.setup();
    render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={10} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(await screen.findByRole("button", { name: "Cancel preview" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Cancelling preview");
    expect(workerCancel).toHaveBeenCalledOnce();
    expect(workerRelay.current).toBeDefined();
    await workerRelay.current!({ type: "cancelled", jobId: "00000000-0000-4000-8000-000000000001", sequence: 1, elapsedMs: 12 });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Preview cancelled"));
    expect(request.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "cancel" }),
      expect.objectContaining({ command: "event", event: expect.objectContaining({ type: "cancelled" }) }),
    ]));
    expect(screen.getByText(/No preview artifact was kept/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /play preview/i })).not.toBeInTheDocument();
  });

  it("stops local work immediately and waits for the cancel command before relaying terminal cancellation", async () => {
    let releaseCancel!: () => void;
    const gate = new Promise<void>((resolve) => { releaseCancel = resolve; });
    const request = stubPreviewApi(gate);
    const user = userEvent.setup();
    render(<PreviewAction file={file} media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} currentTimeSeconds={10} />);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(await screen.findByRole("button", { name: "Cancel preview" }));
    expect(workerCancel).toHaveBeenCalledOnce();
    const settlement = workerRelay.current!({ type: "cancelled", jobId: "00000000-0000-4000-8000-000000000001", sequence: 1, elapsedMs: 12 });
    expect(request.mock.calls.some(([, init]) => JSON.parse(String(init?.body)).command === "event")).toBe(false);
    releaseCancel();
    await settlement;
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Preview cancelled"));
  });

  it("offers a linked retry from a cancelled preview", async () => {
    const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 10);
    const retry = vi.fn();
    const cancelled = { ...job, state: "cancelled" as const };
    render(<PreviewSurface job={cancelled} onRetry={retry} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry preview" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText(/new attempt linked to this one/)).toBeInTheDocument();
  });
});
