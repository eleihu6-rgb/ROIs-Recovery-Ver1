/**
 * Gantt Scenario detail-panel — two-column layout (Option 2).
 *
 * The detail panel used to stack every section in a single tall column
 * (Basic Info → Scope Filters → KPI), which forced vertical scrolling on a
 * wide panel and stretched the Date / Model / Rule controls full-width.
 *
 * This test proves the new layout:
 *   - Basic Info (left column) and Scope Filters (right column) sit SIDE BY
 *     SIDE — the Crew "Bases" control is clearly to the RIGHT of, and
 *     vertically aligned with, the Basic-Info "RP Date" control. In the old
 *     stacked layout Bases lived far BELOW RP Date at the same x, so this
 *     assertion would have failed before the change (a real regression guard).
 *   - The whole config fits without vertical scroll: the scrollable body's
 *     scrollHeight does not exceed its clientHeight at the standard viewport.
 *
 * Auth is seeded into sessionStorage the same way as scenario-detail-toolbar.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — detail-panel two-column layout', () => {
  const input: RoScenarioInput = {
    name: `RO-TwoCol-${Date.now()}`,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    crewBase: 'YEG',
    division: 'Pilots',
  }

  let token = ''

  const login = async (request: import('@playwright/test').APIRequestContext) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
    const json = (await res.json()) as {
      data: { token: string; userCode: string; userName: string; schema: string }
    }
    return json.data
  }

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

  test.afterEach(async ({ request }) => {
    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok()) return
    const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    for (const item of data.items) {
      await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  })

  test('Scen-2010 — Basic Info and Scope Filters sit side-by-side and the panel needs no vertical scroll', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    // Anchor controls: RP Date lives in Basic Info (left), Bases in Crew
    // Filters (right). Both must be visible before we measure geometry.
    const rpDateCtrl   = scenario.rpPeriod
    const basesCtrl = scenario.crewBases
    await expect(scenario.rpPeriod).toBeVisible()
    await expect(scenario.detailPanel).toContainText('RP Date')
    await expect(scenario.startDate).toHaveValue(input.startDate)
    await expect(scenario.endDate).toHaveValue(input.endDate)
    await expect(rpDateCtrl).toBeVisible()
    await expect(basesCtrl).toBeVisible()

    const dateBox     = await rpDateCtrl.boundingBox()
    const basesBox = await basesCtrl.boundingBox()
    expect(dateBox, 'RP Date control should have a box').not.toBeNull()
    expect(basesBox, 'Crew Bases control should have a box').not.toBeNull()
    if (!dateBox || !basesBox) throw new Error('missing boxes')

    // ── Side-by-side: Bases is in a separate RIGHT column, clearly to the
    //    right of the RP Date control (≥200px), not stacked beneath it. ───────
    expect(
      basesBox.x,
      `Crew Bases (${Math.round(basesBox.x)}) should be well right of RP Date (${Math.round(dateBox.x)})`,
    ).toBeGreaterThan(dateBox.x + 200)

    // ── Vertically aligned: the right column starts near the top, level with
    //    the RP Date row, not hundreds of px below it as in the old stack. ────
    expect(
      Math.abs(basesBox.y - dateBox.y),
      `Crew Bases y (${Math.round(basesBox.y)}) should be near RP Date y (${Math.round(dateBox.y)})`,
    ).toBeLessThan(300)

    // ── No vertical scroll: the scrollable body fits its own viewport. ───────
    const body = page.getByTestId('scenario-detail-body')
    await expect(body).toBeVisible()
    const overflow = await body.evaluate((el) => el.scrollHeight - el.clientHeight)
    expect(overflow, `detail body overflows by ${overflow}px (should fit without scroll)`).toBeLessThanOrEqual(4)
  })
})
