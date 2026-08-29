/**
 * R'Bot Phase 1 — Live Roster core edits via chat (move/swap/unassign/add-ground-task).
 *
 * Drives the REAL AiChatPanel UI (§Simulate-User): open the panel, type an instruction,
 * click Send. The LLM call itself is mocked (`POST /altair/ai/chat`) so the test is
 * deterministic, but everything downstream — dispatchAiAction, roster-store.addGroundTask,
 * the draft store, the legality preview, RuleConfirmDialog — runs for real, exactly like a
 * manual drag-drop. Every mutation only STAGES a pending change (draft-save-btn badge);
 * R'Bot never calls Save (see wondrous-jumping-lynx plan, "Stage only, human always Saves").
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const CREW_ID = 'RBOT01'

const ok = (data: unknown) => JSON.stringify({ code: 200, data, message: 'ok' })
const json = { status: 200, contentType: 'application/json' }

/** GET /api/assignment — the live ground-task dictionary R'Bot validates "Day Off" against. */
const mockAssignmentDictionary = (page: Page) =>
  page.route('**/api/assignment', (route) =>
    route.fulfill({
      ...json,
      body: ok([
        { assignment: 'Day Off', description: 'Day off', defaultAssignmentGroup: 'DO', restTime: null },
        { assignment: 'Training', description: 'Training', defaultAssignmentGroup: 'TR', restTime: null },
      ]),
    }),
  )

/** POST /api/legality/preview-draft — the Rust legality gate every draft op runs through. */
const mockLegalityPreview = (page: Page, violations: Record<string, unknown>[]) =>
  page.route('**/api/legality/preview-draft', (route) =>
    route.fulfill({ ...json, body: ok({ allowed: true, violations }) }),
  )

/** POST /altair/ai/chat — the LLM call; ai-server itself returns actions raw (no {code,data} envelope). */
const mockChatResponse = (page: Page, content: string, actions: Record<string, unknown>[]) =>
  page.route('**/altair/ai/chat', (route) =>
    route.fulfill({
      ...json,
      body: JSON.stringify({ role: 'assistant', content, actions }),
    }),
  )

/** Seed a crew into the global crew store so add_ground_task's crewId lookup resolves. */
const seedCrew = (page: Page) =>
  page.evaluate((crewId) => {
    const mod = (window as unknown as { __vitePreload?: unknown })
    void mod
    return import('/altair/src/stores/crew-store.ts').then(({ useCrewStore }) => {
      useCrewStore.setState({
        items: [
          {
            sessionTags: [],
            crew: {
              id: 1,
              crewId,
              firstName: 'RBot',
              middleName: null,
              lastName: 'Test',
              preferredName: null,
              gender: 'M',
              division: 'P',
              filiale: 'F8',
              status: 1,
              remarks: null,
              seniorityNum: null,
              panelBase: 'BJS',
            },
          },
        ],
      })
    })
  }, CREW_ID)

const openChatAndSend = async (page: Page, text: string) => {
  await page.getByTestId('ai-chat-toggle').click()
  await expect(page.getByTestId('ai-chat-panel')).toBeVisible()
  await page.getByTestId('ai-chat-input').fill(text)
  await page.getByTestId('ai-chat-send').click()
}

const gotoLive = async (page: Page) => {
  await seedGanttAuth(page, page.request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('draft-save-btn')).toBeVisible({ timeout: 30_000 })
}

