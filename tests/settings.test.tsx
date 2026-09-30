import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SettingsPanel } from "@/components/settings-panel";
import { SettingsProvider } from "@/components/settings-context";
import { defaultSettings, normalizeSettings } from "@/shared/contracts/settings";
import { SETTINGS_STORAGE_KEY } from "@/components/settings-storage";
import * as finalArtifactStore from "@/features/final/final-artifact-store";
import { openFinalOutput, openFinalSource, retainFinalOutput, saveFinalSource } from "@/features/final/final-artifact-store";

function makeWav() {
  const frames = 48_000; const bytes = new ArrayBuffer(44 + frames * 6); const view = new DataView(bytes);
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, 48_000, true); view.setUint32(28, 288_000, true); view.setUint16(32, 6, true); view.setUint16(34, 24, true); text(36, "data"); view.setUint32(40, frames * 6, true);
  return new Blob([bytes], { type: "audio/wav" });
}

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

  it("requires confirmation and reports completion without deleting unrelated localStorage", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("indexedDB", new IDBFactory());
    window.localStorage.setItem("unrelated.preference", "keep");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: { finalJobs: [], previewJobs: [] }, error: null, requestId: "00000000-0000-4000-8000-000000000099" }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: { token: "00000000-0000-4000-8000-000000000019" } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: { scope: "REMOVE_OUTPUTS", items: [], complete: true } }) }));
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    await user.click(screen.getByRole("button", { name: "Clear outputs" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("final output bytes only");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.localStorage.getItem("unrelated.preference")).toBe("keep");
    await user.click(screen.getByRole("button", { name: "Clear outputs" }));
    await user.click(screen.getByRole("button", { name: "Confirm cleanup" }));
    expect(await screen.findByText(/Cleanup complete/)).toBeInTheDocument();
    expect(window.localStorage.getItem("unrelated.preference")).toBe("keep");
    vi.unstubAllGlobals();
  });

  it("announces partial failures by item", async () => {
    const user = userEvent.setup();
    const artifactId = "00000000-0000-4000-8000-000000000095";
    vi.spyOn(finalArtifactStore, "listFinalArtifactIds").mockResolvedValue([artifactId]);
    vi.spyOn(finalArtifactStore, "removeFinalOutputs").mockResolvedValue([{ id: artifactId, removed: false, error: "storage failure" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: { finalJobs: [], previewJobs: [] }, error: null, requestId: "00000000-0000-4000-8000-000000000099" }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: { token: "00000000-0000-4000-8000-000000000019" } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: { scope: "REMOVE_OUTPUTS", complete: false, items: [{ id: artifactId, kind: "output", outcome: "failed", message: "Local artifact removal failed; linked history was retained." }] } }) }));
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    await user.click(screen.getByRole("button", { name: "Clear outputs" }));
    await user.click(screen.getByRole("button", { name: "Confirm cleanup" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Cleanup incomplete");
    expect(screen.getByRole("list", { name: "Cleanup item results" })).toHaveTextContent(`output: ${artifactId} — failed`);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("removes a real app-managed output artifact after exact-scope confirmation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("indexedDB", new IDBFactory());
    const artifactId = "00000000-0000-4000-8000-000000000098";
    const blob = makeWav();
    await retainFinalOutput(artifactId, blob, { fileName: "enhanced.wav", mimeType: "audio/wav", durationSeconds: 1 });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return { ok: true, json: async () => ({ data: { finalJobs: [], previewJobs: [] }, error: null, requestId: "00000000-0000-4000-8000-000000000099" }) };
      const body = JSON.parse(String(init.body));
      if (body.phase === "prepare") return { ok: true, json: async () => ({ data: { token: "00000000-0000-4000-8000-000000000020" } }) };
      return { ok: true, json: async () => ({ data: { scope: "REMOVE_OUTPUTS", complete: true, items: [{ id: artifactId, kind: "output", outcome: "removed", message: "Final output removed." }] } }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    await user.click(screen.getByRole("button", { name: "Clear outputs" }));
    await user.click(screen.getByRole("button", { name: "Confirm cleanup" }));
    expect(await screen.findByText(/Cleanup complete/)).toBeInTheDocument();
    expect(await openFinalOutput(artifactId)).toBeUndefined();
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).removedOutputIds).toEqual([artifactId]);
    vi.unstubAllGlobals();
  });

  it("clears orphaned app-managed retry copies in the all-generated-files scope", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("indexedDB", new IDBFactory());
    const sourceRef = "local:orphan-retry-copy:10:2";
    await saveFinalSource(sourceRef, new File(["retained retry bytes"], "retry.wav", { type: "audio/wav" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: { finalJobs: [], previewJobs: [] }, error: null, requestId: "00000000-0000-4000-8000-000000000099" }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: { token: "00000000-0000-4000-8000-000000000021" } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: { scope: "REMOVE_ALL", items: [{ id: sourceRef, kind: "retry-source", outcome: "removed", message: "App-retained source copy removed." }], complete: true } }) }));
    render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    await user.click(screen.getByRole("button", { name: "Clear all generated files" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("retained retry-source copies");
    await user.click(screen.getByRole("button", { name: "Confirm cleanup" }));
    expect(await screen.findByText(/Cleanup complete/)).toBeInTheDocument();
    expect(await openFinalSource(sourceRef)).toBeUndefined();
    vi.unstubAllGlobals();
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
