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
          // Prefer system Chromium (set by Dockerfile); fall back to Alpine default path
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
})
