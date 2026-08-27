import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const ganttBase = process.env.GANTT_BASE_URL ?? 'http://localhost:5566'
const here = import.meta.dirname
const testDir = path.join(here, '..', 'tests', 'gantt')
const resultsDir = path.join(here, '..', 'results')

export default defineConfig({
  testDir,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: path.join(resultsDir, 'test-results'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: ganttBase,
    storageState: path.join(resultsDir, '.auth', 'gantt-admin.json'),
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  // webServer disabled — both gantt + live-server are already running.
  webServer: [],
})