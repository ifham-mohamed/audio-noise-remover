import { expect, test } from "@playwright/test";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const fixtures = path.resolve(__dirname, "../fixtures/preview");
const audioFormats = ["wav", "mp3", "flac", "m4a"] as const;
const videoFormats = ["mp4", "mov", "mkv"] as const;

function makeTenSecondWav() {
  const sampleRate = 48_000;
  const sampleCount = sampleRate * 10;
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index++) buffer.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * 440 / sampleRate) * 9000), 44 + index * 2);
  return buffer;
}

function readFloatWavSamples(bytes: Buffer) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const length = view.getUint32(offset + 4, true);
    if (name === "data") {
      const samples = new Float32Array(length / 4);
      for (let index = 0; index < samples.length; index++) samples[index] = view.getFloat32(offset + 8 + index * 4, true);
      return samples;
    }
    offset += 8 + length + (length % 2);
  }
  throw new Error("Publisher reference fixture has no audio data.");
}

test.beforeAll(async () => {
  let bytes: Buffer;
  try { bytes = await readFile(path.resolve(__dirname, "../../models/dpdfnet2_48khz_hr.onnx")); }
  catch { throw new Error("Experimental model E2E requires the pinned local artifact. Run `npm run model:setup` first."); }
  if (createHash("sha256").update(bytes).digest("hex") !== "7f0575a5cec0ba4ffd8f8bd657e06d007e4ccdd955d76faab922b9d3291dc14b") {
    throw new Error("Experimental model E2E found an invalid local model checksum. Restore the pinned artifact, then run `npm run model:setup`.");
  }
});

async function runWorker(page: import("@playwright/test").Page, filename: string, selectedTrack = 0, expectedType: "succeeded" | "failed" = "succeeded", mode: "denoise" | "clarity" | "combined" | "invalid-clarity" = "denoise") {
  const requestedOrigins = new Set<string>();
  page.on("request", (request) => requestedOrigins.add(new URL(request.url()).origin));
  await page.goto(`/tests/e2e/worker-harness.html${mode === "invalid-clarity" ? "?invalid-clarity" : ""}`);
  await page.getByLabel("Local test media").setInputFiles(path.join(fixtures, filename));
  await page.getByLabel("Selected audio track").selectOption(String(selectedTrack));
  if (mode === "clarity" || mode === "invalid-clarity") await page.getByLabel("Enable experimental noise removal").uncheck();
  if (mode !== "denoise") await page.getByLabel("Enable voice clarity").check();
  await page.getByRole("button", { name: "Run experimental local preview" }).click();
  const result = page.getByTestId("worker-result");
  await expect.poll(async () => result.getAttribute("data-type"), { timeout: 60_000 }).toMatch(/^(succeeded|failed)$/);
  if (await result.getAttribute("data-type") !== expectedType) throw new Error(`Unexpected worker result: ${await result.textContent()}`);
  return { result, requestedOrigins };
}

