/**
 * R'Bot → Recovery and Best-fit crew (P3 feature wiring).
 *
 * Real UI: the user asks R'Bot in chat; R'Bot opens the SAME Recovery / Best-fit dialogs the
 * context menu and Alert Center open, scoped to the request. Only the LLM reply (…/ai/chat)
 * is stubbed; dispatch, stores, dialogs and data are real. Read-only: nothing is Applied or
 * Saved, so no shared SIT data changes.
 *
 * Fixtures:
 *   - Case 3 (8004 fleet mismatch): pairing 152227 (ADD, 2026-09-19) with L3002/L3006/L3007 —
 *     docs/test-cases/crew-recovery, .local/case3. Still carries live 8004 rows.
 *   - An open pairing (coverage open/partial) chosen at runtime from the loaded Live pairings.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const SHOT_DIR = '../docs/assets/screenshots/gantt'
const CASE3_CREW = ['L3002', 'L3006', 'L3007']
const CASE3_PAIRING = 152227

interface HookPairing { id: number; label: string | null; start: string | null; composition: Array<{ rank: string | null; plan: number; fill: number }> }

const stub = async (page: Page, actions: unknown[], content = 'Opening it for you.'): Promise<void> => {
  await page.unroute('**/ai/chat')
  await page.route('**/ai/chat', (route) => route.fulfill({ json: { role: 'assistant', content, actions } }))
}
const ask = async (page: Page, text: string): Promise<void> => {
  await page.getByTestId('ai-chat-input').fill(text)
  await page.getByTestId('ai-chat-send').click()
}
const lastChip = (page: Page) => page.getByTestId('ai-chat-applied').last()

const openLive = async (page: Page, request: import('@playwright/test').APIRequestContext): Promise<void> => {
  await seedGanttAuth(page, request)
  const dash = new GanttDashboardPage(page)
  await dash.goto(60_000)
  await dash.expectRosterPaneVisible()
  await dash.expectPairingPaneVisible()
  await page.getByTestId('ai-chat-toggle').click()
}

/** An open pairing (has an open position) whose label is unique among loaded pairings. */
const pickOpenPairing = async (page: Page): Promise<HookPairing> => {
  let chosen: HookPairing | undefined
  await expect.poll(async () => {
    // Labels come from the pane's rendered rows; composition from the pairing store.
    const order = await readHook<Array<{ id: string; label: string }>>(page, 'pairingPanelOrder')
    const labelById = new Map(order.map((r) => [Number(r.id), r.label]))
    const ps = (await readHook<HookPairing[]>(page, 'pairings')).map((p) => ({ ...p, label: labelById.get(p.id) ?? null }))
    const labelCount = new Map<string, number>()
    for (const p of ps) if (p.label) labelCount.set(p.label, (labelCount.get(p.label) ?? 0) + 1)
    chosen = ps.find((p) => p.label && labelCount.get(p.label) === 1 && p.composition.some((s) => s.plan > s.fill) && p.composition.some((s) => s.plan > 0))
    return chosen !== undefined
  }, { timeout: 60_000 }).toBe(true)
  return chosen!
}

