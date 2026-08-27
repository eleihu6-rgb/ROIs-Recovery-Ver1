/**
 * Rule 7305 — consecutive Days must use the crew-base local calendar, not UTC.
 *
 * Bug: scenario 740 / crew 1877 RES duties have null duty_ref_tz. rosterDuties used to
 * coalesce that to 0 (UTC), so a YYZ CRPM ending 2026-09-23 02:00Z was treated as occupying
 * Sep 23 and bridging the blank Sep 20 local day — Alert Center showed the false positive
 * "(9) [2026-09-15, 2026-09-23]". With the crew-base offset fallback (YYZ −240):
 *   - Sep 19 ends 22:00 local → Sep 20 blank → continuity breaks (no Sep 15 span)
 *   - Sep 25–30 RES run is 6 local days ending Sep 30 22:00 (not Oct 1)
 *
 * §Simulate-User: click the real roster-pane Recheck button; only read legality via the
 * same API the scenario view uses.
 *
 * Run:
 *   cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-740-7305-consecutive-days.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SCENARIO_ID = 740
const SCENARIO_SEARCH = 'QG - TEST- C-YYZ-Sep'
const CREW = '1877'

type Viol = { crew_id: string; rule_code: string; message: string }

/** Read the legality payload the scenario view reads (app proxy + session token). */
const getLegality = (page: Page): Promise<{ status: string; violations: Viol[] }> =>
  page.evaluate(async (sid) => {
    const tok = JSON.parse(sessionStorage.getItem('rois-auth') ?? '{}').token
    const r = await fetch(`/altair/live/api/scenario/${sid}/legality`, {
      headers: { authorization: `Bearer ${tok}` },
    })
    return (await r.json()).data as { status: string; violations: [] }
  }, SCENARIO_ID)

const crew7305 = (l: { violations: Viol[] }): Viol[] =>
  l.violations.filter((v) => v.crew_id === CREW && v.rule_code === '7305')

test('scenario 740 UI recheck uses YYZ local days for crew 1877 rule 7305', async ({ page, request }) => {
  test.setTimeout(600_000)

  // The app keeps its session in sessionStorage, which storageState does not carry.
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const { data: auth } = (await res.json()) as {
    data: { token: string; userCode: string; userName: string; schema: string }
  }
  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema },
        token: a.token,
      }),
    )
  }, auth)

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_SEARCH)
  await row.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 30_000 })

  await expect
    .poll(async () => (await getLegality(page)).status, { timeout: 60_000, intervals: [1000] })
    .not.toBe('COMPUTING')

  // ── The real user action: click the roster-pane Recheck button. ──
  const recheck = page.getByTestId('scenario-legality-recheck')
  await expect(recheck).toBeVisible({ timeout: 30_000 })
  await recheck.click()

  await expect
    .poll(
      async () => {
        const l = await getLegality(page)
        return l.status === 'READY' ? crew7305(l).length : -1
      },
      { timeout: 540_000, intervals: [3000] },
    )
    .toBeGreaterThan(0)

  const fired = crew7305(await getLegality(page))
  for (const v of fired) console.log(`  7305: ${v.message}`)

  // UTC-offset false positive must not return.
  expect(fired.some((v) => v.message.includes('(9) [2026-09-15, 2026-09-23]'))).toBe(false)
  expect(fired.some((v) => v.message.includes('[2026-09-15,'))).toBe(false)

  // Late-September RES block: Sep 25–30 local (CRPM ends 22:00 YYZ on the 30th).
  const late = fired.filter((v) => v.message.includes('[2026-09-25,'))
  expect(late.length, 'expected the Sep 25 consecutive-days violation').toBe(1)
  expect(late[0].message).toContain(
    'The number of consecutive roster days (6) [2026-09-25, 2026-09-30]',
  )
})
