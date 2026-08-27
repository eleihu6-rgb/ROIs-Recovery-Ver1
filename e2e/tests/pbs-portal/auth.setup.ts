/**
 * PBS Auth Setup — validates the PBS backend + portal account once, before the
 * pbs-portal / pbs-app projects run, and writes a storageState file the projects
 * depend on.
 *
 * Auth contract (verified against the running stack):
 *   - GET {PBS_API}/api/auth/password-public-key
 *   - POST {PBS_API}/api/auth/session  { userCode, encryptedPassword, encryption }
 *   - success → { code: 200, data: { token, user, authMode } }   (envelope)
 *   - the portal stores the token in sessionStorage('pbs-portal.auth.token')
 *
 * NOTE: Playwright storageState persists localStorage/cookies, NOT sessionStorage,
 * so it cannot carry the portal token. Each authenticated spec therefore logs in
 * itself (real or mocked). This setup's job is to (a) fail fast with a clear
 * message if the PBS backend is down or the demo account changed, and (b) produce
 * the storageState file the project config requires.
 */
import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginToPbsApi } from '../../utils/pbs/auth'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.join(__dirname, '../../results/.auth/pbs-admin.json')

const PBS_USER = process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'
const PBS_API = process.env.PBS_API_URL ?? 'http://localhost:3002/api'

setup('validate PBS portal account (shared for Portal & App)', async ({ page, request }) => {
  const { token } = await loginToPbsApi(request, PBS_API, PBS_USER, PBS_PASS)
  expect(token, 'login response must carry data.token').toBeTruthy()

  // Persist a (token-less) storageState so the dependent projects have their file.
  await page.context().storageState({ path: AUTH_FILE })
})
