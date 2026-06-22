import { defineConfig, devices } from '@playwright/test';

/**
 * MockJ Playwright E2E Test Configuration
 * Run: npx playwright test
 * UI Mode: npx playwright test --ui
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['html'], ['github'], ['json', { outputFile: 'test-results/results.json' }]]
    : [['html', { open: 'on-failure' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Generous timeouts for AI response waits
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Desktop browsers
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },

    // Mobile
    { name: 'mobile-chrome',  use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari',  use: { ...devices['iPhone 14'] } },
  ],

  // Auto-start dev server when running locally
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
