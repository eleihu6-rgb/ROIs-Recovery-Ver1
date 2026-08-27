/**
 * Phase 2a — Rule Templates page under Legality (Model A rule catalog).
 *
 * Renamed from "Rule Instances" to "Rule Templates": the table now shows only
 * template (instance '001') rows, and the per-row Copy button is temporarily
 * hidden pending re-enable. Admin (admin/123456, is_admin=1) can still edit a
 * template — templates are read-only for non-admins but editable by admins
 * (gated on isAdmin, not locked).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'

interface Auth { token: string; userCode: string; userName: string; schema: string; isAdmin: number }

const adminLogin = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })
  expect(res.ok(), `admin login failed: ${res.status()}`).toBeTruthy()
  const auth = ((await res.json()) as { data: Auth }).data
  expect(auth.isAdmin, 'admin account must be is_admin=1').toBe(1)
  return auth
}

const seedAdmin = async (page: Page, auth: Auth): Promise<void> => {
  await page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin },
      token: a.token,
    }))
  }, auth)
}

const listRules = async (request: APIRequestContext, token: string) =>
  ((await (await request.get(`${GANTT_API}/api/legality/rules`, { headers: { Authorization: `Bearer ${token}` } })).json()) as
    { data: Array<{ id: number; function: number; instance: string; isTemplate: boolean; updatedBy?: string | null }> }).data

test.describe('Legality — Rule Templates (Phase 2a)', () => {
  test('table shows templates only, admin edits a template, copy button is hidden', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    const token = auth.token

    const nonTemplate = (await listRules(request, token)).find((r) => !r.isTemplate)
    const template8002 = (await listRules(request, token)).find((r) => r.function === 8002 && r.instance === '001')

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-nav-rule-instances').click()
    const view = page.getByTestId('rule-instances-view')
    await expect(view).toBeVisible()
    await expect(view.getByText('Rule Templates', { exact: true })).toBeVisible()

    // Update By column renders the editor stored directly on the rule (no users join),
    // matching the value the catalog API returns.
    await expect(view.getByRole('columnheader', { name: 'Update By' })).toBeVisible()
    if (template8002) {
      await expect(page.getByTestId('rule-instance-updatedby-8002-001')).toHaveText(template8002.updatedBy ?? '—')
    }

    // 8002/001 is a Template: Template badge present, NO Delete, but admin gets the editor.
    await expect(page.getByTestId('rule-instance-template-8002-001')).toBeVisible()
    await expect(page.getByTestId('rule-instance-delete-8002-001')).toHaveCount(0)
    await page.getByTestId('rule-instance-edit-8002-001').click()
    await expect(page.getByTestId('rule-instance-params-8002-001')).toBeVisible() // editor renders for the template (admin)

    // Copy affordance is hidden everywhere in the table pending re-enable.
    await expect(page.locator('[data-testid^="rule-instance-copy-"]')).toHaveCount(0)

    // Table content is templates-only: a known non-template instance must not render a row.
    if (nonTemplate) {
      await expect(page.getByTestId(`rule-instance-row-${nonTemplate.function}-${nonTemplate.instance}`)).toHaveCount(0)
    }
  })
})
