import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalProcessAction } from "@/features/editor/final-process-action";
import { createFinalJob } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";
import type { MediaMetadata } from "@/shared/contracts/media";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const saveSource = vi.hoisted(() => vi.fn(async () => undefined));
const removeSource = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/features/final/final-artifact-store", () => ({ saveFinalSource: saveSource, removeFinalSource: removeSource }));
const media: MediaMetadata = { sourceName: "speech.wav", sourceRef: "local:speech.wav:20:1", format: "wav", mediaKind: "audio", sizeBytes: 48_044, durationSeconds: 1, audioStream: { id: "audio-0", present: true, channels: 1, sampleRate: 48000, summary: "Ready" } };
function supportedProfile() { const profile = defaultProcessingProfile(media.sourceRef, "audio-0"); return { ...profile, stages: profile.stages.map((stage) => ({ ...stage, enabled: stage.id === "noise-removal" })) }; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); push.mockClear(); });

describe("final process action", () => {
  it("enables full local processing for a 4:57 WAV and explains the five-minute boundary", () => {
    const recording: MediaMetadata = { ...media, sizeBytes: 27_200_000, durationSeconds: 297 };
    const profile = supportedProfile();
    const file = new File([new Uint8Array(44)], "speech.wav", { type: "audio/wav" });
    const { rerender } = render(<FinalProcessAction media={recording} profile={profile} file={file} fileAvailable />);
    expect(screen.getByRole("button", { name: "Process" })).toBeEnabled();
    rerender(<FinalProcessAction media={{ ...recording, durationSeconds: 300.01 }} profile={profile} file={file} fileAvailable />);
    expect(screen.getByRole("button", { name: "Process" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("5-minute experimental limit");
  });

  it("keeps Process unavailable for unsupported profiles and explains the experimental limits", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const unsupported = defaultProcessingProfile(media.sourceRef, "audio-0");
    unsupported.stages = unsupported.stages.map((stage) => ({ ...stage, enabled: false }));
    render(<FinalProcessAction media={media} profile={unsupported} file={new File([new Uint8Array(media.sizeBytes)], "speech.wav", { type: "audio/wav" })} fileAvailable />);
    expect(screen.getByRole("button", { name: "Process" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("noise removal and/or voice clarity");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
  it("saves the original locally and starts the supported experimental WAV path with keyboard activation", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(jobId);
    const profile = supportedProfile();
    const file = new File([new Uint8Array(media.sizeBytes)], "speech.wav", { type: "audio/wav" });
    const job = createFinalJob(media, profile, { id: jobId });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => ({ data: job, error: null, requestId: "test" }), body: init?.body }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FinalProcessAction media={media} profile={profile} file={file} fileAvailable />);
    await user.tab(); expect(screen.getByRole("button", { name: "Process" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(saveSource).toHaveBeenCalledWith(jobId, file);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ media, profile, clientAttemptId: jobId });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/processing/${jobId}`));
  });
});
