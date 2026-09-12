import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * AL / DO fixed full-day window in the Create Ground Task dialog.
 *
 * Product change (Ryan, 2026-09-12): Annual Leave (AL) and Day Off (DO) are whole-day
 * assignments. Their assignment.fixed_str_tm / fixed_end_tm are set to 00:00–23:59, and
 * the dialog auto-fills + LOCKS the start/end times so a scheduler picks only the crew,
 * the base airport and the date — never the time.
 *
 * Validated for real F8 crew from two bases — 2 ADD (J4001/J4002) + 2 DXB (K1001/K1002) —
 * driving the real dialog (§Simulate-User): type the crew, choose AL/DO, confirm the time
 * fields are locked to the full-day window, then create and assert the resulting draft
 * roster entry spans exactly one full day (23h59m) for that crew at its base.
 *
 * Live gantt is always in draft mode, so a created ground task is a LOCAL draft (negative
 * temp id) — nothing is written to the backend, making this test zero-pollution.
 */
const rosterObjects = (page: Page): Promise<Array<Record<string, unknown>>> => readHook(page, 'roster')

const FULL_DAY_MINUTES = 23 * 60 + 59 // 00:00 → 23:59

// The roster introspection hook exposes the scheduled window as `start` / `end`
// (see gantt-test-hook.ts: schStrDtUtc → start, schEndDtUtc → end).
const spanMinutes = (item: Record<string, unknown>): number => {
  const start = new Date(String(item.start)).getTime()
  const end = new Date(String(item.end)).getTime()
  return Math.round((end - start) / 60000)
}

interface FullDayCase {
  crewId: string
  base: string
  assignment: 'AL' | 'DO'
}

// 2 ADD + 2 DXB base crew, covering both whole-day assignments (AL and DO).
const CASES: FullDayCase[] = [
  { crewId: 'J4001', base: 'ADD', assignment: 'AL' },
  { crewId: 'K1001', base: 'DXB', assignment: 'AL' },
  { crewId: 'J4002', base: 'ADD', assignment: 'DO' },
  { crewId: 'K1002', base: 'DXB', assignment: 'DO' },
]

