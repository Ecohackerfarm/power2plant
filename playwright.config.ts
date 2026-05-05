import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: {
    // Inside the dev container tests run against localhost; override with E2E_BASE_URL if needed
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Use system Chromium when running in the dev container (env var set by Dockerfile).
          // Omit executablePath in CI so Playwright uses its own installed binary.
          ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
            : {}),
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
})
