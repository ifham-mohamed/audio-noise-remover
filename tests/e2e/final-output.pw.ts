import { expect, test } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve(__dirname, "../fixtures/preview/tone.wav");

test("creates a validated experimental full-file WAV artifact locally", async ({ page }) => {
  test.setTimeout(120_000);
  const requestOrigins = new Set<string>();
  const apiBodies: string[] = [];
  page.on("request", (request) => {
    requestOrigins.add(new URL(request.url()).origin);
    if (request.url().includes("/api/final-jobs") && request.method() !== "GET") apiBodies.push(request.postData() ?? "");
  });
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
  await expect(page.getByRole("button", { name: "Process" })).toBeEnabled();
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("Experimental output validated locally")).toBeVisible({ timeout: 100_000 });
  await expect(page.getByText(/This DPDFNet-based result is experimental and not production-qualified/)).toBeVisible();
  expect([...requestOrigins]).toEqual(["http://127.0.0.1:3100"]);
  expect(apiBodies.length).toBeGreaterThan(1);
  expect(apiBodies.join("\n")).not.toContain("RIFF");

  const artifacts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ai-noice-removal-final-artifacts", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<{ sourceCount: number; sourceBytes: number[]; outputs: { bytes: number[]; mimeType: string; validated: boolean }[] }>((resolve, reject) => {
        const tx = db.transaction(["sources", "outputs"], "readonly");
        const sources = tx.objectStore("sources").getAll();
        const outputs = tx.objectStore("outputs").getAll();
        tx.oncomplete = () => resolve({ sourceCount: sources.result.length, sourceBytes: Array.from(new Uint8Array(sources.result[0]?.bytes ?? new ArrayBuffer(0))), outputs: outputs.result.map((output) => ({ bytes: Array.from(new Uint8Array(output.bytes ?? new ArrayBuffer(0))), mimeType: output.mimeType, validated: output.validated })) });
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  expect(artifacts.sourceCount).toBe(1);
  expect(artifacts.sourceBytes.length).toBeGreaterThan(44);
  expect(artifacts.outputs).toHaveLength(1);
  expect(artifacts.outputs[0]?.validated).toBe(true);
  expect(artifacts.outputs[0]?.mimeType).toBe("audio/wav");
  expect(artifacts.outputs[0]?.bytes.length).toBeGreaterThan(44);
  const signalChange = await page.evaluate(async ({ source, output }) => {
    const audio = new AudioContext();
    try {
      const [before, after] = await Promise.all([audio.decodeAudioData(Uint8Array.from(source).buffer), audio.decodeAudioData(Uint8Array.from(output).buffer)]);
      const beforeSamples = before.getChannelData(0); const afterSamples = after.getChannelData(0);
      if (beforeSamples.length !== afterSamples.length) return false;
      let difference = 0;
      for (let index = 0; index < beforeSamples.length; index += 1) difference += Math.abs(beforeSamples[index]! - afterSamples[index]!);
      return difference / beforeSamples.length > 1e-5;
    } finally { await audio.close(); }
  }, { source: artifacts.sourceBytes, output: artifacts.outputs[0]!.bytes });
  expect(signalChange).toBe(true);
});

test("fails closed when the pinned model is unavailable and retains no final output", async ({ page }) => {
  await page.route("**/api/preview-model", (route) => route.fulfill({ status: 404, body: "missing local model" }));
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("The pinned experimental model is unavailable or failed verification. Set it up locally, then retry.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Your original remains unchanged, and no successful output is available.", { exact: true })).toBeVisible();
  const outputCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("ai-noice-removal-final-artifacts", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const count = db.transaction("outputs", "readonly").objectStore("outputs").count();
      count.onsuccess = () => { resolve(count.result); db.close(); };
      count.onerror = () => { reject(count.error); db.close(); };
    };
  }));
  expect(outputCount).toBe(0);
});

