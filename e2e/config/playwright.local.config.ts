import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

const env = {
  ganttBase: process.env.GANTT_BASE_URL ?? 'http://localhost:5566',
  ganttApi: process.env.GANTT_API_URL ?? 'http://localhost:3000',
  ganttUser: process.env.GANTT_TEST_USER ?? 'admin',
  ganttPass: process.env.GANTT_TEST_PASS ?? '123456',
}

export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 600_000,
  reporter: [['list'], ['html', { outputFolder: path.join(__dirname, '../results/html-report'), open: 'never' }]],

  use: {
    baseURL: env.ganttBase,
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    viewport: { width: 1600, height: 1000 },
  },

  projects: [
    {
      name: 'gantt',
      testMatch: /tests\/gantt\/(?:recovery-context-menu|recovery-mixed-mode|recovery-1001-).*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: env.ganttBase,
      },
    },
  ],
})
