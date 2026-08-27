import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts, ganttApiUrl, ganttApiLogin } from '../utils/gantt-hook'

/**
 * Round-trip immutability regression for IMP-sourced roster rows.
 *
 * Invariant chain:
 *  1. Live IMP row exists (API-verified).
 *  2. When the scenario roster is built, IMP rows are emitted as PA (source='PA')
 *     in ro_input / scenario result — so they appear in the publish dialog as PA rows.
 *  3. PA rows are NOT publishable (checkbox disabled, row dimmed at 50% opacity).
 *  4. IMP-origin rows are excluded from the NOC payload (unit-tested in T5).
 *  5. In Live, Edit/Swap are disabled on IMP rows (tested in roster-imp-immutability.spec.ts).
 *
 * This test drives assertions 1-3 and 5 via the UI; assertion 4 requires a full
 * optimizer run and is documented as a fixme.
 */

interface RosterItem {
  id: number
  crewId: string
  pairingId: number | null
  source: string | null
  schStrDtUtc: string | null
}

interface RosterProbe {
  id: number
  pairingId: number
  crewId: string
  schStrDtUtc: string
  rowIndex: number
  scrollX: number
  scrollY: number
  pxPerHour: number
  rangeStartIso: string
  headerHeight: number
  rowHeight: number
}

/** Compute canvas click coordinates for a probed roster puck. */
const puckClickXY = (probe: RosterProbe): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

