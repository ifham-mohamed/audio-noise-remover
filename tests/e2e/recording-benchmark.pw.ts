import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Opt in with a local path. Private media/results stay under ignored tmp/.
const recording = process.env.AI_NOICE_BENCHMARK_AUDIO_PATH;
const exec = promisify(execFile);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function residentBytes(): Promise<number | null> {
  if (process.platform !== "win32") return null;
  const cmd = `$list=Get-CimInstance Win32_Process; $ids=[System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${process.pid}); do { $added=$false; foreach($p in $list) { if($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added=$true } } } while($added); $browserIds=@($list | Where-Object { $ids.Contains([int]$_.ProcessId) -and $_.Name -eq 'msedge.exe' } | Select-Object -ExpandProperty ProcessId); if($browserIds.Count) { [long](Get-Process -Id $browserIds -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum).Sum } else { 0 }`;
  try { return Number((await exec("powershell", ["-NoProfile", "-Command", cmd], { timeout: 15_000 })).stdout.trim()); } catch { return null; }
}

test("benchmarks the complete private speech recording and saves a distinct validated output", async ({ page, browser }) => {
  test.skip(!recording, "Set AI_NOICE_BENCHMARK_AUDIO_PATH to explicitly select a private local recording.");
  test.setTimeout(900_000);
  const before = digest(await readFile(recording!));
  const origins = new Set<string>(); page.on("request", (request) => origins.add(new URL(request.url()).origin));
  page.on("response", async (response) => {
    if (response.url().includes("/api/final-jobs/") && response.request().method() === "POST" && !response.ok()) {
      const body = await response.json().catch(() => null);
      console.log(`FINAL_EVENT_REJECTED=${JSON.stringify(body?.error)}`);
    }
  });
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(recording!);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("switch", { name: "Voice clarity enabled" }).click();
  await page.getByRole("switch", { name: "Loudness normalization enabled" }).click();
  await page.getByLabel("Output name", { exact: true }).fill("clear-speech.wav");
  let sampledPeak = 0, samples = 0, sampling = false;
  const sample = async () => { if (sampling) return; sampling = true; const bytes = await residentBytes(); if (bytes !== null) { sampledPeak = Math.max(sampledPeak, bytes); samples++; } sampling = false; };
  const timer = setInterval(() => void sample(), 3000);
  const started = performance.now();
  try {
    await page.getByRole("button", { name: "Process", exact: true }).click();
    await expect.poll(async () => {
      const id = page.url().split("/").at(-1)!;
      const response = await page.request.get(`http://127.0.0.1:3100/api/final-jobs/${id}`);
      if (!response.ok) return false;
      const job = (await response.json()).data;
      return ["succeeded", "failed", "cancelled"].includes(job?.state);
    }, { timeout: 850_000, intervals: [1000] }).toBe(true);
    const id = page.url().split("/").at(-1)!;
    const terminal = (await (await page.request.get(`http://127.0.0.1:3100/api/final-jobs/${id}`)).json()).data;
    expect(terminal.state, JSON.stringify(terminal.failure)).toBe("succeeded");
    await expect(page.getByText("Experimental output validated locally", { exact: true })).toBeVisible();
  } finally { clearInterval(timer); }
  await sample();
  const wallTimeMs = Math.round(performance.now() - started);
  const id = page.url().split("/").at(-1)!;
  const job = (await (await page.request.get(`http://127.0.0.1:3100/api/final-jobs/${id}`)).json()).data;
  expect(job.state).toBe("succeeded"); expect(job.output.mediaValidated).toBe(true);
  expect(job.output.metrics["loudness-normalization"]).toBeDefined();
  const audio = page.getByLabel("Listen to the validated experimental model output");
  await expect.poll(() => audio.evaluate((element) => (element as HTMLAudioElement).readyState)).toBeGreaterThan(0);
  const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Download WAV" }).click();
  const download = await downloadEvent;
  const root = path.resolve("tmp/recording-benchmark"); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "run-")); const outputPath = path.join(directory, "clear-speech.wav");
  await download.saveAs(outputPath);
  const outputBytes = await readFile(outputPath); expect(digest(outputBytes)).toBe(job.output.sha256);
  expect(digest(await readFile(recording!))).toBe(before); expect(digest(outputBytes)).not.toBe(before);
  expect([...origins]).toEqual(["http://127.0.0.1:3100"]);
  const report = { browser: `Edge ${browser.version()}`, os: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, durationSeconds: job.output.durationSeconds, stages: job.enabledStages.map((stage: { id: string }) => stage.id), coordinatorElapsedMs: job.elapsedMs, wallTimeMs, sampledPeakBrowserWorkingSetBytes: sampledPeak || null, workingSetSamples: samples, memoryMethod: "3-second samples of Edge processes descended from this test worker; sampling may miss instantaneous peaks", validated: true, unchangedSource: true, sameOriginOnly: true, outputPath, metrics: job.output.metrics, listeningQuality: "not human-auditioned; no clean reference available" };
  await writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`PRIVATE_RECORDING_BENCHMARK_REPORT=${path.join(directory, "report.json")}`);
});

test("cancels the private long recording after real inference has begun without retaining output", async ({ page }) => {
  test.skip(!recording, "Private local recording benchmark is opt in.");
  test.setTimeout(240_000);
  const before = digest(await readFile(recording!)); let inferred = false;
  page.on("request", (request) => {
    if (!request.url().includes("/api/final-jobs/") || request.method() !== "POST") return;
    try { const body = request.postDataJSON(); if (body.event?.type === "progress" && body.event.stageId === "noise-removal" && body.event.progress > 0.14) inferred = true; } catch { /* Only inspect typed local progress messages. */ }
  });
  await page.goto("http://127.0.0.1:3100"); await page.locator('input[type="file"]').first().setInputFiles(recording!);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Process", exact: true }).click();
  await expect.poll(() => inferred, { timeout: 180_000 }).toBe(true);
  await page.getByRole("button", { name: "Cancel processing", exact: true }).click();
  await expect(page.getByText("Final processing cancelled. No final output was retained.", { exact: true })).toBeVisible({ timeout: 30_000 });
  const id = page.url().split("/").at(-1)!;
  const job = (await (await page.request.get(`http://127.0.0.1:3100/api/final-jobs/${id}`)).json()).data;
  expect(job.state).toBe("cancelled"); expect(job.output).toBeUndefined();
  const count = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("ai-noice-removal-final-artifacts", 1); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const query = db.transaction("outputs", "readonly").objectStore("outputs").count(); query.onsuccess = () => { resolve(query.result); db.close(); }; query.onerror = () => { reject(query.error); db.close(); }; };
  }));
  expect(count).toBe(0); expect(digest(await readFile(recording!))).toBe(before);
  const root = path.resolve("tmp/recording-benchmark"); await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "cancellation-report.json"), JSON.stringify({ actualInferenceStarted: true, state: job.state, outputCount: count, elapsedMs: job.elapsedMs, unchangedSource: true, spokenNarratorResult: "not tested" }, null, 2));
});
