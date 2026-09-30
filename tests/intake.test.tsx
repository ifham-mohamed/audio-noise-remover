import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntakePanel } from "@/features/intake/intake-panel";
import type { MediaInspection } from "@/shared/contracts/media";
import { createPreviewJob } from "@/shared/contracts/preview";
import { defaultProcessingProfile } from "@/shared/contracts/processing";

const inspectionMock = vi.hoisted(() => ({ inspectLocalMedia: vi.fn<(file: File) => Promise<MediaInspection>>() }));
vi.mock("@/features/intake/media-inspection", () => inspectionMock);
const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

const readyResult: MediaInspection = { status: "ready", metadata: { sourceName: "interview.wav", sourceRef: "local:interview.wav:12:1", format: "wav", mediaKind: "audio", sizeBytes: 12, durationSeconds: 75, audioStream: { present: true, summary: "Audio stream ready" } } };

function fileInput() { return document.querySelector<HTMLInputElement>("input[type=file]")!; }

describe("intake panel", () => {
  beforeEach(() => {
    inspectionMock.inspectLocalMedia.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { media: typeof readyResult.metadata; profile: ReturnType<typeof defaultProcessingProfile>; currentTimeSeconds: number };
      const job = createPreviewJob(body.media, body.profile, body.currentTimeSeconds, { id: "00000000-0000-4000-8000-000000000001" });
      return { ok: true, json: async () => ({ data: job, error: null, requestId: "test-request" }) };
    }));
  });

  it("shows the local empty intake and supported formats", () => {
    render(<IntakePanel />);
    expect(screen.getByRole("button", { name: "Choose a local audio or video file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse files" })).toBeInTheDocument();
    expect(screen.getByText(/MP3, WAV, M4A, FLAC, MP4, MOV, MKV/)).toBeInTheDocument();
    expect(screen.getByText(/stays on this device/)).toBeInTheDocument();
  });

  it("shows inspecting until the local inspection completes", async () => {
    let resolve: (value: MediaInspection) => void = () => undefined;
    inspectionMock.inspectLocalMedia.mockReturnValue(new Promise((res) => { resolve = res; }));
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["audio"], "interview.wav", { type: "audio/wav" }));
    expect(screen.getByRole("status")).toHaveTextContent("Inspecting file…");
    resolve(readyResult);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ready to enhance" })).toBeInTheDocument());
  });

  it("shows ready metadata and safely removes the intake draft", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValue(readyResult);
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["audio"], "interview.wav", { type: "audio/wav" }));
    await waitFor(() => expect(screen.getByText("1:15", { selector: "dd" })).toBeInTheDocument());
    expect(screen.getByText("12 B")).toBeInTheDocument();
    expect(screen.getByText("Local source")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tune the enhancement stages" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where should this go?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("button", { name: "Choose a local audio or video file" })).toBeInTheDocument();
  });

  it("creates a bounded preview request from the current playback position and effect profile", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValue(readyResult);
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["audio"], "interview.wav", { type: "audio/wav" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument());
    const playhead = screen.getByRole("spinbutton", { name: "Go to seconds" });
    await user.clear(playhead);
    await user.type(playhead, "40");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Preview", level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Bounded sample · 0:30/)).toBeInTheDocument();
    expect(screen.getByText(/Range 25\.00–55\.00 seconds/)).toBeInTheDocument();
    const request = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/preview-jobs");
    const submittedProfile = JSON.parse(String(request?.[1]?.body)).profile as ReturnType<typeof defaultProcessingProfile>;
    expect(submittedProfile.stages.find((stage) => stage.id === "noise-removal")?.enabled).toBe(true);
    expect(submittedProfile.stages.find((stage) => stage.id === "voice-clarity")?.enabled).toBe(false);
    const noise = screen.getByRole("switch", { name: "Noise removal enabled" });
    await user.click(noise);
    expect(screen.getByText("Older profile")).toBeInTheDocument();
  });

  it("shows an actionable inspection error without processing controls", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValue({ status: "error", code: "NO_AUDIO_STREAM", message: "This file has no readable audio stream." });
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["video"], "silent.mp4", { type: "video/mp4" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no readable audio stream"));
    expect(screen.getByRole("button", { name: "Replace file" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue to editor" })).not.toBeInTheDocument();
  });

  it("replaces an invalid source with a fresh inspection", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValueOnce({ status: "error", code: "CORRUPT_MEDIA", message: "This file is unreadable." }).mockResolvedValueOnce(readyResult);
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["bad"], "bad.wav", { type: "audio/wav" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Replace file" }));
    await user.upload(fileInput(), new File(["good"], "interview.wav", { type: "audio/wav" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ready to enhance" })).toBeInTheDocument());
    expect(inspectionMock.inspectLocalMedia).toHaveBeenCalledTimes(2);
  });

  it("resets editor controls when a new selection collides on the source reference", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValue(readyResult);
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["first"], "interview.wav", { lastModified: 1 }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ready to enhance" })).toBeInTheDocument());
    await user.click(screen.getByRole("switch", { name: "Noise removal enabled" }));
    expect(screen.getByRole("switch", { name: "Noise removal enabled" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Replace file" }));
    await user.upload(fileInput(), new File(["other"], "interview.wav", { lastModified: 1 }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ready to enhance" })).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Noise removal enabled" })).toBeChecked();
  });

  it("offers diagnostics when the local inspector is unavailable", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValue({ status: "error", code: "INSPECTION_UNAVAILABLE", message: "Local inspection is unavailable." });
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["audio"], "interview.wav", { type: "audio/wav" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Open local diagnostics" })).toHaveAttribute("href", "/settings#diagnostics"));
  });

  it("reviews video audio-first and persists a selected stream", async () => {
    const videoResult: MediaInspection = { status: "ready", metadata: { sourceName: "meeting.mp4", sourceRef: "local:meeting", format: "mp4", mediaKind: "video", sizeBytes: 200, durationSeconds: 12, audioStream: { id: "main", label: "Main mix", present: true, summary: "AAC stereo", channels: 2, channelLayout: "stereo", sampleRate: 48000 }, audioStreams: [{ id: "main", label: "Main mix", present: true, summary: "AAC stereo", channels: 2, channelLayout: "stereo", sampleRate: 48000 }, { id: "commentary", label: "Commentary", present: true, summary: "AAC mono", channels: 1, channelLayout: "mono", sampleRate: 44100 }], selectedAudioStreamId: "main" } };
    inspectionMock.inspectLocalMedia.mockResolvedValue(videoResult);
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["video"], "meeting.mp4", { type: "video/mp4" }));
    await waitFor(() => expect(screen.getByText("Audio-first review")).toBeInTheDocument());
    expect(screen.getByText("stereo")).toBeInTheDocument();
    expect(screen.getByText("48,000 Hz")).toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: "Audio stream" });
    await user.selectOptions(select, "commentary");
    expect(select).toHaveValue("commentary");
    expect(screen.getByText("AAC mono")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    const previewRequest = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/preview-jobs");
    expect(JSON.parse(String(previewRequest?.[1]?.body)).profile.selectedAudioStreamId).toBe("commentary");
  });

  it("documents the first-stream default when video choices are unavailable", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValue({ status: "ready", metadata: { ...readyResult.metadata, sourceName: "single.mp4", format: "mp4", mediaKind: "video", audioStream: { id: "audio-0", present: true, summary: "Default audio" } } });
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["video"], "single.mp4", { type: "video/mp4" }));
    await waitFor(() => expect(screen.getByText(/first usable audio stream by default/)).toBeInTheDocument());
    expect(screen.queryByRole("combobox", { name: "Audio stream" })).not.toBeInTheDocument();
  });
});
