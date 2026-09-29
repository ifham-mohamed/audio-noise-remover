import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalProcessAction } from "@/features/editor/final-process-action";
import { createFinalJob } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const media: MediaMetadata = { sourceName: "speech.wav", sourceRef: "local:speech.wav:20:1", format: "wav", mediaKind: "audio", sizeBytes: 20, durationSeconds: 30, audioStream: { id: "audio-0", present: true, summary: "Ready" } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockClear(); });

describe("final process action", () => {
  it("keeps Process unavailable until the verified local final executor and output path exist", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<FinalProcessAction media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} fileAvailable />);
    expect(screen.getByRole("button", { name: "Process" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("no verified full-file final executor and output path");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
  it("allows keyboard activation when the verified local executor is available", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    const job = createFinalJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), { id: jobId });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => ({ data: job, error: null, requestId: "test" }), body: init?.body }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FinalProcessAction media={media} profile={defaultProcessingProfile(media.sourceRef, "audio-0")} fileAvailable canExecuteFinal />);
    await user.tab(); expect(screen.getByRole("button", { name: "Process" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ media, profile: defaultProcessingProfile(media.sourceRef, "audio-0") });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/processing/${jobId}`));
  });
});