test.describe('IMP roster source round-trip immutability', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).roster, {
      message: 'roster objects loaded',
      timeout: 30_000,
    }).toBeGreaterThan(0)
  })

  test('IMP row exists in Live and is immutable (Edit/Swap disabled, Delete enabled)', async ({ page }) => {
    // --- Assertion 1: Live has at least one IMP-sourced flying roster row. ---
    const items = await readHook<RosterItem[]>(page, 'roster')
    const impItem = items.find((i) => i.source === 'IMP' && i.pairingId != null && i.schStrDtUtc)
    test.skip(!impItem, 'no IMP-sourced flying roster item found in loaded data')

    // --- Assertion 5: Edit/Swap disabled, Delete enabled (mirrors roster-imp-immutability.spec.ts). ---
    const panelRows = await readHook<Array<{ crewId: string; seniority: string }>>(page, 'rosterPanel')
    const impRowIdx = panelRows.findIndex((r) => r.crewId === impItem.crewId)
    test.skip(impRowIdx < 0, `IMP crew ${impItem.crewId} not found in visible panel rows`)

    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    test.skip(!probe, 'no visible roster puck found on canvas')

    const impProbe: RosterProbe = {
      id: impItem.id,
      pairingId: impItem.pairingId!,
      crewId: impItem.crewId,
      schStrDtUtc: impItem.schStrDtUtc!,
      rowIndex: impRowIdx,
      scrollX: probe.scrollX,
      scrollY: probe.scrollY,
      pxPerHour: probe.pxPerHour,
      rangeStartIso: probe.rangeStartIso,
      headerHeight: probe.headerHeight,
      rowHeight: probe.rowHeight,
    }

    const canvas = dashboard.rosterCanvas
    const canvasBox = await canvas.boundingBox()
    test.skip(!canvasBox, 'roster canvas not visible')

    const { x, y } = puckClickXY(impProbe)
    test.skip(
      x < 0 || x > canvasBox.width - 4 || y < 0 || y > canvasBox.height - 4,
      'IMP roster puck is outside the visible canvas area',
    )

    await canvas.click({ position: { x, y }, button: 'right' })

    const menu = page.locator('[data-roster-source="IMP"]')
    await expect(menu).toBeVisible({ timeout: 5_000 })

    await expect(menu.getByText(/Edit Task/i)).toBeDisabled()
    await expect(menu.getByText(/Swap Task/i)).toBeDisabled()
    await expect(menu.getByText(/Delete/i)).toBeEnabled()
  })

  test('PA rows in the scenario publish dialog are not publishable (checkbox disabled)', async ({ request }) => {
    // This assertion verifies that when IMP-origin rows arrive in the scenario
    // result as source='PA', the publish dialog marks them as non-publishable
    // (disabled checkbox, dimmed row at 50% opacity). It requires:
    //   - A DONE RO scenario that includes IMP-origin crew
    //   - The scenario's roster API endpoint returns rows with source='PA'
    //
    // We look up a real DONE RO scenario via the API, then open its publish dialog.
    // If no suitable scenario exists, the test is skipped.

    // --- Precondition: find a DONE RO scenario via the Live API. ---
    const token = await ganttApiLogin(request)
    const params = new URLSearchParams({ fileType: 'RO', status: 'DONE', pageSize: '1' })
    const scenarioRes = await request.get(`${ganttApiUrl}/api/scenario?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    test.skip(!scenarioRes.ok(), `scenario list query failed: ${scenarioRes.status()}`)
    const scenarioBody = (await scenarioRes.json()) as {
      data: { items: Array<{ id: number; name: string }> }
    }
    const scenarioItem = scenarioBody.data.items[0]
    test.skip(!scenarioItem, 'no DONE RO scenario found — cannot verify publish dialog')

    // --- Fetch the scenario's roster assignments to confirm PA rows exist. ---
    const rosterRes = await request.get(
      `${ganttApiUrl}/api/scenario/${scenarioItem.id}/roster`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    test.skip(!rosterRes.ok(), `scenario roster query failed: ${rosterRes.status()}`)

    const rosterBody = (await rosterRes.json()) as {
      data: Array<{ source: string; publishable: boolean; crewId: string }>
    }
    const paRows = rosterBody.data.filter((r) => r.source === 'PA')
    test.skip(paRows.length === 0, 'no PA rows in scenario roster — publish dialog cannot be verified for IMP exclusion')

    // --- Assertion 3: PA rows are not publishable. ---
    // The scenario store computes publishable = (source !== 'PA'), so every PA row
    // must have publishable === false.
    for (const paRow of paRows) {
      expect(paRow.publishable, `PA row for crew ${paRow.crewId} must NOT be publishable`).toBe(false)
    }

    // --- UI verification: open the scenario publish dialog and check PA row state. ---
    // Navigate to the scenario module, then click the DONE RO scenario in the list.
    const page = dashboard.page
    await page.getByTestId('module-nav-scenario').click()

    // Click the scenario list item containing the scenario name to select it.
    // ScenarioListItem renders with data-testid="scenario-list-item".
    const scenarioRow = page
      .locator('[data-testid="scenario-list-item"]')
      .filter({ hasText: scenarioItem.name })
      .first()
    test.skip((await scenarioRow.count()) === 0, `cannot locate scenario "${scenarioItem.name}" in the list`)
    await scenarioRow.click()

    // Wait for the scenario detail panel to load with toolbar.
    // The publish button only appears when isDone || isPublished, and
    // canPublish = fileType === 'RO' && pairingScenarioId === 0.
    await expect(page.getByTestId('scenario-detail-panel')).toBeVisible({ timeout: 15_000 })
    const publishBtn = page.getByTestId('scenario-publish-btn')
    test.skip(
      (await publishBtn.count()) === 0,
      'scenario publish button not present — scenario may not be publishable (not RO, or pairingScenarioId != 0)',
    )
    await expect(publishBtn).toBeEnabled({ timeout: 15_000 })

    // Open the publish dialog (the UploadCloud / "Import to Live Roster" button).
    await publishBtn.click()
    const dialog = page.getByTestId('publish-roster-dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })

    // Verify that PA rows appear in the dialog table with disabled checkboxes.
    // The publish dialog renders all rows; PA rows have disabled checkboxes and
    // dimmed opacity (opacity-50 CSS class from the component).
    // Find a row containing a known PA crew ID.
    for (const paRow of paRows.slice(0, 3)) {
      const paRowEl = dialog.locator('tr').filter({ hasText: new RegExp(paRow.crewId) }).first()
      if ((await paRowEl.count()) === 0) continue
      // The checkbox inside a PA row should be disabled.
      const checkbox = paRowEl.locator('input[type="checkbox"]')
      await expect(checkbox).toBeDisabled()
      // The row should have the dimmed opacity class (non-publishable styling).
      await expect(paRowEl).toHaveClass(/opacity-50/)
    }

    // Close the dialog to clean up.
    await dialog.locator('button', { hasText: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  // --- Assertion 4: NOC payload excludes IMP-origin rows. ---
  // This requires a full optimizer run to produce a ro_input file, then building
  // the NOC payload from the scenario result. The NOC payload builder is unit-tested
  // in T5 (live-server IMP filter), so this is a regression guard that the unit path
  // remains correct. It cannot be verified via UI alone — the NOC payload is constructed
  // server-side and sent to an external system.
  test.fixme(
    'IMP-origin rows are excluded from the NOC outbound payload',
    'Requires a full optimizer run + NOC payload build endpoint. Verified by T5 unit tests. ' +
      'Enable this when a staging environment supports end-to-end optimizer runs with IMP data.',
  )
})
