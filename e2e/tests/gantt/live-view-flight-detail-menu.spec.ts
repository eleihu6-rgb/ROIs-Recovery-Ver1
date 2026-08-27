/**
 * Live context menu — View flight detail (Roster + Pairing).
 * Spec: docs/superpowers/specs/2026-08-24-live-view-flight-detail-menu-design.md
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, scrollPaneVertically } from '../../utils/gantt-hook'

interface RosterProbe {
  id: number; pairingId: number; crewId: string; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string
  headerHeight: number; rowHeight: number
}

interface PairingProbe {
  segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string
  headerHeight: number; rowHeight: number
}

const puckClickXY = (probe: {
  schStrDtUtc: string; scrollX: number; scrollY: number; pxPerHour: number
  rangeStartIso: string; headerHeight: number; rowHeight: number; rowIndex: number
}): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

const paneScrollY = (page: Page, panePrefix: string): Promise<number> =>
  page.evaluate(
    (prefix) => (window.__ganttTest as unknown as { paneScrollY: (p: string) => number }).paneScrollY(prefix),
    panePrefix,
  )

/** fltIds backed by loaded pairing segments (resolvable by Flight Detail). */
const loadableFltIds = async (page: Page): Promise<Set<number>> => {
  const ids = await page.evaluate(() => {
    const segs = (window.__ganttTest as unknown as {
      pairingSegments: () => Array<{ fltId: number | null }>
    }).pairingSegments()
    const out = new Set<number>()
    for (const s of segs) {
      if (s.fltId != null && s.fltId > 0) out.add(s.fltId)
    }
    return [...out]
  })
  return new Set(ids)
}

const scrollRowIntoCanvas = async (
  page: Page,
  panePrefix: string,
  probe: { rowIndex: number; headerHeight: number; rowHeight: number },
  canvas: Locator,
): Promise<void> => {
  const box = await canvas.boundingBox()
  if (!box) return
  const rowCenter = probe.headerHeight + probe.rowIndex * probe.rowHeight + Math.floor(probe.rowHeight / 2)
  const targetScrollY = Math.max(0, rowCenter - Math.floor(box.height / 2))
  const current = await paneScrollY(page, panePrefix)
  const delta = targetScrollY - current
  if (Math.abs(delta) > 2) {
    await scrollPaneVertically(page, panePrefix, delta)
    await page.waitForTimeout(300)
  }
}

const clickViewFlightDetail = async (
  page: Page,
  canvas: Locator,
  probe: Parameters<typeof puckClickXY>[0],
): Promise<boolean> => {
  const box = await canvas.boundingBox()
  if (!box) return false
  const { x, y } = puckClickXY(probe)
  if (x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4) return false
  await canvas.click({ position: { x, y }, button: 'right' })
  const viewFlight = page.getByRole('button', { name: 'View flight detail', exact: true })
  try {
    await expect(viewFlight).toBeVisible({ timeout: 2_000 })
    await viewFlight.click()
    return true
  } catch {
    if (!page.isClosed()) await page.keyboard.press('Escape').catch(() => {})
    return false
  }
}

const resolvePairingRowIndex = async (page: Page, probe: PairingProbe): Promise<PairingProbe | null> =>
  page.evaluate((p) => {
    const g = window.__ganttTest as unknown as {
      pairingPanelOrder: () => Array<{ id: string }>
    }
    const rowIndex = g.pairingPanelOrder().findIndex((r) => r.id === String(p.pairingId))
    if (rowIndex < 0) return null
    return { ...p, rowIndex }
  }, probe)

const rosterFlyingProbes = async (page: Page): Promise<Array<{ probe: RosterProbe; fltId: number }>> => {
  const template = await rosterCanvasGeometry(page)
  return page.evaluate(({ geom }) => {
    const g = window.__ganttTest as unknown as {
      roster: () => Array<{ id: number; crewId: string; pairingId: number | null; fltId: number | null; start: string }>
      rosterPanelOrder: () => Array<{ crewId: string }>
    }
    const { scrollX, scrollY, pxPerHour, rangeStartIso, headerHeight, rowHeight } = geom
    const out: Array<{ probe: RosterProbe; fltId: number }> = []
    const order = g.rosterPanelOrder()
    for (let rowIndex = 0; rowIndex < order.length; rowIndex++) {
      const cid = order[rowIndex].crewId
      for (const it of g.roster()) {
        if (String(it.crewId) !== cid || it.pairingId == null || !it.start) continue
        if (it.fltId == null || it.fltId <= 0) continue
        out.push({
          probe: {
            id: it.id, pairingId: it.pairingId, crewId: cid, schStrDtUtc: it.start, rowIndex,
            scrollX, scrollY, pxPerHour, rangeStartIso, headerHeight, rowHeight,
          },
          fltId: it.fltId,
        })
        break
      }
    }
    return out
  }, { geom: template })
}

const ROSTER_HEADER_HEIGHT = 30
const ROSTER_ROW_HEIGHT = 43

