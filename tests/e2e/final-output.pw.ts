import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.resolve(__dirname, "../fixtures/preview/tone.wav");

test("creates a validated experimental full-file WAV artifact locally", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }));
  const requestOrigins = new Set<string>();
  const apiBodies: string[] = [];
  page.on("request", (request) => {
    requestOrigins.add(new URL(request.url()).origin);
    if (request.url().includes("/api/final-jobs") && request.method() !== "GET") apiBodies.push(request.postData() ?? "");
  });
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
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
      return await new Promise<{ sourceCount: number; sourceBytes: number[]; outputs: { artifactId: string; fileName: string; bytes: number[]; mimeType: string; validated: boolean }[] }>((resolve, reject) => {
        const tx = db.transaction(["sources", "outputs"], "readonly");
        const sources = tx.objectStore("sources").getAll();
        const outputs = tx.objectStore("outputs").getAll();
        tx.oncomplete = () => resolve({ sourceCount: sources.result.length, sourceBytes: Array.from(new Uint8Array(sources.result[0]?.bytes ?? new ArrayBuffer(0))), outputs: outputs.result.map((output) => ({ artifactId: output.artifactId, fileName: output.fileName, bytes: Array.from(new Uint8Array(output.bytes ?? new ArrayBuffer(0))), mimeType: output.mimeType, validated: output.validated })) });
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
  const audio = page.getByLabel("Listen to the validated experimental model output");
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate((element) => (element as HTMLAudioElement).readyState)).toBeGreaterThan(0);
  expect(await audio.evaluate((element) => (element as HTMLAudioElement).currentSrc)).toMatch(/^blob:/);
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
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download WAV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(artifacts.outputs[0]!.fileName);
  const downloadedBytes = await readFile((await download.path())!);
  expect(downloadedBytes.byteLength).toBe(artifacts.outputs[0]!.bytes.length);
  expect(downloadedBytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect([...downloadedBytes]).toEqual(artifacts.outputs[0]!.bytes);
  const processingUrl = page.url();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "tone.wav" })).toBeVisible();
  await page.getByText("Attempt details").click();
  const historyActions = page.getByRole("group", { name: "Local output actions" });
  await expect(historyActions.getByRole("button", { name: "Download WAV" })).toBeEnabled();
  const historyDownloadPromise = page.waitForEvent("download");
  await historyActions.getByRole("button", { name: "Download WAV" }).click();
  const historyDownload = await historyDownloadPromise;
  expect(historyDownload.suggestedFilename()).toBe(artifacts.outputs[0]!.fileName);
  expect([...(await readFile((await historyDownload.path())!))]).toEqual(artifacts.outputs[0]!.bytes);
  await expect(historyActions.getByRole("status")).toContainText(/browser has been asked to download this WAV/i);
  await page.goto(processingUrl);
  await page.evaluate(async (artifactId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("ai-noice-removal-final-artifacts", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("outputs", "readwrite"); const store = tx.objectStore("outputs"); const get = store.get(artifactId); get.onsuccess = () => { const output = get.result; new Uint8Array(output.bytes)[0] = 78; store.put(output); }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
  }, artifacts.outputs[0]!.artifactId);
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "not a RIFF/WAVE file" })).toBeVisible();
  await expect(page.getByLabel("Listen to the validated experimental final output")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download WAV" })).toHaveCount(0);
  await page.evaluate(async (artifactId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("ai-noice-removal-final-artifacts", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("outputs", "readwrite"); tx.objectStore("outputs").delete(artifactId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
  }, artifacts.outputs[0]!.artifactId);
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "no longer available in this browser" })).toBeVisible();
  await expect(page.getByLabel("Listen to the validated experimental final output")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download WAV" })).toHaveCount(0);
});

test("uses a browser download instead of an unsafe path picker", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async () => { document.body.dataset.pickerInvoked = "true"; throw new Error("The save picker must not be used without source-handle identity."); } }));
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("Experimental output validated locally")).toBeVisible({ timeout: 100_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download WAV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("enhanced-output.wav");
  expect(await page.locator("body").getAttribute("data-picker-invoked")).toBeNull();
  await expect(page.getByRole("status").filter({ hasText: "download has started" })).toBeVisible();
});

