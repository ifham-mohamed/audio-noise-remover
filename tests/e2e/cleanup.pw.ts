import { expect, test } from "@playwright/test";

test("confirms exact local output cleanup accessibly and reports completion", async ({ page }) => {
  const phases: string[] = [];
  await page.route("**/api/cleanup", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { finalJobs: [], previewJobs: [] }, error: null, requestId: "00000000-0000-4000-8000-000000000099" }) });
      return;
    }
    const body = route.request().postDataJSON() as { phase: string; scope: string };
    phases.push(body.phase);
    if (body.phase === "prepare") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { token: "00000000-0000-4000-8000-000000000020" }, error: null, requestId: "cleanup-prepare" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { scope: "REMOVE_OUTPUTS", items: [], complete: true }, error: null, requestId: "cleanup-finish" }) });
  });

  await page.goto("http://127.0.0.1:3100/settings");
  const trigger = page.getByRole("button", { name: "Clear outputs" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Confirm local cleanup" });
  await expect(dialog).toContainText("final output bytes only");
  await expect(dialog).toContainText("Original user files and browser downloads are not affected");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("button", { name: "Confirm cleanup" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cleanup complete" })).toBeVisible();
  expect(phases).toEqual(["prepare", "finish"]);
});
