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

  it("uses the video source-container default or explicit MP4 fallback", async () => {
    const user = userEvent.setup();
    const view = render(<OutputProfilePanel mediaRef="local:meeting.mov" sourceName="meeting.mov" sourceFormat="mov" mediaKind="video" />);
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("source-video");
    view.unmount();
    render(<OutputProfilePanel mediaRef="local:meeting.mov" sourceName="meeting.mov" sourceFormat="mov" mediaKind="video" supportsSourceContainer={false} />);
    expect(screen.getByRole("combobox", { name: "Output format" })).toHaveValue("mp4");
    expect(screen.getByText(/H.264 video and AAC audio/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Output format" }), "mp4");
    expect(screen.getByText(/MP4 · H.264\/AAC fallback/, { selector: "p" })).toBeInTheDocument();
  });

  it("blocks an existing target until overwrite is explicitly confirmed", async () => {
    const user = userEvent.setup();
    render(<OutputProfilePanel {...baseProps} targetName="voice-enhanced.wav" targetExists />);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("voice-enhanced.wav");
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Confirm overwrite/ }));
    expect(screen.getByRole("button", { name: "Output profile ready" })).toBeEnabled();
  });

  it("updates only the output portion of the typed draft", async () => {
    const user = userEvent.setup(); const onProfileChange = vi.fn();
    render(<OutputProfilePanel {...baseProps} onProfileChange={onProfileChange} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Output format" }), "audio-mp3");
    await user.selectOptions(screen.getByRole("combobox", { name: "Output quality" }), "standard");
    expect(screen.getByText(/MP3 · 192 kbps/, { selector: "p" })).toBeInTheDocument();
    const latest = onProfileChange.mock.lastCall?.[0];
    expect(latest.output.format).toBe("audio-mp3");
    expect(latest.output.quality).toBe("standard");
    expect(latest.mediaRef).toBe("local:voice.wav");
    expect(latest.stages).toHaveLength(4);
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
