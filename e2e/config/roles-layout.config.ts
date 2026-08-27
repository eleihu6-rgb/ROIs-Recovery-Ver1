import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.GANTT_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'roles-layout',
      testMatch: /roles-layout\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: process.env.GANTT_BASE_URL ?? 'http://localhost:5173' },
    },
  ],
})
