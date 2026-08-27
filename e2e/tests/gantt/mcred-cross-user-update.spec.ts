import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Two-user (A / B) cross-user live update for de-assign + MCred.
 *
 *   1.1  A de-assigns a flying pairing (NO save) → A's MCred drops immediately, but B sees
 *        NOTHING (A's edit is a local draft; no server write, no broadcast).
 *   1.2  A undoes → A's roster AND MCred both revert to the original.
 *   2    A de-assigns again and SAVES → B (no manual refresh) receives the new roster (the
 *        pairing is gone) and an updated MCred matching A's post-save value.
 *
 * The mutation is driven through the REAL toolbar buttons on browser A (Delete / Undo / Save —
 * §Simulate-User); the target duty is selected via the dev selection hook (test setup, like
 * roster-box-delete.spec.ts), because saved de-assigns persist and can push credited crews below
 * the fold, making canvas geometry unreliable. Cross-user delivery rides the existing
 * `roster-updated` WebSocket broadcast that `/api/draft/commit` emits; B's handler refetches roster
 * + crew-stats for the affected crews. Proof reads the rendered panel MCred + roster items
 * (§No-Illusion), not API calls.
 */

// Pin a host tz WEST of the display tz (regression guard for the viewport-month tz fix).
test.use({ timezoneId: 'America/Vancouver' })

interface RosterProbe { id: number; pairingId: number; crewId: string }
interface DraftState { opCount: number; saving: boolean }

const mcredFor = async (page: Page, crewId: string): Promise<string> => {
  const rows = await readHook<Array<{ crewId: string; mcred: string }>>(page, 'rosterMcred')
  return rows.find((r) => r.crewId === crewId)?.mcred ?? ''
}

const draftState = (page: Page): Promise<DraftState> =>
  readHook<DraftState>(page, 'draftState')

const hasPairing = async (page: Page, crewId: string, pairingId: number): Promise<boolean> => {
  const items = await readHook<Array<{ crewId: string; pairingId: number | null }>>(page, 'roster')
  return items.some((i) => i.crewId === crewId && i.pairingId === pairingId)
}

const selectTask = (page: Page, id: number): Promise<void> =>
  page.evaluate((taskId) => {
    (window.__ganttTest as unknown as { selectRosterTasks: (i: number[]) => void }).selectRosterTasks([taskId])
  }, id)

const toMinutes = (hmm: string): number => {
  const [h, m] = hmm.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

const openGantt = async (page: Page, request: Parameters<typeof seedGanttAuth>[1]): Promise<GanttDashboardPage> => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)
  const dash = new GanttDashboardPage(page)
  await dash.goto()
  await expect.poll(async () => (await counts(page)).roster, { timeout: 30_000 }).toBeGreaterThan(0)
  return dash
}

test('Live-1313 — A de-assign/save propagates roster + MCred to B; B stays put pre-save; undo reverts A', async ({ browser, request }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()
  try {
    await openGantt(pageA, request)
    await openGantt(pageB, request)

    // Pick a crew with NON-ZERO credit + a flying pairing (saved de-assigns persist, so prior
    // runs may have drained some crews — choose one that still has credit).
    await expect.poll(async () =>
      readHook<RosterProbe | null>(pageA, 'rosterProbeWithCredit'), { timeout: 30_000 }).not.toBeNull()
    const probe = await readHook<RosterProbe | null>(pageA, 'rosterProbeWithCredit')
    expect(probe, 'a flying puck on a credited crew exists').not.toBeNull()
    const { id: taskId, crewId, pairingId } = probe!

    await expect.poll(async () => mcredFor(pageB, crewId), { timeout: 30_000 }).not.toBe('')
    const before = await mcredFor(pageA, crewId)
    expect(toMinutes(before), 'probed crew has real credit').toBeGreaterThan(0)
    expect(await mcredFor(pageB, crewId), 'A and B agree before any edit').toBe(before)

    // ── 1.1  A de-assigns (NO save): select the duty, click the real Delete button ──
    await selectTask(pageA, taskId)
    await pageA.getByTestId('draft-delete-btn').click()

    // A's MCred drops immediately (Phase A optimistic delta).
    await expect.poll(async () => mcredFor(pageA, crewId), { timeout: 10_000 }).not.toBe(before)
    expect(toMinutes(await mcredFor(pageA, crewId))).toBeLessThan(toMinutes(before))

    // B sees NOTHING change — the edit is a local draft on A.
    await pageB.waitForTimeout(1500)
    expect(await mcredFor(pageB, crewId), 'B MCred unchanged before save').toBe(before)
    expect(await hasPairing(pageB, crewId, pairingId), 'B still has the pairing before save').toBe(true)

    // ── 1.2  A undoes → roster + MCred revert ──
    await pageA.getByTestId('draft-undo-btn').click()
    await expect.poll(async () => mcredFor(pageA, crewId), { timeout: 10_000 }).toBe(before)
    expect(await hasPairing(pageA, crewId, pairingId), 'A roster restored after undo').toBe(true)

    // ── 2  A de-assigns again and SAVES → B updates live ──
    await selectTask(pageA, taskId)
    await pageA.getByTestId('draft-delete-btn').click()
    await expect.poll(async () => mcredFor(pageA, crewId), { timeout: 10_000 }).not.toBe(before)
    const afterDraft = await mcredFor(pageA, crewId)
    await pageA.getByTestId('draft-save-btn').click()

    const saveSamples: string[] = []
    let sawSaving = false
    await expect.poll(async () => {
      const state = await draftState(pageA)
      const value = await mcredFor(pageA, crewId)
      if (value) saveSamples.push(value)
      if (state.saving) sawSaving = true
      return sawSaving && !state.saving && state.opCount === 0
    }, { message: 'A save completes after sampling rendered MCred', timeout: 30_000 }).toBe(true)

    expect(afterDraft, 'draft MCred changed before Save').not.toBe(before)
    expect(saveSamples, 'committer MCred must not flash back to the pre-save value during Save').not.toContain(before)

    // B (no manual refresh): the pairing is gone and MCred changed to A's post-save value.
    await expect.poll(async () => hasPairing(pageB, crewId, pairingId),
      { message: 'B loses the de-assigned pairing after A saves', timeout: 20_000 }).toBe(false)
    await expect.poll(async () => mcredFor(pageB, crewId),
      { message: 'B MCred updates after A saves', timeout: 20_000 }).not.toBe(before)
    const afterA = await mcredFor(pageA, crewId)
    expect(await mcredFor(pageB, crewId), 'A and B converge on the post-save MCred').toBe(afterA)
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})
