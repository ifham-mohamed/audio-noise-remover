import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EffectInspector } from "@/features/editor/effect-inspector";

describe("effect inspector", () => {
  it("defaults voice clarity off while keeping the independent control available", () => {
    render(<EffectInspector mediaRef="local:interview" />);
    expect(screen.getByRole("heading", { name: "Tune the enhancement stages" })).toBeInTheDocument();
    expect(screen.getAllByRole("article").slice(-4).map((article) => article.querySelector("h3")?.textContent)).toEqual(["Noise removal", "Voice clarity", "Loudness normalization", "Echo/reverb reduction"]);
    expect(screen.getByText(/1\. Noise removal/)).not.toHaveTextContent("2. Voice clarity");
    expect(screen.getByRole("switch", { name: "Noise removal enabled" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Echo/reverb reduction enabled" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Echo/reverb reduction enabled" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Loudness normalization enabled" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Loudness normalization enabled" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/has not passed the production quality gate/)).toBeInTheDocument();
  });

  it("enables loudness and conservative reverb independently and resets them to off", async () => {
    const user = userEvent.setup();
    render(<EffectInspector mediaRef="local:interview" />);
    expect(screen.getByText(/gated integrated loudness measurement and peak-constrained gain/)).toBeInTheDocument();
    expect(screen.getByText(/Experimental conservative reflection suppression/)).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Loudness normalization enabled" }));
    await user.click(screen.getByRole("switch", { name: "Echo/reverb reduction enabled" }));
    expect(screen.getByText(/1\. Noise removal/)).toHaveTextContent("Loudness normalization");
    expect(screen.getByText(/1\. Noise removal/)).toHaveTextContent("Echo/reverb reduction");
    expect(screen.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getAllByRole("button", { name: "Reset" })[2]);
    await user.click(screen.getAllByRole("button", { name: "Reset" })[3]);
    expect(screen.getByRole("switch", { name: "Loudness normalization enabled" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Echo/reverb reduction enabled" })).toHaveAttribute("aria-checked", "false");
  });

  it("keeps voice clarity available when resetting its independent intensity", async () => {
    const user = userEvent.setup();
    render(<EffectInspector mediaRef="local:interview" />);
    await user.click(screen.getAllByRole("button", { name: "Reset" })[1]);
    expect(screen.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  });

  it("updates only the chosen stage, resets it, and omits disabled stages", async () => {
    const user = userEvent.setup();
    render(<EffectInspector mediaRef="local:interview" capabilities={{ "noise-removal": { status: "ready", cpuSafe: true }, "voice-clarity": { status: "ready", cpuSafe: true } }} />);
    await user.click(screen.getByRole("switch", { name: "Voice clarity enabled" }));
    await user.click(screen.getByRole("switch", { name: "Noise removal enabled" }));
    expect(screen.getByText(/1\. Voice clarity/)).toBeInTheDocument();
    const clarity = screen.getByLabelText("Voice clarity · % intensity");
    await user.click(clarity);
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByText("60%", { selector: "output" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Reset" })[1]);
    expect(screen.getByText("50%", { selector: "output" })).toBeInTheDocument();
  });

  it("blocks activation when a required capability is unavailable", async () => {
    const user = userEvent.setup();
    render(<EffectInspector mediaRef="local:interview" capabilities={{ "noise-removal": { status: "unavailable", cpuSafe: false, message: "Install the local speech model." } }} />);
    const toggle = screen.getByRole("switch", { name: "Noise removal enabled" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Install the local speech model.")).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("shows future profiles and their stages as unavailable without adding runnable controls", () => {
    render(<EffectInspector mediaRef="local:interview" />);
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mixed audio" })).toBeInTheDocument();
    expect(screen.getByText("Music denoising")).toBeInTheDocument();
    expect(screen.getByText("Speech and music separation")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  });
});
