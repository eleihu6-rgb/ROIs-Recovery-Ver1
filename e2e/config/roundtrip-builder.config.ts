import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.join(directory, '../tests/gantt'),
  testMatch: 'roundtrip-builder.spec.ts',
  timeout: 600_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: path.join(directory, '../results/roundtrip-builder'),
  use: {
    baseURL: 'https://cr.rois.one',
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
})
