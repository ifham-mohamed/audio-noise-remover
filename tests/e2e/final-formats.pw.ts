import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { finalJobEnvelopeSchema, type FinalJob } from "../../shared/contracts/final-job";

const origin = "http://127.0.0.1:3100";
const fixtures = path.resolve(__dirname, "../fixtures/preview");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

type Case = { source: string; format: "audio-flac" | "audio-mp3" | "audio-m4a" | "source-video"; label: string; extension: string; mimeType: string; secondTrack?: boolean };
const cases: Case[] = [
  { source: "tone.wav", format: "audio-flac", label: "FLAC", extension: "flac", mimeType: "audio/flac" },
  { source: "tone.wav", format: "audio-mp3", label: "MP3", extension: "mp3", mimeType: "audio/mpeg" },
  { source: "tone.wav", format: "audio-m4a", label: "M4A", extension: "m4a", mimeType: "audio/mp4" },
  { source: "tone.mp4", format: "source-video", label: "MP4", extension: "mp4", mimeType: "video/mp4" },
  { source: "tone.mov", format: "source-video", label: "MOV", extension: "mov", mimeType: "video/quicktime" },
  { source: "tone.mkv", format: "source-video", label: "MKV", extension: "mkv", mimeType: "video/x-matroska" },
  { source: "two-usable-audio-mkv.mkv", format: "source-video", label: "MKV", extension: "mkv", mimeType: "video/x-matroska", secondTrack: true },
];

test.beforeEach(async ({ context }) => {
  // Playwright supplies a fresh context/page for every parameterized case.
  await context.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }));
});

function watchLocalRequests(page: Page) {
  const external: string[] = [];
  const modelRequests: string[] = [];
  const stageOrder: string[] = [];
  page.context().on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) external.push(request.url());
    if (url.pathname === "/api/preview-model") modelRequests.push(request.url());
    if (url.pathname.startsWith("/api/final-jobs/") && request.method() === "POST") {
      const body = request.postDataJSON() as { command?: string; event?: { type?: string; stageId?: string; phase?: string } };
      const event = body.event;
      if (body.command === "event" && event?.type === "progress" && event.stageId && /Applying|Normalizing|Reducing/.test(event.phase ?? "") && !stageOrder.includes(event.stageId)) stageOrder.push(event.stageId);
    }
  });
  return { external, modelRequests, stageOrder };
}

async function currentJob(page: Page): Promise<FinalJob> {
  const envelope = await page.evaluate(async () => {
    const response = await fetch(`/api/final-jobs/${location.pathname.split("/").at(-1)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Final job lookup failed: ${response.status}`);
    return response.json();
  });
  const parsed = finalJobEnvelopeSchema.parse(envelope);
  expect(parsed.error).toBeNull();
  expect(parsed.data).not.toBeNull();
  return parsed.data!;
}

