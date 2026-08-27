import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks } from '../../utils/gantt-hook'

const envelope = (data: unknown): string =>
  JSON.stringify({ code: 200, data, message: 'ok' })

const event = (data: unknown): string =>
  `data: ${JSON.stringify(data)}\n\n`

test('Scen-2450 — Import PBS Material keeps result details in the dialog after completion', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await seedScenarioListMocks(page)

  await page.route('**/live/api/roster-periods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        items: [
          { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
        ],
      }),
    })
  })

  await page.route('**/live/api/scenario/import-pbs-material', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        importId: '11111111-1111-4111-8111-111111111111',
        rosterPeriodId: 6,
        rosterPeriod: '2026-06',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        materials: ['crew'],
      }),
    })
  })

  const completeResult = {
    rosterPeriodId: 6,
    rosterPeriod: '2026-06',
    startDt: '2026-06-01',
    endDt: '2026-06-30',
    results: [],
    materialStats: [{
      material: 'crew',
      status: 'partial',
      added: 12,
      updated: 204,
      deleted: 0,
      success: 216,
      failed: 4,
      skipped: 4,
      rejected: 0,
      recordsIn: 216,
      recordsOut: 216,
      warnings: [
        'Missing optional duty node',
        'pairing 118557 not found, skipping crew 417',
        'pairing 118513 not found, skipping crew 784',
        'pairing 118352 not found, skipping crew 1488',
      ],
      errors: [
        { id: '117168', reason: 'missing start/end time' },
        { id: '117169', reason: 'DB constraint failed' },
        { id: '117170', reason: 'missing pairing segment' },
        { id: '117171', reason: 'invalid crew assignment' },
      ],
      timings: {
        fetchMs: 1000,
        transformMs: 1200,
        enqueueMs: 800,
        databaseMs: 3000,
        totalMs: 6000,
      },
    }],
  }

  await page.route('**/live/api/scenario/import-pbs-material/11111111-1111-4111-8111-111111111111/events', async (route) => {
    const importId = '11111111-1111-4111-8111-111111111111'
    const body = [
      event({
        type: 'started',
        importId,
        rosterPeriodId: 6,
        rosterPeriod: '2026-06',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        materials: ['crew'],
        at: '2026-07-16T00:00:00.000Z',
      }),
      event({
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'write',
        status: 'running',
        processed: 100,
        total: 216,
        added: 5,
        updated: 95,
        success: 100,
        failed: 0,
        at: '2026-07-16T00:00:01.000Z',
      }),
      event({
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'write',
        status: 'done',
        processed: 216,
        total: 216,
        added: 12,
        updated: 204,
        success: 216,
        failed: 0,
        at: '2026-07-16T00:00:02.000Z',
      }),
      event({
        type: 'complete',
        importId,
        result: completeResult,
        at: '2026-07-16T00:00:03.000Z',
      }),
    ].join('')
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    })
  })

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await scenario.importButton.click()

  const dialog = page.getByTestId('import-pbs-dialog')
  await expect(dialog).toBeVisible()

  const materialLabels = await dialog.getByTestId('import-pbs-scope').locator('label').allTextContents()
  expect(materialLabels).toEqual(['Crew', 'Roster', 'RosterGround', 'Pairing', 'Flight'])
  for (const key of ['crew', 'roster', 'rosterGround', 'pairing', 'flight']) {
    await expect(dialog.getByTestId(`import-pbs-scope-${key}`)).not.toBeChecked()
  }
  await expect(dialog.getByTestId('import-pbs-confirm')).toBeDisabled()

  await dialog.getByTestId('import-pbs-scope-crew').check()
  await expect(dialog.getByTestId('import-pbs-confirm')).toBeEnabled()
  await dialog.getByTestId('import-pbs-confirm').click()

  await expect(dialog.getByTestId('import-pbs-result')).toBeVisible()
  const row = dialog.getByTestId('import-pbs-result-crew')
  await expect(row).toContainText('Crew')
  await expect(row).toContainText('12')
  await expect(row).toContainText('204')
  await expect(row).toContainText('216')
  await expect(row.getByTestId('import-pbs-result-crew-fetch-ms')).toContainText('1s')
  await expect(row.getByTestId('import-pbs-result-crew-transform-ms')).toContainText('2s')
  await expect(row.getByTestId('import-pbs-result-crew-db-ms')).toContainText('3s')
  await expect(row.getByTestId('import-pbs-result-crew-total-ms')).toContainText('6s')
  const details = dialog.getByTestId('import-pbs-result-crew-details')
  await expect(details).toContainText('117170: missing pairing segment')
  await expect(details).toContainText('117171: invalid crew assignment')
  await expect(details).toContainText('pairing 118557 not found, skipping crew 417')
  await expect(details).toContainText('pairing 118513 not found, skipping crew 784')
  await expect(details).toContainText('pairing 118352 not found, skipping crew 1488')
  await expect(details).not.toContainText('more details not shown')
  await expect(details).toHaveClass(/overflow-y-auto/)
  await expect(dialog.getByTestId('import-pbs-result')).toHaveJSProperty('scrollLeft', 0)
  expect(await dialog.getByTestId('import-pbs-result').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('import-pbs-confirm')).toContainText('Done')
})

