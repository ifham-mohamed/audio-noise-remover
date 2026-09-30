import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryView } from "@/features/history/history-view";
import { createFinalJob, finalJobListEnvelopeSchema, finalJobSchema, type FinalJob } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";

const media = (sourceName: string, mediaKind: "audio" | "video" = "audio") => ({ sourceName, sourceRef: `local:${sourceName}:20:1`, format: mediaKind === "audio" ? "wav" : "mp4", mediaKind, sizeBytes: 20, durationSeconds: 125, audioStream: { id: "audio-0", present: true, summary: "Ready" } });
function makeJob(name: string, createdAt: string, state: FinalJob["state"] = "queued", kind: "audio" | "video" = "audio"): FinalJob {
  const input = media(name, kind);
  const base = createFinalJob(input, defaultProcessingProfile(input.sourceRef, "audio-0", kind, input.format), { createdAt });
  return finalJobSchema.parse({ ...base, state, updatedAt: createdAt,
    ...(state === "failed" ? { failure: { code: "PROCESSING_FAILED", message: "Local processing failed." } } : {}),
    ...(state === "succeeded" ? { output: { artifactId: "00000000-0000-4000-8000-000000000099", fileName: "result.wav", mimeType: "audio/wav", sizeBytes: 500, durationSeconds: 125, mediaValidated: true, experimental: true } } : {}),
  });
}
const newer = makeJob("newer.wav", "2026-09-30T10:00:00.000Z", "running");
const older = makeJob("older.wav", "2026-09-29T10:00:00.000Z", "failed", "video");
const voiceOnly = finalJobSchema.parse({ ...makeJob("voice-only.wav", "2026-09-28T10:00:00.000Z"), enabledStages: [{ id: "voice-clarity", label: "voice clarity" }], profile: { ...makeJob("voice-only.wav", "2026-09-28T10:00:00.000Z").profile, stages: [
  { id: "noise-removal", enabled: false, parameters: { intensity: 60 } },
  { id: "voice-clarity", enabled: true, parameters: { intensity: 50 } },
  { id: "loudness-normalization", enabled: false, parameters: { targetLufs: -16 } },
  { id: "echo-reverb-reduction", enabled: false, parameters: { intensity: 40 } },
] } });
function mockList(jobs: FinalJob[]) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => finalJobListEnvelopeSchema.parse({ data: jobs, error: null, requestId: "test" }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("local history view", () => {
  it("loads newest first with useful metadata and only offers active run navigation", async () => {
    mockList([older, newer]); render(<HistoryView />);
    const rows = await screen.findByRole("list", { name: "Final processing attempts" });
    expect(rows.children[0]).toHaveTextContent("newer.wav");
    expect(rows.children[0]).toHaveTextContent("Audio · WAV · 2:05");
    expect(rows.children[0]).toHaveTextContent("Noise removal, Voice clarity");
    expect(screen.getByRole("link", { name: "View run for newer.wav" })).toHaveAttribute("href", `/processing/${newer.id}`);
    expect(screen.queryByRole("link", { name: "View run for older.wav" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry|download|delete/i })).not.toBeInTheDocument();
  });

  it("shows a direct empty state and distinguishes no matching results", async () => {
    mockList([]); render(<HistoryView />);
    expect(await screen.findByText("No enhancements yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New enhancement" })).toHaveAttribute("href", "/");
    cleanup(); mockList([newer]); render(<HistoryView />);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search history" }), { target: { value: "missing" } });
    expect(await screen.findByText("No matching enhancements")).toBeInTheDocument();
  });

  it("announces load failure and retries without showing an empty state", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, json: async () => ({ data: [newer], error: null, requestId: "test" }) });
    vi.stubGlobal("fetch", fetchMock); render(<HistoryView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Local history could not be loaded");
    expect(screen.queryByText("No enhancements yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("newer.wav")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed on an invalid response envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ state: "not-a-job" }], error: null, requestId: "bad" }) })));
    render(<HistoryView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Local history could not be loaded");
    expect(screen.queryByText("No enhancements yet")).not.toBeInTheDocument();
  });

  it("ignores a superseded history response", async () => {
    const pending: Array<(response: { ok: boolean; json: () => Promise<unknown> }) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => pending.push(resolve))));
    render(<StrictMode><HistoryView /></StrictMode>);
    await waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!({ ok: true, json: async () => ({ data: [newer], error: null, requestId: "new" }) });
    expect(await screen.findByText("newer.wav")).toBeInTheDocument();
    pending[0]!({ ok: true, json: async () => ({ data: [older], error: null, requestId: "old" }) });
    await waitFor(() => expect(screen.getByText("newer.wav")).toBeInTheDocument());
    expect(screen.queryByText("older.wav")).not.toBeInTheDocument();
  });

  it("validates envelopes and supports every filter with independent chip removal", async () => {
    mockList([newer, older]); render(<HistoryView />);
    const search = await screen.findByRole("searchbox", { name: "Search history" });
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0]!, { target: { value: "running" } });
    fireEvent.change(selects[1]!, { target: { value: "audio" } });
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-30" } });
    fireEvent.change(selects[2]!, { target: { value: "noise-removal" } });
    fireEvent.change(search, { target: { value: "newer" } });
    expect(screen.getByRole("list", { name: "Final processing attempts" }).children).toHaveLength(1);
    for (const chip of ["Remove Status filter", "Remove Media type filter", "Remove From filter", "Remove To filter", "Remove Profile filter", "Remove Search filter"]) expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Search filter" }));
    expect((screen.getByRole("searchbox", { name: "Search history" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Remove Status filter" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("list", { name: "Final processing attempts" }).children).toHaveLength(2);
  });

  it("surfaces invalid date ranges", async () => {
    mockList([newer]); render(<HistoryView />);
    await screen.findByRole("searchbox", { name: "Search history" });
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-29" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("start date must be on or before the end date"));
    expect(screen.getByLabelText("From date")).toHaveAttribute("aria-describedby", "date-range-error");
    expect(screen.getByLabelText("To date")).toHaveAttribute("aria-describedby", "date-range-error");
  });

  it("searches visible status labels and excludes profiles without the selected stage", async () => {
    const completed = makeJob("completed.wav", "2026-09-27T10:00:00.000Z", "succeeded");
    mockList([newer, voiceOnly, completed]); render(<HistoryView />);
    const search = await screen.findByRole("searchbox", { name: "Search history" });
    fireEvent.change(search, { target: { value: "Completed" } });
    expect(screen.getByRole("list", { name: "Final processing attempts" }).children).toHaveLength(1);
    expect(screen.getByText("completed.wav")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.change(screen.getAllByRole("combobox")[2]!, { target: { value: "noise-removal" } });
    expect(screen.getByRole("list", { name: "Final processing attempts" }).children).toHaveLength(2);
    expect(screen.queryByText("voice-only.wav")).not.toBeInTheDocument();
  });
});
