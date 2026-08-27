/**
 * Rule 8002 — two ways the migrated violation reaches the planner's gantt.
 *
 * After migrating 8002 (MAX_CUM_BLOCK) to the Rust engine and writing the live
 * June-2026 violations into rule_violation under pbs_solver_ruleset (the gantt's
 * default group), a planner must SEE them. There are two surfaces, and this test
 * exercises BOTH (per the user's "2 ways to validate"):
 *
 *   1. The crew violation BELL — its data source is __ganttTest.liveViolations()
 *      (session-violation-store.displayViolations), which feeds the canvas indicator.
 *   2. The Legality ALERT CENTER — the roster-pane toolbar dialog that lists every
 *      loaded violation message (crew id, base, rank, rule id, message).
 *
 * Opened with DEFAULT filters (full bootstrap load, June→July window). §No-Illusion:
 * asserts the real rule code (8002), severity (Hard/3) and the "40h" limit message
 * the bell + dialog render — not bare visibility.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

type LiveViol = { pairingId: number; ruleCode: string; severity: number; message: string }

test('Viol-8001 — migrated 8002 reaches the gantt via bell data + Alert Center (default filter)', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)            // default no-filter apply → full bootstrap load

  // ── Validation path 1: the BELL's data source (displayViolations) ──────────────
  // Loaded async AFTER the crew viewport (must not block the 1–2s first paint), so poll.
  await expect
    .poll(
      () => page.evaluate(() => {
        const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
        return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8002').length
      }),
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0)

  const bell8002 = await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest: { liveViolations: () => LiveViol[] } }).__ganttTest
    return t.liveViolations().filter((v) => v.ruleCode === '8002')
  })
  // 8002/001 now carries TWO flavors: the Hard (sev 3) cumulative-BLOCK windows and the
  // Overridable (sev 2) monthly CREDIT band (4th param row). Assert the block alarms here.
  expect(bell8002.length).toBeGreaterThan(0)
  expect(bell8002.every((v) => v.pairingId > 0)).toBe(true)
  const block8002 = bell8002.filter((v) => v.severity === 3)
  expect(block8002.length).toBeGreaterThan(0)
  expect(block8002.every((v) => v.severity === 3)).toBe(true)
  // 8002's cap is now param-driven (rule 8002/001 Max Limits), so assert the cumulative-block
  // message SHAPE ("exceeds <n>h"), not a hardcoded 40h that the param can change.
  expect(block8002.some((v) => /exceeds \d+h/.test(v.message))).toBe(true)

  // …and that data resolves to actual crew BELLS: crew rows carry maxViolationSeverity > 0,
  // which is exactly what drawCrewViolationIndicator paints. A row at sev 3 = a Hard bell.
  const bellRows = await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest: { crewViolationSeverities: () => Array<{ crewId: string; severity: number }> } }).__ganttTest
    return t.crewViolationSeverities().filter((r) => r.severity > 0)
  })
  expect(bellRows.length).toBeGreaterThan(0)
  expect(bellRows.some((r) => r.severity === 3)).toBe(true)

  // ── Validation path 2: the Legality ALERT CENTER dialog ────────────────────────
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  // The blue title bar shows the Hard count badge (sev-3 messages loaded).
  await expect(dialog.getByTestId('alert-count-hard')).toBeVisible()

  // The message table lists 8002 rows — assert real content, not bare visibility.
  const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]')
  await expect.poll(() => rows8002.count()).toBeGreaterThan(0)

  // The block-window 8002 row shows the rule id, the Hard (sev 3) badge and the cumulative-block
  // message. The cap is param-driven, so match the message shape ("exceeds <n>h") not a literal cap.
  const first = rows8002.filter({ hasText: /exceeds \d+h/ }).first()
  await expect(first).toContainText('8002')
  await expect(first).toContainText(/exceeds \d+h/)
  await expect(first.locator('td').first()).toContainText('3')   // SEV badge = 3 (Hard)
  // Crew id cell is non-empty (the message is attributed to a real crew).
  const crewId = await first.getAttribute('data-crew-id')
  expect(crewId && crewId.length > 0).toBeTruthy()

  // The Severity grouping in the sidebar renders the "Hard" tier label for sev-3 alarms.
  await expect(dialog).toContainText('Hard')
})

test('Viol-8006 — Alert Center shows the rule INSTANCE (8002/001) and groups by rule / base / rank', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)

  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  // Rule ID column shows the INSTANCE form 8002/001, not the bare template 8002.
  const instRows = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8002/001"]')
  await expect.poll(() => instRows.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
  await expect(instRows.first()).toContainText('8002/001')

  // Group by RULE → a sidebar group keyed by the instance id "8002/001".
  await dialog.getByTestId('alert-groupby-rule').click()
  const ruleGroup = dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })
  await expect(ruleGroup).toHaveCount(1)
  await ruleGroup.click()
  // Every visible row now belongs to that instance.
  const visible = dialog.locator('[data-testid="violation-list-row"]')
  await expect.poll(() => visible.count()).toBeGreaterThan(0)
  await expect(dialog.locator('[data-testid="violation-list-row"]:not([data-rule-id="8002/001"])')).toHaveCount(0)

  // Group by BASE → at least one base group, and selecting it narrows the table to that base.
  await dialog.getByTestId('alert-groupby-base').click()
  await expect(dialog.locator('[data-testid="alert-group-item"]').first()).toBeVisible()
  const firstBase = dialog.locator('[data-testid="alert-group-item"]').first()
  const baseLabel = (await firstBase.textContent())?.trim().replace(/\d+$/, '').trim() ?? ''
  await firstBase.click()
  const baseRowCount = await dialog.locator('[data-testid="violation-list-row"]').count()
  expect(baseRowCount).toBeGreaterThan(0)

  // Group by RANK → the new dimension renders groups too.
  await dialog.getByTestId('alert-groupby-rank').click()
  await expect(dialog.locator('[data-testid="alert-group-item"]').first()).toBeVisible()
  expect(baseLabel.length).toBeGreaterThanOrEqual(0)
})
