/**
 * Rule 7505 — crew-bell only (no roster puck “!”).
 *
 * 7505 is a crew×RP days-off check persisted with an anchor pairing_id. The puck
 * severity map must skip it so planners only see it on the crew-row bell / Alert
 * Center; co-located rules (e.g. 8002) on the same pairing still paint the puck.
 *
 *   Rule-3031 — inject a 7505-only finding on a loaded roster pairing → no puck
 *               severity for that crew's tasks; inject 8002 alongside → puck returns.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, counts } from '../../utils/gantt-hook'

test.describe('Rule 7505 — crew-bell only (no puck)', () => {
  test('Rule-3031 — 7505 alone does not paint puck; 8002 co-located still does', async ({ page, request }) => {
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
      return { taskId: Number(row.id), crewId: String(row.crewId), pairingId: Number(row.pairingId) }
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
        ruleCode: '7505',
        severity: 1,
        message: 'The number of days off(2) must be at least 4 in 1 RP (2026-06-01, 2026-06-30).',
      }])
    }, target!)

    const only7505 = await page.evaluate(({ crewId, pairingId, taskId }) => {
      const t = (window as unknown as {
        __ganttTest: {
          liveViolations: () => Array<{ crewId?: string; pairingId: number; ruleCode: string }>
          livePuckViolationSeverities: () => Array<{ taskId: number; crewId: string; pairingId: number | null; severity: number }>
          live7505HasNoPuckBadge: () => boolean
        }
      }).__ganttTest
      const has7505 = t.liveViolations().some(
        (v) => v.ruleCode === '7505' && v.crewId === crewId && v.pairingId === pairingId,
      )
      const puckOnTask = t.livePuckViolationSeverities().find((r) => r.taskId === taskId)
      return { has7505, puckSeverity: puckOnTask?.severity ?? 0, noPuck: t.live7505HasNoPuckBadge() }
    }, target!)

    expect(only7505.has7505, '7505 must remain in displayViolations (bell/Alert Center source)').toBe(true)
    expect(only7505.puckSeverity, '7505-only must not paint the roster puck').toBe(0)
    expect(only7505.noPuck).toBe(true)

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
      t.setPersistedViolations(crewId, pairingId, [
        {
          ruleCode: '7505',
          severity: 1,
          message: 'The number of days off(2) must be at least 4 in 1 RP (2026-06-01, 2026-06-30).',
        },
        {
          ruleCode: '8002',
          severity: 3,
          message: 'Cumulative block exceeds limit (injected for puck co-location).',
        },
      ])
    }, target!)

    const with8002 = await page.evaluate(({ taskId }) => {
      const t = (window as unknown as {
        __ganttTest: {
          livePuckViolationSeverities: () => Array<{ taskId: number; severity: number }>
        }
      }).__ganttTest
      return t.livePuckViolationSeverities().find((r) => r.taskId === taskId)?.severity ?? 0
    }, target!)

    expect(with8002, 'co-located 8002 must still paint the puck').toBe(3)
  })
})
