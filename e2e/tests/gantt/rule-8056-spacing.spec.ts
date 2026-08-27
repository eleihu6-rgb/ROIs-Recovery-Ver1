/**
 * Rule 8056/001 live validation against the current workset 103 threshold.
 * Confirms the message shape is planner-readable in the live Alert Center.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { ganttApiLogin, ganttApiUrl, gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-8056-spacing.mjs')
const WORKSET_PBS_SOLVER = 103

type SpacingResult = {
  crewEvaluated: number
  crewViolating: number
  spaceHours: number
  violationCount: number
  worst: { crewId: string; currentLabel: string; gapMinutes: number; nextLabel: string } | null
}

const runSpacing = (spaceHours: number): SpacingResult => {
  const out = execFileSync(
    'node',
    [HARNESS, String(spaceHours), '--from', '2026-06-01', '--to', '2026-07-01'],
    {
      cwd: path.join(REPO, 'live-server'),
      encoding: 'utf8',
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
      maxBuffer: 128 * 1024 * 1024,
    },
  )
  return JSON.parse(out) as SpacingResult
}

test.describe('Rule 8056/001 — roster spacing in workset 103', () => {
  test('Rule-3004 — workset 103 carries the live 8056/001 threshold', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: { tables: Array<{ header: string[]; rows: string[][] }> } }> }
    }
    const rule8056 = body.data.rules.find((r) => Number(r.function) === 8056 && r.instance === '001')
    expect(rule8056).toBeTruthy()
    const table = rule8056!.paramJson.tables[0]
    const spaceIdx = table.header.indexOf('Space')
    const unitIdx = table.header.indexOf('Unit')
    expect(spaceIdx).toBeGreaterThanOrEqual(0)
    expect(unitIdx).toBeGreaterThanOrEqual(0)
    expect(table.rows[0][spaceIdx]).toBe('14')
    expect(table.rows[0][unitIdx]).toBe('RH')
  })

  test('Rule-3005 — live warning uses the new readable message shape', async ({ page, request }) => {
    const requiredHours = 14
    const dateTimeMessageRe = new RegExp(
      String.raw`Rest between \(.+ \d{4}-\d{2}-\d{2} \d{2}:\d{2}\) and \(.+ \d{4}-\d{2}-\d{2} \d{2}:\d{2}\) is -?\d+:\d{2}, which is below the required ${requiredHours} RH\.`,
    )
    const atRequired = runSpacing(requiredHours)
    const at13 = runSpacing(13)
    expect(atRequired.violationCount).toBeGreaterThan(at13.violationCount)
    expect(atRequired.crewViolating).toBeGreaterThan(at13.crewViolating)
    expect(atRequired.worst).not.toBeNull()
    expect(atRequired.worst!.gapMinutes).toBeLessThan(requiredHours * 60)

    await seedGanttAuth(page, request)
    await gotoGantt(page)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const testHook = (window as unknown as {
              __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> }
            }).__ganttTest
            const violations = testHook?.liveViolations?.() ?? []
            return {
              c8056: violations.filter((x) => x.ruleCode === '8056').length,
            }
          }),
        { intervals: [500], timeout: 30_000 },
      )
      .toEqual(expect.objectContaining({ c8056: expect.any(Number) }))

    const bells = await page.evaluate(() => {
      const testHook = (window as unknown as {
        __ganttTest: {
          liveViolations: () => Array<{
            message: string
            pairingId: number
            ruleCode: string
            severity: number
          }>
        }
      }).__ganttTest
      return testHook.liveViolations()
    })
    const b8056 = bells.filter((v) => v.ruleCode === '8056')
    expect(b8056.length).toBeGreaterThan(0)
    expect(b8056.every((v) => v.severity === 2)).toBe(true)
    expect(b8056.every((v) => v.pairingId > 0)).toBe(true)
    expect(b8056.some((v) => dateTimeMessageRe.test(v.message))).toBe(true)

    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    const rows8056 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8056/001"]')
    await expect.poll(() => rows8056.count(), { intervals: [500], timeout: 15_000 }).toBeGreaterThan(0)
    const first8056 = rows8056.first()
    await expect(first8056).toContainText('8056/001')
    await expect(first8056).toContainText(dateTimeMessageRe)
  })
})
