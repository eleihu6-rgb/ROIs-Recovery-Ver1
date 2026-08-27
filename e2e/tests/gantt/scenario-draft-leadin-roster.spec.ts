/**
 * Scenario DRAFT/FAILED RO — seed Gantt view with live lead-in context.
 *
 * A DRAFT or FAILED RO scenario with no loaded result (taskId=null) now returns a
 * "seed" Gantt view instead of a 409 "Scenario has no loaded result" error:
 *
 *   • Live lead-in is default behavior for seed views.
 *   • Toolbar badge: "Live lead-in · preview".
 *   • Flight & Pairing panes populate from scope.
 *   • The whole view is read-only (no edit save button; "Viewing · Read-only" indicator).
 *
 * Test-data strategy: reuse existing FAILED RO demo scenarios that have no taskId
 * and a bounded YEG base scope — no create/delete required.
 *
 *   #535  "Qiang - Test"          — FAILED, leadinLive=1, base=YEG  → live lead-in seed
 *   #541  "RUST Seam Connector #2"— FAILED, historical leadinLive=0, base=YEG
 *
 * Both scenarios return dataSource='seed', readOnly=true from /api/scenario/:id/gantt-data.
 *
 *   Scen-2050 — FAILED RO leadinLive=1 → badge "Live lead-in · preview"; roster rows &
 *               pucks present; flight & pairing panes non-empty; view is read-only.
 *   Scen-2051 — historical leadinLive=0 still uses default live lead-in context.
 *   Scen-2052 — regression: DRAFT/FAILED RO with no result renders (no 409 error banner);
 *               the scenario gantt toolbar is visible.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { findScenario, ganttApiLogin, seedGanttAuth } from '../../utils/gantt-hook'

// ─── Demo scenario constants ───────────────────────────────────────────────────
// Both are FAILED RO, taskId=null, base=YEG — they reliably return dataSource='seed'.
const LEADIN_SCENARIO_ID   = 535
const LEADIN_SCENARIO_NAME = 'Qiang - Test'      // leadinLive=1

const EMPTY_SCENARIO_ID   = 541
const LEGACY_LEADIN_OFF_SCENARIO_NAME = 'RUST Seam Connector #2'  // historical leadinLive=0

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the RO scenario list, search and pin the target scenario by id,
 * click it to open the detail panel (no status restriction — seed path works for
 * DRAFT and FAILED), then click "Open scenario" to mount the Scenario Gantt view.
 * Returns once the scenario-gantt-toolbar is visible.
 */
const openSeedScenario = async (page: Page, id: number, name: string): Promise<void> => {
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()

  // Narrow the (potentially long) list by name, then pin by unique #id chip.
  const item = await scenario.scenarioRow(id, name)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()

  // The status badge must say "Failed" (seed scenarios are FAILED, not Done).
  await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toContainText('Failed')

  // Click "Open scenario" — available regardless of status.
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()

  // The scenario gantt view mounts; wait for the toolbar (fast — data is inline JSON).
  const ganttView = page.getByTestId('scenario-gantt-view')
  await expect(ganttView).toBeVisible({ timeout: 15_000 })
  await expect(ganttView.getByTestId('scenario-gantt-toolbar')).toBeVisible({ timeout: 10_000 })
}

const openAnyRoScenario = async (page: Page, id: number, name: string): Promise<void> => {
  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()

  const item = await scenario.scenarioRow(id, name)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()

  await scenario.detailPanel.getByTestId('scenario-open-btn').click()

  const ganttView = page.getByTestId('scenario-gantt-view')
  await expect(ganttView).toBeVisible({ timeout: 15_000 })
  await expect(ganttView.getByTestId('scenario-gantt-toolbar')).toBeVisible({ timeout: 10_000 })
}

