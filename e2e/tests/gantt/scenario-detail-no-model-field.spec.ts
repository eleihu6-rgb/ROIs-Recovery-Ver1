/**
 * Gantt Scenario detail-panel — "Model" (Workset ID) field removed.
 *
 * The RO detail panel used to expose a "Model" field bound to `worksetId`
 * (a numeric Workset ID input). Product decided the field is not needed and
 * it was removed from `scenario-basic-info.tsx`.
 *
 * This test is a regression guard: for an RO scenario the detail panel must
 * still render (Rule Set control present), but the "Model" label / Workset ID
 * input must NOT appear. Before the removal this assertion would have failed.
 *
 * Auth is seeded into sessionStorage the same way as scenario-detail-two-column.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — detail-panel Model field removed', () => {
  const input: RoScenarioInput = {
    name: `RO-NoModel-${Date.now()}`,
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

  test('Scen-2011 — RO detail panel renders Rule Set but no "Model" / Workset ID field', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    await scenario.gotoRo()
    await scenario.createRoScenario(input)
    await expect(scenario.detailPanel).toBeVisible()

    // Panel still renders its RO-specific config — Rule Set control is present.
    await expect(page.getByTestId('scenario-ruleset-select')).toBeVisible()

    // The removed "Model" field: neither its label nor its Workset ID input
    // may appear anywhere in the detail panel.
    await expect(scenario.detailPanel.getByText('Model', { exact: true })).toHaveCount(0)
    await expect(scenario.detailPanel.getByPlaceholder('Workset ID')).toHaveCount(0)
  })
})
