import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewComparison } from "@/features/editor/preview-comparison";
import { createPreviewJob, type PreviewJob } from "@/shared/contracts/preview";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const artifactUrls = vi.hoisted(() => ({ open: vi.fn(), release: vi.fn() }));
vi.mock("@/features/preview/preview-artifact-store", () => ({
  openPreviewArtifact: artifactUrls.open,
  releasePreviewArtifactUrl: artifactUrls.release,
}));

const media: MediaMetadata = {
  sourceName: "interview.wav", sourceRef: "local:interview.wav:12:1", format: "wav", mediaKind: "audio", sizeBytes: 12,
  durationSeconds: 90, audioStream: { id: "audio-0", present: true, summary: "Audio stream ready" },
};
const source = { id: "00000000-0000-4000-8000-000000000003", mimeType: "audio/wav", sizeBytes: 500, durationSeconds: 30 };
const enhanced = { id: "00000000-0000-4000-8000-000000000004", mimeType: "audio/wav", sizeBytes: 600, durationSeconds: 30 };
type OpenedArtifact = { id: string; mimeType: string; sizeBytes: number; durationSeconds: number; url: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve: (value: T) => resolve(value), reject: (reason?: unknown) => reject(reason) };
}

function succeededJob(overrides: Partial<PreviewJob> = {}): PreviewJob {
  const job = createPreviewJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), 45, { id: "00000000-0000-4000-8000-000000000001" });
  return { ...job, state: "succeeded", sequence: 1, artifact: enhanced, comparisonSourceArtifact: source, ...overrides };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  artifactUrls.open.mockImplementation(async (id: string) => ({ id, mimeType: "audio/wav", sizeBytes: 500, durationSeconds: 30, url: `blob:${id}` }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); artifactUrls.open.mockReset(); artifactUrls.release.mockReset(); });

