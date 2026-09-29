import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.pw.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "msedge",
    headless: true,
  },
  webServer: [
    {
      command: "npm run test:worker:serve",
      url: "http://127.0.0.1:4173/tests/e2e/worker-harness.html",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { AI_NOICE_PREVIEW_JOB_STORE_PATH: path.join(os.tmpdir(), `ai-noice-preview-e2e-${process.pid}.json`) },
    },
  ],
});
