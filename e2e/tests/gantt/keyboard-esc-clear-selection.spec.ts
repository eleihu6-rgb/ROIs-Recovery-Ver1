/**
 * ESC key — clear all Gantt pane selections.
 *
 * Four tests cover the selection states that ESC must clear:
 *   ESC-01: Live roster TASK selection (useGanttViewStore.selectedTaskIds)
 *   ESC-02: Live roster CREW-ROW HEADER selection (usePaneStore 'roster-main' row selection)
 *   ESC-03: ESC inside a text input is a no-op (guard in use-keyboard.ts must stay)
 *   ESC-04: Live PAIRING PANE row selection (usePaneStore 'pairing' row selection)
 *           Regression for bug: ESC cleared Roster but left Pairing selected.
 *
 * All Live tests use __ganttTest test drivers to seed selection without needing
 * canvas clicks — same determinism pattern as roster-box-delete.spec.ts.
 * ESC is dispatched as a real KeyboardEvent on the document body.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Read Live selectedTaskIds from __ganttTest probe. */
const liveTaskSelection = (page: Page): Promise<number[]> =>
  readHook<number[]>(page, 'selectedTaskIds')

/** Read Live roster crew-row selection from __ganttTest probe. */
const liveCrewRowSelection = (page: Page): Promise<string[]> =>
  readHook<string[]>(page, 'liveRosterCrewRowIds')

/** Read Live pairing pane row selection from __ganttTest probe. */
const livePairingRowSelection = (page: Page): Promise<string[]> =>
  readHook<string[]>(page, 'livePairingRowIds')

/** Seed Live task selection directly (no canvas click needed). */
const seedTaskSelection = (page: Page, ids: number[]): Promise<void> =>
  page.evaluate((arg) => {
    (window.__ganttTest as unknown as { selectRosterTasks: (i: number[]) => void }).selectRosterTasks(arg)
  }, ids)

/** Seed Live crew-row selection directly. */
const seedCrewRowSelection = (page: Page, crewId: string): Promise<void> =>
  page.evaluate((arg) => {
    (window.__ganttTest as unknown as { setLiveRosterCrewRow: (id: string) => void }).setLiveRosterCrewRow(arg)
  }, crewId)

/** Press ESC on the document body (simulates user pressing the key outside any input). */
const pressEsc = (page: Page): Promise<void> =>
  page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('ESC — clear all Gantt pane selections', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    // Wait until at least some roster items are loaded so we have real ids to select.
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster items must load before seeding selection',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('ESC-01 — ESC clears Live roster task selection', async ({ page }) => {
    // Get the real roster item ids from the hook so we seed valid ids.
    const items = await readHook<Array<{ id: number }>>(page, 'roster')
    expect(items.length, 'need at least one roster item').toBeGreaterThan(0)
    const ids = items.slice(0, 2).map((i) => i.id)

    // Seed selection.
    await seedTaskSelection(page, ids)
    await expect
      .poll(() => liveTaskSelection(page), { timeout: 3_000, message: 'task selection must be seeded' })
      .toEqual(ids)

    // Press ESC — must clear.
    await pressEsc(page)
    await expect
      .poll(() => liveTaskSelection(page), { timeout: 3_000, message: 'ESC must clear task selection' })
      .toEqual([])
  })

  test('ESC-02 — ESC clears Live roster crew-row header selection', async ({ page }) => {
    // Pick the first crew id from the roster items.
    const items = await readHook<Array<{ crewId: string }>>(page, 'roster')
    expect(items.length, 'need at least one roster item for a crewId').toBeGreaterThan(0)
    const crewId = items[0].crewId

    // Seed crew-row selection.
    await seedCrewRowSelection(page, crewId)
    await expect
      .poll(() => liveCrewRowSelection(page), { timeout: 3_000, message: 'crew-row selection must be seeded' })
      .toContain(crewId)

    // Press ESC — must clear.
    await pressEsc(page)
    await expect
      .poll(() => liveCrewRowSelection(page), { timeout: 3_000, message: 'ESC must clear crew-row selection' })
      .toEqual([])
  })

  test('ESC-03 — ESC inside a text input is a no-op (guard must stay)', async ({ page }) => {
    // Seed some task selection first.
    const items = await readHook<Array<{ id: number }>>(page, 'roster')
    expect(items.length).toBeGreaterThan(0)
    const ids = [items[0].id]
    await seedTaskSelection(page, ids)
    await expect
      .poll(() => liveTaskSelection(page), { timeout: 3_000 })
      .toEqual(ids)

    // The Live roster view has no always-visible text input, so we append a temporary
    // one and focus it. The keydown guard checks e.target instanceof HTMLInputElement,
    // so this faithfully exercises the guard path without relying on a specific UI element.
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.type = 'text'
      input.id = '__esc-test-input'
      document.body.appendChild(input)
      input.focus()
    })

    // Dispatch ESC while the input has focus.
    await page.keyboard.press('Escape')

    // Clean up the temporary input.
    await page.evaluate(() => document.getElementById('__esc-test-input')?.remove())

    // Selection must be UNCHANGED.
    const afterEsc = await liveTaskSelection(page)
    expect(afterEsc, 'selection must be unchanged after ESC in an input').toEqual(ids)
  })

  test('ESC-04 — ESC clears Live pairing pane row selection (regression)', async ({ page }) => {
    // Regression: ESC previously cleared Roster but left Pairing pane row selected.
    // Seed a pairing row selection using the __ganttTest driver.
    const items = await readHook<Array<{ id: number }>>(page, 'pairings')
    // Pairing pane may not be loaded if no pairings exist in the date range — skip gracefully.
    if (items.length === 0) return
    const pairingId = String(items[0].id)

    await page.evaluate((arg) => {
      (window.__ganttTest as unknown as { setLivePairingRow: (id: string) => void }).setLivePairingRow(arg)
    }, pairingId)
    await expect
      .poll(() => livePairingRowSelection(page), { timeout: 3_000, message: 'pairing row selection must be seeded' })
      .toContain(pairingId)

    // Press ESC — must clear.
    await pressEsc(page)
    await expect
      .poll(() => livePairingRowSelection(page), { timeout: 3_000, message: 'ESC must clear pairing row selection' })
      .toEqual([])
  })
})
