import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinalOutputReview } from "@/features/editor/final-output-review";
import type { FinalJobOutput } from "@/shared/contracts/final-job";

const openOutput = vi.hoisted(() => vi.fn());
vi.mock("@/features/final/final-artifact-store", () => ({ openFinalOutput: openOutput }));
const base: FinalJobOutput = { artifactId: "00000000-0000-4000-8000-000000000099", fileName: "result.wav", mimeType: "audio/wav", sizeBytes: 48, durationSeconds: 1, mediaValidated: true, experimental: true };
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:final-output") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup(); openOutput.mockReset(); vi.restoreAllMocks();
  for (const [key, descriptor] of [["createObjectURL", originalCreateObjectURL], ["revokeObjectURL", originalRevokeObjectURL]] as const) {
    if (descriptor) Object.defineProperty(URL, key, descriptor);
    else Reflect.deleteProperty(URL, key);
  }
});

describe("final output review", () => {
  it.each([
    ["audio/wav", "WAV", "wav"], ["audio/flac", "FLAC", "flac"], ["audio/mpeg", "MP3", "mp3"], ["audio/mp4", "M4A", "m4a"],
    ["video/mp4", "MP4", "mp4"], ["video/quicktime", "MOV", "mov"], ["video/x-matroska", "MKV", "mkv"],
  ] as const)("reviews and downloads validated %s with its actual file name", async (mimeType, label, extension) => {
    const expected = { ...base, mimeType, fileName: `enhanced.${extension}` };
    const blob = new Blob([new Uint8Array(48)], { type: mimeType });
    openOutput.mockResolvedValue({ ...expected, blob });
    let savedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { savedName = this.download; });
    const { container, unmount } = render(<FinalOutputReview expected={expected} />);
    const save = await screen.findByRole("button", { name: `Download ${label}` });
    const video = mimeType.startsWith("video/");
    expect(container.querySelector(video ? "video" : "audio")).toHaveAttribute("src", "blob:final-output");
    expect(container.querySelector(video ? "audio" : "video")).toBeNull();
    if (video) expect(screen.getByText(/Browser playback depends on support for the preserved video codec/)).toBeInTheDocument();
    fireEvent.click(save);
    expect(savedName).toBe(`enhanced.${extension}`);
    expect(screen.getByRole("status")).toHaveTextContent(`The validated ${label} download has started`);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:final-output");
  });

  it("offers save after browser video playback fails", async () => {
    const expected = { ...base, mimeType: "video/x-matroska" as const, fileName: "enhanced.mkv" };
    openOutput.mockResolvedValue({ ...expected, blob: new Blob([new Uint8Array(48)]) });
    render(<FinalOutputReview expected={expected} />);
    await screen.findByRole("button", { name: "Download MKV" });
    fireEvent.error(screen.getByLabelText("Watch the validated local video output"));
    expect(screen.getByRole("status")).toHaveTextContent("Download the validated file and open it in a compatible local player");
    expect(screen.getByRole("button", { name: "Download MKV" })).toBeEnabled();
  });

  it.each([undefined, { ...base, fileName: "wrong.wav" }])("does not present missing or mismatched output as a success", async (artifact) => {
    openOutput.mockResolvedValue(artifact && { ...artifact, blob: new Blob([new Uint8Array(48)]) });
    render(<FinalOutputReview expected={base} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Download WAV" })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
