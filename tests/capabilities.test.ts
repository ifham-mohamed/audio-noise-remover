import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { render, within } from "@testing-library/react";
import { createElement } from "react";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";
import { buildDiagnosticText } from "@/shared/contracts/capabilities";
import { createCapabilityDetector } from "@/server/adapters/capability-detector";

const baseOptions = {
  now: () => new Date("2026-09-29T00:00:00.000Z"),
  cwd: "C:/clearwave",
  runCommand: async () => "ffmpeg version 9.0.2-full_build",
  inspectBrowserRuntime: async () => ({ version: "5.1.4" }),
  inspectStorage: async () => ({ writable: true, availableBytes: 20 * 1024 * 1024 * 1024 }),
  modelManifest: async () => ({ version: "speech-v0.1", license: "local fixture license" }),
  platform: "win32" as NodeJS.Platform,
  architecture: "x64",
  nodeVersion: "v24.19.0",
};

describe("local capability detector", () => {
  it("reports a ready local runtime with safe summaries", async () => {
    const report = await createCapabilityDetector({ ...baseOptions, accelerationProvider: "CPU" }).detect();

    expect(report.runtime).toEqual({ nodeVersion: "v24.19.0", os: "win32", architecture: "x64" });
    expect(report.items.find((item) => item.id === "ffmpeg")).toMatchObject({ status: "ready", version: "5.1.4" });
    expect(report.items.find((item) => item.id === "native-ffmpeg")).toMatchObject({ status: "ready", version: "9.0.2-full_build" });
    expect(report.items.find((item) => item.id === "models")).toMatchObject({ status: "ready", version: "speech-v0.1" });
    expect(report.items.find((item) => item.id === "models")?.summary).toMatch(/experimental.*does not establish production qualification/i);
    expect(report.items.find((item) => item.id === "storage")).toMatchObject({ status: "ready" });
    expect(report.items.find((item) => item.id === "compute")).toMatchObject({ status: "ready" });
  });

  it("identifies CPU as the safe fallback when acceleration is unavailable", async () => {
    const report = await createCapabilityDetector({ ...baseOptions, accelerationProvider: null }).detect();
    expect(report.items.find((item) => item.id === "compute")).toMatchObject({ status: "limited", code: "ACCELERATOR_UNAVAILABLE" });
    expect(report.items.find((item) => item.id === "compute")?.summary).toMatch(/CPU-safe/);
  });

  it.each([
    ["Windows", "win32" as NodeJS.Platform],
    ["macOS", "darwin" as NodeJS.Platform],
    ["Linux", "linux" as NodeJS.Platform],
  ])("reports %s runtime identity for cross-platform capability decisions", async (_label, platform) => {
    const report = await createCapabilityDetector({ ...baseOptions, platform }).detect();
    expect(report.runtime.os).toBe(platform);
  });

  it("reports missing tools and low storage without exposing command output", async () => {
    const report = await createCapabilityDetector({
      ...baseOptions,
      runCommand: async () => { throw new Error("SECRET_COMMAND_OUTPUT"); },
      modelManifest: async () => null,
      inspectStorage: async () => ({ writable: true, availableBytes: 128 * 1024 * 1024 }),
    }).detect();

    expect(report.items.find((item) => item.id === "ffmpeg")).toMatchObject({ status: "ready", version: "5.1.4" });
    expect(report.items.find((item) => item.id === "native-ffmpeg")).toMatchObject({ status: "limited", code: "FFMPEG_UNAVAILABLE" });
    expect(report.items.find((item) => item.id === "models")).toMatchObject({ status: "unavailable", code: "MODEL_UNAVAILABLE" });
    expect(report.items.find((item) => item.id === "storage")).toMatchObject({ status: "attention", code: "DISK_SPACE_LOW" });
    expect(JSON.stringify(report)).not.toContain("SECRET_COMMAND_OUTPUT");
  });

  it.each([null, { version: "9.0.2" }])("does not substitute native FFmpeg for an unavailable or incorrect browser runtime", async (browserRuntime) => {
    const report = await createCapabilityDetector({ ...baseOptions, inspectBrowserRuntime: async () => browserRuntime }).detect();
    expect(report.items.find((item) => item.id === "ffmpeg")).toMatchObject({ status: "unavailable", code: "FFMPEG_UNAVAILABLE" });
    expect(report.items.find((item) => item.id === "native-ffmpeg")?.status).toBe("ready");
  });

  it("redacts browser inspection failures", async () => {
    const report = await createCapabilityDetector({ ...baseOptions, inspectBrowserRuntime: async () => { throw new Error("SECRET_RUNTIME_PATH"); } }).detect();
    expect(report.items.find((item) => item.id === "ffmpeg")?.status).toBe("unavailable");
    expect(JSON.stringify(report)).not.toContain("SECRET_RUNTIME_PATH");
  });

  it("shows optional native diagnostics without flagging media tools for setup attention", async () => {
    const report = await createCapabilityDetector({ ...baseOptions, runCommand: async () => { throw new Error("missing"); } }).detect();
    const view = render(createElement(DiagnosticsPanel, { initialReport: report }));
    const group = view.getByRole("heading", { name: "Media tools" }).closest("section")!;
    expect(within(group).getByRole("heading", { name: "Browser FFmpeg" })).toBeInTheDocument();
    expect(within(group).getByRole("heading", { name: "Native FFmpeg (optional)" })).toBeInTheDocument();
    // Browser API limitations in the test environment can independently need attention.
    expect(view.queryByRole("status")).not.toHaveTextContent("Native FFmpeg");
    expect(report.items.filter((item) => item.status === "attention" || item.status === "unavailable")).toEqual([]);
  });

  it("verifies actual bundled files against the checked-in manifest", async () => {
    const report = await createCapabilityDetector({ ...baseOptions, cwd: process.cwd(), inspectBrowserRuntime: undefined }).detect();
    expect(report.items.find((item) => item.id === "ffmpeg")).toMatchObject({ status: "ready", version: "5.1.4" });
  });

  it.each(["valid", "missing-manifest", "malformed-manifest", "missing-core", "changed-js", "changed-wasm", "wrong-version", "unsafe-file"])("checks local runtime integrity: %s", async (scenario) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clearwave-runtime-test-"));
    try {
      const directory = path.join(cwd, "public", "ffmpeg");
      await mkdir(directory, { recursive: true });
      const js = "fixture js";
      const wasm = "fixture wasm";
      const hash = (value: string) => createHash("sha256").update(value).digest("hex");
      const manifest = { version: scenario === "wrong-version" ? "9.0.2" : "5.1.4", files: { "ffmpeg-core.js": hash(js), "ffmpeg-core.wasm": hash(wasm) } };
      if (scenario === "unsafe-file") Object.assign(manifest.files, { "../outside": hash(js) });
      if (scenario !== "missing-manifest") await writeFile(path.join(directory, "runtime-manifest.json"), scenario === "malformed-manifest" ? "invalid json" : JSON.stringify(manifest));
      await writeFile(path.join(directory, "ffmpeg-core.js"), scenario === "changed-js" ? "changed" : js);
      if (scenario !== "missing-core") await writeFile(path.join(directory, "ffmpeg-core.wasm"), scenario === "changed-wasm" ? "changed" : wasm);
      const report = await createCapabilityDetector({ ...baseOptions, cwd, inspectBrowserRuntime: undefined }).detect();
      expect(report.items.find((item) => item.id === "ffmpeg")?.status).toBe(scenario === "valid" ? "ready" : "unavailable");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("creates a redacted report without media or secret content", () => {
    const text = buildDiagnosticText({
      generatedAt: "2026-09-29T00:00:00.000Z",
      requestId: "request-123",
      runtime: { nodeVersion: "v24.19.0", os: "win32", architecture: "x64" },
      items: [{ id: "ffmpeg", label: "FFmpeg", status: "ready", summary: "Verified locally.", version: "9.0.2" }],
    });
    expect(text).toContain("request-123");
    expect(text).not.toMatch(/audio bytes|secret|media content|C:\\Users/);
  });
});
