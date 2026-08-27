/**
 * BUG IDENTIFIER — expected RED until the dev team fixes the product.
 *
 * Lost-update race in gantt/src/stores/scenario-store.ts → saveDetail():
 * on a successful save the success handler does
 *     set({ detail: updated, draftDetail: { ...updated }, isDirty: false, ... })
 * which OVERWRITES draftDetail (and resets isDirty) with the server row. Any edit
 * the user makes while that save is in flight is silently discarded when the
 * response lands — the field visibly reverts AND the Save button disables, so the
 * edit is unrecoverable without re-typing.
 *
 * Confirmed reproduction (this test): create a fresh RO scenario, hold its
 * create-save PUT open, pick a NON-default Rule Set while the save is in
 * flight, let the save resolve, then save again and read the DB. Observed today:
 *   - the rule select shows the picked ruleset during the in-flight save,
 *   - the instant the create-save resolves it reverts (the auto-select effect
 *     then restores the default ruleset, masking the loss in the UI),
 *   - the DB row never carries the user's picked ruleset_id.
 *
 * We pick a non-default ruleset and assert DB persistence so the auto-restored
 * default cannot make a clobbered edit look saved.
 *
 * This is the root cause behind the previously-flaky scenario-* failures. The
 * feature specs were made deterministic by waiting for each save to COMPLETE
 * (ScenarioPage.save()); this spec intentionally does NOT, to keep the bug
 * visible until the store stops clobbering concurrent edits (merge or
 * version-stamp the draft on save success).
 *
 * Identify only — no product fix here (owned by the dev team).
 * See docs/handoff/gantt/2026-06-06-scenario-store-draft-clobber.md
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario store — draft-clobber race (known product bug)', () => {
  let input: RoScenarioInput
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

  test.beforeEach(async ({ page, request }, testInfo) => {
    input = {
      name: `RO-Race-${testInfo.workerIndex}-${testInfo.testId}-${Date.now()}`,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      crewBase: 'YEG',
      division: 'Pilots',
    }
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

  const findScenario = async (
    request: import('@playwright/test').APIRequestContext,
  ): Promise<{ id: number; rulesetId: number | null } | null> => {
    const res = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) return null
    const { data } = (await res.json()) as {
      data: { items: Array<{ id: number; rulesetId: number | null }> }
    }
    return data.items[0] ?? null
  }

  /** A ruleset that is NOT the auto-selected default (id=103), so the auto-restored
   *  default can't disguise a clobbered pick. */
  const pickNonDefaultRuleset = async (
    request: import('@playwright/test').APIRequestContext,
  ): Promise<{ id: number; name: string }> => {
    const res = await request.get(`${GANTT_API}/api/legality/rulesets`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const { data } = (await res.json()) as {
      data: Array<{ id: number; name: string; category: string | null; isDefault: boolean }>
    }
    const ruleOnly = data.filter((r) => r.category === 'RULE')
    // The basic-info "Rule Set" dropdown auto-selects the default; choose a non-default.
    const pick = ruleOnly.find((r) => !r.isDefault) ?? ruleOnly[1]
    expect(pick, 'need a non-default ruleset to detect the clobber').toBeTruthy()
    return pick!
  }

  test('Scen-2029 — a Rule Set picked while the create-save is in flight must NOT be lost', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)
    const ruleset = await pickNonDefaultRuleset(request)
    const rulesetOptionLabel = `#${ruleset.id} ${ruleset.name}`
    await scenario.gotoRo()

    // Hold the first save PUT open so we can edit while it is in flight.
    let releasePut1: () => void = () => {}
    const put1 = new Promise<void>((resolve) => { releasePut1 = resolve })
    let put1Seen = false
    await page.route(/\/api\/scenario\/\d+(\?|$)/, async (route) => {
      if (route.request().method() === 'PUT' && !put1Seen) {
        put1Seen = true
        await put1 // keep PUT1's response pending
      }
      await route.continue()
    })

    // Build a fresh DRAFT RO scenario WITHOUT waiting for the create-save to finish.
    await scenario.newButton.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.nameInput.fill(input.name)
    await scenario.selectRpDate(input.startDate, input.endDate)
    await scenario.divisionSelect.click()
    await page.getByRole('option', { name: input.division, exact: true }).click()
    await scenario.crewBases.click()
    await page.getByRole('menuitemcheckbox', { name: input.crewBase, exact: true }).click()
    await page.keyboard.press('Escape')

    // Click Save → PUT1 fires and is held mid-flight.
    await scenario.saveButton.click()
    await expect.poll(() => put1Seen, { timeout: 10_000 }).toBe(true)

    // Pick a (non-default) Rule Set while the create-save is still in flight.
    const ruleSelect = scenario.detailPanel.getByTestId('scenario-ruleset-select')
    await ruleSelect.click()
    await page.getByRole('option', { name: rulesetOptionLabel, exact: true }).click()
    await expect(ruleSelect).toContainText(String(ruleset.id)) // shows during the in-flight save

    // Let the held create-save resolve; its success handler runs now.
    releasePut1()
    await expect.poll(() => put1Seen).toBe(true)

    // The user saves their pick (click Save if the edit still registers as dirty).
    if (await scenario.saveButton.isEnabled().catch(() => false)) {
      await scenario.save().catch(() => {})
    }

    // CORRECT behaviour: the user's picked ruleset is what persists.
    // Today the in-flight create-save clobbers the draft (and the auto-select
    // effect restores the default ruleset), so the DB never carries the user's
    // pick — this assertion fails, pinpointing the bug.
    // See docs/handoff/gantt/2026-06-06-scenario-store-draft-clobber.md
    await expect
      .poll(async () => (await findScenario(request))?.rulesetId, { timeout: 10_000 })
      .toBe(ruleset.id)
  })
})
