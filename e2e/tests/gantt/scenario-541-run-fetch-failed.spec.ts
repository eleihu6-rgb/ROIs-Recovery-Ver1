import { test, expect, request as pwRequest } from '@playwright/test'

/**
 * Repro for "scenario 541 run → fetch failed".
 *
 * gantt `Run` → live-server `POST /api/scenario/:id/run` → live-server fetches
 * engine-server `${ENGINE_SERVER_URL}/api/optimize/start`. If ENGINE_SERVER_URL
 * points at a dead port, undici throws `fetch failed`, which /run returns as a
 * 500. Root cause found: live-server/.env had ENGINE_SERVER_URL=:3013 while the
 * engine-server actually listens on :3003.
 *
 * This test fails (red) while the misconfig stands and passes once the run
 * reaches a live engine-server (no "fetch failed").
 */
const LIVE = process.env.GANTT_API_URL || 'http://127.0.0.1:3000'
const CRED = { userCode: 'Ryan', password: 'Our2027' }
const SCENARIO = 541

test('scenario run reaches engine-server (no "fetch failed")', async () => {
  const ctx = await pwRequest.newContext({ baseURL: LIVE })

  const login = await ctx.post('/api/auth/login', { data: CRED })
  expect(login.ok(), `login HTTP ${login.status()}`).toBeTruthy()
  const token = ((await login.json()) as { data: { token: string } }).data.token
  expect(token, 'login returned no token').toBeTruthy()

  const run = await ctx.post(`/api/scenario/${SCENARIO}/run`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  })
  const body = await run.text()
  // eslint-disable-next-line no-console
  console.log(`[scenario ${SCENARIO} run] HTTP ${run.status()} :: ${body}`)

  expect(body.toLowerCase(), 'live-server could not reach engine-server').not.toContain('fetch failed')
  expect(run.status(), body).toBeLessThan(500)
})
