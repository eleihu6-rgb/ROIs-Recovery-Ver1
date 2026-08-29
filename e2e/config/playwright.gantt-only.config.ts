import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

const ganttBase = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
// Optional demo pacing: PW_SLOWMO=<ms> delays each action so a headed run is watchable.
// Default 0 keeps CI/headless runs at full speed (no behaviour change).
const slowMo = Number(process.env.PW_SLOWMO ?? 0)

export default defineConfig({
  testDir: path.join(__dirname, '../tests/gantt'),
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: path.join(__dirname, '../results/test-results'),

  use: {
    ...devices['Desktop Chrome'],
    baseURL: ganttBase,
    storageState: path.join(__dirname, '../results/.auth/gantt-admin.json'),
    viewport: { width: 1440, height: 900 },
    launchOptions: { slowMo },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  // Only start gantt server; skip pbs-portal. When GANTT_BASE_URL is https://, no
  // server is managed at all (external deployment is already running).
  webServer: ganttBase.startsWith('https://') ? [] : [
    {
      command: `cd "${path.join(repoRoot, 'gantt')}" && npx vite --port 5173`,
      url: `${ganttBase}/altair/`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
