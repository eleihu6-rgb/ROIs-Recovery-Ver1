/**
 * Rule 8002 — diagnostic for the "top-5 crew show no bell" report.
 *
 * Two distinct facts proven here, against the live June-2026 data:
 *
 *  1. The pipeline WORKS on a fresh load: many crew carry an 8002 bell (sev 3),
 *     and crew 113 specifically — whose 8002 violation is on a LIVE pairing
 *     (is_deleted=0) — shows its bell. (If this fails on the user's screen, the
 *     browser tab is running stale pre-fix code: hard-refresh.)
 *
 *  2. Crew 0227's 8002 violation is on pairing 61711, whose roster_flight rows are
 *     ALL is_deleted=1 (cancelled). /api/roster correctly excludes cancelled duties,
 *     so the gantt never loads that pairing and CANNOT attach a bell — even though
 *     rule_violation has a row for it. This is a data inconsistency at the violation
 *     source (the Rust 8002 ingestion counted cancelled duties), NOT a front-end bug.
 *     This test documents the current (broken-at-source) behaviour: 0227 has no bell.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

type BellRow = { crewId: string; severity: number }

test('Viol-8003 — 8002 bells appear; live-pairing crew 113 has one, cancelled-pairing crew 0227 does not', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)

  // The bell data source must populate (fetched async after first paint).
  await expect
    .poll(
      () => page.evaluate(() => {
        const t = (window as unknown as { __ganttTest?: { crewViolationSeverities?: () => BellRow[] } }).__ganttTest
        return (t?.crewViolationSeverities?.() ?? []).filter((r) => r.severity > 0).length
      }),
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0)

  const bells = await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest: { crewViolationSeverities: () => BellRow[] } }).__ganttTest
    return t.crewViolationSeverities()
  })
  const byCrew = new Map(bells.map((r) => [String(r.crewId), r.severity]))

  // (1) Pipeline works: crew 113's live-pairing 8002 violation surfaces as a Hard bell.
  expect(byCrew.get('113') ?? 0).toBe(3)

  // (2) Crew 0227's only June duty (pairing 61711) is cancelled (is_deleted=1) → not
  //     loaded by /api/roster → no bell, despite a rule_violation row existing.
  expect(byCrew.get('0227') ?? 0).toBe(0)
})
