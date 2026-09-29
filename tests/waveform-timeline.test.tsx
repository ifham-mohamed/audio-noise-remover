import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaveformTimeline } from "@/features/editor/waveform-timeline";

describe("waveform timeline", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("renders semantic timeline details and a usable text fallback", () => {
    render(<WaveformTimeline durationSeconds={75} />);
    expect(screen.getByRole("heading", { name: "Audio timeline" })).toBeInTheDocument();
    expect(screen.getByLabelText("Waveform overview")).toBeInTheDocument();
    expect(screen.getByLabelText("Seek through audio")).toHaveValue("0");
    expect(screen.getByText("Preview bounds: 0:00 – 1:15")).toBeInTheDocument();
    expect(screen.getByText("Current time").parentElement).toHaveTextContent("0:00 / 1:15");
  });

  it("clamps text and range seeking and supports keyboard seeking", async () => {
    const user = userEvent.setup();
    render(<WaveformTimeline durationSeconds={30} />);
    const time = screen.getByLabelText("Go to seconds");
    await user.clear(time); await user.type(time, "99");
    expect(time).toHaveValue(30);
    const timeline = screen.getByRole("region", { name: "Audio timeline" });
    timeline.focus(); await user.keyboard("{ArrowLeft}");
    expect(screen.getByLabelText("Go to seconds")).toHaveValue(25);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("Go to seconds")).toHaveValue(30);
  });

  it("keeps empty duration safe and does not treat input Space as playback", async () => {
    const user = userEvent.setup();
    render(<WaveformTimeline durationSeconds={0} />);
    expect(screen.getByText(/usable duration was not reported/)).toBeInTheDocument();
    expect(screen.getByLabelText("Seek through audio")).toBeDisabled();
    const time = screen.getByLabelText("Go to seconds");
    time.focus(); await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Play local audio" })).toHaveTextContent("Play");
  });

  it("keeps current-time feedback while reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<WaveformTimeline durationSeconds={20} />);
    expect(screen.getByRole("region", { name: "Audio timeline" })).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByText("Current time").parentElement).toHaveTextContent("0:00 / 0:20");
  });

  it("toggles mute and exposes local playback when a file URL is available", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:local-audio") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    render(<WaveformTimeline file={new File(["audio"], "voice.wav", { type: "audio/wav" })} durationSeconds={12} />);
    const mute = screen.getByRole("button", { name: "Mute local audio" });
    await user.click(mute);
    expect(screen.getByRole("button", { name: "Unmute local audio" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Play local audio" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