test("fails closed when the pinned model bytes do not match the verified model", async ({ page }) => {
  await page.route("**/api/preview-model", (route) => route.fulfill({ status: 200, contentType: "application/octet-stream", body: "not-the-pinned-model" }));
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("The pinned experimental model is unavailable or failed verification. Set it up locally, then retry.", { exact: true })).toBeVisible({ timeout: 30_000 });
  const outputCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("ai-noice-removal-final-artifacts", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const count = db.transaction("outputs", "readonly").objectStore("outputs").count();
      count.onsuccess = () => { resolve(count.result); db.close(); }; count.onerror = () => { reject(count.error); db.close(); };
    };
  }));
  expect(outputCount).toBe(0);
});

test("cancels an active local worker and retains no final artifact", async ({ page }) => {
  let announceModelRequest!: () => void;
  let releaseModelResponse!: () => void;
  const modelRequested = new Promise<void>((resolve) => { announceModelRequest = resolve; });
  const modelResponseGate = new Promise<void>((resolve) => { releaseModelResponse = resolve; });
  let announceCancelledEvent!: () => void;
  let releaseCancelledEvent!: () => void;
  const cancelledEventSeen = new Promise<void>((resolve) => { announceCancelledEvent = resolve; });
  const cancelledEventGate = new Promise<void>((resolve) => { releaseCancelledEvent = resolve; });
  const cancelBodies: string[] = [];
  let failCancellationFinalizationOnce = true;
  page.on("request", (request) => { if (request.url().includes("/api/final-jobs/") && request.method() === "POST") cancelBodies.push(request.postData() ?? ""); });
  await page.route("**/api/preview-model", async (route) => { announceModelRequest(); await modelResponseGate; await route.fulfill({ status: 404, body: "cancelled before response" }); });
  await page.route("**/api/final-jobs/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && JSON.parse(request.postData() ?? "{}").event?.type === "cancelled") {
      announceCancelledEvent(); await cancelledEventGate;
      if (failCancellationFinalizationOnce) { failCancellationFinalizationOnce = false; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ data: null, error: { code: "FINAL_JOB_UNAVAILABLE", message: "Temporary local-store failure." }, requestId: "test-request" }) }); return; }
    }
    await route.continue();
  });
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
  await page.getByRole("button", { name: "Process" }).click();
  await modelRequested;
  const cancelButton = page.getByRole("button", { name: "Cancel processing" });
  await expect(cancelButton).toBeEnabled({ timeout: 30_000 });
  await cancelButton.focus();
  await page.keyboard.press("Enter");
  await cancelledEventSeen;
  await expect(page.locator("p.sr-only[role=status]")).toHaveText("Cancelling final processing. Waiting for the local worker to stop.");
  releaseCancelledEvent();
  await expect(page.getByRole("alert").filter({ hasText: "Temporary local-store failure." })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Retry cancellation confirmation" }).click();
  await expect(page.getByText("Final processing cancelled. No final output was retained.", { exact: true })).toBeVisible({ timeout: 15_000 });
  const outputCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("ai-noice-removal-final-artifacts", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const count = db.transaction("outputs", "readonly").objectStore("outputs").count(); count.onsuccess = () => { resolve(count.result); db.close(); }; count.onerror = () => { reject(count.error); db.close(); }; };
  }));
  expect(outputCount).toBe(0);
  releaseModelResponse();
  await page.waitForTimeout(300);
  const lateOutputCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("ai-noice-removal-final-artifacts", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const count = db.transaction("outputs", "readonly").objectStore("outputs").count(); count.onsuccess = () => { resolve(count.result); db.close(); }; count.onerror = () => { reject(count.error); db.close(); } };
  }));
  expect(lateOutputCount).toBe(0);
  expect(cancelBodies.map((body) => JSON.parse(body))).toContainEqual({ command: "cancel" });
  expect(cancelBodies.every((body) => !/RIFF|bytes|artifact/i.test(body))).toBe(true);
});
