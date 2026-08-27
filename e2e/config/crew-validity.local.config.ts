import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Crew rank/base validity E2E config — run the crew-validity specs against any running
 * gantt + live-server pair (no webServer management here; the standard ports or overrides):
 *
 *   GANTT_BASE_URL=http://localhost:5173 GANTT_API_URL=http://localhost:3000 \
 *     npx playwright test --config=config/crew-validity.local.config.ts \
 *       filter/crew-validity-filter.spec.ts roster/crew-validity-redline.spec.ts \
 *       scenario/crew-validity-scenario.spec.ts
 */
export default defineConfig({
  testDir: path.join(__dirname, '../gantt'),
  fullyParallel: false,
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.GANTT_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: [],
})