async function startAndAwaitOutput(page: Page, expectedLabel: string) {
  await expect(page.getByRole("button", { name: "Process", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Process", exact: true }).click();
  await expect(page).toHaveURL(/\/processing\/[a-f0-9-]+$/);
  await expect.poll(async () => {
    const job = await currentJob(page);
    if (job.state === "failed" || job.state === "cancelled") throw new Error(`Final integration failed: ${job.failure?.code ?? job.state}: ${job.failure?.message ?? "No final output"}`);
    return job.state;
  }, { timeout: 100_000 }).toBe("succeeded");
  await expect(page.getByRole("heading", { name: "Review your final output" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Download ${expectedLabel}` })).toBeEnabled();
  const job = await currentJob(page);
  expect(job.output?.mediaValidated).toBe(true);
  return job;
}

async function verifyRetainedBytesAndHistory(page: Page, job: FinalJob, source: Buffer, label: string) {
  expect(job.output).toBeDefined();
  const expected = job.output!;
  const retained = await page.evaluate(async ({ jobId, artifactId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ai-noice-removal-final-artifacts", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<{ source: { bytes: ArrayBuffer }; output: { bytes: ArrayBuffer; fileName: string; mimeType: string; validated: boolean; sha256: string } }>((resolve, reject) => {
        const tx = db.transaction(["sources", "outputs"], "readonly");
        const original = tx.objectStore("sources").get(jobId);
        const output = tx.objectStore("outputs").get(artifactId);
        tx.oncomplete = () => resolve({ source: original.result, output: output.result });
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      if (!records.source || !records.output) throw new Error("Successful job must retain original bytes and validated output.");
      const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
      return { sourceSha256: await digest(records.source.bytes), sourceSize: records.source.bytes.byteLength, outputSha256: await digest(records.output.bytes), outputBytes: Array.from(new Uint8Array(records.output.bytes)), fileName: records.output.fileName, mimeType: records.output.mimeType, validated: records.output.validated, storedSha256: records.output.sha256 };
    } finally { db.close(); }
  }, { jobId: job.id, artifactId: expected.artifactId });
  expect(retained.sourceSha256).toBe(sha256(source));
  expect(retained.sourceSize).toBe(source.byteLength);
  expect(retained.validated).toBe(true);
  expect(retained.fileName).toBe(expected.fileName);
  expect(retained.mimeType).toBe(expected.mimeType);
  expect(retained.outputBytes.length).toBe(expected.sizeBytes);
  expect(retained.outputSha256).toBe(expected.sha256);
  expect(retained.storedSha256).toBe(expected.sha256);

  async function downloadAndCompare(button: ReturnType<Page["getByRole"]>) {
    const pending = page.waitForEvent("download");
    await button.click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(expected.fileName);
    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    const bytes = await readFile(filePath!);
    expect(bytes).toEqual(Buffer.from(retained.outputBytes));
    expect(sha256(bytes)).toBe(expected.sha256);
  }
  await downloadAndCompare(page.getByRole("button", { name: `Download ${label}` }));
  const processingUrl = page.url();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.reload();
  // Server history may include earlier cases; scope actions to this exact attempt.
  const attempt = page.locator("details").filter({ hasText: job.id });
  await expect(attempt).toHaveCount(1);
  await attempt.locator("summary").click();
  const actions = attempt.getByRole("group", { name: "Local output actions" });
  await expect(actions.getByRole("button", { name: `Download ${label}` })).toBeEnabled();
  await downloadAndCompare(actions.getByRole("button", { name: `Download ${label}` }));
  await page.goto(processingUrl);
  await expect(page.getByRole("heading", { name: "Review your final output" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Download ${label}` })).toBeEnabled();
}

for (const scenario of cases) {
  test(`${scenario.source} → ${scenario.label}${scenario.secondTrack ? " from selected second audio track" : ""} downloads and reopens locally`, async ({ page }) => {
    test.setTimeout(150_000);
    const requests = watchLocalRequests(page);
    const source = await readFile(path.join(fixtures, scenario.source));
    await page.goto(origin);
    await page.locator('input[type="file"]').first().setInputFiles(path.join(fixtures, scenario.source));
    await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
    if (scenario.secondTrack) {
      const picker = page.getByRole("combobox", { name: "Audio stream" });
      await expect(picker.locator("option")).toHaveCount(2);
      await picker.selectOption("ffmpeg-stream-2");
      await expect(picker).toHaveValue("ffmpeg-stream-2");
    }
    await page.getByRole("switch", { name: "Noise removal enabled" }).click();
    await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
    await expect(page.getByRole("switch", { name: "Noise removal enabled" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("combobox", { name: "Output format" }).selectOption(scenario.format);
    const targetName = `final-${scenario.secondTrack ? "second-track" : scenario.source.replace(".", "-")}.${scenario.extension}`;
    await page.getByRole("textbox", { name: "Output name" }).fill(targetName);
    const job = await startAndAwaitOutput(page, scenario.label);
    await expect(page.getByText("Local voice-clarity output validated", { exact: true })).toBeVisible();
    expect(job.output).toMatchObject({ fileName: targetName, mimeType: scenario.mimeType, mediaValidated: true });
    expect(job.enabledStages.map((stage) => stage.id)).toEqual(["voice-clarity"]);
    expect(job.output?.metrics?.["voice-clarity"]).toMatchObject({ intensity: 50 });
    if (scenario.format === "source-video") {
      expect(job.profile.output).toMatchObject({ format: "source-video", videoCodec: "source", audioCodec: "aac", audioBitrateKbps: 192 });
      await expect(page.getByLabel("Watch the validated local video output")).toBeVisible();
    }
    if (scenario.secondTrack) {
      expect(job.profile.selectedAudioStreamId).toBe("ffmpeg-stream-2");
      expect(job.media.selectedAudioStreamId).toBe("ffmpeg-stream-2");
      expect(job.media.audioStreams?.find((stream) => stream.id === "ffmpeg-stream-2")?.ffmpegAudioOrdinal).toBe(1);
    }
    await verifyRetainedBytesAndHistory(page, job, source, scenario.label);
    expect(requests.modelRequests).toEqual([]);
    expect(requests.external).toEqual([]);
  });
}

function shortExcerpt(wav: Buffer) {
  // Keep the fixture's format/header and only 200 ms of PCM. A complete 400 ms
  // loudness block cannot exist, making the measurement warning deterministic.
  for (let offset = 12; offset + 8 <= wav.length;) {
    const length = wav.readUInt32LE(offset + 4);
    if (wav.toString("ascii", offset, offset + 4) === "data") {
      const byteCount = 48_000 * 0.2 * 2;
      expect(length).toBeGreaterThanOrEqual(byteCount);
      const excerpt = Buffer.from(wav.subarray(0, offset + 8 + byteCount));
      excerpt.writeUInt32LE(excerpt.length - 8, 4);
      excerpt.writeUInt32LE(byteCount, offset + 4);
      return excerpt;
    }
    offset += 8 + length + length % 2;
  }
  throw new Error("Synthetic WAV fixture has no PCM data chunk.");
}

test("all four stages retain metrics, disclose an unmet loudness target, and preserve source bytes", async ({ page }) => {
  test.setTimeout(150_000);
  const requests = watchLocalRequests(page);
  const source = shortExcerpt(await readFile(path.join(fixtures, "tone.wav")));
  await page.goto(origin);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "short-four-stage.wav", mimeType: "audio/wav", buffer: source });
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
  for (const name of ["Voice clarity enabled", "Loudness normalization enabled", "Echo/reverb reduction enabled"]) await page.getByRole("switch", { name }).click();
  await expect(page.getByRole("switch", { name: "Noise removal enabled" })).toHaveAttribute("aria-checked", "true");
  const job = await startAndAwaitOutput(page, "WAV");
  const stages = ["noise-removal", "voice-clarity", "loudness-normalization", "echo-reverb-reduction"];
  expect(job.enabledStages.map((stage) => stage.id)).toEqual(stages);
  expect(requests.stageOrder).toEqual(stages);
  expect(requests.modelRequests.length).toBeGreaterThan(0);
  expect(job.output?.metrics?.["voice-clarity"]).toMatchObject({ intensity: 50 });
  expect(job.output?.metrics?.["echo-reverb-reduction"]).toMatchObject({ experimental: true });
  expect(job.output?.metrics?.["loudness-normalization"]).toMatchObject({ targetLufs: -16, achievedLufs: null, targetUnmet: true, targetUnmetReason: "unmeasurable" });
  await expect(page.getByRole("status").filter({ hasText: "Loudness stage:" })).toContainText("Peak protection or insufficient measurable audio prevented the requested target.");
  await expect(page.getByText("This DPDFNet-based result is experimental and not production-qualified.", { exact: true })).toBeVisible();
  await verifyRetainedBytesAndHistory(page, job, source, "WAV");
  expect(requests.external).toEqual([]);
});

test.describe("video timing fails closed through the actual final worker", () => {
  let timingFixtures: Record<"delayedFirst" | "delayedSecond" | "commonOrigin", string>;
  test.beforeAll(() => {
    const result = execFileSync(process.execPath, [path.resolve("scripts/fixtures/final-timing-fixtures.mjs")], { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 30_000 });
    timingFixtures = JSON.parse(result);
    for (const fixture of Object.values(timingFixtures)) expect(typeof fixture).toBe("string");
  });

  for (const scenario of [
    { key: "delayedFirst", name: "delayed selected audio", secondTrack: false },
    { key: "delayedSecond", name: "delayed second audio track", secondTrack: true },
    { key: "commonOrigin", name: "nonzero common timeline origin", secondTrack: false },
  ] as const) {
    test(`rejects ${scenario.name} without publishing or retaining a final artifact`, async ({ page }) => {
      test.setTimeout(90_000);
      const requests = watchLocalRequests(page);
      const source = Buffer.from(timingFixtures[scenario.key], "base64");
      await page.goto(origin);
      await page.locator('input[type="file"]').first().setInputFiles({ name: `${scenario.key}.mkv`, mimeType: "video/x-matroska", buffer: source });
      await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
      if (scenario.secondTrack) {
        const picker = page.getByRole("combobox", { name: "Audio stream" });
        await expect(picker.locator("option")).toHaveCount(2);
        await picker.selectOption("ffmpeg-stream-2");
      }
      await page.getByRole("switch", { name: "Noise removal enabled" }).click();
      await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
      await page.getByRole("combobox", { name: "Output format" }).selectOption("source-video");
      await expect(page.getByRole("button", { name: "Process", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Process", exact: true }).click();
      await expect(page).toHaveURL(/\/processing\/[a-f0-9-]+$/);
      await expect.poll(async () => (await currentJob(page)).state, { timeout: 45_000 }).toBe("failed");
      const job = await currentJob(page);
      expect(job.failure).toMatchObject({ code: "UNSUPPORTED_MEDIA" });
      expect(job.failure?.message).toContain("Unsupported video timing:");
      expect(job.failure?.message).toContain("No final output was published.");
      expect(job.output).toBeUndefined();
      if (scenario.secondTrack) expect(job.profile.selectedAudioStreamId).toBe("ffmpeg-stream-2");
      await expect(page.getByText("Your original remains unchanged, and no successful output is available.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Download MKV" })).toHaveCount(0);
      const retained = await page.evaluate(async (jobId) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("ai-noice-removal-final-artifacts", 1);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        try {
          const record = await new Promise<{ original: { bytes: ArrayBuffer }; outputCount: number }>((resolve, reject) => {
            const tx = db.transaction(["sources", "outputs"], "readonly");
            const original = tx.objectStore("sources").get(jobId);
            const count = tx.objectStore("outputs").count();
            tx.oncomplete = () => resolve({ original: original.result, outputCount: count.result });
            tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
          });
          if (!record.original) throw new Error("Failed timing validation must preserve the retained source.");
          const digest = await crypto.subtle.digest("SHA-256", record.original.bytes);
          return { outputCount: record.outputCount, sourceSize: record.original.bytes.byteLength, sourceSha256: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("") };
        } finally { db.close(); }
      }, job.id);
      expect(retained).toEqual({ outputCount: 0, sourceSize: source.byteLength, sourceSha256: sha256(source) });
      expect(requests.stageOrder).toEqual([]);
      expect(requests.modelRequests).toEqual([]);
      await page.getByRole("link", { name: "History", exact: true }).click();
      await expect(page).toHaveURL(/\/history$/);
      await page.reload();
      const attempt = page.locator("details").filter({ hasText: job.id });
      await expect(attempt).toHaveCount(1);
      await attempt.locator("summary").click();
      await expect(attempt.getByText("Failure code: UNSUPPORTED_MEDIA", { exact: true })).toBeVisible();
      await expect(attempt.getByRole("group", { name: "Local output actions" })).toHaveCount(0);
      expect(requests.external).toEqual([]);
    });
  }
});