test.describe("real browser-worker experimental enhancement", () => {
  for (const format of audioFormats) {
    test(`${format.toUpperCase()} is decoded by the bundled local worker`, async ({ page }) => {
      const { result, requestedOrigins } = await runWorker(page, `tone.${format}`);
      await expect(result).toHaveAttribute("data-reopened", "true");
      await expect(result).toHaveAttribute("data-source-reopened", "true");
      await expect(result).toHaveAttribute("data-pair-duration-match", "true");
      await expect(result).toHaveAttribute("data-model-progress", "true");
      expect([...requestedOrigins]).toEqual(["http://127.0.0.1:4173"]);
    });
  }

  for (const format of videoFormats) {
    test(`${format.toUpperCase()} audio is extracted without decoding or publishing video`, async ({ page }) => {
      const { result, requestedOrigins } = await runWorker(page, `tone.${format}`);
      await expect(result).toHaveAttribute("data-reopened", "true");
      await expect(result).toHaveAttribute("data-source-reopened", "true");
      await expect(result).toHaveAttribute("data-pair-duration-match", "true");
      await expect(result).toHaveAttribute("data-model-progress", "true");
      expect([...requestedOrigins]).toEqual(["http://127.0.0.1:4173"]);
    });
  }

  test("uses the selected second video audio track and rejects the unsupported first track", async ({ page }) => {
    const unsupportedTrack = await runWorker(page, "two-audio-mkv.mkv", 0, "failed");
    await expect(unsupportedTrack.result).toHaveAttribute("data-code", "UNSUPPORTED_MEDIA");

    const selectedTrack = await runWorker(page, "two-audio-mkv.mkv", 1);
    await expect(selectedTrack.result).toHaveAttribute("data-reopened", "true");
    await expect(selectedTrack.result).toHaveAttribute("data-source-reopened", "true");
  });

  test("enhanced audio differs from decoded WAV input and survives artifact reopen", async ({ page }) => {
    const { result } = await runWorker(page, "tone.wav");
    await expect(result).toHaveAttribute("data-reopened", "true");
    expect(Number(await result.getAttribute("data-rms-difference"))).toBeGreaterThan(1e-6);
    const actual = await page.evaluate(() => (window as typeof window & { __experimentalPreviewOutput: number[] }).__experimentalPreviewOutput);
    const reference = readFloatWavSamples(await readFile(path.join(fixtures, "dpdfnet2-tone-reference.wav")));
    expect(actual).toHaveLength(reference.length);
    let errorEnergy = 0;
    for (let index = 0; index < reference.length; index++) errorEnergy += (actual[index] - reference[index]) ** 2;
    const rmse = Math.sqrt(errorEnergy / reference.length);
    expect(rmse).toBeLessThan(1e-5);
  });

  test("voice clarity runs alone in the local worker and produces a validated artifact", async ({ page }) => {
    const { result, requestedOrigins } = await runWorker(page, "tone.wav", 0, "succeeded", "clarity");
    await expect(result).toHaveAttribute("data-reopened", "true");
    await expect(result).toHaveAttribute("data-model-progress", "false");
    expect([...requestedOrigins]).toEqual(["http://127.0.0.1:4173"]);
  });

  test("invalid voice-clarity parameters fail before artifact handoff", async ({ page }) => {
    const { result } = await runWorker(page, "tone.wav", 0, "failed", "invalid-clarity");
    await expect(result).toHaveAttribute("data-code", "PROCESSING_FAILED");
    await expect(result).toContainText("voice clarity settings are invalid");
    await expect(result).toHaveAttribute("data-reopened", "false");
  });

  test("denoising runs before voice clarity in the combined local worker profile", async ({ page }) => {
    const { result } = await runWorker(page, "tone.wav", 0, "succeeded", "combined");
    await expect(result).toHaveAttribute("data-reopened", "true");
    await expect(result).toHaveAttribute("data-model-progress", "true");
    await expect(result).toHaveAttribute("data-clarity-progress", "true");
    await expect(result).toHaveAttribute("data-stage-order", "noise-removal,voice-clarity");
  });

  test("a missing local model fails without an artifact", async ({ page }) => {
    await page.route("**/api/preview-model", (route) => route.fulfill({ status: 404, body: "missing" }));
    const { result } = await runWorker(page, "tone.wav", 0, "failed");
    await expect(result).toHaveAttribute("data-code", "MODEL_UNAVAILABLE");
    await expect(result).toHaveAttribute("data-reopened", "false");
  });

  test("cancellation during model inference settles without retaining an artifact", async ({ page }) => {
    await page.goto("/tests/e2e/worker-harness.html");
    await page.getByLabel("Local test media").setInputFiles({ name: "ten-second.wav", mimeType: "audio/wav", buffer: makeTenSecondWav() });
    await page.getByRole("button", { name: "Run experimental local preview" }).click();
    const result = page.getByTestId("worker-result");
    await expect(result).toHaveAttribute("data-model-progress", "true", { timeout: 30_000 });
    await page.getByRole("button", { name: "Cancel experimental preview" }).click();
    await expect(result).toHaveAttribute("data-type", "cancelled", { timeout: 30_000 });
    await expect(result).toHaveAttribute("data-reopened", "false");
    const retainedCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
      const request = indexedDB.open("ai-noice-removal-preview-artifacts", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("artifacts", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const count = db.transaction("artifacts", "readonly").objectStore("artifacts").count();
        count.onsuccess = () => { resolve(count.result); db.close(); };
        count.onerror = () => { reject(count.error); db.close(); };
      };
    }));
    expect(retainedCount).toBe(0);
  });
});
