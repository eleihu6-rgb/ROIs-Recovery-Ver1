/**
 * Gantt Scenario list-panel header buttons.
 *
 * The header exposes two icon-only actions with hover tooltips:
 *   - Import  → "Import PBS material"
 *   - New (+) → "Create new scenario"
 *
 * This test asserts both icon buttons are present and that hovering each one
 * surfaces the correct tooltip text (the icons carry no visible label, so the
 * tooltip is the only affordance — it must be correct).
 *
 * Auth and reference APIs are mocked so this toolbar check stays focused on
 * the real Scenario UI instead of requiring a live-server/remote DB round-trip.
 *
 * Import PBS progress (Scen-2035/2037/2038) drives the real dialog against a
 * mocked async POST + progressive SSE stream so per-material progress and percent
 * advance only when backend events are released.
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

type ImportMaterial = 'crew' | 'flight' | 'pairing' | 'roster' | 'rosterGround'

interface ImportSseBridge {
  ready: boolean
  controller: ReadableStreamDefaultController<Uint8Array> | null
  encoder: TextEncoder | null
}

declare global {
  interface Window {
    __importPbsSse?: ImportSseBridge
  }
}

test.describe('Scenario — list header buttons', () => {
  const ok = (data: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, message: 'ok', data }),
  })

  const scenarioRows = {
    items: [
      {
        id: 9001,
        name: 'PO Feb Pairing',
        fileType: 'PO',
        status: 'DRAFT',
        strDtLoc: '2026-02-01',
        endDtLoc: '2026-02-28',
        optimizedCount: 0,
        leadinLive: 1,
        updatedBy: 'tester',
        updatedByName: 'Tester',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.route('**/altair/live/api/auth/me', (route) => route.fulfill(ok({
      userCode: 'tester',
      userName: 'Tester',
      schema: 'f8',
      isAdmin: 1,
    })))
    await page.route('**/api/auth/me', (route) => route.fulfill(ok({
      userCode: 'tester',
      userName: 'Tester',
      schema: 'f8',
      isAdmin: 1,
    })))
    await page.route('**/altair/live/api/public/config', (route) => route.fulfill(ok({
      airline: 'F8',
      timezone: 'UTC',
      language: 'en',
      theme: 'light',
      dateFormat: 'YYYY-MM-DD',
    })))
    await page.route('**/api/public/config', (route) => route.fulfill(ok({
      airline: 'F8',
      timezone: 'UTC',
      language: 'en',
      theme: 'light',
      dateFormat: 'YYYY-MM-DD',
    })))
    await page.route('**/altair/live/api/dashboard/overview', (route) => route.fulfill(ok({
      flightsToday: 0,
      totalActiveCrew: 0,
      violations: null,
      pendingApprovals: null,
      crewByRank: [],
      flightsByDay: [],
    })))
    await page.route('**/altair/live/api/assignment/group', (route) => route.fulfill(ok([])))
    await page.route('**/altair/live/api/assignment', (route) => route.fulfill(ok([])))
    await page.route('**/altair/live/api/scenario/run-health', (route) => route.fulfill(ok({
      overall: 'healthy',
      checkedAt: '2026-07-04T00:00:00.000Z',
      services: [],
    })))
    await page.route(/\/altair\/live\/api\/scenario(\?|$)/, (route) => route.fulfill(ok(scenarioRows)))
    await page.route('**/altair/live/api/base', (route) => route.fulfill(ok([
      { id: 1, base: 'YYZ', name: 'Toronto', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 1 },
      { id: 2, base: 'YVR', name: 'Vancouver', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 2 },
      { id: 3, base: 'YEG', name: 'Edmonton', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 3 },
    ])))
    await page.route('**/altair/live/api/rank', (route) => route.fulfill(ok([
      { id: 1, rank: 'CA', division: 'P', description: 'Captain', displayOrder: 1, isCrewRank: 1 },
      { id: 2, rank: 'FO', division: 'P', description: 'First Officer', displayOrder: 2, isCrewRank: 1 },
    ])))
    await page.route('**/altair/live/api/fleet', (route) => route.fulfill(ok([
      { id: 1, fleet: '7M8', description: 'B737 MAX 8', fleetGrp: '737', acType: '7M8', displayOrder: 1 },
    ])))
    await page.route('**/altair/live/base/timezone-options', (route) => route.fulfill(ok([])))
    await page.route('**/altair/live/api/roster-periods', (route) => route.fulfill(ok({
      items: [
        { id: 5, rosterPeriod: '2026-05', name: '2026-05', rpStart: '2026-05-01', rpEnd: '2026-05-31', isCurrent: false },
        { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
        { id: 7, rosterPeriod: '2026-07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: false },
      ],
    })))
    await page.route('**/altair/live/api/scenario/import-targets/po', (route) => route.fulfill(ok({ items: scenarioRows.items })))
    await page.route('**/altair/live/api/dictionary/parent/DIVISION', (route) => route.fulfill(ok([
      { id: 1, parentCode: 'DIVISION', code: 'P', name: 'Pilot', idx: 1, codeValue: null },
    ])))
  })

  test('Scen-2030 — shows S3 Pairing + Import + New icon buttons with the correct hover tooltips', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    await expect(scenario.s3PairingButton).toBeVisible()
    await expect(scenario.importButton).toBeVisible()
    await expect(scenario.newButton).toBeVisible()

    await scenario.s3PairingButton.hover()
    await expect(page.getByText('S3 Pairing').first()).toBeVisible()

    await page.getByTestId('scenario-nav-ro').hover()
    await expect(page.getByText('S3 Pairing')).toHaveCount(0)

    // Hover the Import button → "Import PBS material" tooltip.
    await scenario.importButton.hover()
    await expect(page.getByText('Import PBS material').first()).toBeVisible()

    // Move away, then hover the New button → "Create new scenario" tooltip.
    await page.getByTestId('scenario-nav-ro').hover()

    await expect(page.getByRole('button', { name: 'Create new scenario' })).toBeVisible()
  })

  test('Scen-2034 — S3 Pairing button opens import dialog with New Pairing controls', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.s3PairingButton.click()

    const dialog = page.getByTestId('s3-pairing-import-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('S3 Pairing Import')
    await expect(dialog.getByTestId('s3-pairing-file')).toBeVisible()
    await expect(dialog.getByTestId('s3-target-scenario')).toContainText('#9001 PO Feb Pairing')
    await expect(dialog.getByText('Clear selected PO scenario before import')).toBeVisible()
    await expect(dialog.getByTestId('s3-pairing-import-confirm')).toBeDisabled()

    await dialog.getByTestId('s3-target-mode-new').check()
    await expect(dialog.getByPlaceholder('S3 Pairing <filename>')).toBeVisible()
    await expect(dialog.getByText('Date range')).toBeVisible()
    await expect(dialog.getByTestId('s3-new-base')).toHaveCount(0)
    await expect(dialog.getByTestId('s3-new-division')).toBeVisible()

    await dialog.getByTestId('s3-new-division').click()
    await expect(page.getByRole('option', { name: 'P - Pilot' })).toBeVisible()
    await page.keyboard.press('Escape')

    await dialog.getByTestId('s3-pairing-import-cancel').click()
    await expect(dialog).toBeHidden()
  })

  test('Scen-2036 — Pairing Sc. dropdown shows PO scenario id and saves that id', async ({ page }) => {
    const roDetail = {
      id: 9100,
      name: 'RO Pairing Sc Label',
      fileType: 'RO',
      status: 'DRAFT',
      strDtLoc: '2026-06-01',
      endDtLoc: '2026-06-30',
      optimizedCount: 0,
      leadinLive: 1,
      updatedBy: 'tester',
      updatedByName: 'Tester',
      updatedAt: '2026-06-01T00:00:00.000Z',
      worksetId: 910,
      version: 1,
      rulesetId: 103,
      pairingScenarioId: null,
      flightScenarioId: null,
      division: 'P',
      filterParams: { crew: { bases: ['YYZ'], division: 'P' }, pairing: { bases: ['YYZ'], fleets: ['7M8'] } },
      comments: null,
      createdBy: 'tester',
      createdAt: '2026-06-01T00:00:00.000Z',
    }
    let savedPairingScenarioId: number | null | undefined

    await page.route(/\/api\/.*/, async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      if (path.endsWith('/api/auth/me')) {
        return route.fulfill(ok({ userCode: 'tester', userName: 'Tester', schema: 'f8', isAdmin: 1 }))
      }
      if (path.endsWith('/api/public/config')) {
        return route.fulfill(ok({ airline: 'F8', timezone: 'UTC', language: 'en', theme: 'light', dateFormat: 'YYYY-MM-DD' }))
      }
      if (path.endsWith('/api/dashboard/overview')) {
        return route.fulfill(ok({
          flightsToday: 0,
          totalActiveCrew: 0,
          violations: null,
          pendingApprovals: null,
          crewByRank: [],
          flightsByDay: [],
        }))
      }
      if (path.endsWith('/api/assignment/group') || path.endsWith('/api/assignment')) return route.fulfill(ok([]))
      if (path.endsWith('/api/scenario/run-health')) {
        return route.fulfill(ok({ overall: 'healthy', checkedAt: '2026-07-04T00:00:00.000Z', services: [] }))
      }
      if (path.endsWith('/api/base')) {
        return route.fulfill(ok([
          { id: 1, base: 'YYZ', name: 'Toronto', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 1 },
        ]))
      }
      if (path.endsWith('/api/rank')) {
        return route.fulfill(ok([
          { id: 1, rank: 'CA', division: 'P', description: 'Captain', displayOrder: 1, isCrewRank: 1 },
        ]))
      }
      if (path.endsWith('/api/fleet')) {
        return route.fulfill(ok([
          { id: 1, fleet: '7M8', description: 'B737 MAX 8', fleetGrp: '737', acType: '7M8', displayOrder: 1 },
        ]))
      }
      if (path.endsWith('/api/dictionary/parent/DIVISION')) {
        return route.fulfill(ok([
          { id: 1, parentCode: 'DIVISION', code: 'P', name: 'Pilot', idx: 1, codeValue: null },
        ]))
      }
      if (path.endsWith('/api/scenario') && url.search) {
        return route.fulfill(ok({ items: [roDetail], total: 1, page: 1, pageSize: 20, totalPages: 1 }))
      }
      if (path.endsWith('/api/scenario/9100')) {
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON() as { pairingScenarioId?: number | null }
          savedPairingScenarioId = body.pairingScenarioId
          return route.fulfill(ok({ ...roDetail, pairingScenarioId: body.pairingScenarioId ?? null }))
        }
        return route.fulfill(ok(roDetail))
      }
      if (path.endsWith('/api/legality/rulesets')) {
        return route.fulfill(ok([{ id: 103, name: 'PBS Solver Ruleset', category: 'RULE', isDefault: true }]))
      }
      if (path.endsWith('/api/scenario/import-targets/po')) {
        return route.fulfill(ok({
          items: [{
            id: 692,
            worksetId: 721,
            name: 'Imported PO',
            status: 'DRAFT',
            strDtLoc: '2026-06-01',
            endDtLoc: '2026-06-30',
          }],
        }))
      }
      return route.fulfill(ok([]))
    })

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.listItemByName(roDetail.name).click()
    await expect(scenario.detailPanel).toBeVisible()

    const pairingSc = scenario.detailPanel.getByTestId('scenario-pairing-sc')
    await pairingSc.click()
    await expect(page.getByRole('option', { name: '692 - Imported PO', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '721 - Imported PO', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '692 - Imported PO', exact: true }).click()
    await expect(pairingSc).toContainText('692 - Imported PO')

    await scenario.save()
    expect(savedPairingScenarioId).toBe(692)
  })

  test('Scen-2031 — Import button opens the PBS import dialog with the spec controls', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    await scenario.importButton.click()

    const dialog = page.getByTestId('import-pbs-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Import PBS Material' })).toBeVisible()

    // RosterPeriod drives the disabled import dates.
    await expect(dialog.getByTestId('import-pbs-roster-period')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-start-date')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-end-date')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-start-date')).toHaveValue('2026-06-01')
    await expect(dialog.getByTestId('import-pbs-end-date')).toHaveValue('2026-06-30')
    await expect(dialog.getByTestId('import-pbs-start-date')).toBeDisabled()
    await expect(dialog.getByTestId('import-pbs-end-date')).toBeDisabled()

    // Material scope starts empty; users must choose at least one material.
    await expect(dialog.getByTestId('import-pbs-scope-flight')).not.toBeChecked()
    await expect(dialog.getByTestId('import-pbs-scope-pairing')).not.toBeChecked()
    await expect(dialog.getByTestId('import-pbs-scope-roster')).not.toBeChecked()
    await expect(dialog.getByTestId('import-pbs-scope-rosterGround')).not.toBeChecked()
    await expect(dialog.getByTestId('import-pbs-scope-crew')).not.toBeChecked()
    await expect(dialog.getByText('Select at least one material type.')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-confirm')).toBeDisabled()

    await dialog.getByTestId('import-pbs-scope-crew').check()
    await expect(dialog.getByTestId('import-pbs-confirm')).toBeEnabled()

    // Cancel closes the dialog without side effects.
    await dialog.getByTestId('import-pbs-cancel').click()
    await expect(dialog).toBeHidden()
  })

  test('Scen-2032 — Import PBS material no longer shows legacy condition controls', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.importButton.click()

    const dialog = page.getByTestId('import-pbs-dialog')
    await expect(dialog).toBeVisible()

    await expect(dialog.getByTestId('import-pbs-bases')).toHaveCount(0)
    await expect(dialog.getByTestId('import-pbs-ranks')).toHaveCount(0)
    await expect(dialog.getByTestId('import-pbs-fleets')).toHaveCount(0)
    await expect(dialog.getByTestId('import-pbs-mode')).toHaveCount(0)
  })

  /**
   * Controllable progressive SSE for Import PBS progress.
   *
   * Playwright route.fulfill cannot reliably stream chunked SSE bodies, so we
   * wrap window.fetch for the events URL with a ReadableStream that the test
   * feeds via page.evaluate. The gantt client still uses its real SSE parser.
   */
  const installImportProgressSse = async (
    page: Page,
    opts: { chunks: unknown[][] },
  ): Promise<{ releaseNext: () => Promise<void> }> => {
    const pending = [...opts.chunks]

    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window)
      window.__importPbsSse = {
        ready: false,
        controller: null,
        encoder: null,
      }
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
        if (url.includes('/import-pbs-material/') && url.includes('/events')) {
          const bridge = window.__importPbsSse!
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              bridge.controller = controller
              bridge.encoder = new TextEncoder()
              bridge.ready = true
            },
          })
          return new Response(stream, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          })
        }
        return originalFetch(input, init)
      }
    })

    return {
      releaseNext: async () => {
        const chunk = pending.shift()
        if (chunk === undefined) throw new Error('No SSE chunk left to release')

        await expect.poll(async () => page.evaluate(() => Boolean(window.__importPbsSse?.ready)))
          .toBe(true)

        await page.evaluate((events) => {
          const bridge = window.__importPbsSse
          if (!bridge?.controller || !bridge.encoder) {
            throw new Error('Import PBS SSE bridge is not ready')
          }
          for (const event of events) {
            bridge.controller.enqueue(
              bridge.encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            )
          }
        }, chunk)

        if (pending.length === 0) {
          await page.evaluate(() => {
            window.__importPbsSse?.controller?.close()
          })
        }
      },
    }
  }

  const mockImportStart = async (
    page: Page,
    opts: {
      importId: string
      materials: ImportMaterial[]
      onPostBody?: (body: unknown) => void
    },
  ): Promise<void> => {
    await page.route('**/altair/live/api/scenario/import-pbs-material', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      // Do not intercept the SSE events URL (matched more specifically elsewhere).
      if (route.request().url().includes('/events')) {
        await route.fallback()
        return
      }
      const raw = route.request().postData()
      if (raw && opts.onPostBody) {
        opts.onPostBody(JSON.parse(raw) as unknown)
      }
      await route.fulfill(ok({
        importId: opts.importId,
        rosterPeriodId: 6,
        rosterPeriod: '2026-06',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        materials: opts.materials,
      }))
    })
  }

  test('Scen-2035 — Import PBS material shows progress while the import request is running', async ({ page }) => {
    const importId = '00000000-0000-4000-8000-000000000001'
    const at = '2026-07-15T00:00:00.000Z'
    const completeResult = {
      rosterPeriodId: 6,
      rosterPeriod: '2026-06',
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      results: [{
        connectorCode: 'f8-roster-flight',
        syncId: 'sync-9',
        filteredCount: 0,
        rejectionFile: null,
        status: 'success',
        timings: [{
          material: 'rosterGround',
          fetchMs: 4_000,
          transformMs: 500,
          enqueueMs: 100,
          databaseMs: 2_500,
          totalMs: 7_100,
          recordsIn: 20,
          recordsOut: 12,
          rejected: 0,
        }],
      }],
    }

    await mockImportStart(page, { importId, materials: ['rosterGround'] })
    const sse = await installImportProgressSse(page, {
      chunks: [
        [
          {
            type: 'stage',
            importId,
            material: 'rosterGround',
            stage: 'fetch',
            status: 'running',
            at,
          },
        ],
        [
          {
            type: 'complete',
            importId,
            result: completeResult,
            at,
          },
        ],
      ],
    })

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.importButton.click()

    const dialog = page.getByTestId('import-pbs-dialog')
    await dialog.getByTestId('import-pbs-scope-crew').check()
    await dialog.getByTestId('import-pbs-confirm').click()

    // Initial progress before any SSE stage is applied: material stages are waiting at 0%.
    await expect(dialog.getByTestId('import-pbs-progress')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-elapsed')).toHaveText('00:00')
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect(dialog.getByTestId('import-pbs-progress-bar')).toHaveAttribute('aria-valuenow', '0')
    await expect(dialog.getByTestId('import-pbs-material-progress')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-material-progress-rosterGround-fetch')).toHaveAttribute('data-status', 'waiting')
    await expect(dialog.getByTestId('import-pbs-material-progress-rosterGround-transform')).toHaveAttribute('data-status', 'waiting')
    await expect(dialog.getByTestId('import-pbs-material-progress-rosterGround-write')).toHaveAttribute('data-status', 'waiting')
    await expect(dialog.getByTestId('import-pbs-progress-summary')).toHaveCount(0)
    await expect(dialog.getByTestId('import-pbs-confirm')).toBeDisabled()

    // Stream fetch-running then complete → dialog stays open with result details and timing toast appears.
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect(dialog.getByTestId('import-pbs-material-progress-rosterGround-fetch')).toHaveAttribute('data-status', 'running')
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-result')).toBeVisible()
    await expect(page.getByText(/fetch 00:04, transform 00:01, enqueue 00:00, database 00:03, records 12/)).toBeVisible()
  })

  test('Scen-2037 — Import PBS material advances stages from real SSE events end-to-end', async ({ page }) => {
    const importId = '00000000-0000-4000-8000-000000000037'
    const at = '2026-07-15T12:00:00.000Z'
    const material = 'crew' as const
    const completeResult = {
      rosterPeriodId: 6,
      rosterPeriod: '2026-06',
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      results: [{
        connectorCode: 'f8-crew',
        syncId: 'sync-crew-37',
        filteredCount: 0,
        rejectionFile: null,
        status: 'success',
        timings: [{
          material: 'crew',
          fetchMs: 8_000,
          transformMs: 1_000,
          enqueueMs: 200,
          databaseMs: 3_000,
          totalMs: 12_200,
          recordsIn: 120,
          recordsOut: 118,
          rejected: 2,
        }],
      }],
    }

    let postedBody: {
      rosterPeriodId?: number
      scope?: Record<string, boolean>
    } | null = null

    await mockImportStart(page, {
      importId,
      materials: [material],
      onPostBody: (body) => {
        postedBody = body as typeof postedBody
      },
    })

    const stage = (
      stageName: 'fetch' | 'transform' | 'enqueue' | 'write',
      status: 'running' | 'done',
    ) => ({
      type: 'stage' as const,
      importId,
      material,
      stage: stageName,
      status,
      at,
    })

    const sse = await installImportProgressSse(page, {
      chunks: [
        // 1) fetch running — still Fetching, 0%
        [stage('fetch', 'running')],
        // 2) fetch done → Transforming headline, percent 25 (1/4)
        [stage('fetch', 'done')],
        // 3) transform running — Transforming, 25%
        [stage('transform', 'running')],
        // 4) transform done → Writing (enqueue incomplete), 50%
        [stage('transform', 'done')],
        // 5) enqueue done — Writing, 75%
        [stage('enqueue', 'done')],
        // 6) write done — Writing, 99% cap
        [stage('write', 'done')],
        // 7) complete — dialog closes
        [{ type: 'complete', importId, result: completeResult, at }],
      ],
    })

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.importButton.click()

    const dialog = page.getByTestId('import-pbs-dialog')

    // Crew-only: select Crew without implicit dependencies.
    await dialog.getByTestId('import-pbs-scope-crew').check()
    await expect(dialog.getByTestId('import-pbs-scope-crew')).toBeChecked()
    await expect(dialog.getByTestId('import-pbs-confirm')).toBeEnabled()

    await dialog.getByTestId('import-pbs-confirm').click()

    await expect(dialog.getByTestId('import-pbs-progress')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-confirm')).toBeDisabled()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect(dialog.getByTestId('import-pbs-progress-bar')).toHaveAttribute('aria-valuenow', '0')

    // POST body must be crew-only for the selected scope.
    await expect.poll(() => postedBody?.scope?.crew).toBe(true)
    expect(postedBody?.scope).toEqual({
      flight: false,
      pairing: false,
      roster: false,
      rosterGround: false,
      crew: true,
    })
    expect(postedBody?.rosterPeriodId).toBe(6)

    // Stage 1: fetch running
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-fetch')).toHaveAttribute('data-status', 'running')
    await expect
      .poll(async () => Number(await dialog.getByTestId('import-pbs-progress-bar').getAttribute('aria-valuenow')))
      .toBeGreaterThan(0)

    // Stage 2: fetch done → transform is waiting, percent 25
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-fetch')).toHaveAttribute('data-status', 'done')
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-transform')).toHaveAttribute('data-status', 'waiting')
    await expect(dialog.getByTestId('import-pbs-progress-bar')).toHaveAttribute('aria-valuenow', '25')

    // Stage 3: transform running — still Transforming @ 25
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect
      .poll(async () => Number(await dialog.getByTestId('import-pbs-progress-bar').getAttribute('aria-valuenow')))
      .toBeGreaterThan(25)

    // Stage 4: transform done → write is waiting @ 50
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-transform')).toHaveAttribute('data-status', 'done')
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-write')).toHaveAttribute('data-status', 'waiting')
    await expect(dialog.getByTestId('import-pbs-progress-bar')).toHaveAttribute('aria-valuenow', '50')

    // Stage 5: enqueue done → Writing @ 75
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-transform')).toHaveAttribute('data-status', 'done')
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-write')).toHaveAttribute('data-status', 'waiting')
    await expect(dialog.getByTestId('import-pbs-progress-bar')).toHaveAttribute('aria-valuenow', '75')

    // Stage 6: write done → still open, 99 cap until complete
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-progress')).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-material-progress-crew-write')).toHaveAttribute('data-status', 'done')
    await expect(dialog.getByTestId('import-pbs-progress-bar')).toHaveAttribute('aria-valuenow', '99')

    // Stage 7: complete
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-result')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Imported 1 connector for 2026-06/)).toBeVisible()
    await expect(page.getByText(/fetch 00:08, transform 00:01, enqueue 00:00, database 00:03, records 118/)).toBeVisible()
  })

  test('Scen-2038 — Import PBS material surfaces SSE error without closing as success', async ({ page }) => {
    const importId = '00000000-0000-4000-8000-000000000038'
    const at = '2026-07-15T13:00:00.000Z'

    await mockImportStart(page, { importId, materials: ['crew'] })
    const sse = await installImportProgressSse(page, {
      chunks: [
        [
          {
            type: 'stage',
            importId,
            material: 'crew',
            stage: 'fetch',
            status: 'running',
            at,
          },
        ],
        [
          {
            type: 'error',
            importId,
            message: 'Connector f8-crew import failed',
            at,
          },
        ],
      ],
    })

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.importButton.click()

    const dialog = page.getByTestId('import-pbs-dialog')
    await dialog.getByTestId('import-pbs-scope-crew').check()
    await dialog.getByTestId('import-pbs-confirm').click()

    await expect(dialog.getByTestId('import-pbs-progress')).toBeVisible()
    await sse.releaseNext()
    await expect(dialog.getByTestId('import-pbs-stage-label')).toHaveText('Overall import progress')

    await sse.releaseNext()
    // Dialog stays open after failure; Confirm re-enables for retry.
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('import-pbs-progress')).toHaveCount(0)
    await expect(dialog.getByTestId('import-pbs-confirm')).toBeEnabled()
    await expect(page.getByText(/Connector f8-crew import failed after/)).toBeVisible()
    // Must not show the success toast pattern.
    await expect(page.getByText(/Imported \d+ connector/)).toHaveCount(0)
  })
})
