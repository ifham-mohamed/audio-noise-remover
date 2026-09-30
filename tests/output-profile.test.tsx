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

  it("preserves the source video container and discloses omitted tracks and MP4 compatibility", () => {
    const view = render(<OutputProfilePanel mediaRef="local:meeting.mov" sourceName="meeting.mov" sourceFormat="mov" mediaKind="video" />);
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("source-video");
    expect(screen.getByRole("option", { name: "Source container · AAC 192 kbps" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Output name" })).toHaveValue("enhanced-output.mov");
    expect(screen.getByText(/Other audio, subtitle, data, and attachment tracks are omitted/)).toBeInTheDocument();
    view.unmount();
    render(<OutputProfilePanel mediaRef="local:meeting.mov" sourceName="meeting.mov" sourceFormat="mov" mediaKind="video" supportsSourceContainer={false} />);
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("mp4");
    expect(screen.getByRole("option", { name: "MP4 original video + AAC" })).toBeEnabled();
    expect(screen.getByText(/incompatible streams fail safely without H.264 re-encoding/)).toBeInTheDocument();
  });

  it("blocks an existing target until overwrite is explicitly confirmed", async () => {
    const user = userEvent.setup();
    render(<OutputProfilePanel {...baseProps} targetName="voice-enhanced.wav" targetExists />);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("voice-enhanced.wav");
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Confirm overwrite/ }));
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
  });

  it("enables audio formats with explicit codecs, names, and fixed encoding quality", async () => {
    const user = userEvent.setup(); const onProfileChange = vi.fn();
    render(<OutputProfilePanel {...baseProps} onProfileChange={onProfileChange} />);
    expect(screen.getByRole("option", { name: "FLAC · lossless" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "MP3 · 192 kbps" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "M4A · AAC 192 kbps" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Output quality" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
    for (const [format, extension, codec, bitrate] of [["audio-flac", "flac", "flac", undefined], ["audio-mp3", "mp3", "mp3", 192], ["audio-m4a", "m4a", "aac", 192], ["audio-wav", "wav", "pcm_s24le", undefined]] as const) {
      await user.selectOptions(screen.getByRole("combobox", { name: "Output format" }), format);
      expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue(format);
      expect(screen.getByRole("textbox", { name: "Output name" })).toHaveValue(`voice-enhanced.${extension}`);
      expect(onProfileChange.mock.lastCall?.[0].output).toMatchObject({ format, audioCodec: codec, audioBitrateKbps: bitrate });
      expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
    }
  });

  it.each(["mov", "mkv", "mp4"])("uses the %s source extension and original video codec when changing containers", async (sourceFormat) => {
    const onProfileChange = vi.fn();
    const user = userEvent.setup();
    render(<OutputProfilePanel mediaRef="local:meeting" sourceName={`meeting.${sourceFormat}`} sourceFormat={sourceFormat} mediaKind="video" onProfileChange={onProfileChange} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Output format" }), "mp4");
    await user.selectOptions(screen.getByRole("combobox", { name: "Output format" }), "source-video");
    expect(screen.getByRole("textbox", { name: "Output name" })).toHaveValue(`meeting-enhanced.${sourceFormat}`);
    expect(onProfileChange.mock.lastCall?.[0].output).toMatchObject({ videoCodec: "source", audioCodec: "aac", audioBitrateKbps: 192 });
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
