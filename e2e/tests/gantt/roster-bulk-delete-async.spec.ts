import { test, expect } from '@playwright/test'
import { gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Live roster bulk delete async refresh', () => {
  test('Live-1321 — bulk delete shows task progress and refreshes roster after completion', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    let rosterLoads = 0
    let taskPolls = 0

    await page.route(/\/api\/roster(?:\?|$)/, async (route) => {
      rosterLoads += 1
      await route.fulfill({
        json: {
          code: 200,
          message: 'ok',
          data: [],
        },
      })
    })

    await page.route('**/api/roster/bulk-delete/candidates**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          message: 'ok',
          data: {
            groups: [{ mode: 'PAIRED', assignment: 'FLY', assignmentGroup: 'FLY', count: 1 }],
            rows: [{
              id: 101,
              pairingId: 9001,
              crewId: 'C001',
              source: 'MA',
              startDt: '2026-08-01T00:00:00Z',
              assignmentGroup: 'FLY',
              assignment: 'FLY',
              pairingLabel: 'P9001',
              rosterActingRank: 'CA',
              fltNum: 'F8001',
              depArp: 'YVR',
              arvArp: 'SFO',
            }],
          },
        },
      })
    })

    await page.route('**/api/roster/bulk-delete', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          message: 'ok',
          data: { taskId: 'task-123' },
        },
      })
    })

    await page.route('**/api/roster/bulk-delete/tasks/task-123', async (route) => {
      taskPolls += 1
      await route.fulfill({
        json: {
          code: 200,
          message: 'ok',
          data: taskPolls === 1
            ? {
                taskId: 'task-123',
                state: 'active',
                progress: {
                  stage: 'recomputing-manday',
                  percent: 60,
                  startedAt: new Date().toISOString(),
                  elapsedMs: 1500,
                  stages: [
                    { stage: 'deleting', status: 'completed', startedAt: '2026-08-04T06:07:34.812Z', finishedAt: '2026-08-04T06:07:35.812Z', elapsedMs: 1000 },
                    { stage: 'rechecking', status: 'completed', startedAt: '2026-08-04T06:07:35.812Z', finishedAt: '2026-08-04T06:07:56.812Z', elapsedMs: 21000 },
                    { stage: 'recomputing-manday', status: 'active', startedAt: '2026-08-04T06:07:36.812Z', elapsedMs: 1500 },
                    { stage: 'broadcasting', status: 'pending', elapsedMs: 0 },
                  ],
                },
                result: null,
                error: null,
              }
            : {
                taskId: 'task-123',
                state: 'completed',
                progress: {
                  stage: 'completed',
                  percent: 100,
                  startedAt: new Date().toISOString(),
                  elapsedMs: 3200,
                  stages: [
                    { stage: 'deleting', status: 'completed', elapsedMs: 1000 },
                    { stage: 'rechecking', status: 'completed', elapsedMs: 21000 },
                    { stage: 'recomputing-manday', status: 'completed', elapsedMs: 700 },
                    { stage: 'broadcasting', status: 'completed', elapsedMs: 500 },
                  ],
                },
                result: { deleted: 1, crewIds: ['C001'], durationMs: 3200 },
                error: null,
              },
        },
      })
    })

    await gotoGantt(page)
    await page.getByTestId('roster-bulk-delete-button').click()
    await expect(page.getByTestId('roster-bulk-delete-dialog')).toBeVisible()

    await page.getByRole('button', { name: /refresh/i }).click()
    await page.locator('label', { hasText: 'FLY' }).getByRole('checkbox').check()
    await expect(page.getByText('C001')).toBeVisible()
    await page.getByRole('button', { name: /delete selected/i }).click()

    await expect(page.getByTestId('roster-bulk-delete-progress')).toBeVisible()
    await expect(page.getByTestId('roster-bulk-delete-stage-deleting')).toBeVisible()
    await expect(page.getByTestId('roster-bulk-delete-stage-rechecking')).toBeVisible()
    await expect(page.getByTestId('roster-bulk-delete-stage-recomputing-manday')).toBeVisible()
    await expect(page.getByTestId('roster-bulk-delete-stage-broadcasting')).toBeVisible()
    await expect(page.getByTestId('roster-bulk-delete-elapsed')).toContainText('1.5s')
    await expect.poll(() => taskPolls).toBeGreaterThanOrEqual(2)
    await expect.poll(() => rosterLoads).toBeGreaterThan(1)
  })

  test('Live-1322 — bulk delete gives an immediate retry reminder on a mutation conflict', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    await page.route('**/api/roster/bulk-delete/candidates**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          message: 'ok',
          data: {
            groups: [{ mode: 'PAIRED', assignment: 'FLY', assignmentGroup: 'FLY', count: 1 }],
            rows: [{
              id: 101,
              pairingId: 9001,
              crewId: 'C001',
              source: 'MA',
              startDt: '2026-08-01T00:00:00Z',
              assignmentGroup: 'FLY',
              assignment: 'FLY',
              pairingLabel: 'P9001',
              rosterActingRank: 'CA',
              fltNum: 'F8001',
              depArp: 'YVR',
              arvArp: 'SFO',
            }],
          },
        },
      })
    })

    const conflictMessage = 'Your Bulk Delete Roster Flights request was not started. Another user is currently running Import PBS Material (user: planner-2). Please wait until it finishes, then try again.'
    await page.route('**/api/roster/bulk-delete', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 409, data: null, message: conflictMessage }),
      })
    })

    await gotoGantt(page)
    await page.getByTestId('roster-bulk-delete-button').click()
    await expect(page.getByTestId('roster-bulk-delete-dialog')).toBeVisible()
    await page.getByRole('button', { name: /refresh/i }).click()
    await page.locator('label', { hasText: 'FLY' }).getByRole('checkbox').check()
    await expect(page.getByText('C001')).toBeVisible()
    await page.getByRole('button', { name: /delete selected/i }).click()

    await expect(page.getByText(conflictMessage)).toBeVisible()
    await expect(page.getByTestId('roster-bulk-delete-progress')).toHaveCount(0)
    await expect(page.getByTestId('roster-bulk-delete-dialog')).toBeVisible()
  })
})
