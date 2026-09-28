import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiagnosticsPanel, mergeBrowserCapabilities } from "@/components/diagnostics-panel";
import type { CapabilityReport } from "@/shared/contracts/capabilities";

const report: CapabilityReport = {
  generatedAt: "2026-09-29T00:00:00.000Z",
  requestId: "request-123",
  runtime: { nodeVersion: "v24.19.0", os: "win32", architecture: "x64" },
  items: [
    { id: "ffmpeg", label: "FFmpeg", status: "ready", summary: "Media inspection is available locally.", version: "9.0.2" },
    { id: "models", label: "Speech models", status: "unavailable", code: "MODEL_UNAVAILABLE", summary: "No local speech model manifest was found yet.", actionLabel: "Open setup guidance" },
    { id: "compute", label: "Compute", status: "limited", code: "ACCELERATOR_UNAVAILABLE", summary: "CPU-safe processing is ready; no optional accelerator was detected." },
    { id: "storage", label: "Local storage", status: "attention", code: "DISK_SPACE_LOW", summary: "Only 128 MB is available for temporary work and outputs.", actionLabel: "Open cleanup settings" },
    { id: "browser-directory", label: "Directory access", status: "limited", code: "BROWSER_LIMITATION", summary: "Use the supported save/download fallback." },
  ],
};

describe("DiagnosticsPanel", () => {
  it("shows actionable attention states and CPU fallback text", () => {
    const view = render(<DiagnosticsPanel initialReport={report} />);
    expect(view.getByRole("status")).toHaveTextContent("Local setup needs attention");
    expect(view.getByText(/CPU-safe processing is ready/i)).toBeInTheDocument();
    expect(view.getByText(/Open cleanup settings/i)).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "Browser" })).toBeInTheDocument();
  });

  it("offers a selectable report when clipboard access is unavailable", () => {
    const view = render(<DiagnosticsPanel initialReport={report} />);
    fireEvent.click(view.getByRole("button", { name: /copy diagnostics/i }));
    expect(view.getByLabelText(/select and copy this redacted report/i)).toBeInTheDocument();
    const fallback = view.getByLabelText(/select and copy this redacted report/i);
    expect(fallback).toHaveAttribute("readonly");
    expect((fallback as HTMLTextAreaElement).value).toContain("request-123");
  });

  it("enriches a server report with the browser capability fallback", () => {
    const merged = mergeBrowserCapabilities({ ...report, items: report.items.filter((item) => !item.id.startsWith("browser-")) });
    expect(merged.items.some((item) => item.id === "browser-directory")).toBe(true);
    expect(merged.items.some((item) => item.id === "browser-clipboard")).toBe(true);
  });

  it("does not treat an undefined browser API property as supported", () => {
    Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined });
    const merged = mergeBrowserCapabilities({ ...report, items: report.items.filter((item) => !item.id.startsWith("browser-")) });
    expect(merged.items.find((item) => item.id === "browser-directory")).toMatchObject({ status: "limited", code: "BROWSER_LIMITATION" });
  });

  it("shows a recoverable error when the diagnostics endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ data: null, error: { code: "RUNTIME_CHECK_FAILED", message: "failed" }, requestId: "request-3" }) }));
    const view = render(<DiagnosticsPanel />);
    expect(await view.findByRole("alert")).toHaveTextContent(/could not be completed/i);
    expect(view.getByRole("heading", { name: "Browser" })).toBeInTheDocument();
  });
});
