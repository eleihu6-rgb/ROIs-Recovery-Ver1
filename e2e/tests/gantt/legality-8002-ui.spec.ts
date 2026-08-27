/**
 * Rule 8002 alarm BELL in the end-user viewport.
 *
 * Validates the migrated Rust-8002 violation renders as the crew violation bell on the
 * live gantt: it flows rule_violation (ccar121_gantt, pairing-attached) → /api/violations
 * → session-violation-store.displayViolations → drawCrewViolationIndicator (bell, right of
 * MDO) + ViolationTooltip. We assert the bell's data source via window.__ganttTest.liveViolations.
 *
 * After running the Rust 8002 check against the live June-2026 roster, many crew exceed
 * the 40h/28-day limit (Hard, sev 3) and their alarms are written under pbs_solver_ruleset.
 * §No-Illusion: asserts the rule_code, severity and message the bell+tooltip render.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

type LiveViol = { pairingId: number; ruleCode: string; severity: number; message: string }

test('Legal-6007 — gantt renders the migrated 8002 alarm bell (crew 998, base YYZ)', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)

  // Load base YYZ (412 crew incl. the June violator 998) — a bounded set within the
  // violations endpoint cap, so 998's violation is fetched alongside crew loading.
  await page.evaluate(async () => {
    const t = (window as unknown as { __ganttTest?: { applyCrewFilter?: (f: { bases: string[] }) => Promise<void> } }).__ganttTest
    await t?.applyCrewFilter?.({ bases: ['YYZ'] })
  })

  // The bell's data source: poll until the 8002 alarm is in displayViolations
  // (loaded async after the crew viewport — it must not block the 1–2s first paint).
  await expect
    .poll(
      () => page.evaluate(() => {
        const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
        return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8002').length
      }),
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0)

  const ui8002 = await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest: { liveViolations: () => LiveViol[] } }).__ganttTest
    return t.liveViolations().filter((v) => v.ruleCode === '8002')
  })

  // Many YYZ crew breach the 28-day block cap — each rendered as a Hard (sev 3) bell with the
  // cumulative-block message the tooltip shows. The cap is param-driven (rule 8002/001 Max
  // Limits), so assert the message SHAPE ("exceeds <n>h"), not a literal 40h.
  expect(ui8002.length).toBeGreaterThan(0)
  expect(ui8002.every((v) => v.severity === 3)).toBe(true)
  expect(ui8002.every((v) => v.pairingId > 0)).toBe(true)
  expect(ui8002[0].message).toMatch(/exceeds \d+h/)
})
