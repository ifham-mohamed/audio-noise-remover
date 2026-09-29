import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AppShell } from "@/components/app-shell";
import { createFinalJob } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

describe("AppShell", () => {
  it("renders the local-first navigation shell", () => {
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);

    expect(view.getAllByText("New enhancement").length).toBeGreaterThan(0);
    expect(view.getByRole("link", { name: /history/i })).toBeInTheDocument();
    expect(view.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    expect(view.getAllByRole("button", { name: /checking local readiness|on this device|local setup needs attention/i }).length).toBeGreaterThan(0);
    expect(view.queryByText(/upload|cloud sync|remote processing/i)).not.toBeInTheDocument();
  });

  it("keeps an accessible active-job region in the shell", () => {
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);

    expect(view.getByRole("region", { name: /active jobs/i })).toBeInTheDocument();
    expect(view.getByText(/no active jobs/i)).toBeInTheDocument();
  });

  it("renders an available active job as a navigable summary", () => {
    const view = render(
      <AppShell activeJob={{ href: "/processing/job-1", label: "Interview recording", status: "Enhancing" }}>
        <h1>New enhancement</h1>
      </AppShell>,
    );

    expect(view.getByRole("link", { name: /interview recording/i })).toHaveAttribute("href", "/processing/job-1");
    expect(view.getByText("Enhancing")).toBeInTheDocument();
  });

  it("discovers a persisted active final job from the local API", async () => {
    const media = { sourceName: "Local interview.wav", sourceRef: "local:interview:1", format: "wav", mediaKind: "audio" as const, sizeBytes: 20, durationSeconds: 30, audioStream: { id: "audio-0", present: true, summary: "Ready" } };
    const job = createFinalJob(media, defaultProcessingProfile(media.sourceRef, "audio-0"), { id: "00000000-0000-4000-8000-000000000001" });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve(url === "/api/final-jobs"
      ? { ok: true, json: async () => ({ data: [job], error: null, requestId: "jobs" }) }
      : { ok: true, json: async () => ({ data: { generatedAt: "2026-09-30T00:00:00.000Z", requestId: "caps", runtime: { nodeVersion: "v24", os: "win32", architecture: "x64" }, items: [] }, error: null, requestId: "caps" }) })));
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);
    expect(await view.findByRole("link", { name: /local interview.wav/i })).toHaveAttribute("href", `/processing/${job.id}`);
    expect(view.getByText(/Final processing queued · 0:00/)).toBeInTheDocument();
  });

  it("marks destination navigation as selected when the route changes", () => {
    navigationState.pathname = "/history";
    const view = render(<AppShell><h1>History</h1></AppShell>);

    expect(view.getByRole("link", { name: /history/i })).toHaveAttribute("aria-current", "page");
    expect(view.getByRole("link", { name: /new enhancement/i })).not.toHaveAttribute("aria-current", "page");
  });

  it("keeps the compact navigation trigger reachable for small viewports", () => {
    navigationState.pathname = "/";
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);

    expect(view.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
  });

  it("defines a reduced-motion fallback for shell feedback", () => {
    const styles = readFileSync("app/globals.css", "utf8");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("transition-duration: 0.01ms");
  });

  it("reflects attention returned by the local capability endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { generatedAt: "2026-09-29T00:00:00.000Z", requestId: "request-1", runtime: { nodeVersion: "v24", os: "win32", architecture: "x64" }, items: [{ id: "ffmpeg", label: "FFmpeg", status: "unavailable", summary: "Missing", code: "FFMPEG_UNAVAILABLE" }] }, error: null, requestId: "request-1" }),
    }));
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);
    expect((await view.findAllByRole("button", { name: /local setup needs attention/i })).length).toBeGreaterThan(0);
  });

  it("treats a failed capability response as attention", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ data: null, error: { code: "RUNTIME_CHECK_FAILED", message: "failed" }, requestId: "request-2" }) }));
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);
    expect((await view.findAllByRole("button", { name: /local setup needs attention/i })).length).toBeGreaterThan(0);
  });
});