test("creates a validated WAV using voice clarity alone without requesting the denoising model", async ({ page }) => {
  const modelRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/preview-model")) modelRequests.push(request.url()); });
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await page.getByRole("switch", { name: "Noise removal enabled" }).click();
  await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
  await expect(page.getByRole("switch", { name: "Noise removal enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("Local voice-clarity output validated")).toBeVisible({ timeout: 100_000 });
  await expect(page.getByText("This output uses the bounded local voice-clarity EQ; listen to confirm it suits your recording.", { exact: true })).toBeVisible();
  await expect(page.getByText("Validated WAV · local-only · bounded clarity DSP; listening quality is not certified", { exact: true })).toBeVisible();
  expect(modelRequests).toEqual([]);
});

test("processes noise removal before voice clarity in the full-file WAV workflow", async ({ page }) => {
  const modelRequests: string[] = [];
  const stageOrder: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/preview-model")) modelRequests.push(request.url());
    if (request.url().includes("/api/final-jobs/") && request.method() === "POST") {
      try {
        const body = request.postDataJSON() as { command?: string; event?: { phase?: string; type?: string } };
        if (body.command === "event" && body.event?.type === "progress" && body.event.phase === "Applying experimental noise removal" && !stageOrder.includes("noise-removal")) stageOrder.push("noise-removal");
        if (body.command === "event" && body.event?.type === "progress" && body.event.phase === "Applying voice clarity" && !stageOrder.includes("voice-clarity")) stageOrder.push("voice-clarity");
      } catch { /* Other local job requests do not carry worker stage progress. */ }
    }
  });
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
  await expect(page.getByRole("switch", { name: "Noise removal enabled" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("Experimental output validated locally")).toBeVisible({ timeout: 100_000 });
  await expect(page.getByText("This DPDFNet-based result is experimental and not production-qualified.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Stages: Noise removal · Voice clarity/)).toBeVisible();
  expect(stageOrder).toEqual(["noise-removal", "voice-clarity"]);
  expect(modelRequests.length).toBeGreaterThan(0);
});

test("retries model-unavailable output as a new linked local attempt", async ({ page }) => {
  let failFirstModelRequest = true;
  const retryBodies: string[] = [];
  const retryOrigins = new Set<string>();
  page.on("request", (request) => {
    if (request.url().endsWith("/api/final-jobs") && request.method() === "POST") { retryBodies.push(request.postData() ?? ""); retryOrigins.add(new URL(request.url()).origin); }
  });
  await page.route("**/api/preview-model", async (route) => { if (failFirstModelRequest) { failFirstModelRequest = false; await route.fulfill({ status: 404, body: "missing local model" }); } else await route.continue(); });
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
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
  const failedAttemptId = new URL(page.url()).pathname.split("/").at(-1)!;
  const retryButton = page.getByRole("button", { name: "Retry as a new attempt" });
  await retryButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Experimental output validated locally")).toBeVisible({ timeout: 100_000 });
  const retryDetails = await page.evaluate(async (priorId) => {
    const currentId = location.pathname.split("/").at(-1)!;
    const [currentResponse, previousResponse] = await Promise.all([fetch(`/api/final-jobs/${currentId}`), fetch(`/api/final-jobs/${priorId}`)]);
    return { current: (await currentResponse.json()).data, previous: (await previousResponse.json()).data };
  }, failedAttemptId);
  expect(retryDetails.current.id).not.toBe(failedAttemptId);
  expect(retryDetails.current.retryOf).toBe(failedAttemptId);
  expect(retryDetails.current.state).toBe("succeeded");
  expect(retryDetails.previous.state).toBe("failed");
  await expect(page.getByRole("link", { name: `attempt ${failedAttemptId.slice(0, 8)}` })).toBeVisible();
  const retryRequest = retryBodies.map((body) => JSON.parse(body)).find((body) => body.retryOfJobId === failedAttemptId);
  expect(retryRequest).toMatchObject({ retryOfJobId: failedAttemptId, clientAttemptId: retryDetails.current.id });
  expect(JSON.stringify(retryRequest)).not.toContain("RIFF");
  expect([...retryOrigins]).toEqual(["http://127.0.0.1:3100"]);
});

test("fails closed when the pinned model bytes do not match the verified model", async ({ page }) => {
  await page.route("**/api/preview-model", (route) => route.fulfill({ status: 200, contentType: "application/octet-stream", body: "not-the-pinned-model" }));
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
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

test("does not create a retry attempt when the original source is missing locally", async ({ page }) => {
  await page.route("**/api/preview-model", (route) => route.fulfill({ status: 404, body: "missing local model" }));
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("The pinned experimental model is unavailable or failed verification. Set it up locally, then retry.", { exact: true })).toBeVisible({ timeout: 30_000 });
  const before = await page.evaluate(async () => (await (await fetch("/api/final-jobs")).json()).data.length as number);
  const failedAttemptId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.evaluate(async (sourceRef) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("ai-noice-removal-final-artifacts", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("sources", "readwrite"); tx.objectStore("sources").delete(sourceRef); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
  }, failedAttemptId);
  const retryButton = page.getByRole("button", { name: "Retry as a new attempt" });
  await retryButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "The original file is no longer retained" })).toBeVisible();
  const after = await page.evaluate(async () => (await (await fetch("/api/final-jobs")).json()).data.length as number);
  expect(after).toBe(before);
});

test("does not create a retry attempt when retained source bytes are unreadable", async ({ page }) => {
  await page.route("**/api/preview-model", (route) => route.fulfill({ status: 404, body: "missing local model" }));
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
  await page.getByRole("button", { name: "Process" }).click();
  await expect(page.getByText("The pinned experimental model is unavailable or failed verification. Set it up locally, then retry.", { exact: true })).toBeVisible({ timeout: 30_000 });
  const before = await page.evaluate(async () => (await (await fetch("/api/final-jobs")).json()).data.length as number);
  const failedAttemptId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.evaluate(async (sourceRef) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("ai-noice-removal-final-artifacts", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sources", "readwrite"); const store = tx.objectStore("sources"); const get = store.get(sourceRef);
        get.onsuccess = () => { const record = get.result; const bytes = new Uint8Array(record.bytes); bytes.set([78, 79, 80, 69], 0); record.bytes = bytes.buffer; store.put(record); };
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, failedAttemptId);
  await page.getByRole("button", { name: "Retry as a new attempt" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "not a readable RIFF/WAVE file" })).toBeVisible();
  const after = await page.evaluate(async () => (await (await fetch("/api/final-jobs")).json()).data.length as number);
  expect(after).toBe(before);
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
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toBeEnabled();
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
