import { describe, expect, it } from "vitest";
import { buildDiagnosticText } from "@/shared/contracts/capabilities";
import { createCapabilityDetector } from "@/server/adapters/capability-detector";

const baseOptions = {
  now: () => new Date("2026-09-29T00:00:00.000Z"),
  cwd: "C:/clearwave",
  runCommand: async () => "ffmpeg version 9.0.2-full_build",
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
    expect(report.items.find((item) => item.id === "ffmpeg")).toMatchObject({ status: "ready", version: "9.0.2-full_build" });
    expect(report.items.find((item) => item.id === "models")).toMatchObject({ status: "ready", version: "speech-v0.1" });
    expect(report.items.find((item) => item.id === "storage")).toMatchObject({ status: "ready" });
    expect(report.items.find((item) => item.id === "compute")).toMatchObject({ status: "ready" });
  });

  it("identifies CPU as the safe fallback when acceleration is unavailable", async () => {
    const report = await createCapabilityDetector({ ...baseOptions, accelerationProvider: null }).detect();
    expect(report.items.find((item) => item.id === "compute")).toMatchObject({ status: "limited", code: "ACCELERATOR_UNAVAILABLE" });
    expect(report.items.find((item) => item.id === "compute")?.summary).toMatch(/CPU-safe/);
  });

  it("reports missing tools and low storage without exposing command output", async () => {
    const report = await createCapabilityDetector({
      ...baseOptions,
      runCommand: async () => { throw new Error("SECRET_COMMAND_OUTPUT"); },
      modelManifest: async () => null,
      inspectStorage: async () => ({ writable: true, availableBytes: 128 * 1024 * 1024 }),
    }).detect();

    expect(report.items.find((item) => item.id === "ffmpeg")).toMatchObject({ status: "unavailable", code: "FFMPEG_UNAVAILABLE" });
    expect(report.items.find((item) => item.id === "models")).toMatchObject({ status: "unavailable", code: "MODEL_UNAVAILABLE" });
    expect(report.items.find((item) => item.id === "storage")).toMatchObject({ status: "attention", code: "DISK_SPACE_LOW" });
    expect(JSON.stringify(report)).not.toContain("SECRET_COMMAND_OUTPUT");
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
