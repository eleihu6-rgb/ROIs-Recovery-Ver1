import { test, expect, type Page, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Create Ground Task dialog (gantt/src/components/roster/ground-task-dialog.tsx),
 * opened from the Live sub-toolbar (SquarePlus / "Create Ground Task").
 *
 * The Live gantt is ALWAYS in draft mode (draft-store: `active: true`), so creating
 * a ground task adds a LOCAL draft op with a negative temp id — nothing is written to
 * the backend until the user clicks Save (which this test never does). That makes the
 * test zero-pollution by construction: the draft lives only in this context's memory.
 *
 * We assert the full create flow end-to-end: the new roster entry actually appears in
 * the store the canvas draws from, carrying the crew, assignment and remark we entered.
 */
const rosterObjects = (page: Page): Promise<Array<Record<string, unknown>>> => readHook(page, 'roster')
type Kpis = { crewId: string; mcred: string; mbh: string; ybh: string; mdo: string; ydo: string; mal: string; yal: string }

const airportZone = (page: Page, airport: string): Promise<string | undefined> =>
  page.evaluate((a) => (window.__ganttTest as unknown as { airportZone: (x: string) => string | undefined }).airportZone(a), airport)

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const kpisFor = async (page: Page, crewId: string): Promise<Kpis | undefined> => {
  const rows = await readHook<Kpis[]>(page, 'rosterPanelKpis')
  return rows.find((r) => r.crewId === crewId)
}

const toCount = (value: string): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const setEnglishDatePicker = async (
  page: Page,
  trigger: Locator,
  ariaLabel: string,
  isoDate: string,
): Promise<void> => {
  const [year, month, day] = isoDate.split('-').map(Number)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const formatted = `${monthNames[month - 1]} ${day}, ${year}`

  await trigger.click()
  const isoInput = page.getByRole('textbox', { name: `${ariaLabel} ISO value` })
  await expect(isoInput).toBeVisible({ timeout: 5_000 })
  await isoInput.fill(isoDate)
  await page.getByRole('gridcell', { name: `Select ${formatted}`, exact: true }).click()
  await expect(trigger).toContainText(formatted)
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const findDoFreeDate = async (page: Page, crewId: string): Promise<string> => {
  const rpBadge = page.getByTestId('roster-pane').getByTestId('roster-header-rp')
  await expect(rpBadge).toBeVisible({ timeout: 15_000 })
  const rpTitle = (await rpBadge.getAttribute('title')) ?? ''
  const monthMatch = rpTitle.match(/\((\d{4}-\d{2})\)/)
  const yearMonth = monthMatch?.[1] ?? '2026-07'

  const range = await readHook<{ start: string; end: string }>(page, 'dateRange')
  const end = range.end.slice(0, 10)
  const roster = await rosterObjects(page)
  const existingDoDates = new Set(
    roster
      .filter((r) => String(r.crewId) === crewId && String(r.assignment ?? '').toUpperCase() === 'DO')
      .map((r) => String(r.schStrDtUtc ?? '').slice(0, 10)),
  )
  for (let offset = 0; offset < 31; offset += 1) {
    const date = addDays(`${yearMonth}-01`, offset)
    if (date > end || date.slice(0, 7) !== yearMonth) break
    if (!existingDoDates.has(date)) return date
  }
  test.skip(true, `no DO-free date found for crew ${crewId} in ${yearMonth}`)
  return `${yearMonth}-01`
}

test.describe('Create Ground Task dialog', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.route('**/api/legality/preview-draft', (route) =>
      route.fulfill(ok({ allowed: true, violations: [] })))
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect
      .poll(async () => (await counts(page)).roster, { message: 'roster loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('GroundTask-1 — create adds a draft roster entry for the chosen crew + assignment', async ({ page }) => {
    // Attach the ground task to a real loaded crew so it renders on an existing row.
    const crewId = String((await rosterObjects(page))[0].crewId)
    const remark = `E2E-GT-${Date.now()}` // exercises the remark field
    // No pre-existing drafts in a fresh context, so any negative id afterwards is ours.
    expect((await rosterObjects(page)).some((r) => Number(r.id) < 0), 'no draft entries yet').toBe(false)

    await page.getByTestId('create-ground-task-btn').click()
    const heading = page.getByRole('heading', { name: 'Create Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.getByTestId('ground-task-dialog')
    await expect(dialog.getByTestId('ground-task-credit-row')).toBeVisible()
    await expect(dialog.getByTestId('ground-task-credit-input')).toBeVisible()
    await expect(dialog.getByTestId('ground-task-start-time')).toHaveValue('00:00')
    await expect(dialog.getByTestId('ground-task-end-time')).toHaveValue('23:59')

    // Crew: type the id and commit it (Enter) → a chip appears.
    const crewInput = dialog.getByPlaceholder('Type ID, press Enter…')
    await crewInput.fill(crewId)
    await crewInput.press('Enter')
    await expect(dialog.getByText(crewId, { exact: true })).toBeVisible()

    // Assignment: options come from GET /api/assignment on mount; pick the first real one.
    const select = dialog.locator('select')
    await expect.poll(async () => select.locator('option').count(), {
      message: 'assignment options loaded',
      timeout: 15_000,
    }).toBeGreaterThan(1)
    await select.selectOption({ index: 1 })
    const assignment = await select.inputValue()
    expect(assignment, 'a non-empty assignment was selected').not.toBe('')
    await dialog.getByTestId('ground-task-credit-input').fill('135')
    await expect(dialog.getByTestId('ground-task-credit-value')).toHaveText('2h 15m')

    await dialog.getByTestId('ground-task-dep-arp').fill('YVR')
    await dialog.getByTestId('ground-task-arv-arp').fill('YYZ')

    // Times (dates default to today). End after start so duration is valid.
    const times = dialog.locator('input[type="time"]')
    await times.nth(0).fill('09:00')
    await times.nth(1).fill('12:00')
    await dialog.locator('textarea').fill(remark)

    // The footer summary reflects the single crew that will be created.
    await expect(dialog.getByText(/Will create\s+1\s+roster entry/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(heading).toHaveCount(0) // dialog closed on success

    // A draft entry (negative temp id) now exists in the store the canvas draws from —
    // the negative id proves it was NOT persisted to the backend (always-draft mode).
    await expect.poll(async () => (await rosterObjects(page)).some((r) => Number(r.id) < 0), {
      message: 'a draft ground-task entry (negative id) appeared',
      timeout: 10_000,
    }).toBe(true)

    // The new entry carries the crew + assignment we entered, and has no pairing.
    const created = (await rosterObjects(page)).find((r) => Number(r.id) < 0)
    expect(created, 'created ground task is present').toBeTruthy()
    expect(String(created!.crewId)).toBe(crewId.toUpperCase())
    expect(created!.assignment).toBe(assignment)
    expect(created!.base).toBe('YVR')
    expect(created!.depArp).toBe('YVR')
    expect(created!.arvArp).toBe('YYZ')
    expect(created!.schCreditedMinutes).toBe('135')
    expect(created!.actCreditedMinutes).toBe('135')
    expect(created!.pairingId, 'ground task has no pairing').toBeNull()
  })

  test('GroundTask-5 — DP Min typed in create dialog round-trips through draft and reopens with same value', async ({ page }) => {
    // Regression: previously the local mock item built for a freshly created ground task
    // omitted dpMin, so reopening the draft entry showed an empty DP Min field until the
    // user clicked Save (which reloaded items from the server).
    const crewId = String((await rosterObjects(page))[0].crewId)

    await page.getByTestId('create-ground-task-btn').click()
    const heading = page.getByRole('heading', { name: 'Create Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.getByTestId('ground-task-dialog')

    const crewInput = dialog.getByPlaceholder('Type ID, press Enter…')
    await crewInput.fill(crewId)
    await crewInput.press('Enter')
    await expect(dialog.getByText(crewId, { exact: true })).toBeVisible()

    const select = dialog.locator('select')
    await expect.poll(async () => select.locator('option').count(), {
      message: 'assignment options loaded',
      timeout: 15_000,
    }).toBeGreaterThan(1)
    await select.selectOption({ index: 1 })

    // Type a non-zero DP Min. The default is auto-computed from assignment.dpPct, so we
    // explicitly override it with a recognizable value to prove the value round-trips.
    const dpInput = dialog.getByTestId('ground-task-dp-min-input')
    await dpInput.fill('123')

    await dialog.getByTestId('ground-task-dep-arp').fill('YVR')
    await dialog.getByTestId('ground-task-arv-arp').fill('YYZ')
    const times = dialog.locator('input[type="time"]')
    await times.nth(0).fill('09:00')
    await times.nth(1).fill('12:00')

    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(heading).toHaveCount(0)

    // The draft entry (negative temp id) now exists and carries the dpMin we typed.
    await expect.poll(async () => (await rosterObjects(page)).some((r) => Number(r.id) < 0), {
      message: 'a draft ground-task entry (negative id) appeared',
      timeout: 10_000,
    }).toBe(true)
    const created = (await rosterObjects(page)).find((r) => Number(r.id) < 0)
    expect(created, 'created ground task is present').toBeTruthy()
    expect(created!.dpMin, 'dpMin round-trips into the draft entry').toBe(123)

    // Reopen via the test hook (same code path as a user double-click) and verify the
    // DP Min field shows the value we entered — not an empty field.
    await page.evaluate((item) => {
      const hook = (window as unknown as {
        __ganttTest?: { openGroundTaskEdit: (i: Record<string, unknown>) => void },
      }).__ganttTest
      if (!hook?.openGroundTaskEdit) throw new Error('Gantt test hook is missing openGroundTaskEdit')
      hook.openGroundTaskEdit(item as never)
    }, created as unknown as Record<string, unknown>)

    const editHeading = page.getByRole('heading', { name: 'Edit Ground Task' })
    await expect(editHeading).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByTestId('ground-task-dp-min-input')).toHaveValue('123')
  })

  test('GroundTask-3 — adding DO increments displayed MDO before Save; Undo restores it', async ({ page }) => {
    const crewId = String((await rosterObjects(page))[0].crewId)

    await expect.poll(async () => (await kpisFor(page, crewId))?.mdo ?? '', {
      message: 'crew manday KPIs loaded',
      timeout: 30_000,
    }).not.toBe('')
    const before = (await kpisFor(page, crewId))!
    const beforeMdo = toCount(before.mdo)
    const beforeYdo = toCount(before.ydo)
    const date = await findDoFreeDate(page, crewId)

    await page.getByTestId('create-ground-task-btn').click()
    const heading = page.getByRole('heading', { name: 'Create Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.getByTestId('ground-task-dialog')

    const crewInput = dialog.getByPlaceholder('Type ID, press Enter…')
    await crewInput.fill(crewId)
    await crewInput.press('Enter')
    await expect(dialog.getByText(crewId, { exact: true })).toBeVisible()

    const select = dialog.locator('select')
    await expect.poll(async () => select.locator('option').count(), {
      message: 'assignment options loaded',
      timeout: 15_000,
    }).toBeGreaterThan(1)
    test.skip(await select.locator('option[value="DO"]').count() === 0, 'DO assignment option is unavailable')
    await select.selectOption('DO')
    await dialog.getByTestId('ground-task-dep-arp').fill('YVR')
    await dialog.getByTestId('ground-task-arv-arp').fill('YYZ')

    await setEnglishDatePicker(page, dialog.getByTestId('ground-task-start-date'), 'Ground task start date', date)
    await dialog.getByTestId('ground-task-start-time').fill('00:00')
    await setEnglishDatePicker(page, dialog.getByTestId('ground-task-end-date'), 'Ground task end date', date)
    await dialog.getByTestId('ground-task-end-time').fill('23:59')

    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(heading).toHaveCount(0)

    await expect.poll(async () => {
      const kpis = await kpisFor(page, crewId)
      return kpis ? toCount(kpis.mdo) : -1
    }, { message: 'MDO increments immediately before Save', timeout: 10_000 }).toBe(beforeMdo + 1)
    await expect.poll(async () => {
      const kpis = await kpisFor(page, crewId)
      return kpis ? toCount(kpis.ydo) : -1
    }, { message: 'YDO increments immediately before Save', timeout: 10_000 }).toBe(beforeYdo + 1)

    await page.getByTestId('draft-undo-btn').click()
    await expect.poll(async () => {
      const kpis = await kpisFor(page, crewId)
      return kpis ? `${kpis.mdo}|${kpis.ydo}` : ''
    }, { message: 'Undo restores day-off KPIs', timeout: 10_000 }).toBe(`${before.mdo}|${before.ydo}`)
  })

  test('GroundTask-2 — edit dialog shows credit/airports and saves dep airport as base in draft update', async ({ page }) => {
    const existing = (await rosterObjects(page))[0]
    const groundTask = {
      ...existing,
      id: 987654321,
      crewId: String(existing.crewId),
      pairingId: null,
      base: 'YVR',
      depArp: 'YVR',
      arvArp: 'YYZ',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      label: 'SIM',
      source: 'F8',
      schStrDtUtc: '2026-07-10T09:00:00.000Z',
      schEndDtUtc: '2026-07-10T12:00:00.000Z',
      actStrDtUtc: '2026-07-10T09:00:00.000Z',
      actEndDtUtc: '2026-07-10T12:00:00.000Z',
      actCreditedMinutes: '180',
      schCreditedMinutes: '240',
      dutySeq: null,
      segSeq: null,
      fltId: null,
      fltDt: null,
    }

    await page.evaluate((task) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          patchRoster?: (paneId: 'main' | 'sub', items: Array<Record<string, unknown>>) => void
          openGroundTaskEdit?: (item: Record<string, unknown>) => void
        }
      }).__ganttTest
      if (!hook?.patchRoster || !hook.openGroundTaskEdit) {
        throw new Error('Gantt test hook is missing patchRoster/openGroundTaskEdit')
      }
      hook.patchRoster('main', [task])
    }, groundTask)

    await expect.poll(async () => airportZone(page, 'YVR'), {
      message: 'YVR timezone loaded',
      timeout: 15_000,
    }).toBe('America/Vancouver')

    await page.evaluate((taskId) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          hoverRosterTask?: (taskId: number) => void
        }
      }).__ganttTest
      if (!hook?.hoverRosterTask) throw new Error('Gantt test hook is missing hoverRosterTask')
      hook.hoverRosterTask(taskId)
    }, groundTask.id)
    await expect(page.getByTestId('status-bar-text')).toContainText('YVR')
    await expect(page.getByTestId('status-bar-text')).toContainText('YVR-YYZ')
    await expect(page.getByTestId('status-bar-text')).toContainText('7/10 02:00L ~ 05:00L')
    await expect(page.getByTestId('status-bar-text')).not.toContainText('Pairing #—')
    await expect(page.getByTestId('status-bar-text')).not.toContainText('Base YVR')

    await page.evaluate((task) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          openGroundTaskEdit?: (item: Record<string, unknown>) => void
        }
      }).__ganttTest
      if (!hook?.openGroundTaskEdit) throw new Error('Gantt test hook is missing openGroundTaskEdit')
      hook.openGroundTaskEdit(task)
    }, groundTask)

    const heading = page.getByRole('heading', { name: 'Edit Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.getByTestId('ground-task-dialog')

    await expect(dialog.getByTestId('ground-task-credit-row')).toBeVisible()
    await expect(dialog.getByTestId('ground-task-credit-value')).toHaveText('3h 00m')
    await expect(dialog.getByTestId('ground-task-credit-row')).toContainText('read-only')

    await expect(dialog.getByTestId('ground-task-dep-arp')).toHaveValue('YVR')
    await expect(dialog.getByTestId('ground-task-arv-arp')).toHaveValue('YYZ')
    await dialog.getByTestId('ground-task-dep-arp').fill('YYC')
    await dialog.getByTestId('ground-task-arv-arp').fill('YUL')
    await dialog.getByTestId('ground-task-save-btn').click()
    await expect(heading).toHaveCount(0)

    const updateOps = await readHook<Array<{ type: string; taskId?: number; data?: Record<string, unknown> }>>(page, 'draftOps')
    const update = updateOps.find((op) => op.type === 'update' && op.taskId === groundTask.id)
    expect(update?.data?.base).toBe('YYC')
    expect(update?.data?.depArp).toBe('YYC')
    expect(update?.data?.arvArp).toBe('YUL')
  })

  test('GroundTask-4 — MA/CR ground task credit is editable before Save', async ({ page }) => {
    const existing = (await rosterObjects(page))[0]
    const groundTask = {
      ...existing,
      id: 987654323,
      crewId: String(existing.crewId),
      pairingId: null,
      base: 'YVR',
      depArp: 'YVR',
      arvArp: 'YYZ',
      assignmentGroup: 'RES',
      assignment: 'CRAM',
      label: 'CRAM',
      source: 'MA',
      schStrDtUtc: '2026-07-15T09:00:00.000Z',
      schEndDtUtc: '2026-07-15T17:00:00.000Z',
      actStrDtUtc: null,
      actEndDtUtc: null,
      actCreditedMinutes: '240',
      schCreditedMinutes: '240',
      dutySeq: null,
      segSeq: null,
      fltId: null,
      fltDt: null,
    }

    await page.evaluate((task) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          patchRoster?: (paneId: 'main' | 'sub', items: Array<Record<string, unknown>>) => void
          openGroundTaskEdit?: (item: Record<string, unknown>) => void
        }
      }).__ganttTest
      if (!hook?.patchRoster || !hook.openGroundTaskEdit) {
        throw new Error('Gantt test hook is missing patchRoster/openGroundTaskEdit')
      }
      hook.patchRoster('main', [task])
      hook.openGroundTaskEdit(task)
    }, groundTask)

    const heading = page.getByRole('heading', { name: 'Edit Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.getByTestId('ground-task-dialog')

    await expect(dialog.getByTestId('ground-task-credit-input')).toHaveValue('240')
    await expect(dialog.getByTestId('ground-task-credit-value')).toHaveText('4h 00m')
    await dialog.getByTestId('ground-task-credit-input').fill('210')
    await expect(dialog.getByTestId('ground-task-credit-value')).toHaveText('3h 30m')

    await dialog.getByTestId('ground-task-save-btn').click()
    await expect(heading).toHaveCount(0)

    const updateOps = await readHook<Array<{ type: string; taskId?: number; data?: Record<string, unknown> }>>(page, 'draftOps')
    const update = updateOps.find((op) => op.type === 'update' && op.taskId === groundTask.id)
    expect(update?.data?.schCreditedMinutes).toBe('210')
    expect(update?.data?.actCreditedMinutes).toBe('210')
  })

  test('GroundTask-IMP — imported ground task opens as view-only Ground Editor', async ({ page }) => {
    const existing = (await rosterObjects(page))[0]
    const groundTask = {
      ...existing,
      id: 987654322,
      crewId: String(existing.crewId),
      pairingId: null,
      base: 'YVR',
      depArp: 'YVR',
      arvArp: 'YYZ',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      label: 'SIM',
      source: 'IMP',
      schStrDtUtc: '2026-07-10T09:00:00.000Z',
      schEndDtUtc: '2026-07-10T12:00:00.000Z',
      actStrDtUtc: '2026-07-10T09:00:00.000Z',
      actEndDtUtc: '2026-07-10T12:00:00.000Z',
      dutySeq: null,
      segSeq: null,
      fltId: null,
      fltDt: null,
    }

    await page.evaluate((task) => {
      const hook = (window as unknown as {
        __ganttTest?: {
          patchRoster?: (paneId: 'main' | 'sub', items: Array<Record<string, unknown>>) => void
          openGroundTaskEdit?: (item: Record<string, unknown>) => void
        }
      }).__ganttTest
      if (!hook?.patchRoster || !hook.openGroundTaskEdit) {
        throw new Error('Gantt test hook is missing patchRoster/openGroundTaskEdit')
      }
      hook.patchRoster('main', [task])
      hook.openGroundTaskEdit(task)
    }, groundTask)

    const heading = page.getByRole('heading', { name: 'Ground Task' })
    await expect(heading).toBeVisible({ timeout: 5_000 })
    const dialog = page.getByTestId('ground-task-dialog')

    await expect(dialog.getByTestId('ground-task-view-only')).toBeVisible()
    await expect(dialog.getByTestId('ground-task-assignment')).toContainText('SIM')
    await expect(dialog.getByTestId('ground-task-dep-arp')).toContainText('YVR')
    await expect(dialog.getByTestId('ground-task-arv-arp')).toContainText('YYZ')
    await expect(dialog.getByTestId('ground-task-save-btn')).toHaveCount(0)
    await expect(dialog.getByTestId('ground-task-delete-btn')).toBeEnabled()
  })

  test('Live-GT-drag — Ground Task AppDialog title bar moves the window', async ({ page }) => {
    await page.getByTestId('create-ground-task-btn').click()
    const dialog = page.getByTestId('ground-task-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByRole('heading', { name: 'Create Ground Task' })).toBeVisible()

    const header = dialog.locator('[data-app-dialog-header]')
    await expect(header).toBeVisible()
    const headerClass = (await header.getAttribute('class')) ?? ''
    expect(headerClass, 'title bar uses bg-primary').toContain('bg-primary')

    const before = await dialog.boundingBox()
    const start = await header.boundingBox()
    expect(before && start).toBeTruthy()
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2)
    await page.mouse.down()
    await page.mouse.move(start!.x + start!.width / 2 + 140, start!.y + start!.height / 2 + 90, { steps: 8 })
    await page.mouse.up()
    const after = await dialog.boundingBox()
    expect(Math.round(after!.x - before!.x), 'window moved right ~140px').toBeGreaterThan(110)
    expect(Math.round(after!.y - before!.y), 'window moved down ~90px').toBeGreaterThan(60)
  })
})
