import { defineConfig } from "@playwright/test";

// BASE_URL points at the running stack (Compose proxy by default). PLAYWRIGHT_CHROMIUM_EXECUTABLE
// lets sandboxes without downloadable browsers use a preinstalled Chromium; CI installs its own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
  },
});
