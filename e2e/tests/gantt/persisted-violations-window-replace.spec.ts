/**
 * Live persisted violations — display window = official RP (no ±1 month pad).
 *
 * Regression 1 (Viol-8060): upsert-only writes left June pairing keys after a narrower
 * refetch; replacePersistedViolations drops them.
 *
 * Regression 2 (Viol-8061 / Viol-8062): Aug+Sep RP selection must not load June 7504 or
 * July 1001 — those have no effective-window overlap with the official RP bounds.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, counts } from '../../utils/gantt-hook'

test.describe('Live persisted violations — display-window replace', () => {
  test('Viol-8060 — replace clears out-of-window June 7504 from displayViolations', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)

    const target = await page.evaluate(() => {
      const t = (window as unknown as {
        __ganttTest: {
          roster: () => Array<{ id: number; crewId: string; pairingId: number | null }>
        }
      }).__ganttTest
      const row = t.roster().find((r) => r.pairingId != null)
      if (!row || row.pairingId == null) return null
      return { crewId: String(row.crewId), pairingId: Number(row.pairingId) }
    })
    expect(target, 'need a loaded roster pairing task').toBeTruthy()

    await page.evaluate(({ crewId, pairingId }) => {
      const t = (window as unknown as {
        __ganttTest: {
          setPersistedViolations: (
            c: string,
            p: number,
            v: Array<{ ruleCode: string; severity: number; message: string }>,
          ) => void
        }
      }).__ganttTest
      t.setPersistedViolations(crewId, pairingId, [{
        ruleCode: '7504',
        severity: 2,
        message: 'Rest between consecutive WOCL flight duties (2026-06-09, 2026-06-11) is 12:27 less than 55 RH.',
      }])
    }, target!)

    const before = await page.evaluate(({ crewId, pairingId }) => {
      const t = (window as unknown as {
        __ganttTest: {
          liveViolations: () => Array<{ crewId?: string; pairingId: number; ruleCode: string }>
        }
      }).__ganttTest
      return t.liveViolations().some(
        (v) => v.ruleCode === '7504' && v.crewId === crewId && v.pairingId === pairingId,
      )
    }, target!)
    expect(before, 'June 7504 must be present after upsert inject').toBe(true)

    await page.evaluate(({ crewId, pairingId }) => {
      const t = (window as unknown as {
        __ganttTest: {
          replacePersistedViolations: (
            entries: Array<{
              crewId: string
              pairingId: number
              violations: Array<{ ruleCode: string; severity: number; message: string }>
            }>,
          ) => void
        }
      }).__ganttTest
      t.replacePersistedViolations([{
        crewId,
        pairingId,
        violations: [{
          ruleCode: '8002',
          severity: 3,
          message: 'In-window credit finding for Aug–Sep display window.',
        }],
      }])
    }, target!)

    const after = await page.evaluate(({ crewId, pairingId }) => {
      const t = (window as unknown as {
        __ganttTest: {
          liveViolations: () => Array<{ crewId?: string; pairingId: number; ruleCode: string; message: string }>
        }
      }).__ganttTest
      const rows = t.liveViolations().filter((v) => v.crewId === crewId && v.pairingId === pairingId)
      return {
        has7504: rows.some((v) => v.ruleCode === '7504'),
        has8002: rows.some((v) => v.ruleCode === '8002'),
      }
    }, target!)

    expect(after.has7504, 'June 7504 must leave displayViolations after replace').toBe(false)
    expect(after.has8002, 'in-window 8002 must remain after replace').toBe(true)
  })

  test('Viol-8061/8062 — Aug+Sep RP bounds exclude June 7504 and July 1001', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)

    const result = await page.evaluate(() => {
      const t = (window as unknown as {
        __ganttTest: {
          violationQueryWindowForTest: (
            dateStartIso: string,
            dateEndIso: string,
            rpStartMs: number,
            rpEndMs: number,
          ) => {
            startMonth: number
            endMonth: number
            june7504Overlaps: boolean
            july1001Overlaps: boolean
          }
        }
      }).__ganttTest
      const DAY = 86_400_000
      const rpStart = new Date(2026, 7, 1)
      const rpEnd = new Date(2026, 8, 30, 23, 59, 59)
      return t.violationQueryWindowForTest(
        new Date(rpStart.getTime() - 7 * DAY).toISOString(),
        new Date(rpEnd.getTime() + 7 * DAY).toISOString(),
        rpStart.getTime(),
        rpEnd.getTime(),
      )
    })

    expect(result.june7504Overlaps, 'June 7504 must not overlap Aug–Sep official RP').toBe(false)
    expect(result.july1001Overlaps, 'July 1001 must not overlap Aug–Sep official RP').toBe(false)
    expect(result.startMonth).toBe(8)
    expect(result.endMonth).toBe(9)
  })
})