describe("preview comparison", () => {
  it("loads both local artifacts and exposes labeled paired playback controls", async () => {
    render(<PreviewComparison job={succeededJob()} />);
    expect(await screen.findByRole("heading", { name: "Before and After" })).toBeInTheDocument();
    expect(artifactUrls.open).toHaveBeenCalledWith(source.id);
    expect(artifactUrls.open).toHaveBeenCalledWith(enhanced.id);
    expect(screen.getByRole("img", { name: /Before waveform, active side/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /After waveform/ })).toBeInTheDocument();
    expect(screen.getByText(/Source bounds 30\.00–60\.00 sec/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Before selected");
  });

  it("synchronizes seek and sequential A/B switching while keeping playback on one side", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<PreviewComparison job={succeededJob()} />);
    const slider = await screen.findByRole("slider", { name: "Seek within preview comparison" });
    const before = screen.getByLabelText("Before preview audio") as HTMLAudioElement;
    const after = screen.getByLabelText("After preview audio") as HTMLAudioElement;
    fireEvent.change(slider, { target: { value: "12.5" } });
    expect(slider).toHaveValue("12.5");
    expect(screen.getByText(/Preview time/).parentElement).toHaveTextContent("0:12 / 0:30");
    expect(before.currentTime).toBe(12.5);
    expect(after.currentTime).toBe(12.5);

    await user.click(screen.getByRole("button", { name: /^After$/ }));
    expect(screen.getByRole("status")).toHaveTextContent("After selected");
    await user.click(screen.getByRole("button", { name: "Play preview comparison" }));
    expect(play).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /^A\/B$/ }));
    expect(screen.getByRole("status")).toHaveTextContent("A/B mode, After active");
    await user.click(screen.getByRole("button", { name: /Switch A\/B side/ }));
    expect(screen.getByRole("status")).toHaveTextContent("A/B mode, Before active");
    expect(slider).toHaveValue("12.5");
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("keeps seeks inside the bounded preview and ignores non-finite time entry", async () => {
    render(<PreviewComparison job={succeededJob()} />);
    const slider = await screen.findByRole("slider", { name: "Seek within preview comparison" });
    const timeEntry = screen.getByRole("spinbutton", { name: "Go to preview seconds" });
    fireEvent.change(timeEntry, { target: { value: "100" } });
    expect(slider).toHaveValue("0");
    fireEvent.blur(timeEntry);
    expect(slider).toHaveValue("30");
    expect((screen.getByLabelText("Before preview audio") as HTMLAudioElement).currentTime).toBe(30);
    expect((screen.getByLabelText("After preview audio") as HTMLAudioElement).currentTime).toBe(30);
    fireEvent.change(timeEntry, { target: { value: "7.25" } });
    expect(timeEntry).toHaveValue(7.25);
    fireEvent.blur(timeEntry);
    expect(slider).toHaveValue("7.25");
    fireEvent.change(timeEntry, { target: { value: "Infinity" } });
    fireEvent.blur(timeEntry);
    expect(slider).toHaveValue("7.25");
  });

  it("keeps the playhead on a mode switch and explains autoplay rejection", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValueOnce().mockRejectedValueOnce(new Error("blocked"));
    render(<PreviewComparison job={succeededJob()} />);
    const before = await screen.findByLabelText("Before preview audio") as HTMLAudioElement;
    const after = screen.getByLabelText("After preview audio") as HTMLAudioElement;
    before.currentTime = 8.25;
    await user.click(screen.getByRole("button", { name: "Play preview comparison" }));
    await user.click(screen.getByRole("button", { name: /^After$/ }));
    expect(play).toHaveBeenCalledTimes(2);
    expect(after.currentTime).toBe(8.25);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Local preview playback was blocked/);
  });

  it("ignores a late playback rejection after a newer side has become active", async () => {
    const user = userEvent.setup();
    const lateAfter = deferred<void>();
    const currentBefore = deferred<void>();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValueOnce().mockImplementationOnce(() => lateAfter.promise).mockImplementationOnce(() => currentBefore.promise);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    render(<PreviewComparison job={succeededJob()} />);
    await screen.findByLabelText("Before preview audio");
    const afterAudio = screen.getByLabelText("After preview audio") as HTMLAudioElement;
    const pauseStaleAfter = vi.spyOn(afterAudio, "pause").mockImplementation(() => undefined);
    await user.click(screen.getByRole("button", { name: "Play preview comparison" }));
    await user.click(screen.getByRole("button", { name: /^After$/ }));
    await user.click(screen.getByRole("button", { name: /^Before$/ }));
    currentBefore.resolve();
    lateAfter.reject(new Error("late autoplay rejection"));
    await waitFor(() => expect(pauseStaleAfter).toHaveBeenCalled());
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Before selected");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains missing source or expired pair and never substitutes the original file", async () => {
    const user = userEvent.setup();
    render(<PreviewComparison job={succeededJob({ comparisonSourceArtifact: undefined })} />);
    expect(await screen.findByText(/Preview comparison data is unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Play preview comparison/ })).not.toBeInTheDocument();
    expect(artifactUrls.open).not.toHaveBeenCalled();
    await user.keyboard("{Space}");
    expect(screen.queryByRole("audio")).not.toBeInTheDocument();
  });

  it("revokes both object URLs and stops playback on unmount", async () => {
    const view = render(<PreviewComparison job={succeededJob()} />);
    await waitFor(() => expect(screen.getByLabelText("Before preview audio")).toHaveAttribute("src", `blob:${source.id}`));
    const pauseBefore = vi.spyOn(screen.getByLabelText("Before preview audio") as HTMLAudioElement, "pause").mockImplementation(() => undefined);
    const pauseAfter = vi.spyOn(screen.getByLabelText("After preview audio") as HTMLAudioElement, "pause").mockImplementation(() => undefined);
    view.unmount();
    await waitFor(() => expect(artifactUrls.release).toHaveBeenCalledTimes(2));
    expect(artifactUrls.release).toHaveBeenCalledWith(`blob:${source.id}`);
    expect(artifactUrls.release).toHaveBeenCalledWith(`blob:${enhanced.id}`);
    expect(pauseBefore).toHaveBeenCalled();
    expect(pauseAfter).toHaveBeenCalled();
  });

  it("discards late artifact loads and releases their URLs after the job changes", async () => {
    const staleBefore = deferred<OpenedArtifact>();
    const staleAfter = deferred<OpenedArtifact>();
    artifactUrls.open.mockImplementationOnce(() => staleBefore.promise).mockImplementationOnce(() => staleAfter.promise);
    const view = render(<PreviewComparison job={succeededJob()} />);
    const nextSource = { ...source, id: "00000000-0000-4000-8000-000000000005" };
    const nextAfter = { ...enhanced, id: "00000000-0000-4000-8000-000000000006" };
    view.rerender(<PreviewComparison job={succeededJob({ artifact: nextAfter, comparisonSourceArtifact: nextSource })} />);
    expect(await screen.findByRole("heading", { name: "Before and After" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Before preview audio")).toHaveAttribute("src", `blob:${nextSource.id}`));

    staleBefore.resolve({ ...source, url: `blob:${source.id}` });
    staleAfter.resolve({ ...enhanced, url: `blob:${enhanced.id}` });
    await waitFor(() => expect(artifactUrls.release).toHaveBeenCalledWith(`blob:${source.id}`));
    expect(artifactUrls.release).toHaveBeenCalledWith(`blob:${enhanced.id}`);
    expect(screen.getByLabelText("Before preview audio")).toHaveAttribute("src", `blob:${nextSource.id}`);
  });
});