test('Scen-2453 — Import PBS Material gives an immediate retry reminder on a mutation conflict', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await seedScenarioListMocks(page)

  await page.route('**/live/api/roster-periods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        items: [
          { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
        ],
      }),
    })
  })

  const conflictMessage = 'Your Import PBS Material request was not started. Another user is currently running Bulk Delete Roster Flights (user: planner-2). Please wait until it finishes, then try again.'
  await page.route('**/live/api/scenario/import-pbs-material', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 409, data: null, message: conflictMessage }),
    })
  })

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await scenario.importButton.click()

  const dialog = page.getByTestId('import-pbs-dialog')
  await dialog.getByTestId('import-pbs-scope-crew').check()
  await dialog.getByTestId('import-pbs-confirm').click()

  await expect(page.getByText(conflictMessage)).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('import-pbs-progress')).toHaveCount(0)
  await expect(dialog.getByTestId('import-pbs-result')).toHaveCount(0)
})

test('Scen-2454 — Import PBS Material button is hidden for non-admin users without the SCENARIO_IMPORT_PBS ctl', async ({ page, request }) => {
  // Override /api/auth/me after seedScenarioListMocks (LIFO wins): the
  // client-side restore uses /api/auth/me for `user.isAdmin` + `permissions`,
  // so the JWT-validated backend session can keep isAdmin=1 while the client
  // simulates a non-admin planner with no import ctl — the button must hide.
  await seedGanttAuth(page, request)
  await seedScenarioListMocks(page)

  await page.route('**/live/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: {
          user: { userCode: 'planner', userName: 'Planner', schema: 'f8', isAdmin: 0 },
          menus: ['SCENARIO', 'SCENARIO_LIST', 'SCENARIO_ALL'],
          ctrls: { SCENARIO_ALL: ['SCENARIO_NEW', 'SCENARIO_OPEN'] },
          dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
        },
        message: 'ok',
      }),
    })
  })

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()

  // The button is the same testid regardless of permission state; with
  // PermissionGate returning fallback (null), the locator finds zero matches.
  await expect(page.getByTestId('scenario-import-btn')).toHaveCount(0)
})

test('Scen-2455 — Import PBS Material surfaces the server message verbatim on 403 (no spurious "after 00:00")', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await seedScenarioListMocks(page)

  await page.route('**/live/api/roster-periods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        items: [
          { id: 8, rosterPeriod: '2026RP08', name: '2026RP08', rpStart: '2026-08-01', rpEnd: '2026-08-31', isCurrent: true },
        ],
      }),
    })
  })

  // Matches the message returned by decidePermission() when the
  // SCENARIO_IMPORT_PBS ctl is missing for the active SCENARIO_ALL context.
  const forbiddenMessage = 'No permission for this action.'
  await page.route('**/live/api/scenario/import-pbs-material', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PERM_CTRL', data: null, message: forbiddenMessage }),
    })
  })

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await scenario.importButton.click()

  const dialog = page.getByTestId('import-pbs-dialog')
  await dialog.getByTestId('import-pbs-scope-flight').check()
  await dialog.getByTestId('import-pbs-confirm').click()

  // Toast should show ONLY the server message, not "<message> after 00:00".
  // Previous bug appended "after 00:00" because formatImportDuration(0) === "00:00",
  // which read "Admin access required after 00:00" and was confused with a date error.
  const toast = page.getByText(forbiddenMessage, { exact: true })
  await expect(toast).toBeVisible()
  await expect(page.getByText(`${forbiddenMessage} after 00:00`, { exact: true })).toHaveCount(0)
  await expect(page.getByText(/after \d{2}:\d{2}/)).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('import-pbs-progress')).toHaveCount(0)
  await expect(dialog.getByTestId('import-pbs-result')).toHaveCount(0)
})

