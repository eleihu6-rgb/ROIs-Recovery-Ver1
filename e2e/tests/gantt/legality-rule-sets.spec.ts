/**
 * Phase 2b — Rule Set management under Legality (workset/rule_set, Model A).
 *
 * Admin (admin/123456) drives the full lifecycle through the UI: New → Add Rule →
 * Copy (share-rules) → Edit (rename) → Delete, asserting each step against the real
 * GET /api/legality/rulesets list (§No-Illusion). Idempotent: cleans up its sets.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
interface Auth { token: string; userCode: string; userName: string; schema: string; isAdmin: number }

const adminLogin = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })
  expect(res.ok()).toBeTruthy()
  const a = ((await res.json()) as { data: Auth }).data
  expect(a.isAdmin).toBe(1)
  return a
}
const seedAdmin = async (page: Page, a: Auth) => {
  await page.addInitScript((x) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: x.userCode, userName: x.userName, schema: x.schema, isAdmin: x.isAdmin }, token: x.token,
    }))
  }, a)
}
const sets = async (request: APIRequestContext, token: string) =>
  ((await (await request.get(`${GANTT_API}/api/legality/rulesets`, { headers: { Authorization: `Bearer ${token}` } })).json()) as
    { data: Array<{ id: number; name: string; ruleCount: number; type: string }> }).data
const findSet = async (request: APIRequestContext, token: string, name: string) =>
  (await sets(request, token)).find((s) => s.name === name)

test.describe('Legality — Rule Set management (Phase 2b)', () => {
  test('admin new → add rule → copy → edit → delete lifecycle', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    const token = auth.token
    const SET = `QA-Set-${Date.now()}`
    const COPY = `${SET}-Copy`
    const RENAMED = `${SET}-Renamed`

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-nav-rule-sets').waitFor({ state: 'visible' }).catch(() => {})
    await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible()

    // New Set → it becomes the selected set AND the sidebar card must appear immediately
    // (regression: empty worksets were excluded from GET /rulesets HAVING count > 0, so
    // refreshSets() after create would drop it; the store now injects missing new sets).
    await page.getByTestId('rule-set-new-btn').click()
    await page.getByTestId('rule-set-name-input').fill(SET)
    await page.getByTestId('rule-set-new-confirm').click()
    await expect(page.getByTestId('legality-set-name')).toContainText(SET)
    // Sidebar card must be visible so the user can find and click the new (empty) set.
    await expect(
      page.locator('[data-testid^="legality-ruleset-card-"]').filter({ hasText: SET })
    ).toBeVisible()

    // Add a rule via the Add Rules dialog → the set now appears in the API list with 1 rule.
    await page.getByTestId('rule-set-add-rules-btn').click()
    await expect(page.getByTestId('rule-set-add-rules-dialog')).toBeVisible()
    await page.getByTestId('rule-set-add-rule-8002-001').click()
    await page.getByTestId('rule-set-add-rules-dialog').getByRole('button', { name: 'Done' }).click()
    await expect.poll(async () => (await findSet(request, token, SET))?.ruleCount ?? 0).toBe(1)

    // Copy (share-rules) → a new set with the same 1 rule appears.
    await page.getByTestId('rule-set-copy-btn').click()
    await page.getByTestId('rule-set-name-input').fill(COPY)
    await page.getByTestId('rule-set-copy-mode-share-rules').check()
    await page.getByTestId('rule-set-copy-confirm').click()
    await expect.poll(async () => (await findSet(request, token, COPY))?.ruleCount ?? -1).toBe(1)

    // Copy is now selected; Edit → rename it.
    await page.getByTestId('rule-set-edit-btn').click()
    await page.getByTestId('rule-set-name-input').fill(RENAMED)
    await page.getByTestId('rule-set-edit-confirm').click()
    await expect.poll(async () => Boolean(await findSet(request, token, RENAMED))).toBe(true)
    expect(await findSet(request, token, COPY)).toBeUndefined()

    // Delete both sets (select each card, Delete, confirm) → gone from the list.
    for (const name of [RENAMED, SET]) {
      const s = await findSet(request, token, name)
      if (!s) continue
      await page.getByTestId(`legality-ruleset-card-${s.id}`).click()
      await expect(page.getByTestId('legality-set-name')).toContainText(name)
      await page.getByTestId('rule-set-delete-btn').click()
      await page.getByTestId('rule-set-delete-confirm').click()
      await expect.poll(async () => Boolean(await findSet(request, token, name))).toBe(false)
    }
  })

  test('admin creates a multi-type rule set: min-1 enforced, stored as LIVE,PBS,RO', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    const token = auth.token
    const SET = `QA-Multi-${Date.now()}`

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible()

    // New dialog defaults to RO. Deselecting it must disable Create (min-1).
    await page.getByTestId('rule-set-new-btn').click()
    await page.getByTestId('rule-set-name-input').fill(SET)
    const confirm = page.getByTestId('rule-set-new-confirm')
    await expect(confirm).toBeEnabled()
    await page.getByTestId('rule-set-type-ro').click()
    await expect(confirm).toBeDisabled()
    // Select all three → Create enabled again.
    await page.getByTestId('rule-set-type-live').click()
    await page.getByTestId('rule-set-type-pbs').click()
    await page.getByTestId('rule-set-type-ro').click()
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page.getByTestId('legality-set-name')).toContainText(SET)

    // The set is stored with the canonical comma type (no enable → no live-state side effects).
    await expect.poll(async () => (await findSet(request, token, SET))?.type ?? null).toBe('LIVE,PBS,RO')

    // Cleanup: delete through the UI.
    const s = await findSet(request, token, SET)
    if (s) {
      await page.getByTestId(`legality-ruleset-card-${s.id}`).click()
      await expect(page.getByTestId('legality-set-name')).toContainText(SET)
      await page.getByTestId('rule-set-delete-btn').click()
      await page.getByTestId('rule-set-delete-confirm').click()
      await expect.poll(async () => Boolean(await findSet(request, token, SET))).toBe(false)
    }
  })

  test('LIVE toolbar selector resolves an enabled LIVE,PBS,RO set as the LIVE set', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    // Seed the ruleset list with a multi-type enabled set for division P; backstop its
    // auto-selection (getRuleset) with a stub workset so no real DB row is touched.
    await page.route('**/api/legality/rulesets', async (route) => {
      const res = await route.fetch()
      const json = await res.json() as { data: Array<{ id: number; name: string; type: string }> }
      json.data = [
        { id: 999001, name: 'Mock Unified FD', category: 'RULE', type: 'LIVE,PBS,RO', division: 'P', enabled: true, updatedBy: 'admin', ruleCount: 3, isDefault: true },
        ...json.data.filter((s) => s.id !== 999001),
      ]
      await route.fulfill({ response: res, json })
    })
    await page.route('**/api/legality/ruleset/999001', (route) =>
      route.fulfill({ json: { code: 200, data: { workset: { id: 999001, name: 'Mock Unified FD', category: 'RULE' }, rules: [] }, message: 'ok' } }))

    await page.goto('/')
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByRole('button', { name: /P · Mock Unified FD/ })).toBeVisible({ timeout: 15_000 })
  })
})
