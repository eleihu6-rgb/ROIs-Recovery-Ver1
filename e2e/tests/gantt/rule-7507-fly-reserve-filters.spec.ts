/**
 * Rule 7507/001 — Min GDOs with fly/reserve day filters.
 *
 *   Rule-3032 — live param_json for 7507/001 is in workset 103 with the four new
 *               columns after Count Layover and a single wildcard template row.
 *   Rule-3033 — Legality tab Edit shows those column headers in the inline params table.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

test.describe('Rule 7507/001 — fly/reserve day filters', () => {
  test('Rule-3032 — live param_json carries 7507/001 in workset 103 with fly/reserve columns', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/103`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `ruleset 103 HTTP ${res.status()}`).toBeTruthy()
    const body = await res.json() as {
      data: {
        rules: Array<{
          function: number
          instance: string
          description: string
          paramJson: { tables: Array<{ header: string[]; rows: string[][] }> }
        }>
      }
    }
    const rule = body.data.rules.find((r) => Number(r.function) === 7507 && r.instance === '001')
    expect(rule, '7507/001 must be in PBS Solver Ruleset (workset 103)').toBeTruthy()
    const table = rule!.paramJson.tables[0]
    const header = table.header
    expect(header).toContain('Count Layover')
    expect(header).toContain('NUM FLY DAY')
    expect(header).toContain('FLY ASSIGNMENTS')
    expect(header).toContain('NUM RESERVES')
    expect(header).toContain('RES ASSIGNMENTS')
    expect(header).toContain('Leave Assignments')
    const layoverIdx = header.indexOf('Count Layover')
    expect(header[layoverIdx + 1]).toBe('NUM FLY DAY')
    expect(header[layoverIdx + 2]).toBe('FLY ASSIGNMENTS')
    expect(header[layoverIdx + 3]).toBe('NUM RESERVES')
    expect(header[layoverIdx + 4]).toBe('RES ASSIGNMENTS')
    expect(table.rows).toHaveLength(1)
    const row = table.rows[0]
    const col = (name: string) => header.indexOf(name)
    expect(row[col('Min DO')]).toBe('0')
    expect(row[col('NUM FLY DAY')]).toBe('0-31')
    expect(row[col('FLY ASSIGNMENTS')]).toBe('*')
    expect(row[col('NUM RESERVES')]).toBe('0-31')
    expect(row[col('RES ASSIGNMENTS')]).toBe('*')
  })

  test('Rule-3033 — Legality Edit shows 7507 fly/reserve header columns', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId('legality-ruleset-card-103').click()
    await expect(page.getByTestId('legality-rule-name-7507-001')).toHaveText('7507/001', { timeout: 10_000 })
    await expect(page.getByTestId('legality-rule-row-7507-001')).toContainText(
      'Min # GDOs in a RP (fly/reserve filters)',
    )
    await page.getByTestId('legality-rule-edit-7507-001').click()
    const params = page.getByTestId('legality-params-7507-001')
    await expect(params).toBeVisible()
    await expect(params).toContainText('NUM FLY DAY')
    await expect(params).toContainText('FLY ASSIGNMENTS')
    await expect(params).toContainText('NUM RESERVES')
    await expect(params).toContainText('RES ASSIGNMENTS')
    await expect(params.locator('[data-testid^="legality-param-row-7507-001-0-"]')).toHaveCount(1)
  })
})