test('Scen-2451 — Import PBS Material replays progress history for a late SSE subscription', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await seedScenarioListMocks(page)

  await page.route('**/live/api/roster-periods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        items: [
          { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
        ],
      }),
    })
  })

  await page.route('**/live/api/scenario/import-pbs-material', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        importId: '22222222-2222-4222-8222-222222222222',
        rosterPeriodId: 6,
        rosterPeriod: '2026-06',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        materials: ['crew'],
      }),
    })
  })

  await page.route('**/live/api/scenario/import-pbs-material/22222222-2222-4222-8222-222222222222/events', async (route) => {
    const importId = '22222222-2222-4222-8222-222222222222'
    const body = [
      event({
        type: 'started',
        importId,
        rosterPeriodId: 6,
        rosterPeriod: '2026-06',
        startDt: '2026-06-01',
        endDt: '2026-06-30',
        materials: ['crew'],
        at: '2026-07-16T00:00:00.000Z',
      }),
      event({
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'fetch',
        status: 'done',
        recordsIn: 216,
        at: '2026-07-16T00:00:01.000Z',
      }),
      event({
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'transform',
        status: 'done',
        recordsOut: 216,
        at: '2026-07-16T00:00:02.000Z',
      }),
      event({
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'enqueue',
        status: 'done',
        at: '2026-07-16T00:00:03.000Z',
      }),
      event({
        type: 'stage',
        importId,
        material: 'crew',
        stage: 'write',
        status: 'running',
        processed: 108,
        total: 216,
        added: 12,
        updated: 96,
        success: 108,
        failed: 0,
        at: '2026-07-16T00:00:04.000Z',
      }),
    ].join('')
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    })
  })

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await scenario.importButton.click()

  const dialog = page.getByTestId('import-pbs-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('import-pbs-scope-crew').check()
  await dialog.getByTestId('import-pbs-confirm').click()

  await expect(dialog.getByTestId('import-pbs-stage-label')).toContainText('Overall import progress')
  await expect(dialog.getByTestId('import-pbs-progress-summary')).toHaveCount(0)
  await expect(dialog.getByTestId('import-pbs-material-progress')).toBeVisible()
  await expect(dialog.getByTestId('import-pbs-material-progress-crew-fetch')).toHaveAttribute('data-status', 'done')
  await expect(dialog.getByTestId('import-pbs-material-progress-crew-transform')).toHaveAttribute('data-status', 'done')
  await expect(dialog.getByTestId('import-pbs-material-progress-crew-write')).toHaveAttribute('data-status', 'running')
  await expect(dialog.getByTestId('import-pbs-material-progress-crew-fetch')).toContainText('Done1s')
  await expect(dialog.getByTestId('import-pbs-material-progress-crew-transform')).toContainText('Done2s')
  await expect(dialog.getByTestId('import-pbs-material-progress-crew-write')).toContainText(/Running\d+s/)
  await expect(dialog.getByTestId('import-pbs-material-progress')).not.toContainText('108 / 216')
  await expect(dialog.getByTestId('import-pbs-material-progress')).not.toContainText('108')
  await expect(dialog.getByTestId('import-pbs-material-progress')).not.toContainText('216')
  await expect
    .poll(async () => Number(await dialog.getByTestId('import-pbs-progress-bar').getAttribute('aria-valuenow')))
    .toBeGreaterThan(80)
})

test('Scen-2452 — Import PBS Material shows per-material progress after start', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await seedScenarioListMocks(page)

  await page.route('**/live/api/roster-periods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        items: [
          { id: 7, rosterPeriod: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: true },
        ],
      }),
    })
  })

  await page.route('**/live/api/scenario/import-pbs-material', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        importId: '33333333-3333-4333-8333-333333333333',
        rosterPeriodId: 7,
        rosterPeriod: '2026-07',
        startDt: '2026-07-01',
        endDt: '2026-07-31',
        materials: ['roster', 'rosterGround', 'pairing', 'flight'],
      }),
    })
  })

  await page.route('**/live/api/scenario/import-pbs-material/33333333-3333-4333-8333-333333333333/events', async (route) => {
    const importId = '33333333-3333-4333-8333-333333333333'
    const body = [
      event({
        type: 'started',
        importId,
        rosterPeriodId: 7,
        rosterPeriod: '2026-07',
        startDt: '2026-07-01',
        endDt: '2026-07-31',
        materials: ['roster', 'rosterGround', 'pairing', 'flight'],
        at: '2026-07-16T00:00:00.000Z',
      }),
      event({
        type: 'stage',
        importId,
        material: 'roster',
        stage: 'fetch',
        status: 'running',
        at: '2026-07-16T00:00:01.000Z',
      }),
    ].join('')
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    })
  })

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await scenario.importButton.click()

  const dialog = page.getByTestId('import-pbs-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('import-pbs-scope-roster').check()
  await dialog.getByTestId('import-pbs-scope-rosterGround').check()
  await dialog.getByTestId('import-pbs-scope-pairing').check()
  await dialog.getByTestId('import-pbs-scope-flight').check()
  await dialog.getByTestId('import-pbs-confirm').click()

  await expect(dialog.getByTestId('import-pbs-progress-summary')).toHaveCount(0)
  await expect(dialog.getByTestId('import-pbs-material-progress')).toBeVisible()
  await expect(dialog.getByTestId('import-pbs-material-progress-roster-fetch')).toHaveAttribute('data-status', 'running')
  await expect(dialog.getByTestId('import-pbs-material-progress-roster-transform')).toHaveAttribute('data-status', 'waiting')
  await expect(dialog.getByTestId('import-pbs-material-progress-roster-write')).toHaveAttribute('data-status', 'waiting')
  await expect(dialog.getByTestId('import-pbs-material-progress-roster-fetch')).toContainText(/Running\d+s/)
  await expect(dialog.getByTestId('import-pbs-material-progress-roster-transform')).toContainText('Waiting')
  await expect(dialog.getByTestId('import-pbs-material-progress-roster-transform')).toContainText('0s')
  await expect(dialog.getByTestId('import-pbs-material-progress-flight-fetch')).toHaveAttribute('data-status', 'waiting')
  await expect(dialog).toContainText('Waiting')
})