const rosterCanvasGeometry = async (page: Page): Promise<{
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
}> =>
  page.evaluate(({ headerHeight, rowHeight }) => {
    const g = window.__ganttTest as unknown as {
      zoom: () => { scrollX: number; pxPerHour: number }
      dateRange: () => { start: string; end: string }
      paneScrollY: (p: string) => number
    }
    const { scrollX, pxPerHour } = g.zoom()
    return {
      scrollX,
      scrollY: g.paneScrollY('roster'),
      pxPerHour,
      rangeStartIso: g.dateRange().start,
      headerHeight,
      rowHeight,
    }
  }, { headerHeight: ROSTER_HEADER_HEIGHT, rowHeight: ROSTER_ROW_HEIGHT })

const setGroundTaskDate = async (
  page: Page,
  trigger: Locator,
  isoDate: string,
  ariaLabel: 'Ground task start date' | 'Ground task end date',
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

const scrollPuckIntoCanvas = async (
  page: Page,
  panePrefix: string,
  probe: RosterProbe,
  canvas: Locator,
): Promise<RosterProbe> => {
  await scrollRowIntoCanvas(page, panePrefix, probe, canvas)
  const box = await canvas.boundingBox()
  if (!box) return probe

  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const contentX = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour
  const desiredCanvasX = Math.min(120, Math.floor(box.width / 4))
  const targetScrollX = Math.max(0, contentX - desiredCanvasX)
  await page.evaluate((x) => {
    (window.__ganttTest as unknown as { setScrollX: (n: number) => void }).setScrollX(x)
  }, targetScrollX)
  await page.waitForTimeout(300)

  const geom = await rosterCanvasGeometry(page)
  return { ...probe, scrollX: geom.scrollX, scrollY: geom.scrollY }
}

const rightClickRosterProbe = async (
  page: Page,
  canvas: Locator,
  probe: Parameters<typeof puckClickXY>[0],
): Promise<boolean> => {
  const box = await canvas.boundingBox()
  if (!box) return false
  const { x, y } = puckClickXY(probe)
  if (x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4) return false
  await canvas.click({ position: { x, y }, button: 'right' })
  return true
}

/** Ground tasks or flying duties without a resolvable fltId — View flight detail must stay hidden. */
const rosterNoFltIdProbes = async (page: Page): Promise<RosterProbe[]> => {
  const template = await rosterCanvasGeometry(page)
  return page.evaluate(({ geom }) => {
    const g = window.__ganttTest as unknown as {
      roster: () => Array<{ id: number; crewId: string; pairingId: number | null; fltId: number | null; start: string }>
      rosterPanelOrder: () => Array<{ crewId: string }>
    }
    const { scrollX, scrollY, pxPerHour, rangeStartIso, headerHeight, rowHeight } = geom
    const ground: RosterProbe[] = []
    const flyingNoFlt: RosterProbe[] = []
    const order = g.rosterPanelOrder()
    for (let rowIndex = 0; rowIndex < order.length; rowIndex++) {
      const cid = order[rowIndex].crewId
      for (const it of g.roster()) {
        if (String(it.crewId) !== cid || !it.start) continue
        const probe: RosterProbe = {
          id: it.id,
          pairingId: it.pairingId ?? 0,
          crewId: cid,
          schStrDtUtc: it.start,
          rowIndex,
          scrollX,
          scrollY,
          pxPerHour,
          rangeStartIso,
          headerHeight,
          rowHeight,
        }
        if (it.pairingId == null) {
          ground.push({ ...probe, pairingId: 0 })
          break
        }
        if (it.fltId == null || it.fltId <= 0) {
          flyingNoFlt.push(probe)
          break
        }
      }
    }
    return [...ground, ...flyingNoFlt]
  }, { geom: template })
}

const createDraftGroundTask = async (page: Page): Promise<void> => {
  const roster = await readHook<Array<{ crewId: string }>>(page, 'roster')
  expect(roster.length, 'roster loaded for ground-task fallback').toBeGreaterThan(0)
  const crewId = String(roster[0].crewId)
  const range = await readHook<{ start: string; end: string }>(page, 'dateRange')
  const taskDate = range.start.slice(0, 10)

  await page.getByTestId('create-ground-task-btn').click()
  await expect(page.getByRole('heading', { name: 'Create Ground Task' })).toBeVisible({ timeout: 5_000 })
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
  await setGroundTaskDate(page, dialog.getByTestId('ground-task-start-date'), taskDate, 'Ground task start date')
  await setGroundTaskDate(page, dialog.getByTestId('ground-task-end-date'), taskDate, 'Ground task end date')
  await dialog.getByTestId('ground-task-dep-arp').fill('YVR')
  await dialog.getByTestId('ground-task-arv-arp').fill('YYZ')
  const times = dialog.locator('input[type="time"]')
  await times.nth(0).fill('09:00')
  await times.nth(1).fill('12:00')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create Ground Task' })).toHaveCount(0)
  await expect.poll(async () => (await readHook<Array<{ id: number; pairingId: number | null }>>(page, 'roster'))
    .some((r) => Number(r.id) < 0 && r.pairingId == null), {
    message: 'draft ground task rendered in roster store',
    timeout: 10_000,
  }).toBe(true)
}

test.describe('Live View flight detail menu', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    await page.route('**/api/legality/preview-draft', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { allowed: true, violations: [] }, message: 'ok' }) }))
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect
      .poll(async () => (await counts(page)).roster, { message: 'roster loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
    await expect
      .poll(async () => (await counts(page)).pairing, { message: 'pairing loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('Live-1460 — roster right-click View flight detail opens Flight Detail', async ({ page }) => {
    const validFlt = await loadableFltIds(page)
    const candidates = (await rosterFlyingProbes(page)).filter((c) => validFlt.has(c.fltId))
    expect(
      candidates.length,
      'need a roster flying puck with resolvable fltId in loaded pairing segments',
    ).toBeGreaterThan(0)

    let openedFltId: number | null = null
    for (const { probe: raw, fltId } of candidates.slice(0, 8)) {
      const probe = await scrollPuckIntoCanvas(page, 'roster', raw, dashboard.rosterCanvas)
      if (!(await clickViewFlightDetail(page, dashboard.rosterCanvas, probe))) continue

      const dialog = dashboard.flightDetailDialog
      await expect(dialog).toBeVisible({ timeout: 10_000 })
      const idEl = dialog.getByTestId('flight-detail-flight-id')
      if (await idEl.isVisible().catch(() => false)) {
        try {
          await expect(idEl).toHaveText(`#${fltId}`, { timeout: 15_000 })
          openedFltId = fltId
          break
        } catch {
          await dialog.getByTestId('flight-detail-close').click().catch(() => {})
        }
      } else {
        await dialog.getByTestId('flight-detail-close').click().catch(() => {})
      }
    }
    expect(openedFltId, 'View flight detail opened with matching flight id').not.toBeNull()
  })

  test('Live-1461 — pairing segment right-click View flight detail opens Flight Detail', async ({ page }) => {
    test.setTimeout(90_000)
    const validFlt = await loadableFltIds(page)

    const probeSources: PairingProbe[] = []
    const primary = await readHook<PairingProbe | null>(page, 'pairingProbe')
    if (primary?.fltId != null && primary.fltId > 0 && validFlt.has(primary.fltId)) {
      probeSources.push(primary)
    }
    const fromList = await page.evaluate((valid) => {
      const g = window.__ganttTest as unknown as { pairingProbes: (n?: number) => PairingProbe[] }
      return g.pairingProbes(50).filter((p) => p.fltId != null && p.fltId > 0 && valid.includes(p.fltId))
    }, [...validFlt])
    for (const p of fromList) {
      if (!probeSources.some((s) => s.segId === p.segId)) probeSources.push(p)
    }
    expect(
      probeSources.length,
      'need a pairing segment with resolvable fltId in loaded pairing segments',
    ).toBeGreaterThan(0)

    let openedFltId: number | null = null
    for (const raw of probeSources.slice(0, 6)) {
      const resolved = await resolvePairingRowIndex(page, raw)
      if (!resolved) continue
      await scrollRowIntoCanvas(page, 'pairing', resolved, dashboard.pairingCanvas)
      const probe = { ...resolved, scrollY: await paneScrollY(page, 'pairing') }
      if (!(await clickViewFlightDetail(page, dashboard.pairingCanvas, probe))) continue

      const dialog = dashboard.flightDetailDialog
      await expect(dialog).toBeVisible({ timeout: 10_000 })
      const idEl = dialog.getByTestId('flight-detail-flight-id')
      if (await idEl.isVisible().catch(() => false)) {
        try {
          await expect(idEl).toHaveText(`#${probe.fltId}`, { timeout: 15_000 })
          openedFltId = probe.fltId!
          break
        } catch {
          await dialog.getByTestId('flight-detail-close').click().catch(() => {})
        }
      } else {
        await dialog.getByTestId('flight-detail-close').click().catch(() => {})
      }
    }
    expect(openedFltId, 'View flight detail opened from a pairing segment').not.toBeNull()
  })

  test('Live-1462 — ground / no-fltId roster right-click hides View flight detail', async ({ page }) => {
    let candidates = await rosterNoFltIdProbes(page)
    if (candidates.length === 0) {
      await createDraftGroundTask(page)
      await expect.poll(async () => (await rosterNoFltIdProbes(page)).length, {
        message: 'ground or no-fltId roster puck available after draft create',
        timeout: 10_000,
      }).toBeGreaterThan(0)
      candidates = await rosterNoFltIdProbes(page)
    }
    expect(
      candidates.length,
      'need a ground task or roster flying puck without fltId',
    ).toBeGreaterThan(0)

    const viewFlight = page.getByRole('button', { name: 'View flight detail', exact: true })
    let rightClicked = false
    for (const raw of candidates.slice(0, 8)) {
      const probe = await scrollPuckIntoCanvas(page, 'roster', raw, dashboard.rosterCanvas)
      if (!(await rightClickRosterProbe(page, dashboard.rosterCanvas, probe))) continue
      rightClicked = true
      await expect(viewFlight).toHaveCount(0)
      await page.keyboard.press('Escape').catch(() => {})
      break
    }
    expect(rightClicked, 'right-clicked a ground or no-fltId roster puck').toBeTruthy()
  })
})
