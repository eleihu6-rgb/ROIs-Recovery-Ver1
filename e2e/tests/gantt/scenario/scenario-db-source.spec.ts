/**
 * Scenario Gantt — renders from the DB (SCENARIO_GANTT_SOURCE=db).
 *
 * Proves the Scenario Gantt renders correctly when live-server serves it from the
 * partition-backed `scenario` schema instead of parsing optimizer gz files:
 *   - 459  live-backed read path (pairing/flight partition 0 → f8.*)
 *   - 460  copy-backed read path (pairing 405 / flight 456 → scenario.*)
 *
 * REQUIRES live-server started with SCENARIO_GANTT_SOURCE=db. Rendering is gated on
 * scenario.roster_flight row presence, not status — 460 is FAILED-but-loaded and
 * still opens, proving the gate (459 was reconciled to DONE via the result loader).
 *
 * Asserts specifics (per CLAUDE.md §Playwright-Required): the payload's dataSource
 * is 'db', 26 crew rows render, at least one crew shows a non-zero MCred, and a
 * roster puck is on the canvas.
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { gotoScenarioList } from '../../../pages/gantt/scenario-nav'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: Auth }
  return json.data
}

// Fixed dev fixtures loaded into the scenario schema (roster + manday present).
// Selected by #id in the list because the live-backed names are duplicated in dev.
const CASES = [
  { label: 'live-backed (6)', id: 6, search: 'RO-2026-06 YEG Test---' },
  { label: 'live-backed (459)', id: 459, search: 'Copy of RO-2026-06 YEG Test---' },
  { label: 'copy-backed FAILED-but-loaded (460)', id: 460, search: 'Ryan-2026-06 YEG Test---' },
]

test.describe('Scenario Gantt — DB source', () => {
  let token = ''

  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    token = auth.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  for (const { label, id, search } of CASES) {
    test(`Scen-2030 — ${label} renders 26 crew + MCred from DB`, async ({ page }) => {
      // ── open the scenario gantt via the UI (search → select by #id → open) ──
      await page.goto('/altair/')
      await page.waitForLoadState('networkidle')
      await gotoScenarioList(page)
      await page.getByTestId('scenario-nav-ro').click()

      await page.getByPlaceholder('Search scenarios…').fill(search)
      // The live-backed fixture's name is duplicated in dev — pin to the #id badge.
      const item = page.getByTestId('scenario-list-item').filter({
        has: page.getByTestId('scenario-item-id').getByText(`#${id}`, { exact: true }),
      })
      await expect(item).toBeVisible({ timeout: 10_000 })
      await item.click()

      const detail = page.getByTestId('scenario-detail-panel')
      await expect(detail).toBeVisible()
      await detail.getByTestId('scenario-open-btn').click()

      const ganttView = page.getByTestId('scenario-gantt-view')
      await expect(ganttView).toBeVisible({ timeout: 15_000 })

      // ── assert the DB payload reached the store ──
      await expect
        .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid)?.crew.length ?? 0, id), {
          timeout: 15_000,
          message: 'scenario roster should load 26 crew',
        })
        .toBe(26)

      const roster = await page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid), id)
      expect(roster?.dataSource).toBe('db')
      expect(roster?.crew.length).toBe(26)
      // At least one crew has a non-zero MCred (credit flowed from scenario.crew_manday_*).
      const withCredit = roster!.crew.filter((c) => c.mCredHours > 0)
      expect(withCredit.length, 'at least one crew has non-zero MCred').toBeGreaterThan(0)

      // ── a roster puck is drawn on the canvas ──
      await expect
        .poll(async () => page.evaluate((sid) => window.__ganttTest?.scenarioRosterPuck(sid) != null, id), {
          timeout: 15_000,
          message: 'a roster puck should be on the canvas',
        })
        .toBe(true)
    })
  }
})
