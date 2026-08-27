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

const getRule8071 = async (request: Parameters<typeof ganttApiLogin>[0], token: string): Promise<RuleRow> => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule8071 = body.data.rules.find((r) => Number(r.function) === 8071 && r.instance === '001')
  expect(rule8071, '8071/001 must exist in workset 103').toBeTruthy()
  return rule8071!
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
  expect(res.ok(), `patch 8071 params failed: ${res.status()}`).toBeTruthy()
}

const run8071Recheck = (): void => {
  execFileSync(
    'node',
    ['scripts/live-legality.mjs', '--group', String(WORKSET_PBS_SOLVER), '--from', FROM, '--to', TO, '--rules', '8071'],
    { cwd: path.join(REPO, 'live-server'), encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
}

const withMaxTimes = (paramJson: ParamJson, value: string): ParamJson => {
  const next = cloneParamJson(paramJson)
  const table = next.tables[0]
  const maxTimesCol = table.header.indexOf('Max Times')
  expect(maxTimesCol, '8071 Max Times column').toBeGreaterThanOrEqual(0)
  table.rows[0][maxTimesCol] = value
  return next
}

const setJuneRange = async (page: Parameters<typeof gotoGantt>[0]): Promise<void> => {
  await setDateRange(page, FROM, TO)
}

test.describe('Rule 8071/001 — roster properties', () => {
  test.describe.configure({ mode: 'serial' })

  test('Rule-8071-001 — workset 103 carries F8 default 8071 params with Flights wildcard', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: {
        rules: Array<{
          function: number
          instance: string
          paramJson: { tables: Array<{ header: string[]; rows: string[][] }> }
        }>
      }
    }
    const rule8071 = body.data.rules.find((r) => Number(r.function) === 8071 && r.instance === '001')
    expect(rule8071).toBeTruthy()
    const table = rule8071!.paramJson.tables[0]
    expect(table.header).toEqual([
      'Bases',
      'Ranks',
      'Fleets',
      'Crew Teams',
      'Labels',
      'Attributes',
      'Override Duty Attributes',
      'Assignment Groups',
      'Qualifiers',
      'Flights',
      'Destinations',
      'Positions',
      'Period',
      'Unit',
      'Max Times',
      'Min Times',
      'Check Mode',
    ])
    expect(table.rows[0]).toEqual(['*', '*', '*', '*', '*', '*', '*', 'FLY', '*', '*', '*', '*', '1', 'CM', '11', '0', '*'])
  })

  test('Rule-8071-002 — scoped recheck persists 8071 and Alert Center shows it', async ({ page, request }) => {
    const token = await ganttApiLogin(request)
    const rule = await getRule8071(request, token)
    const originalParamJson = cloneParamJson(rule.paramJson)

    try {
      await patchParamJson(request, token, rule.id, withMaxTimes(originalParamJson, '0'))
      run8071Recheck()

      await seedGanttAuth(page, request)
      await gotoGantt(page)
      await setJuneRange(page)

      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string; message: string }> } })
                .__ganttTest
              return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8071').length
            }),
          { timeout: 30_000, intervals: [500] },
        )
        .toBeGreaterThan(0)

      const rows = await page.evaluate(() => {
        const t = (window as unknown as {
          __ganttTest: { liveViolations: () => Array<{ pairingId: number; ruleCode: string; severity: number; message: string }> }
        }).__ganttTest
        return t.liveViolations().filter((v) => v.ruleCode === '8071')
      })
      expect(rows.every((v) => v.pairingId > 0)).toBe(true)
      expect(rows.some((v) => /matching rosters \(\d+\).*1CM window/.test(v.message))).toBe(true)

      await page.getByTestId('violations-button').first().click()
      const dialog = page.getByTestId('violation-list-dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByTestId('alert-groupby-rule').click()
      await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8071/001' })).toHaveCount(1)
      const rows8071 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8071/001"]')
      await expect.poll(() => rows8071.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
      await expect(rows8071.first()).toContainText('8071/001')
      await expect(rows8071.first()).toContainText(/matching rosters/)
    } finally {
      await patchParamJson(request, token, rule.id, originalParamJson)
      run8071Recheck()
    }
  })
})
