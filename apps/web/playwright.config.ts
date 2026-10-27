import { defineConfig, devices } from "@playwright/test";

if (process.env.E2E_LOCAL_SUPABASE !== "1") throw new Error("Run pnpm test:e2e from the repository root to use local Supabase.");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "uv run --directory ../api uvicorn app.main:app --host 127.0.0.1 --port 8001", url: "http://127.0.0.1:8001/ready", reuseExistingServer: false, timeout: 60_000 },
    { command: "NEXT_DIST_DIR=.next-e2e pnpm dev --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120_000 },
  ],
});
