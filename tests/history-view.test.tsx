import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryView } from "@/features/history/history-view";
import { createFinalJob, finalJobListEnvelopeSchema, finalJobSchema, type FinalJob } from "@/shared/contracts/final-job";
import { defaultProcessingProfile } from "@/shared/contracts/processing";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
    expect(within(rows.children[0] as HTMLElement).queryByRole("button", { name: /retry|download|delete/i })).not.toBeInTheDocument();
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

  it("shows attempt details, reports unrecorded snapshots, and renders chronological linked attempts", async () => {
    const parent = older;
    const child = finalJobSchema.parse({ ...makeJob("retry.wav", "2026-09-30T11:00:00.000Z", "cancelled"), retryOf: parent.id, failure: undefined, media: parent.media, profile: parent.profile });
    mockList([child, parent]); render(<HistoryView />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Status" }), { target: { value: "cancelled" } });
    const details = await screen.findAllByText("Attempt details");
    fireEvent.click(details[0]!);
    const row = details[0]!.closest("li") as HTMLElement;
    expect(within(row).getByText("Execution details: Not recorded.")).toBeInTheDocument();
    expect(within(row).getByText(/Selected audio stream: audio-0/)).toBeInTheDocument();
    expect(within(row).getByText("Linked attempts, oldest first")).toBeInTheDocument();
    expect(within(row).getByText(new RegExp(parent.id))).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: parent.id })).toHaveAttribute("href", `/processing/${parent.id}`);
    expect(within(row).getByRole("button", { name: "Retry as a new attempt" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Copy attempt diagnostics" })).toBeInTheDocument();
  });

  it("offers selectable redacted diagnostics when clipboard writing fails", async () => {
    mockList([older]);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<HistoryView />);
    fireEvent.click((await screen.findAllByText("Attempt details"))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Copy attempt diagnostics" }));
    const safeText = await screen.findByLabelText("Selectable safe attempt diagnostics");
    expect((safeText as HTMLTextAreaElement).value).not.toContain("older.wav");
    const row = safeText.closest("li") as HTMLElement;
    expect(within(row).getAllByRole("status").find((status) => status.textContent?.includes("Clipboard unavailable"))).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Retry as a new attempt" })).toBeInTheDocument();
  });

  it("shows successful output, enabled parameters, and identifiers without offering Retry", async () => {
    const succeeded = finalJobSchema.parse({
      ...makeJob("complete.wav", "2026-09-30T12:00:00.000Z", "succeeded"),
      requestId: "00000000-0000-4000-8000-000000000201",
      executionSnapshot: { version: 1, modelId: "candidate-model", modelVersion: "v1", runtime: "onnxruntime-web/wasm", qualification: "experimental; not production-qualified" },
    });
    mockList([succeeded]); render(<HistoryView />);
    const summary = await screen.findByText("Attempt details");
    fireEvent.click(summary);
    const row = summary.closest("li") as HTMLElement;
    expect(within(row).getByText(/result\.wav · audio\/wav · 500 bytes · 125 seconds · validated/)).toBeInTheDocument();
    expect(within(row).getByText(/Noise removal: intensity 60/)).toBeInTheDocument();
    expect(within(row).getByText(/Voice clarity: intensity 50/)).toBeInTheDocument();
    expect(within(row).getByText(succeeded.id)).toBeInTheDocument();
    expect(row).toHaveTextContent(`Request ID: ${succeeded.requestId}`);
    expect(within(row).queryByRole("button", { name: "Retry as a new attempt" })).not.toBeInTheDocument();
  });

  it("labels removed successful output while retaining its safe metadata", async () => {
    const removed = finalJobSchema.parse({ ...makeJob("removed.wav", "2026-09-30T12:00:00.000Z", "succeeded"), outputAvailability: "removed" });
    mockList([removed]); render(<HistoryView />);
    fireEvent.click(await screen.findByText("Attempt details"));
    const row = screen.getByText("Output removed · result.wav · audio/wav · 500 bytes · 125 seconds");
    expect(row).toBeInTheDocument();
  });

  it("identifies a missing retry parent while keeping the attempt details available", async () => {
    const orphan = finalJobSchema.parse({
      ...makeJob("orphan.wav", "2026-09-30T13:00:00.000Z", "cancelled"),
      retryOf: "00000000-0000-4000-8000-000000000202",
    });
    mockList([orphan]); render(<HistoryView />);
    const summary = await screen.findByText("Attempt details");
    fireEvent.click(summary);
    const row = summary.closest("li") as HTMLElement;
    expect(within(row).getByText(/Previous attempt 00000000-0000-4000-8000-000000000202 is unavailable in local history\./)).toBeInTheDocument();
    expect(within(row).getByText("Attempt identifiers and terminal reason")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Retry as a new attempt" })).toBeInTheDocument();
  });

  it("stops cyclic ancestry traversal and sorts branched linked attempts chronologically", async () => {
    const root = finalJobSchema.parse({ ...newer, retryOf: "00000000-0000-4000-8000-000000000211" });
    const branchOne = finalJobSchema.parse({ ...makeJob("branch-one.wav", "2026-09-30T10:10:00.000Z"), id: "00000000-0000-4000-8000-000000000211", retryOf: root.id });
    const branchTwo = finalJobSchema.parse({ ...makeJob("branch-two.wav", "2026-09-30T10:20:00.000Z"), id: "00000000-0000-4000-8000-000000000212", retryOf: root.id });
    const nested = finalJobSchema.parse({ ...makeJob("nested.wav", "2026-09-30T10:15:00.000Z"), id: "00000000-0000-4000-8000-000000000213", retryOf: branchOne.id });
    mockList([nested, branchTwo, branchOne, root]); render(<HistoryView />);
    const rootRow = (await screen.findByRole("heading", { name: "newer.wav" })).closest("li") as HTMLElement;
    fireEvent.click(within(rootRow).getByText("Attempt details"));
    const links = within(rootRow).getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/processing/") && link.textContent !== "View run");
    expect(links.map((link) => link.textContent)).toEqual([root.id, branchOne.id, nested.id, branchTwo.id]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([root.id, branchOne.id, nested.id, branchTwo.id].map((id) => `/processing/${id}`));
  });

  it("does not label a different available stream as the selected stream", async () => {
    const mismatched = finalJobSchema.parse({
      ...newer,
      profile: { ...newer.profile, selectedAudioStreamId: "audio-selected-but-unavailable" },
      media: { ...newer.media, audioStreams: [{ id: "audio-0", present: true, summary: "Available stream" }] },
    });
    mockList([mismatched]); render(<HistoryView />);
    const row = (await screen.findByRole("heading", { name: "newer.wav" })).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByText("Attempt details"));
    expect(within(row).getByText("Selected audio stream audio-selected-but-unavailable: metadata unavailable.")).toBeInTheDocument();
    expect(within(row).queryByText(/Selected audio stream: audio-selected-but-unavailable ·/)).not.toBeInTheDocument();
  });
});
