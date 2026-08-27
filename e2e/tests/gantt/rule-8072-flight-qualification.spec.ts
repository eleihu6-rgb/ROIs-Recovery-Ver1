import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl, gotoGantt, seedGanttAuth, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const WORKSET_PBS_SOLVER = 103
const FROM = '2026-06-01'
const TO = '2026-07-01'

type ParamJson = { tables: Array<{ header: string[]; rows: string[][] }> }
type RuleRow = { id: number; function: number; instance: string; paramJson: ParamJson }

const cloneParamJson = (paramJson: ParamJson): ParamJson =>
  JSON.parse(JSON.stringify(paramJson)) as ParamJson

const getRule8072 = async (request: Parameters<typeof ganttApiLogin>[0], token: string): Promise<RuleRow> => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule8072 = body.data.rules.find((r) => Number(r.function) === 8072 && r.instance === '001')
  expect(rule8072, '8072/001 must exist in workset 103').toBeTruthy()
  return rule8072!
}

const patchParamJson = async (
  request: Parameters<typeof ganttApiLogin>[0],
  token: string,
  ruleId: number,
  paramJson: ParamJson,
): Promise<void> => {
  const res = await request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
    timeout: 60_000,
  })
  expect(res.ok(), `patch 8072 params failed: ${res.status()}`).toBeTruthy()
}

const run8072Recheck = (): void => {
  execFileSync(
    'node',
    ['scripts/live-legality.mjs', '--group', String(WORKSET_PBS_SOLVER), '--from', FROM, '--to', TO, '--rules', '8072'],
    { cwd: path.join(REPO, 'live-server'), encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
}

const withQualificationAndMaxLimits = (paramJson: ParamJson, qualification: string, maxLimits: string): ParamJson => {
  const next = cloneParamJson(paramJson)
  const table = next.tables[0]
  const requiredQualificationsCol = table.header.indexOf('Required Qualifications')
  const maxLimitsCol = table.header.indexOf('Max Limits')
  expect(requiredQualificationsCol, '8072 Required Qualifications column').toBeGreaterThanOrEqual(0)
  expect(maxLimitsCol, '8072 Max Limits column').toBeGreaterThanOrEqual(0)
  table.rows[0][requiredQualificationsCol] = qualification
  table.rows[0][maxLimitsCol] = maxLimits
  return next
}

const setJuneRange = async (page: Parameters<typeof gotoGantt>[0]): Promise<void> => {
  await setDateRange(page, FROM, TO)
}

test.describe('Rule 8072/001 — flight qualification counts', () => {
  test.describe.configure({ mode: 'serial' })

  test('Rule-8072-001 — workset 103 carries F8 default 8072 params', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const rule8072 = await getRule8072(request, token)
    const table = rule8072.paramJson.tables[0]
    expect(table.header).toEqual([
      'Flight Fleets',
      'Flight Assignment Groups',
      'Crew Teams',
      'Crew Nationality',
      'Destination Countries',
      'Acting Ranks',
      'Flight Compositions',
      'Required Qualifications',
      'Attributes',
      'Dep',
      'Arr',
      'Min Limits',
      'Max Limits',
    ])
    expect(table.rows[0]).toEqual(['*', 'FLY', '*', '*', '*', '*', '*', 'FC-GREEN', '*', '*', '*', '0', '1'])
  })

  test('Rule-8072-002 — scoped recheck persists 8072 and Alert Center shows it', async ({ page, request }) => {
    // Full-month live-legality for 8072 alone is ~2min here; try + finally each recheck.
    test.setTimeout(420_000)
    const token = await ganttApiLogin(request)
    const rule = await getRule8072(request, token)
    const originalParamJson = cloneParamJson(rule.paramJson)

    try {
      await patchParamJson(request, token, rule.id, withQualificationAndMaxLimits(originalParamJson, '*', '0'))
      run8072Recheck()

      await seedGanttAuth(page, request)
      await gotoGantt(page)
      await setJuneRange(page)

      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string; message: string }> } })
                .__ganttTest
              return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8072').length
            }),
          { timeout: 30_000, intervals: [500] },
        )
        .toBeGreaterThan(0)

      const rows = await page.evaluate(() => {
        const t = (window as unknown as {
          __ganttTest: { liveViolations: () => Array<{ pairingId: number; ruleCode: string; severity: number; message: string }> }
        }).__ganttTest
        return t.liveViolations().filter((v) => v.ruleCode === '8072')
      })
      expect(rows.every((v) => v.pairingId > 0)).toBe(true)
      expect(rows.some((v) => /Crew count out of range \(Current: \d+, Allowed: \d+–\d+\)/.test(v.message))).toBe(true)

      await page.getByTestId('violations-button').first().click()
      const dialog = page.getByTestId('violation-list-dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByTestId('alert-groupby-rule').click()
      await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8072/001' })).toHaveCount(1)
      const rows8072 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8072/001"]')
      await expect.poll(() => rows8072.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
      await expect(rows8072.first()).toContainText('8072/001')
      await expect(rows8072.first()).toContainText(/Crew count out of range/)
    } finally {
      await patchParamJson(request, token, rule.id, originalParamJson)
      run8072Recheck()
    }
  })
})
