import { expect, test } from "@playwright/test";
import path from "node:path";

test("keeps speech controls usable and future profiles clearly unavailable", async ({ page }) => {
  await page.goto("http://127.0.0.1:3100");
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve(__dirname, "../fixtures/preview/tone.wav"));
  await expect(page.getByRole("heading", { name: "Ready to enhance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Music" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mixed audio" })).toBeVisible();
  await expect(page.getByText("Music denoising")).toBeVisible();
  await expect(page.getByText("Speech and music separation")).toBeVisible();
  await expect(page.getByText("No qualified local adapter is available yet.").first()).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(4);
  await expect(page.getByRole("switch", { name: "Noise removal enabled" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Voice clarity enabled" })).toHaveAttribute("aria-checked", "true");
});
