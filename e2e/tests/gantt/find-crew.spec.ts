import { test, expect, type APIRequestContext, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

/**
 * Find Crew by Pairing/Flight — right-clicking a pairing flight segment offers
 * "Find Crew by Pairing" / "Find Crew by Flight"; choosing one brings the crew
 * assigned to that pairing/flight to the TOP of the Roster Main pane (selecting
 * them) while every other crew keeps its existing relative sort order.
 *
 * Regression intent (spec 2026-06-08-find-crew):
 *  - found crew appear at the top, as a set, matching the backend crew list
 *  - non-found crew that were present before keep their relative order (point 4)
 *  - a second find accumulates (does not replace the first group)
 */

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

interface PairingProbe {
  segId: number
  pairingId: number
  fltId: number | null
  schStrDtUtc: string
  rowIndex: number
  scrollX: number
  scrollY: number
  pxPerHour: number
  rangeStartIso: string
  headerHeight: number
  rowHeight: number
}

type RosterRow = { crewId: string; rank: string }

const crewForPairing = async (
  request: APIRequestContext,
  token: string,
  pairingId: number,
): Promise<string[]> => {
  const res = await request.get(`${GANTT_API}/api/pairing/${pairingId}/crew`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `pairing crew endpoint ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: { crewIds: string[] } }
  return json.data.crewIds
}

/** Compute canvas click coordinates for a probed pairing segment. */
const segmentClickXY = (probe: PairingProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

/** Wait until the roster row order stops changing (background crew streaming settled), then return it. */
const waitRosterStable = async (read: () => Promise<RosterRow[]>): Promise<string[]> => {
  let prev = ''
  await expect.poll(async () => {
    const cur = JSON.stringify((await read()).map((r) => r.crewId))
    const stable = cur === prev && cur !== '[]'
    prev = cur
    return stable
  }, { message: 'roster row order settled', timeout: 30_000, intervals: [600] }).toBe(true)
  return (await read()).map((r) => r.crewId)
}

/** Right-click a segment; skip the test if its computed x is outside the canvas. */
const rightClickSegment = async (canvas: Locator, probe: PairingProbe): Promise<void> => {
  const box = await canvas.boundingBox()
  const { x, y } = segmentClickXY(probe)
  test.skip(!box || x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4,
    'probed segment is outside the visible canvas')
  await canvas.click({ position: { x, y }, button: 'right' })
}

test.describe('Find Crew', () => {
  let dashboard: GanttDashboardPage
  let token: string

  test.beforeEach(async ({ page, request }) => {
    // Wide viewport → wider canvas time window → more pairings clickable.
    await page.setViewportSize({ width: 1920, height: 1080 })
    token = await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('Live-1058 — Find Crew by Pairing moves assigned crew to top of Roster, others keep order', async ({ page, request }) => {
    const probe = await readHook<PairingProbe | null>(page, 'pairingProbe')
    expect(probe, 'a visible pairing segment exists').not.toBeNull()

    const expectedCrew = await crewForPairing(request, token, probe!.pairingId)
    test.skip(expectedCrew.length === 0, 'probed pairing has no assigned crew')

    const before = await waitRosterStable(() => readHook<RosterRow[]>(page, 'rosterPanelOrder'))

    await rightClickSegment(dashboard.pairingCanvas, probe!)

    await expect(page.getByRole('button', { name: 'Find Crew by Pairing' })).toBeVisible({ timeout: 5_000 })
    // The probe prefers a flight segment, so the flight action is offered too.
    if (probe!.fltId != null) {
      await expect(page.getByRole('button', { name: 'Find Crew by Flight' })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Find Crew by Pairing' }).click()

    // Top rows become exactly the assigned crew (added if missing), as a set.
    const expectedSet = JSON.stringify([...expectedCrew].sort())
    await expect.poll(async () => {
      const order = await readHook<RosterRow[]>(page, 'rosterPanelOrder')
      return JSON.stringify(order.slice(0, expectedCrew.length).map((r) => r.crewId).sort())
    }, { message: 'assigned crew pinned to top', timeout: 10_000 }).toBe(expectedSet)

    // Point 4: other crew keep their relative order. Compare the crew present in
    // BOTH snapshots (excluding found) — robust to crew added by the find itself.
    const after = (await readHook<RosterRow[]>(page, 'rosterPanelOrder')).map((r) => r.crewId)
    const foundSet = new Set(expectedCrew)
    const beforeIds = new Set(before)
    const afterIds = new Set(after)
    const restAfter = after.filter((id) => !foundSet.has(id) && beforeIds.has(id))
    const restBefore = before.filter((id) => !foundSet.has(id) && afterIds.has(id))
    expect(restAfter, 'non-found crew preserve their relative order').toEqual(restBefore)
  })

  test('Live-1059 — brought-in crew are hydrated into the crew store (Base/SEN/Fleet resolvable, not blank)', async ({ page, request }) => {
    // Regression: previously Find Crew only added crew IDs to the selection and loaded
    // their roster BARS — never the crew OBJECTS — so the roster panel rendered blank
    // Base/SEN/Fleet for brought-in crew. crewSeniority() reads crew-store.items, the
    // exact set the panel resolves Base/SEN/Fleet from; brought-in crew must appear there.
    const probe = await readHook<PairingProbe | null>(page, 'pairingProbe')
    expect(probe, 'a visible pairing segment exists').not.toBeNull()

    const expectedCrew = await crewForPairing(request, token, probe!.pairingId)
    test.skip(expectedCrew.length === 0, 'probed pairing has no assigned crew')

    const loadedBefore = new Set(
      (await readHook<{ crewId: string }[]>(page, 'crewSeniority')).map((c) => c.crewId),
    )
    const broughtIn = expectedCrew.filter((c) => !loadedBefore.has(c))
    test.skip(broughtIn.length === 0, 'all assigned crew already loaded; nothing new to hydrate')

    await rightClickSegment(dashboard.pairingCanvas, probe!)
    await page.getByRole('button', { name: 'Find Crew by Pairing' }).click()

    // The crew brought in by the find must now be present in crew-store.items — without
    // this hydration the panel cannot resolve their Base/SEN/Fleet and renders blanks.
    await expect.poll(async () => {
      const items = new Set(
        (await readHook<{ crewId: string }[]>(page, 'crewSeniority')).map((c) => c.crewId),
      )
      return broughtIn.every((c) => items.has(c))
    }, { message: 'brought-in crew hydrated into crew-store (panel can show Base/SEN/Fleet)', timeout: 15_000 }).toBe(true)
  })

  test('Live-1060 — Find Crew accumulates: a second find on another pairing keeps the first group at the top', async ({ page, request }) => {
    const allProbes = await readHook<PairingProbe[]>(page, 'pairingProbes')
    // Keep only probes whose computed click point lands inside the canvas.
    const box = await dashboard.pairingCanvas.boundingBox()
    const probes = allProbes.filter((p) => {
      const { x, y } = segmentClickXY(p)
      return box && x >= 0 && x <= box.width - 4 && y >= 0 && y <= box.height - 4
    })
    expect(probes.length, 'clickable pairing segments available').toBeGreaterThan(1)

    // Find two distinct pairings, each with assigned crew, where the second adds a new member.
    let a: { probe: PairingProbe; crew: string[] } | null = null
    let b: { probe: PairingProbe; crew: string[] } | null = null
    for (const p of probes) {
      const crew = await crewForPairing(request, token, p.pairingId)
      if (crew.length === 0) continue
      if (!a) { a = { probe: p, crew }; continue }
      if (p.pairingId !== a.probe.pairingId && crew.some((c) => !a!.crew.includes(c))) {
        b = { probe: p, crew }
        break
      }
    }
    test.skip(!a || !b, 'need two pairings with assigned crew to test accumulation')

    await waitRosterStable(() => readHook<RosterRow[]>(page, 'rosterPanelOrder'))

    // First find → group A pinned to top.
    await rightClickSegment(dashboard.pairingCanvas, a!.probe)
    await page.getByRole('button', { name: 'Find Crew by Pairing' }).click()
    await expect.poll(async () => {
      const order = await readHook<RosterRow[]>(page, 'rosterPanelOrder')
      return JSON.stringify(order.slice(0, a!.crew.length).map((r) => r.crewId).sort())
    }, { message: 'group A at top', timeout: 10_000 }).toBe(JSON.stringify([...a!.crew].sort()))

    // Second find on a different pairing → union pinned to top (accumulate, not replace).
    await rightClickSegment(dashboard.pairingCanvas, b!.probe)
    await page.getByRole('button', { name: 'Find Crew by Pairing' }).click()

    const union = [...new Set([...a!.crew, ...b!.crew])]
    await expect.poll(async () => {
      const order = await readHook<RosterRow[]>(page, 'rosterPanelOrder')
      const top = new Set(order.slice(0, union.length).map((r) => r.crewId))
      return union.every((c) => top.has(c))
    }, { message: 'both groups present at top after second find', timeout: 10_000 }).toBe(true)
  })
})