test.describe("R'Bot → Recovery / Best-fit", () => {
  test('Live-RBOT-REC-1 — "fix L3002\'s 8004": R\'Bot brings the Case-3 crew up, then its Recovery answer matches the Alert Center', async ({ page, request }) => {
    test.setTimeout(300_000)
    await openLive(page, request)

    // Step 1: R'Bot narrows the board to the Case-3 crew (real filter + reload).
    await stub(page, [{ type: 'filter_crew', crewIds: CASE3_CREW }], 'Showing the Case 3 crew.')
    await ask(page, `show crew ${CASE3_CREW.join(', ')}`)
    await expect(lastChip(page)).toContainText('Filtered crew')
    await expect.poll(async () => {
      const rows = await readHook<Array<{ crewId: string }>>(page, 'rosterPanel')
      // A crew-id filter brings the named crew to the top (the rest stay loaded below).
      return rows.slice(0, CASE3_CREW.length).map((r) => r.crewId).sort().join() === [...CASE3_CREW].sort().join()
    }, { timeout: 120_000 }).toBe(true)
    // Violations load after first paint (§First-Paint) — wait for the 8004 on 152227.
    await expect.poll(async () => (await readHook<Array<{ pairingId: number; ruleCode: string }>>(page, 'liveViolations'))
      .some((v) => v.pairingId === CASE3_PAIRING && v.ruleCode === '8004'), { timeout: 120_000 }).toBe(true)

    // Step 2: R'Bot must agree with the Alert Center's own "can recover" judgement.
    // (152227 flew on 2026-09-19 — a completed roster is not recoverable, so today the Alert
    // Center shows "—" instead of a Recovery button; the positive path is unit-tested in
    // rbot-recovery.test.ts because SIT has no future 8004/1001/3007 alert.)
    await page.getByTestId('violations-button').first().click()
    const alertCenter = page.getByTestId('violation-list-dialog')
    await expect(alertCenter).toBeVisible()
    // The Alert Center marks a recoverable alert with an ENABLED selection checkbox.
    const box = alertCenter.getByTestId(`alert-recovery-checkbox-L3002-${CASE3_PAIRING}`).first()
    await expect(box).toBeVisible({ timeout: 30_000 })
    const recoverable = await box.isEnabled()
    await page.keyboard.press('Escape')
    await expect(alertCenter).toBeHidden()

    await stub(page, [{ type: 'recover_violation', crewId: 'L3002', ruleCode: '8004' }], 'Opening Recovery for L3002.')
    await ask(page, "fix L3002's 8004")
    const dialog = page.getByTestId('recovery-violation-dialog')
    if (recoverable) {
      await expect(lastChip(page)).toContainText(/Opened Recovery for \d+ alerts? \(crew L3002, rule 8004\)/, { timeout: 30_000 })
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('L3002')
    } else {
      await expect(lastChip(page)).toContainText('No recoverable alert for crew L3002, rule 8004')
      await expect(dialog).toBeHidden()
    }
    await page.screenshot({ path: `${SHOT_DIR}/rbot-recovery-violation-Ver1.png` })
  })

  test('Live-RBOT-REC-2 — "staff the open seat on <pairing>" opens Recovery — open seats for that pairing', async ({ page, request }) => {
    test.setTimeout(240_000)
    await openLive(page, request)
    const open = await pickOpenPairing(page)

    await stub(page, [{ type: 'recover_open_pairing', pairing: open.label }])
    await ask(page, `staff the open seat on ${open.label}`)
    await expect(lastChip(page)).toContainText(`Opened Recovery — open seats for ${open.label}`)
    const dialog = page.getByTestId('recovery-violation-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toContainText(open.label!)
    await page.screenshot({ path: `${SHOT_DIR}/rbot-recovery-open-seat-Ver1.png` })
    await page.keyboard.press('Escape')

    // A pairing that does not exist is reported, not guessed.
    await stub(page, [{ type: 'recover_open_pairing', pairing: 'ZZ999/ZZ998' }])
    await ask(page, 'staff ZZ999/ZZ998')
    await expect(lastChip(page)).toContainText('Pairing ZZ999/ZZ998 is not loaded in the pairing pane.')
  })

  test('Live-RBOT-BF-1 — "who can fly <pairing>" opens Best-fit preselected; "the open ones in view" preselects the in-view batch', async ({ page, request }) => {
    test.setTimeout(240_000)
    await openLive(page, request)
    const open = await pickOpenPairing(page)

    // Named pairing → Best-fit dialog with exactly that pairing ticked.
    await stub(page, [{ type: 'best_fit_crew', pairings: [String(open.id)] }])
    await ask(page, `who can fly ${open.label}?`)
    await expect(lastChip(page)).toContainText('Opened Best-fit crew for 1 pairing')
    const dialog = page.getByTestId('best-fit-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId(`best-fit-include-${open.id}`)).toBeChecked()
    await expect(dialog.locator('[data-testid^="best-fit-include-"]:checked')).toHaveCount(1)
    await page.screenshot({ path: `${SHOT_DIR}/rbot-best-fit-named-Ver1.png` })
    await page.getByTestId('best-fit-close').click()
    await expect(dialog).toBeHidden()

    // "The open ones in view": follow-up chip from View Gantt → same dialog, in-view batch.
    await page.getByTestId('ai-chat-view-gantt').click()
    const chip = page.getByTestId('ai-chat-followup').filter({ hasText: 'Find best-fit crew for the open pairings in view' })
    await expect(chip).toBeVisible()
    await stub(page, [{ type: 'best_fit_crew', pairings: [] }])
    await chip.click()
    await expect(lastChip(page)).toContainText(/Opened Best-fit crew for [1-5] pairings? in view/)
    await expect(dialog).toBeVisible()
    const ticked = await dialog.locator('[data-testid^="best-fit-include-"]:checked').count()
    expect(ticked).toBeGreaterThan(0)
    expect(ticked).toBeLessThanOrEqual(5)
    await page.screenshot({ path: `${SHOT_DIR}/rbot-best-fit-in-view-Ver1.png` })
  })
})
