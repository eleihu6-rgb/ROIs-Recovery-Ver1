import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '../tests/gantt',
  testMatch: /recovery-case-001\.spec\.ts/,
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.GANTT_BASE_URL ?? 'https://cr.rois.one',
    channel: 'chrome',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
  },
})
