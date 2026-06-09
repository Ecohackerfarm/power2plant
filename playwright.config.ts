import { defineConfig, devices } from '@playwright/test'

const chromiumOptions = {
  ...devices['Desktop Chrome'],
  launchOptions: {
    // Use system Chromium in dev container; CI uses Playwright's own binary.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...chromiumOptions },
    },
    {
      name: 'chromium',
      use: { ...chromiumOptions },
      dependencies: ['setup'],
    },
  ],
})
