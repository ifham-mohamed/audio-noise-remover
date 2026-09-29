import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalJobView } from "@/features/editor/final-job-view";
import { createFinalJob, finalJobEnvelopeSchema } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const media = { sourceName: "speech.wav", sourceRef: "local:speech.wav:20:1", format: "wav", mediaKind: "audio" as const, sizeBytes: 20, durationSeconds: 30, audioStream: { id: "audio-0", present: true, summary: "Ready" } };
const job = createFinalJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), { id: "00000000-0000-4000-8000-000000000001" });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("final job monitor", () => {
  it("loads the authoritative queued state and announces it to assistive technology", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => finalJobEnvelopeSchema.parse({ data: job, error: null, requestId: "test" }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FinalJobView id={job.id} />);
    await waitFor(() => expect(screen.getAllByRole("status").some((element) => element.textContent?.includes("Final processing queued"))).toBe(true));
    expect(screen.getByRole("heading", { name: "speech.wav" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/final-jobs/${job.id}`, { cache: "no-store" });
  });

  it("renders later stage progress with visible and announced numeric percent", async () => {
    const running = { ...job, state: "running" as const, sequence: 1, phase: "noise-removal", progress: 0.42, elapsedMs: 8000, updatedAt: new Date().toISOString() };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: job, error: null, requestId: "queued" }) }).mockResolvedValue({ ok: true, json: async () => ({ data: running, error: null, requestId: "running" }) });
    const pollCallbacks: Array<() => void> = [];
    vi.spyOn(window, "setInterval").mockImplementation(((callback: TimerHandler, timeout?: number) => { if (typeof callback === "function" && timeout === 1500 && pollCallbacks.length === 0) pollCallbacks.push(() => callback()); return 1; }) as typeof window.setInterval);
    vi.stubGlobal("fetch", fetchMock);
    render(<FinalJobView id={job.id} />);
    await waitFor(() => expect(screen.getByText("Final processing queued")).toBeInTheDocument());
    await act(async () => { pollCallbacks[0]?.(); await Promise.resolve(); await Promise.resolve(); });
    expect(await screen.findByText(/Stage: noise removal · Elapsed: 0:08/)).toBeInTheDocument();
    expect(screen.getByText("Overall stage progress: 42%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Final processing progress" })).toHaveAttribute("aria-valuetext", "42 percent");
    expect(screen.getByText(/Stage: noise removal · Elapsed: 0:08/)).toBeInTheDocument();
  });

  it.each([
    { state: "failed" as const, failure: { code: "PROCESSING_FAILED" as const, message: "Failed locally" } },
    { state: "cancelled" as const },
  ])("does not expose output controls for a $state job", async (status) => {
    const unavailable = { ...job, ...status };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: unavailable, error: null, requestId: "terminal" }) })));
    render(<FinalJobView id={job.id} />);
    await waitFor(() => expect(screen.getByText(status.state === "failed" ? "Final processing failed: Failed locally" : "Final processing cancelled. No final output was retained.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Download WAV" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Listen to the validated experimental final output")).not.toBeInTheDocument();
  });
});
