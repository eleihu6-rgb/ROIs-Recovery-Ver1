import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Demo-video config (Option A: SRT + ffmpeg burn-in).
 *
 * Records a full video for every test (`video: 'on'`) at a fixed 1440×900 frame
 * so the guided walkthrough is captured; the spec then burns its SRT into an
 * .mp4. Points at the public cr.rois.one tunnel with a REAL UI login — no auth
 * seeding — since the whole point is to show what a user actually sees.
 * Single worker / no retries so the recording is one clean take.
 */
export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  timeout: 420_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.GANTT_BASE_URL ?? 'https://cr.rois.one',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: true,
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'demo-video',
      // Any demo spec (pass the specific file on the CLI to record just one).
      testMatch: /gantt\/demo-.*\.spec\.ts/,
    },
  ],
  outputDir: path.join(__dirname, '../results/demo-video'),
})