test.describe('R\'Bot chat — Live Roster mutations stage into the draft store', () => {
  test('add_ground_task stages a pending change without saving', async ({ page }) => {
    await gotoLive(page)
    await seedCrew(page)
    await mockAssignmentDictionary(page)
    await mockLegalityPreview(page, [])
    await mockChatResponse(page, 'Added a day off for crew RBOT01 on 2026-09-05.', [
      { type: 'add_ground_task', crewIds: [CREW_ID], assignment: 'Day Off', date: '2026-09-05' },
    ])

    const saveBtn = page.getByTestId('draft-save-btn')
    await expect(saveBtn).toBeDisabled()

    await openChatAndSend(page, 'give crew RBOT01 a day off on 2026-09-05')

    const applied = page.getByTestId('ai-chat-applied')
    await expect(applied).toBeVisible({ timeout: 10_000 })
    await expect(applied).toContainText('Added "Day Off" for 1 of 1 crew')

    // Staged, not saved: badge shows exactly 1 pending op, Save is now clickable.
    await expect(saveBtn).toContainText('1')
    await expect(saveBtn).toBeEnabled()

    // Cleanup: undo the synthetic op so the draft store leaves clean state.
    await page.getByTestId('draft-undo-btn').click()
    await expect(saveBtn).toBeDisabled()
  })

  test('a soft rule violation shows the confirm dialog; Continue Anyway keeps the staged change', async ({ page }) => {
    await gotoLive(page)
    await seedCrew(page)
    await mockAssignmentDictionary(page)
    await mockLegalityPreview(page, [
      {
        crewId: CREW_ID,
        pairingId: null,
        dutySeq: null,
        ruleCode: '8002',
        ruleInstance: '001',
        scopeKey: 'e2e',
        severity: 1,
        startDt: '2026-09-05T06:00:00.000Z',
        endDt: '2026-09-05T08:00:00.000Z',
        message: 'Synthetic soft ground-task violation (e2e fixture).',
      },
    ])
    await mockChatResponse(page, 'Added a day off for crew RBOT01 on 2026-09-05.', [
      { type: 'add_ground_task', crewIds: [CREW_ID], assignment: 'Day Off', date: '2026-09-05' },
    ])

    const saveBtn = page.getByTestId('draft-save-btn')
    await openChatAndSend(page, 'give crew RBOT01 a day off on 2026-09-05')

    const dialog = page.getByTestId('rule-confirm-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText('1 Soft')
    await expect(dialog).toContainText('Synthetic soft ground-task violation')

    const proceedBtn = page.getByTestId('rule-confirm-proceed')
    await expect(proceedBtn).toBeVisible()
    await proceedBtn.click()
    await expect(dialog).toBeHidden()

    const applied = page.getByTestId('ai-chat-applied')
    await expect(applied).toBeVisible({ timeout: 10_000 })
    await expect(applied).toContainText('Added "Day Off" for 1 of 1 crew')
    await expect(saveBtn).toContainText('1')
    await expect(saveBtn).toBeEnabled()

    await page.getByTestId('draft-undo-btn').click()
    await expect(saveBtn).toBeDisabled()
  })

  test('a blocking rule violation shows the confirm dialog with no Continue option; Cancel discards the change', async ({ page }) => {
    await gotoLive(page)
    await seedCrew(page)
    await mockAssignmentDictionary(page)
    await mockLegalityPreview(page, [
      {
        crewId: CREW_ID,
        pairingId: null,
        dutySeq: null,
        ruleCode: '8002',
        ruleInstance: '001',
        scopeKey: 'e2e',
        severity: 3,
        startDt: '2026-09-05T06:00:00.000Z',
        endDt: '2026-09-05T08:00:00.000Z',
        message: 'Synthetic blocking ground-task violation (e2e fixture).',
      },
    ])
    await mockChatResponse(page, 'Added a day off for crew RBOT01 on 2026-09-05.', [
      { type: 'add_ground_task', crewIds: [CREW_ID], assignment: 'Day Off', date: '2026-09-05' },
    ])

    const saveBtn = page.getByTestId('draft-save-btn')
    await openChatAndSend(page, 'give crew RBOT01 a day off on 2026-09-05')

    const dialog = page.getByTestId('rule-confirm-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText('Rule Violation Detected')
    await expect(dialog).toContainText('Synthetic blocking ground-task violation')
    await expect(page.getByTestId('rule-confirm-proceed')).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    const applied = page.getByTestId('ai-chat-applied')
    await expect(applied).toBeVisible({ timeout: 10_000 })
    await expect(applied).toContainText(`Could not create the ground task for ${CREW_ID}`)

    // Rejected before addOp — nothing staged, Save stays disabled.
    await expect(saveBtn).toBeDisabled()
  })
})
