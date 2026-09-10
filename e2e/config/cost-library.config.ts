import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  testDir: path.resolve(directory, '../tests/gantt'),
  testMatch: 'cost-library.spec.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: process.env.GANTT_BASE_URL ?? 'http://localhost:5173', viewport: { width: 1440, height: 1000 }, actionTimeout: 15_000, screenshot: 'only-on-failure' },
  outputDir: path.resolve(directory, '../results/cost-library'),
})
