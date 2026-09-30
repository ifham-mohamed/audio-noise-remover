import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OutputProfilePanel } from "@/features/editor/output-profile";

const baseProps = { mediaRef: "local:voice.wav", sourceName: "voice.wav", sourceFormat: "wav", mediaKind: "audio" as const };

describe("output profile panel", () => {
  it("shows explicit audio defaults and browser destination fallback", () => {
    render(<OutputProfilePanel {...baseProps} />);
    expect(screen.getByRole("heading", { name: "Where should this go?" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("audio-wav");
    expect(screen.getByText(/48 kHz sample rate/)).toBeInTheDocument();
    expect(screen.getByText(/browser save flow/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
  });

  it("shows declared video profiles as unavailable until their final encode paths are implemented", () => {
    const view = render(<OutputProfilePanel mediaRef="local:meeting.mov" sourceName="meeting.mov" sourceFormat="mov" mediaKind="video" />);
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("source-video");
    expect(screen.getByRole("option", { name: "Source container · AAC 192 kbps" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output path unavailable" })).toBeDisabled();
    expect(screen.getByText(/Final video export is not implemented yet/)).toBeInTheDocument();
    view.unmount();
    render(<OutputProfilePanel mediaRef="local:meeting.mov" sourceName="meeting.mov" sourceFormat="mov" mediaKind="video" supportsSourceContainer={false} />);
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("mp4");
    expect(screen.getByRole("option", { name: "MP4 · H.264/AAC fallback" })).toBeDisabled();
    expect(screen.getByText(/no video stream will be encoded or replaced/)).toBeInTheDocument();
  });

  it("blocks an existing target until overwrite is explicitly confirmed", async () => {
    const user = userEvent.setup();
    render(<OutputProfilePanel {...baseProps} targetName="voice-enhanced.wav" targetExists />);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("voice-enhanced.wav");
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Confirm overwrite/ }));
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
  });

  it("keeps compressed audio and quality settings unavailable until encoding is verified", async () => {
    const user = userEvent.setup(); const onProfileChange = vi.fn();
    render(<OutputProfilePanel {...baseProps} onProfileChange={onProfileChange} />);
    expect(screen.getByRole("option", { name: "FLAC · lossless · not available yet" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "MP3 · 192 kbps · not available yet" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "M4A · AAC 192 kbps · not available yet" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Output quality" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Output format" }), "audio-mp3");
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("audio-wav");
    expect(onProfileChange).not.toHaveBeenCalled();
  });

  it("rejects using the original source as the output target without writing anything", async () => {
    const user = userEvent.setup(); const onProfileChange = vi.fn();
    render(<OutputProfilePanel {...baseProps} onProfileChange={onProfileChange} />);
    const name = screen.getByRole("textbox", { name: "Output name" });
    await user.clear(name); await user.type(name, "voice.wav");
    expect(screen.getByRole("alert")).toHaveTextContent("original source");
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeDisabled();
    expect(onProfileChange).toHaveBeenCalled();
  });
});
