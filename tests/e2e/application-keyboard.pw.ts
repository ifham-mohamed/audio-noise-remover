import { expect, test } from "@playwright/test";
import path from "node:path";

const wavFixture = path.resolve(__dirname, "../fixtures/preview/tone.wav");

test("keyboard intake starts and cancels preview accessibly without sending media bytes", async ({ page }) => {
  const previewRequestBodies: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/preview-jobs") && request.method() === "POST") previewRequestBodies.push(request.postDataJSON());
  });
  await page.goto("http://127.0.0.1:3100/");

  const dropzone = page.getByRole("button", { name: "Choose a local audio or video file" });
  await expect(dropzone).toBeVisible();
  await expect(dropzone).toHaveAttribute("tabindex", "0");
  await dropzone.focus();
  await expect(dropzone).toBeFocused();
  const fileInput = page.locator('input[type="file"]').first();
  await dropzone.evaluate((element) => element.addEventListener("keydown", () => element.setAttribute("data-keyboard-event-observed", "true"), { capture: true, once: true }));
  await fileInput.evaluate((input: HTMLInputElement) => {
    const nativeClick = input.click.bind(input);
    Object.defineProperty(input, "click", { configurable: true, value: () => { document.documentElement.dataset.filePickerActivated = "true"; nativeClick(); } });
  });
  await dropzone.press("Enter");
  await expect(dropzone).toHaveAttribute("data-keyboard-event-observed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-file-picker-activated", "true");
  await fileInput.setInputFiles(wavFixture);

  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  const previewButton = page.getByRole("button", { name: "Preview", exact: true });
  await expect(previewButton).toBeEnabled();
  await previewButton.focus();
  await expect(previewButton).toBeFocused();
  await previewButton.press("Enter");
  const cancelButton = page.getByRole("button", { name: "Cancel preview" });
  await expect(cancelButton).toBeVisible({ timeout: 60_000 });
  await cancelButton.click();
  await expect(page.getByRole("status").filter({ hasText: "Preview cancelled" })).toBeVisible({ timeout: 60_000 });

  expect(previewRequestBodies).toHaveLength(1);
  const requestBody = previewRequestBodies[0] as Record<string, unknown>;
  expect(Object.keys(requestBody)).toEqual(expect.arrayContaining(["media", "profile", "currentTimeSeconds"]));
  expect(requestBody).not.toHaveProperty("file");
  expect(requestBody).not.toHaveProperty("audioBytes");
  expect(requestBody).not.toHaveProperty("decodedAudio");
  expect((requestBody.profile as { stages: Array<{ id: string; enabled: boolean }> }).stages.find((stage) => stage.id === "voice-clarity")?.enabled).toBe(false);
});

test("the app announces a real enhanced preview as experimental", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:3100/");
  await page.locator('input[type="file"]').first().setInputFiles(wavFixture);
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();

  const voiceClarity = page.getByRole("switch", { name: "Voice clarity enabled" });
  await expect(voiceClarity).toHaveAttribute("aria-checked", "false");
  await expect(voiceClarity).toBeDisabled();
  await page.getByRole("button", { name: "Preview", exact: true }).click();

  await expect(page.getByRole("status").filter({ hasText: "Preview ready" })).toContainText("experimental model; not production-qualified", { timeout: 60_000 });
  await expect(page.getByText("Experimental model preview ready", { exact: false })).toContainText("Validated enhanced audio");
  await expect(page.getByRole("heading", { name: "Before and After" })).toBeVisible();
  const beforeWaveform = page.getByRole("img", { name: /Before waveform/ });
  await expect(beforeWaveform).toBeVisible();
  await expect(page.getByText(/Source bounds/)).toBeVisible();
  const afterButton = page.getByRole("button", { name: "After", exact: true });
  await afterButton.focus();
  await expect(afterButton).toBeFocused();
  await afterButton.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "After selected" })).toBeVisible();
  const comparisonSeek = page.getByRole("slider", { name: "Seek within preview comparison" });
  await comparisonSeek.focus();
  await comparisonSeek.press("ArrowRight");
  await expect(comparisonSeek).not.toHaveValue("0");
  const reducedMotionDurations = await Promise.all([beforeWaveform, comparisonSeek].map((element) => element.evaluate((node) => ({ transition: getComputedStyle(node).transitionDuration, animation: getComputedStyle(node).animationDuration }))));
  expect(reducedMotionDurations.every(({ transition, animation }) => Number.parseFloat(transition) <= 0.001 && Number.parseFloat(animation) <= 0.001)).toBe(true);
  const abButton = page.getByRole("button", { name: "A/B", exact: true });
  await abButton.focus();
  await abButton.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "A/B mode" })).toBeVisible();
  const muteButton = page.getByRole("button", { name: "Mute preview comparison" });
  await muteButton.focus();
  await expect(muteButton).toBeFocused();
  await muteButton.press("Space");
  await expect(page.getByRole("button", { name: "Unmute preview comparison" })).toBeVisible();
});

test("preserves visible focus and honors reduced-motion and forced-colors preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("http://127.0.0.1:3100/");
  const browseButton = page.getByRole("button", { name: "Browse files" });
  let reachedByKeyboard = false;
  for (let tab = 0; tab < 24 && !reachedByKeyboard; tab += 1) {
    await page.keyboard.press("Tab");
    reachedByKeyboard = await browseButton.evaluate((element) => document.activeElement === element);
  }
  expect(reachedByKeyboard).toBe(true);
  const focusStyle = await browseButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, transitionDuration: style.transitionDuration };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);
  expect(Number.parseFloat(focusStyle.transitionDuration)).toBeLessThanOrEqual(0.001);
  expect(await page.evaluate(() => ({ reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, forced: matchMedia("(forced-colors: active)").matches }))).toEqual({ reduced: true, forced: true });
});