test.describe('Ground Task — AL/DO fixed full-day window', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.route('**/api/legality/preview-draft', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { allowed: true, violations: [] }, message: 'ok' }),
      }))
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect
      .poll(async () => (await counts(page)).roster, { message: 'roster loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  for (const c of CASES) {
    test(`FullDay-${c.assignment}-${c.base}-${c.crewId} — selecting ${c.assignment} locks time to full day and creates a whole-day draft`, async ({ page }) => {
      await page.getByTestId('create-ground-task-btn').click()
      const heading = page.getByRole('heading', { name: 'Create Ground Task' })
      await expect(heading).toBeVisible({ timeout: 5_000 })
      const dialog = page.getByTestId('ground-task-dialog')

      // Default (no assignment): times are editable inputs seeded to the full-day window.
      await expect(dialog.getByTestId('ground-task-start-time')).toHaveValue('00:00')
      await expect(dialog.getByTestId('ground-task-end-time')).toHaveValue('23:59')

      // Crew: type + Enter → chip.
      const crewInput = dialog.getByPlaceholder('Type ID, press Enter…')
      await crewInput.fill(c.crewId)
      await crewInput.press('Enter')
      await expect(dialog.getByText(c.crewId, { exact: true })).toBeVisible()

      // Assignment options come from GET /api/assignment (real backend data).
      const select = dialog.locator('select')
      await expect.poll(async () => select.locator('option').count(), {
        message: 'assignment options loaded',
        timeout: 15_000,
      }).toBeGreaterThan(1)
      test.skip(
        await select.locator(`option[value="${c.assignment}"]`).count() === 0,
        `${c.assignment} assignment option is unavailable`,
      )
      await select.selectOption(c.assignment)

      // Core assertion: the time fields are now LOCKED to the full-day window — rendered
      // as read-only pills (data-value), not editable time inputs the scheduler can change.
      const startTime = dialog.getByTestId('ground-task-start-time')
      const endTime = dialog.getByTestId('ground-task-end-time')
      await expect(startTime).toHaveAttribute('data-value', '00:00')
      await expect(endTime).toHaveAttribute('data-value', '23:59')
      // A locked pill is a <div>, so it exposes no form value at all.
      expect(await startTime.evaluate((el) => el.tagName)).toBe('DIV')
      expect(await endTime.evaluate((el) => el.tagName)).toBe('DIV')
      await expect(dialog.getByTestId('ground-task-fixed-day-hint')).toContainText('Full day')
      await expect(dialog.getByTestId('ground-task-fixed-day-hint')).toContainText(c.assignment)

      // Base airport for this crew.
      await dialog.getByTestId('ground-task-dep-arp').fill(c.base)
      await dialog.getByTestId('ground-task-arv-arp').fill(c.base)

      await expect(dialog.getByText(/Will create\s+1\s+roster entry/)).toBeVisible()
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      // Create awaits the draft legality gate + a crew lock (a real round-trip over the
      // tunnel) before the dialog closes — allow tunnel latency, like the draft poll below.
      await expect(heading).toHaveCount(0, { timeout: 15_000 })

      // The draft (negative temp id) for THIS crew carries the assignment, base and a
      // full-day span. Poll: draft insertion + legality gate resolve asynchronously.
      await expect.poll(async () => {
        const created = (await rosterObjects(page)).find(
          (r) => Number(r.id) < 0 && String(r.crewId) === c.crewId && r.assignment === c.assignment,
        )
        return created ? spanMinutes(created) : -1
      }, {
        message: `full-day ${c.assignment} draft for ${c.crewId} spans 23h59m`,
        timeout: 10_000,
      }).toBe(FULL_DAY_MINUTES)

      const created = (await rosterObjects(page)).find(
        (r) => Number(r.id) < 0 && String(r.crewId) === c.crewId && r.assignment === c.assignment,
      )!
      expect(created.base).toBe(c.base)
      expect(created.depArp).toBe(c.base)
      expect(created.arvArp).toBe(c.base)
      expect(created.pairingId, 'ground task has no pairing').toBeNull()
    })
  }

  test('FullDay-snapshot — locked full-day AL dialog (visual proof)', async ({ page }, testInfo) => {
    await page.getByTestId('create-ground-task-btn').click()
    const dialog = page.getByTestId('ground-task-dialog')
    await expect(dialog.getByRole('heading', { name: 'Create Ground Task' })).toBeVisible({ timeout: 5_000 })

    const crewInput = dialog.getByPlaceholder('Type ID, press Enter…')
    await crewInput.fill('K1001')
    await crewInput.press('Enter')

    // Fill the airports and COMMIT each via its suggestion option so the autocomplete
    // popover closes deterministically (it lingers 120ms after a plain blur). Pick AL LAST
    // (native select opens no popover) — the captured dialog shows Assignment=AL / Group=LVE
    // and the locked full-day Start/End unobstructed.
    await dialog.getByTestId('ground-task-dep-arp').fill('DXB')
    await dialog.getByTestId('ground-task-dep-arp-option-DXB').click()
    await dialog.getByTestId('ground-task-arv-arp').fill('DXB')
    await dialog.getByTestId('ground-task-arv-arp-option-DXB').click()

    const select = dialog.locator('select')
    await expect.poll(async () => select.locator('option').count(), { timeout: 15_000 }).toBeGreaterThan(1)
    test.skip(await select.locator('option[value="AL"]').count() === 0, 'AL assignment option is unavailable')
    await select.selectOption('AL')

    await expect(dialog.getByTestId('ground-task-start-time')).toHaveAttribute('data-value', '00:00')
    await expect(dialog.getByTestId('ground-task-fixed-day-hint')).toContainText('Full day')

    const path = '../docs/assets/screenshots/gantt/ground-task-full-day-al-do-Ver2.png'
    await dialog.screenshot({ path })
    await testInfo.attach('ground-task-full-day-al-do-Ver2', { path, contentType: 'image/png' })
  })
})
