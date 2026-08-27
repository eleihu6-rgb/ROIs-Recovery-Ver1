import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

/**
 * Environment variables (set in .env or CI pipeline). Defaults point ONLY at
 * this project's own services — never another repo's dev server.
 *
 * GANTT_BASE_URL      — Gantt frontend origin (default http://localhost:5173; app at /altair/)
 * PBS_PORTAL_BASE_URL — PBS Portal app base   (default http://localhost:3030/pbs;
 *                       the portal's own vite serves under base path /pbs/.
 *                       NOTE: :5174 is the unrelated ROIs-Suit-MM frontend — do NOT use it.)
 * PBS_APP_BASE_URL    — PBS App (Expo) web URL (default http://localhost:8081)
 * GANTT_API_URL       — Gantt/live-server API  (default http://localhost:3000)
 * PBS_API_URL         — PBS backend API        (default http://localhost:3002/api)
 *
 * Portal test account: PBS crew accounts are numeric crew codes with the shared
 * demo password 'rois' (admin/123456 is a live-server account and is NOT a portal user).
 */

// ─── Environment with fallbacks ────────────────────────────────────────────

const env = {
  ganttBase: process.env.GANTT_BASE_URL ?? 'http://localhost:5173',
  // The portal SPA only resolves routes under its /pbs/ base; baseURL must
  // include it so relative goto('login') → …/pbs/login.
  pbsPortalBase: process.env.PBS_PORTAL_BASE_URL ?? 'http://localhost:3030/pbs',
  pbsAppBase: process.env.PBS_APP_BASE_URL ?? 'http://localhost:8081',
  ganttApi: process.env.GANTT_API_URL ?? 'http://localhost:3000',
  pbsApi: process.env.PBS_API_URL ?? 'http://localhost:3002',

  // Test credentials
  ganttUser: process.env.GANTT_TEST_USER ?? 'admin',
  ganttPass: process.env.GANTT_TEST_PASS ?? '123456',
  pbsUser: process.env.PBS_TEST_USER ?? '762',
  pbsPass: process.env.PBS_TEST_PASS ?? 'rois',
}

// baseURL must end with a slash so relative paths resolve under /pbs/.
const pbsPortalBaseURL = env.pbsPortalBase.endsWith('/') ? env.pbsPortalBase : `${env.pbsPortalBase}/`

// ─── Playwright config ─────────────────────────────────────────────────────

export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  reporter: [
    ['html', { outputFolder: path.join(__dirname, '../results/html-report'), open: 'never' }],
    ['list'],
    ['junit', { outputFile: path.join(__dirname, '../results/junit-results.xml') }],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // ─── Gantt (independent auth) ────────────────────────────────────────
    {
      name: 'gantt',
      testMatch: /tests\/gantt\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.ganttBase,
        storageState: path.join(__dirname, '../results/.auth/gantt-admin.json'),
        viewport: { width: 1440, height: 900 },
      },
      dependencies: ['gantt-setup'],
  },
  {
    name: 'gantt-setup',
    testMatch: /tests\/gantt\/.*\.setup\.ts/,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: env.ganttBase,
      },
    },

    // ─── PBS Portal (shared auth with PBS App) ──────────────────────────
    {
      name: 'pbs-portal',
      testMatch: /tests\/pbs-portal\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: pbsPortalBaseURL,
        storageState: path.join(__dirname, '../results/.auth/pbs-admin.json'),
        viewport: { width: 1440, height: 900 },
      },
      dependencies: ['pbs-setup'],
  },
  {
    name: 'pbs-setup',
    testMatch: /tests\/pbs-portal\/.*\.setup\.ts/,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: pbsPortalBaseURL,
      },
    },

    // ─── PBS App (shared auth with PBS Portal) ──────────────────────────
    {
      name: 'pbs-app',
      testMatch: /tests\/pbs-app\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.pbsAppBase,
        storageState: path.join(__dirname, '../results/.auth/pbs-admin.json'),
        viewport: { width: 375, height: 667 },
      },
      dependencies: ['pbs-setup'],
    },

    // ─── Production/performance checks ─────────────────────────────────
    {
      name: 'perf',
      testMatch: /tests\/perf\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // ─── Playwright live-stream subsystem (no auth/server deps; talks to
    //     ai-server :3005 only) ──────────────────────────────────────────
    {
      name: 'live-stream',
      testMatch: /tests\/live-stream\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  outputDir: path.join(__dirname, '../results/test-results'),

  // Web servers — only managed in local dev (localhost). For remote/UAT environments
  // (https:// base URL) the server is already running externally; attempting to check
  // an external URL from within the runner machine causes a 120s timeout that blocks
  // all tests with no error log.
  webServer: env.ganttBase.startsWith('https://') ? [] : [
    {
      command: `cd "${path.join(repoRoot, 'gantt')}" && npx vite --port 5173`,
      url: `${env.ganttBase}/altair/`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Use the portal's own vite config (serves under /pbs/ on its own
      // port, 3030). Do NOT force --port 5174 — that port is the unrelated
      // ROIs-Suit-MM frontend.
      command: `cd "${path.join(repoRoot, 'pbs-portal')}" && npx vite`,
      url: pbsPortalBaseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
