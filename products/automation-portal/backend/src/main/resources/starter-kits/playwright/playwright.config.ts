import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

// FrameworkRunnerService invokes `npx playwright test` directly, never `npm test` — so .env
// is never picked up by any npm-script mechanism. Playwright always loads this config file
// itself before running anything, so `import 'dotenv/config'` here is what actually gets
// PORTAL_URL / PORTAL_API_KEY / EXECUTION_ID into process.env for tests/reporter/
// testrix-reporter.ts to read, regardless of how the CLI was invoked.
export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['./tests/reporter/testrix-reporter.ts'],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  // Testrix's Framework Runner always dispatches with `--project=<requested browser>` (default
  // "chrome" — see FrameworkRunnerService.runPlaywright()), so a project of that name must exist
  // or the run fails immediately with "Project(s) 'chrome' not found". `channel: 'chrome'` drives
  // the system-installed Google Chrome already baked into the Framework Runner's Docker image
  // instead of Playwright's own bundled Chromium, which that image deliberately never downloads.
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
