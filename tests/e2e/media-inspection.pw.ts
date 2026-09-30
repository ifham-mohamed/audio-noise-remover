import { expect, test } from "@playwright/test";
import path from "node:path";

const fixtureDirectory = path.resolve(__dirname, "../fixtures/preview");
const supportedInputs = ["tone.mp3", "tone.wav", "tone.m4a", "tone.flac", "tone.mp4", "tone.mov", "tone.mkv"];

test("inspects supported local formats by decoding real audio without posting media", async ({ page }) => {
  const inspectRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/media/inspect")) inspectRequests.push(request.url());
  });
  await page.goto("http://127.0.0.1:3100/");

  for (const name of supportedInputs) {
    await page.locator('input[type="file"]').first().setInputFiles(path.join(fixtureDirectory, name));
    await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(/Audio stream \d+/)).toBeVisible();
    await expect(page.locator("dd").filter({ hasText: "0:01" })).toBeVisible();
    if (["tone.mp4", "tone.mov", "tone.mkv"].includes(name)) await expect(page.getByText("Video with audio")).toBeVisible();
    else await expect(page.getByText("Audio", { exact: true })).toBeVisible();
    if (name !== supportedInputs.at(-1)) {
      await page.getByRole("button", { name: "Replace file" }).click();
    }
  }
  expect(inspectRequests).toEqual([]);
});

test("rejects corrupt, misleading, unsupported, and no-audio inputs; finds a usable later audio stream", async ({ page }) => {
  const inspectionRequests: Array<{ url: string; body: string | null }> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/media/inspect")) inspectionRequests.push({ url: request.url(), body: request.postData() });
  });
  await page.goto("http://127.0.0.1:3100/");
  const input = page.locator('input[type="file"]').first();

  await input.setInputFiles({ name: "damaged.wav", mimeType: "audio/wav", buffer: Buffer.from("not a media container") });
  const mediaError = page.getByRole("alert", { name: "Couldn’t inspect this file" });
  await expect(mediaError).toContainText("could not read or decode", { timeout: 45_000 });
  await page.getByRole("button", { name: "Replace file" }).click();

  await input.setInputFiles(path.join(fixtureDirectory, "tone.wav"));
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Replace file" }).click();
  await input.setInputFiles(path.join(fixtureDirectory, "silent.mp4"));
  await expect(mediaError).toContainText("could not find a usable audio stream", { timeout: 45_000 });
  await page.getByRole("button", { name: "Replace file" }).click();

  await input.setInputFiles(path.join(fixtureDirectory, "tone.wav"));
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Replace file" }).click();
  const misleadingBytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), "/tests/fixtures/preview/tone.wav");
  await input.setInputFiles({ name: "misleading.mp3", mimeType: "audio/mpeg", buffer: Buffer.from(misleadingBytes) });
  await expect(mediaError).toContainText("could not read or decode", { timeout: 45_000 });
  await page.getByRole("button", { name: "Replace file" }).click();

  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not supported") });
  await expect(mediaError).toContainText("file type is not supported");
  await expect(page.getByText(/Supported: MP3, WAV, M4A, FLAC, MP4, MOV, MKV/)).toBeVisible();
  await page.getByRole("button", { name: "Replace file" }).click();

  await input.setInputFiles(path.join(fixtureDirectory, "two-audio-mkv.mkv"));
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Audio stream 3")).toBeVisible();
  await expect(page.getByText(/aac, 48,000 Hz, mono/i)).toBeVisible();
  await expect(page.getByText("Using the first usable audio stream by default.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Audio stream" })).toHaveCount(0);

  await page.getByRole("button", { name: "Replace file" }).click();
  await input.setInputFiles(path.join(fixtureDirectory, "two-usable-audio-mkv.mkv"));
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 45_000 });
  const streamPicker = page.getByRole("combobox", { name: "Audio stream" });
  await expect(streamPicker.locator("option")).toHaveCount(2);
  await expect(streamPicker.locator("option").nth(0)).toHaveText("Audio stream 2");
  await expect(streamPicker.locator("option").nth(1)).toHaveText("Audio stream 3");
  await expect(streamPicker).toHaveValue("ffmpeg-stream-1");
  await streamPicker.selectOption("ffmpeg-stream-2");
  await expect(streamPicker).toHaveValue("ffmpeg-stream-2");
  await expect(page.getByText("Using the first usable audio stream by default.")).toHaveCount(0);
  expect(inspectionRequests).toEqual([]);
});