const dragSplitter = async (page: Page, splitterIndex: number, deltaY: number): Promise<void> => {
  const splitter = page.getByTestId('pane-row-splitter').nth(splitterIndex)
  await expect(splitter).toBeVisible()
  const box = await splitter.boundingBox()
  expect(box).not.toBeNull()

  const centerX = box!.x + box!.width / 2
  const centerY = box!.y + box!.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX, centerY + deltaY, { steps: 8 })
  await page.mouse.up()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Scenario DRAFT/FAILED RO — seed Gantt view', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scen-2050 — leadinLive=1 FAILED RO → "Live lead-in" badge; roster has pucks; panes non-empty; read-only', async ({ page }) => {
    await openSeedScenario(page, LEADIN_SCENARIO_ID, LEADIN_SCENARIO_NAME)

    const ganttView = page.getByTestId('scenario-gantt-view')
    const toolbar   = ganttView.getByTestId('scenario-gantt-toolbar')

    // ── Badge text ────────────────────────────────────────────────────────────
    await expect(toolbar.getByTestId('sg-source-badge')).toContainText('Live lead-in')

    // ── Roster canvas is visible (seed pane defaults open) ───────────────────
    const rosterCanvas = ganttView.getByTestId('scenario-roster-canvas')
    await expect(rosterCanvas).toBeVisible({ timeout: 10_000 })

    // ── Crew rows > 0 (store truth via __ganttTest.scenarioRoster) ────────────
    // scenarioRoster returns { dataSource, crew: [{crewId, rank, mCredHours}] }
    const rosterData = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioRoster!(sid),
      LEADIN_SCENARIO_ID,
    )
    expect(rosterData, 'scenarioRoster probe must return data').not.toBeNull()
    expect(rosterData!.dataSource).toBe('seed')
    expect(rosterData!.crew.length, 'should have crew rows for YEG scope').toBeGreaterThan(0)

    // ── Roster pucks > 0 (live lead-in assignments seeded) ───────────────────
    // scenarioRosterPuck returns the first removable pairing puck (or null if none).
    const firstPuck = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioRosterPuck!(sid, undefined, undefined) ?? null,
      LEADIN_SCENARIO_ID,
    )
    expect(firstPuck, 'live lead-in scenario must have at least one roster pairing puck').not.toBeNull()

    // ── Pairing pane: click to open it (defaultPanes includes pairing for RO) ─
    // The pairing pane button is in the pane-toggle bar; if not already open we open it.
    const addPairingBtn = toolbar.getByTestId('sg-add-pane-pairing')
    if (await addPairingBtn.isEnabled()) {
      await addPairingBtn.click()
    }
    const pairingCanvas = ganttView.getByTestId('scenario-pairing-canvas')
    await expect(pairingCanvas).toBeVisible({ timeout: 10_000 })

    // scenarioPairingRowIds returns the scenario pairing pane's selected row ids;
    // for a non-empty pane, use the store directly via scenarioRoster (same store).
    // Instead, assert via the pairing puck probe — any puck means the pane has data.
    const firstPairingPuck = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioPairingPuck!(sid, undefined, undefined) ?? null,
      LEADIN_SCENARIO_ID,
    )
    expect(firstPairingPuck, 'pairing pane must have at least one pairing segment puck').not.toBeNull()

    // ── Flight pane: open if needed ───────────────────────────────────────────
    const addFlightBtn = toolbar.getByTestId('sg-add-pane-flight')
    if (await addFlightBtn.isEnabled()) {
      await addFlightBtn.click()
    }
    const flightCanvas = ganttView.getByTestId('scenario-flight-canvas')
    await expect(flightCanvas).toBeVisible({ timeout: 10_000 })

    const firstFlightPuck = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioFlightPuck!(sid, undefined) ?? null,
      LEADIN_SCENARIO_ID,
    )
    expect(firstFlightPuck, 'flight pane must have at least one flight puck').not.toBeNull()

    // ── Read-only: "Viewing · Read-only" indicator, Save button absent ────────
    await expect(toolbar.getByTestId('sg-acquire-lock-btn')).toContainText('Viewing')
    await expect(toolbar.getByTestId('sg-save-btn')).toHaveCount(0)
  })

  test('Scen-2051 — historical leadinLive=0 FAILED RO still uses live lead-in preview', async ({ page }) => {
    await openSeedScenario(page, EMPTY_SCENARIO_ID, LEGACY_LEADIN_OFF_SCENARIO_NAME)

    const ganttView = page.getByTestId('scenario-gantt-view')
    const toolbar   = ganttView.getByTestId('scenario-gantt-toolbar')

    // ── Badge text ────────────────────────────────────────────────────────────
    await expect(toolbar.getByTestId('sg-source-badge')).toContainText('Live lead-in')

    // ── Roster canvas is visible ──────────────────────────────────────────────
    const rosterCanvas = ganttView.getByTestId('scenario-roster-canvas')
    await expect(rosterCanvas).toBeVisible({ timeout: 10_000 })

    // ── Crew rows > 0, dataSource=seed ───────────────────────────────────────
    const rosterData = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioRoster!(sid),
      EMPTY_SCENARIO_ID,
    )
    expect(rosterData, 'scenarioRoster probe must return data').not.toBeNull()
    expect(rosterData!.dataSource).toBe('seed')
    expect(rosterData!.crew.length, 'should have crew rows for YEG scope').toBeGreaterThan(0)

    // ── Live lead-in assignments are now default even for historical leadinLive=0 rows.
    const firstPuck = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioRosterPuck!(sid, undefined, undefined) ?? null,
      EMPTY_SCENARIO_ID,
    )
    expect(firstPuck, 'seed scenario should include live lead-in roster pairing pucks').not.toBeNull()

    // ── Pairing pane non-empty ────────────────────────────────────────────────
    const addPairingBtn = toolbar.getByTestId('sg-add-pane-pairing')
    if (await addPairingBtn.isEnabled()) {
      await addPairingBtn.click()
    }
    const pairingCanvas = ganttView.getByTestId('scenario-pairing-canvas')
    await expect(pairingCanvas).toBeVisible({ timeout: 10_000 })

    const firstPairingPuck = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioPairingPuck!(sid, undefined, undefined) ?? null,
      EMPTY_SCENARIO_ID,
    )
    expect(firstPairingPuck, 'pairing pane must have at least one pairing segment puck').not.toBeNull()

    // ── Flight pane non-empty ─────────────────────────────────────────────────
    const addFlightBtn = toolbar.getByTestId('sg-add-pane-flight')
    if (await addFlightBtn.isEnabled()) {
      await addFlightBtn.click()
    }
    const flightCanvas = ganttView.getByTestId('scenario-flight-canvas')
    await expect(flightCanvas).toBeVisible({ timeout: 10_000 })

    const firstFlightPuck = await page.evaluate(
      (sid) => window.__ganttTest!.scenarioFlightPuck!(sid, undefined) ?? null,
      EMPTY_SCENARIO_ID,
    )
    expect(firstFlightPuck, 'flight pane must have at least one flight puck').not.toBeNull()

    // ── Read-only indicator ───────────────────────────────────────────────────
    await expect(toolbar.getByTestId('sg-acquire-lock-btn')).toContainText('Viewing')
    await expect(toolbar.getByTestId('sg-save-btn')).toHaveCount(0)
  })

  test('Scen-2052 — regression: FAILED RO with no result renders seed view instead of 409 error', async ({ page }) => {
    // Open either scenario — the point is that the UI renders rather than showing
    // "Scenario has no loaded result" (the old 409 error banner).
    await openSeedScenario(page, EMPTY_SCENARIO_ID, LEGACY_LEADIN_OFF_SCENARIO_NAME)

    const ganttView = page.getByTestId('scenario-gantt-view')
    const toolbar   = ganttView.getByTestId('scenario-gantt-toolbar')

    // The scenario name is owned by the top dropdown; the gantt toolbar should not repeat it.
    await expect(toolbar.getByTestId('sg-scenario-name')).toHaveCount(0)
    await expect(page.getByTestId('module-nav-scenario')).toContainText(LEGACY_LEADIN_OFF_SCENARIO_NAME)

    // The source badge must be visible (proves the seed path was taken, not an error).
    await expect(toolbar.getByTestId('sg-source-badge')).toBeVisible()

    // No 409 / "no loaded result" error banner must be present.
    await expect(page.getByText('Scenario has no loaded result')).toHaveCount(0)
    await expect(page.getByText('no loaded result')).toHaveCount(0)
  })

  test('Scen-2053 — closing all panes then reopening roster reuses the top row (no blank upper half)', async ({ page }) => {
    await openSeedScenario(page, EMPTY_SCENARIO_ID, LEGACY_LEADIN_OFF_SCENARIO_NAME)

    const ganttView = page.getByTestId('scenario-gantt-view')
    const toolbar = ganttView.getByTestId('scenario-gantt-toolbar')

    const closeButtons = page.getByTitle('Close pane')
    await expect(closeButtons).toHaveCount(2)

    // Default RO layout is roster (top) + pairing (bottom). Close both so the next reopen
    // exercises the empty-layout placeholder path.
    await closeButtons.nth(1).click()
    await expect(page.getByTestId('scenario-pairing-canvas')).toHaveCount(0)
    await closeButtons.nth(0).click()
    await expect(page.getByTestId('scenario-roster-canvas')).toHaveCount(0)

    await toolbar.getByTestId('sg-add-pane-roster').click()

    const rosterCanvas = page.getByTestId('scenario-roster-canvas')
    await expect(rosterCanvas).toBeVisible({ timeout: 10_000 })

    const viewBox = await ganttView.boundingBox()
    const rosterBox = await rosterCanvas.boundingBox()
    expect(viewBox, 'scenario gantt view should be measurable').not.toBeNull()
    expect(rosterBox, 'scenario roster canvas should be measurable').not.toBeNull()

    const offsetTop = rosterBox!.y - viewBox!.y
    expect(
      offsetTop,
      `reopened roster pane must start near the top of the scenario layout, got offset ${offsetTop}px`,
    ).toBeLessThan(180)
  })

  test('Scen-2054 — opening pairing first, then roster, still renders roster above pairing', async ({ page }) => {
    await openSeedScenario(page, EMPTY_SCENARIO_ID, LEGACY_LEADIN_OFF_SCENARIO_NAME)

    const ganttView = page.getByTestId('scenario-gantt-view')
    const toolbar = ganttView.getByTestId('scenario-gantt-toolbar')

    const closeButtons = page.getByTitle('Close pane')
    await expect(closeButtons).toHaveCount(2)

    await closeButtons.nth(1).click()
    await expect(page.getByTestId('scenario-pairing-canvas')).toHaveCount(0)
    await closeButtons.nth(0).click()
    await expect(page.getByTestId('scenario-roster-canvas')).toHaveCount(0)

    await toolbar.getByTestId('sg-add-pane-pairing').click()
    await expect(page.getByTestId('scenario-pairing-canvas')).toBeVisible({ timeout: 10_000 })

    await toolbar.getByTestId('sg-add-pane-roster').click()
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    const rosterBox = await page.getByTestId('scenario-roster-canvas').boundingBox()
    const pairingBox = await page.getByTestId('scenario-pairing-canvas').boundingBox()
    expect(rosterBox, 'scenario roster canvas should be measurable').not.toBeNull()
    expect(pairingBox, 'scenario pairing canvas should be measurable').not.toBeNull()
    expect(
      rosterBox!.y,
      `roster pane should render above pairing pane, got roster y=${rosterBox!.y} pairing y=${pairingBox!.y}`,
    ).toBeLessThan(pairingBox!.y)
  })

  test.describe('Scenario pane row resize', () => {
    test.describe.configure({ mode: 'serial' })

    test('Scen-2055 — dragging the flight splitter first keeps the pairing row anchored', async ({ page, request }) => {
      test.slow()

      const token = await ganttApiLogin(request)
      const scenario = await findScenario(request, token, { fileType: 'RO' })
      await openAnyRoScenario(page, scenario.id, scenario.name)

      const toolbar = page.getByTestId('scenario-gantt-toolbar')
      const addFlightBtn = toolbar.getByTestId('sg-add-pane-flight')
      if (await addFlightBtn.isEnabled()) {
        await addFlightBtn.click()
      }

      await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })

      await dragSplitter(page, 1, 60)

      const pairingRow = page.getByTestId('scenario-grid-row-1')
      const firstBox = await pairingRow.boundingBox()
      expect(firstBox, 'scenario pairing row should be measurable after the first lower-splitter drag').not.toBeNull()

      await dragSplitter(page, 1, -40)

      const secondBox = await pairingRow.boundingBox()
      expect(secondBox, 'scenario pairing row should stay measurable after the second lower-splitter drag').not.toBeNull()
      expect(Math.abs(secondBox!.y - firstBox!.y)).toBeLessThanOrEqual(1)
    })

    test('Scen-2056 — dragging the flight splitter to the limit keeps the flight pane visible', async ({ page, request }) => {
      test.slow()

      const token = await ganttApiLogin(request)
      const scenario = await findScenario(request, token, { fileType: 'RO' })
      await openAnyRoScenario(page, scenario.id, scenario.name)

      const toolbar = page.getByTestId('scenario-gantt-toolbar')
      const addFlightBtn = toolbar.getByTestId('sg-add-pane-flight')
      if (await addFlightBtn.isEnabled()) {
        await addFlightBtn.click()
      }

      await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })

      await dragSplitter(page, 1, 500)

      const flightRow = page.getByTestId('scenario-grid-row-2')
      const flightBox = await flightRow.boundingBox()
      expect(flightBox, 'scenario flight row should still be measurable at the drag limit').not.toBeNull()
      expect(flightBox!.height).toBeGreaterThanOrEqual(76)
      await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible()
    })

    test('Scen-2057 — after the flight pane hits minimum height, the pairing pane can still move down', async ({ page, request }) => {
      test.slow()

      const token = await ganttApiLogin(request)
      const scenario = await findScenario(request, token, { fileType: 'RO' })
      await openAnyRoScenario(page, scenario.id, scenario.name)

      const toolbar = page.getByTestId('scenario-gantt-toolbar')
      const addFlightBtn = toolbar.getByTestId('sg-add-pane-flight')
      if (await addFlightBtn.isEnabled()) {
        await addFlightBtn.click()
      }

      await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })

      await dragSplitter(page, 1, 500)

      const pairingRow = page.getByTestId('scenario-grid-row-1')
      const flightRow = page.getByTestId('scenario-grid-row-2')
      const beforePairingBox = await pairingRow.boundingBox()
      const beforeFlightBox = await flightRow.boundingBox()
      expect(beforePairingBox, 'scenario pairing row should be measurable before dragging the upper splitter').not.toBeNull()
      expect(beforeFlightBox, 'scenario flight row should be measurable before dragging the upper splitter').not.toBeNull()

      await dragSplitter(page, 0, 100)

      const afterPairingBox = await pairingRow.boundingBox()
      const afterFlightBox = await flightRow.boundingBox()
      expect(afterPairingBox, 'scenario pairing row should stay measurable after dragging the upper splitter').not.toBeNull()
      expect(afterFlightBox, 'scenario flight row should stay measurable after dragging the upper splitter').not.toBeNull()
      expect(afterPairingBox!.y).toBeGreaterThan(beforePairingBox!.y + 20)
      expect(afterPairingBox!.height).toBeLessThan(beforePairingBox!.height - 20)
      expect(Math.abs(afterFlightBox!.height - beforeFlightBox!.height)).toBeLessThanOrEqual(1)
      expect(afterFlightBox!.height).toBeGreaterThanOrEqual(76)
    })
  })
})
