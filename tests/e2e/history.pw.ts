import { expect, test } from "@playwright/test";

const activeJob = {
  id: "00000000-0000-4000-8000-000000000101", kind: "final", state: "running", sequence: 1,
  createdAt: "2026-09-30T10:00:00.000Z", updatedAt: "2026-09-30T10:01:00.000Z", elapsedMs: 60000, phase: "noise-removal",
  media: { sourceName: "history-speech.wav", sourceRef: "local:history-speech.wav:20:1", format: "wav", mediaKind: "audio", sizeBytes: 20, durationSeconds: 125, audioStream: { id: "audio-0", present: true, summary: "Ready" } },
  profile: { mediaRef: "local:history-speech.wav:20:1", selectedAudioStreamId: "audio-0", stages: [
    { id: "noise-removal", enabled: true, parameters: { intensity: 60 } },
    { id: "voice-clarity", enabled: false, parameters: { intensity: 50 } },
    { id: "loudness-normalization", enabled: false, parameters: { targetLufs: -16 } },
    { id: "echo-reverb-reduction", enabled: false, parameters: { intensity: 40 } },
  ], output: { mediaKind: "audio", format: "audio-wav", quality: "high", sampleRate: 48000, audioCodec: "pcm_s24le", destination: { mode: "browser-download", targetName: "enhanced.wav", targetRef: "destination:enhanced.wav", exists: false, overwriteConfirmed: false } } },
  enabledStages: [{ id: "noise-removal", label: "Noise removal" }],
};

test("navigates to local History, filters and resets, then opens an active run", async ({ page }) => {
  await page.route("**/api/final-jobs", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify({ data: [activeJob], error: null, requestId: "history-e2e" }) }));
  await page.goto("http://127.0.0.1:3100");
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "history-speech.wav" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search history" }).fill("no-such-file");
  await expect(page.getByText("No matching enhancements")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).last().click();
  await expect(page.getByRole("heading", { name: "history-speech.wav" })).toBeVisible();
  await page.getByRole("link", { name: "View run for history-speech.wav" }).click();
  await expect(page).toHaveURL(new RegExp(`/processing/${activeJob.id}$`));
});
