import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntakePanel } from "@/features/intake/intake-panel";
import type { MediaInspection } from "@/shared/contracts/media";

const inspectionMock = vi.hoisted(() => ({ inspectLocalMedia: vi.fn<(file: File) => Promise<MediaInspection>>() }));
vi.mock("@/features/intake/media-inspection", () => inspectionMock);

const readyResult: MediaInspection = { status: "ready", metadata: { sourceName: "interview.wav", sourceRef: "local:interview.wav:12:1", format: "wav", mediaKind: "audio", sizeBytes: 12, durationSeconds: 75, audioStream: { present: true, summary: "Audio stream ready" } } };

function fileInput() { return document.querySelector<HTMLInputElement>("input[type=file]")!; }

describe("intake panel", () => {
  beforeEach(() => { inspectionMock.inspectLocalMedia.mockReset(); });

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
    await waitFor(() => expect(screen.getByText("1:15")).toBeInTheDocument());
    expect(screen.getByText("12 B")).toBeInTheDocument();
    expect(screen.getByText("Local source")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("button", { name: "Choose a local audio or video file" })).toBeInTheDocument();
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

  it("offers diagnostics when the local inspector is unavailable", async () => {
    inspectionMock.inspectLocalMedia.mockResolvedValue({ status: "error", code: "INSPECTION_UNAVAILABLE", message: "Local inspection is unavailable." });
    const user = userEvent.setup();
    render(<IntakePanel />);
    await user.upload(fileInput(), new File(["audio"], "interview.wav", { type: "audio/wav" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Open local diagnostics" })).toHaveAttribute("href", "/settings#diagnostics"));
  });
});
