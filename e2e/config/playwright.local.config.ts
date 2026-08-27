import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

const env = {
  ganttBase: process.env.GANTT_BASE_URL ?? 'http://localhost:5173',
  ganttApi: process.env.GANTT_API_URL ?? 'http://localhost:3000',
  ganttUser: process.env.GANTT_TEST_USER ?? 'admin',
  ganttPass: process.env.GANTT_TEST_PASS ?? '123456',
}

const AUTH_FILE = path.join(__dirname, '../results/.auth/gantt-admin.json')

// Read saved token from auth file (if exists) and inject sessionStorage
function getAuthInitScript() {
  // We need to login via API in each test since storageState doesn't save sessionStorage
  return `
    (async () => {
      const GANTT_API = '${env.ganttApi}';
      const GANTT_USER = '${env.ganttUser}';
      const GANTT_PASS = '${env.ganttPass}';

      try {
        const res = await fetch(GANTT_API + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userCode: GANTT_USER, password: GANTT_PASS })
        });
        const data = await res.json();
        window.sessionStorage.setItem('rois-auth', JSON.stringify({
          user: { userCode: data.userCode, userName: data.userName, schema: data.schema },
          token: data.token
        }));
      } catch (e) {
        console.error('Auth injection failed:', e);
      }
    })();
  `
}

export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  fullyParallel: true,
  timeout: 60_000,
  reporter: [['list']],

  use: {
    baseURL: env.ganttBase,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'gantt-auth',
      testMatch: /tests\/gantt\/auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.ganttBase,
      },
    },
    {
      name: 'gantt-local',
      testMatch: /tests\/gantt\/flight-pane\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.ganttBase,
        viewport: { width: 1440, height: 900 },
        // Inject auth before each test
        storageState: AUTH_FILE,
      },
      dependencies: ['gantt-auth'],
    },
  ],

  outputDir: path.join(__dirname, '../results/test-results'),
})
