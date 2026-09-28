import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { SettingsPanel } from "@/components/settings-panel";
import { SettingsProvider } from "@/components/settings-context";
import { defaultSettings, normalizeSettings } from "@/shared/contracts/settings";
import { SETTINGS_STORAGE_KEY } from "@/components/settings-storage";

describe("settings contract", () => {
  it("normalizes malformed persisted values to safe defaults", () => {
    expect(normalizeSettings({ appearance: { theme: "invalid" } })).toEqual(defaultSettings);
    expect(normalizeSettings(defaultSettings)).toEqual(defaultSettings);
  });
});

describe("settings panel", () => {
  beforeEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute("data-theme"); });

  it("renders all preference groups and persists an appearance change", async () => {
    const user = userEvent.setup();
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Playback" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Output" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accessibility" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Privacy and cleanup" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Theme" }), "light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}").appearance.theme).toBe("light");
  });

  it("requires exact-scope confirmation before cleanup", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("clearwave.outputs", "derived-output");
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    await user.click(screen.getByRole("button", { name: "Clear generated outputs" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("generated outputs");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.localStorage.getItem("clearwave.outputs")).toBe("derived-output");
    await user.click(screen.getByRole("button", { name: "Clear generated outputs" }));
    await user.click(screen.getByRole("button", { name: "Confirm cleanup" }));
    expect(window.localStorage.getItem("clearwave.outputs")).toBeNull();
    expect(screen.getByText("outputs cleared locally.")).toBeInTheDocument();
  });

  it("keeps playback and output preferences independently editable", async () => {
    const user = userEvent.setup();
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    await user.selectOptions(screen.getByRole("combobox", { name: "Seek interval" }), "30");
    await user.click(screen.getByRole("switch", { name: "Autoplay preview" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Default format" }), "mp4");
    await user.selectOptions(screen.getByRole("combobox", { name: "Overwrite confirmation" }), "ask");
    const saved = JSON.parse(window.localStorage.getItem("clearwave.settings.v1") ?? "{}");
    expect(saved.playback).toMatchObject({ seekInterval: "30", autoplayPreview: true });
    expect(saved.output).toMatchObject({ format: "mp4", overwriteConfirmation: "ask" });
  });

  it("falls back to defaults when persisted settings are malformed", async () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ appearance: { theme: "not-a-theme" } }));
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("system");
    expect(screen.getByRole("combobox", { name: "Default format" })).toHaveValue("audio-wav");
  });
});
