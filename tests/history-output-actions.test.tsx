import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryOutputActions } from "@/features/history/history-output-actions";
import type { FinalJobOutput } from "@/shared/contracts/final-job";

const openOutput = vi.hoisted(() => vi.fn());
vi.mock("@/features/final/final-artifact-store", () => ({ openFinalOutput: openOutput }));

const output: FinalJobOutput = { artifactId: "00000000-0000-4000-8000-000000000099", fileName: "result.wav", mimeType: "audio/wav", sizeBytes: 48, durationSeconds: 1, mediaValidated: true, experimental: true };
const retained = { ...output, blob: new Blob([new Uint8Array(48)], { type: "audio/wav" }) };
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalPicker = Object.getOwnPropertyDescriptor(window, "showSaveFilePicker");
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform");
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); openOutput.mockReset();
  for (const [target, key, descriptor] of [[navigator, "clipboard", originalClipboard], [window, "showSaveFilePicker", originalPicker], [navigator, "platform", originalPlatform], [URL, "createObjectURL", originalCreateObjectURL], [URL, "revokeObjectURL", originalRevokeObjectURL]] as const) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

describe("history output actions", () => {
  it("validates retained bytes and offers browser save while explaining unavailable folder/path actions", async () => {
    openOutput.mockResolvedValue(retained);
    render(<HistoryOutputActions expected={output} />);
    const actions = await screen.findByLabelText("Local output actions");
    expect(within(actions).getByRole("button", { name: "Download WAV" })).toBeEnabled();
    expect(within(actions).getByRole("button", { name: "Copy output name" })).toBeEnabled();
    expect(within(actions).getByRole("button", { name: "Copy output path" })).toBeDisabled();
    expect(within(actions).getByRole("button", { name: "Show in folder" })).toBeDisabled();
    expect(within(actions).getByText(/cannot reveal a local folder/i)).toBeInTheDocument();
    expect(within(actions).getByText(/does not expose its full device path/i)).toBeInTheDocument();
  });

  it("disables download when the browser lacks a safe download capability", async () => {
    openOutput.mockResolvedValue(retained);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: undefined });
    render(<HistoryOutputActions expected={output} />);
    const actions = await screen.findByLabelText("Local output actions");
    await waitFor(() => expect(within(actions).getByRole("button", { name: "Download WAV" })).toBeDisabled());
    expect(within(actions).getByText(/does not support a safe local download/i)).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Copy output name" })).toBeEnabled();
  });

  it.each(["Win32", "MacIntel", "Linux x86_64"])("keeps browser actions capability-based on %s", async (platform) => {
    openOutput.mockResolvedValue(retained);
    Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
    render(<HistoryOutputActions expected={output} />);
    const actions = await screen.findByLabelText("Local output actions");
    expect(within(actions).getByRole("button", { name: "Download WAV" })).toBeEnabled();
    expect(within(actions).getByText(new RegExp(`${platform} handles downloads`))).toBeInTheDocument();
  });

  it("does not offer a save for a missing or mismatched local artifact", async () => {
    openOutput.mockResolvedValue(undefined);
    render(<HistoryOutputActions expected={output} />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/not available or no longer matches/i));
    expect(screen.queryByRole("button", { name: "Download WAV" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/No source media is used as a substitute/);
  });

  it.each([
    { fileName: "different.wav" },
    { mimeType: "audio/mpeg" },
    { sizeBytes: 49 },
    { durationSeconds: 2 },
  ])("rejects artifact metadata mismatch %# before enabling save", async (mismatch) => {
    openOutput.mockResolvedValue({ ...retained, ...mismatch });
    render(<HistoryOutputActions expected={output} />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/not available or no longer matches/i));
    expect(screen.queryByRole("button", { name: "Download WAV" })).not.toBeInTheDocument();
  });

  it("removes save controls when local bytes disappear before download", async () => {
    openOutput.mockResolvedValueOnce(retained).mockResolvedValueOnce(undefined);
    render(<HistoryOutputActions expected={output} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download WAV" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/no longer available/i));
    expect(screen.queryByRole("button", { name: "Download WAV" })).not.toBeInTheDocument();
  });

  it("starts a download with the validated artifact name and keeps its object URL until unmount", async () => {
    openOutput.mockResolvedValue(retained);
    const createObjectURL = vi.fn().mockReturnValue("blob:validated-output");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    let downloadedName = "";
    let downloadedUrl = "";
    const showSaveFilePicker = vi.fn();
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: showSaveFilePicker });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloadedName = this.download; downloadedUrl = this.href; });
    const view = render(<HistoryOutputActions expected={output} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download WAV" }));
    await waitFor(() => expect(downloadedName).toBe("result.wav"));
    expect(downloadedUrl).toBe("blob:validated-output");
    expect(createObjectURL).toHaveBeenCalledWith(retained.blob);
    expect(showSaveFilePicker).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/browser has been asked to download this WAV/i);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:validated-output");
  });

  it("releases the old artifact URL when the history record changes", async () => {
    const nextOutput: FinalJobOutput = { ...output, artifactId: "00000000-0000-4000-8000-000000000100", fileName: "next.wav" };
    const nextRetained = { ...nextOutput, blob: new Blob([new Uint8Array(49)], { type: "audio/wav" }) };
    openOutput.mockResolvedValueOnce(retained).mockResolvedValueOnce(retained).mockResolvedValueOnce(nextRetained).mockResolvedValueOnce(nextRetained);
    const createObjectURL = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:next");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    let href = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { href = this.href; });
    const view = render(<HistoryOutputActions expected={output} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download WAV" }));
    await waitFor(() => expect(href).toBe("blob:first"));
    view.rerender(<HistoryOutputActions expected={nextOutput} />);
    await waitFor(() => expect(openOutput).toHaveBeenCalledTimes(3));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    fireEvent.click(await screen.findByRole("button", { name: "Download WAV" }));
    await waitFor(() => expect(href).toBe("blob:next"));
    expect(createObjectURL).toHaveBeenLastCalledWith(nextRetained.blob);
  });

  it("copies only the output filename and reports browser path privacy", async () => {
    openOutput.mockResolvedValue(retained);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<HistoryOutputActions expected={output} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy output name" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("result.wav"));
    expect(screen.getByRole("status")).toHaveTextContent(/do not expose the saved file’s full device path/i);
  });

  it("uses a selectable filename fallback when clipboard permission is unavailable", async () => {
    openOutput.mockResolvedValue(retained);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<HistoryOutputActions expected={output} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy output name" }));
    expect(screen.getByRole("textbox", { name: "Selectable output file name" })).toHaveValue("result.wav");
    expect(screen.getByRole("status")).toHaveTextContent(/select and copy the output file name/i);
  });
});
