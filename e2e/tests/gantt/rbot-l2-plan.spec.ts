/**
 * R'Bot L2 — commit with confirm (spec §16, P3).
 *
 * Real UI: the user instructs R'Bot in chat, R'Bot stages the change, a plan card lists
 * exactly what Save would commit + the legality result, and only "Yes, save" commits it
 * through the normal Save path. Only the LLM reply (…/ai/chat) is stubbed; dispatch,
 * draft, legality pre-check, Save and the server are real.
 *
 * Server truth is checked through a SECOND, independent gantt page (fresh load from the
 * server — no draft), so "nothing saved before Yes" and "Yes saved exactly this" are
 * proven through the UI the next user would see, not by DB queries.
 *
 * Shared SIT data (§16.7): fixture = crew J4040 (FO, ADD), 2026-10-05 — no duty that
 * week. The cycle adds one GDO ground task, then removes it again through the same
 * confirmed-save flow, so the fixture ends where it started.
 */
import { test, expect, type Page, type BrowserContext, type APIRequestContext } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const SHOT_DIR = '../docs/assets/screenshots/gantt'
const CREW = 'J4040'
const DAY = '2026-10-05'

interface HookRosterItem { id: number; crewId: string; pairingId: number | null; assignment: string | null; start: string | null }

const groundTasksOn = (items: HookRosterItem[]): HookRosterItem[] =>
  items.filter((i) => i.crewId === CREW && i.pairingId == null && (i.start ?? '').slice(0, 10) === DAY)

/** Open a fresh Live gantt (server state, no draft) and return CREW's ground tasks on DAY. */
const serverGroundTasks = async (context: BrowserContext, request: APIRequestContext): Promise<HookRosterItem[]> => {
  const probe = await context.newPage()
  try {
    await seedGanttAuth(probe, request)
    const dash = new GanttDashboardPage(probe)
    await dash.goto(60_000)
    await expect.poll(async () => (await readHook<Array<{ crewId: string }>>(probe, 'rosterPanel')).some((r) => r.crewId === CREW),
      { timeout: 90_000 }).toBe(true)
    return groundTasksOn(await readHook<HookRosterItem[]>(probe, 'roster'))
  } finally {
    await probe.close()
  }
}

const card = (page: Page) => page.getByTestId('rbot-plan-card').last()

const stubReply = async (page: Page, actions: unknown[], content = 'Staged — please review the plan card.'): Promise<void> => {
  await page.unroute('**/ai/chat')
  await page.route('**/ai/chat', (route) => route.fulfill({ json: { role: 'assistant', content, actions } }))
}

const ask = async (page: Page, text: string): Promise<void> => {
  await page.getByTestId('ai-chat-input').fill(text)
  await page.getByTestId('ai-chat-send').click()
}

const openLive = async (page: Page, request: APIRequestContext): Promise<void> => {
  await seedGanttAuth(page, request)
  const dash = new GanttDashboardPage(page)
  await dash.goto(60_000)
  await dash.expectRosterPaneVisible()
  await expect.poll(async () => (await readHook<Array<{ crewId: string }>>(page, 'rosterPanel')).some((r) => r.crewId === CREW),
    { timeout: 90_000 }).toBe(true)
  await page.getByTestId('ai-chat-toggle').click()
}

test.describe.configure({ mode: 'serial' })

test.describe("R'Bot L2 — plan card, confirm, save", () => {
  test('Live-RBOT-L2-1 — kill switch L1: card lists the change but offers no Save; Cancel removes it; nothing reaches the server', async ({ page, request, context }) => {
    test.setTimeout(240_000)
    expect(await serverGroundTasks(context, request), 'fixture precondition: J4040 free on 2026-10-05').toEqual([])

    // Policy row read by the card, forced to L1 for this test only.
    await page.route('**/api/dictionary/parent/SYS_PARAM', (route) => route.fulfill({
      json: [
        { id: 1, parentCode: 'SYS_PARAM', code: 'RBOT_AUTONOMY', name: '', idx: 90, codeValue: 'L1' },
        { id: 2, parentCode: 'SYS_PARAM', code: 'RBOT_MAX_PLAN_CHANGES', name: '', idx: 91, codeValue: '20' },
      ],
    }))
    await openLive(page, request)
    await stubReply(page, [{ type: 'add_ground_task', crewIds: [CREW], assignment: 'GDO', date: DAY }])
    await ask(page, `give ${CREW} a GDO on ${DAY}`)

    await expect(card(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
    await expect(page.getByTestId('draft-save-btn')).toBeEnabled() // staged in the draft
    await expect(card(page).getByTestId('rbot-plan-line')).toHaveCount(1)
    await expect(card(page).getByTestId('rbot-plan-line')).toContainText(`Add GDO for ${CREW} on ${DAY}`)
    await expect(card(page).getByTestId('rbot-plan-blocked')).toContainText('R\'Bot is set to L1')
    await expect(card(page).getByTestId('rbot-plan-save')).toHaveCount(0)

    await card(page).getByTestId('rbot-plan-cancel').click()
    await expect(card(page).getByTestId('rbot-plan-result')).toContainText('Cancelled')
    await expect(page.getByTestId('draft-save-btn')).toBeDisabled() // draft is empty again
    expect(await serverGroundTasks(context, request)).toEqual([])
  })

  test('Live-RBOT-L2-2 — L2 full cycle: stage → card (legality) → nothing saved before Yes → Yes saves exactly the card → report → remove it again the same way', async ({ page, request, context }) => {
    test.setTimeout(420_000)
    expect(await serverGroundTasks(context, request), 'fixture precondition: J4040 free on 2026-10-05').toEqual([])

    await openLive(page, request)
    await page.getByTestId('ai-chat-view-gantt').click() // baseline read for the post-save report

    // ── 1. Stage via R'Bot ──────────────────────────────────────────────
    await stubReply(page, [{ type: 'add_ground_task', crewIds: [CREW], assignment: 'GDO', date: DAY }])
    await ask(page, `give ${CREW} a GDO on ${DAY}`)
    await expect(card(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
    const lines = card(page).getByTestId('rbot-plan-line')
    await expect(lines).toHaveCount(1)
    await expect(lines.first()).toContainText('R\'Bot')
    await expect(lines.first()).toContainText(`Add GDO for ${CREW} on ${DAY}`)
    await expect(card(page).getByTestId('rbot-plan-legality')).toContainText(/No new legality violations|new violation/)
    await expect(card(page).getByTestId('rbot-plan-save')).toHaveText('Yes, save 1 change')
    await page.screenshot({ path: `${SHOT_DIR}/rbot-l2-plan-card-Ver2.png` })

    // Nothing reached the server before Yes.
    expect(await serverGroundTasks(context, request)).toEqual([])

    // ── 2. Yes → normal Save path → post-save report ─────────────────────
    await card(page).getByTestId('rbot-plan-save').click()
    // A legality confirm would appear here if the change introduced violations; accept it.
    const confirm = page.getByRole('button', { name: /save anyway|proceed|confirm/i })
    if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click()
    await expect(card(page)).toHaveAttribute('data-status', 'saved', { timeout: 60_000 })
    await expect(page.getByTestId('draft-save-btn')).toBeDisabled()
    const report = page.getByTestId('ai-chat-thread').locator('.text-left').last()
    await expect(report).toContainText('Saved 1 change. Here is the screen after the save:', { timeout: 30_000 })
    await expect(report).toContainText('Since your last read')
    await expect(report).toContainText(`1 crew gained duties: ${CREW} +1`)
    // Regression (coverage recompute): a ground task touches no pairing, so no pairing may
    // change coverage or enter/leave the pairing pane in the report.
    await expect(report).not.toContainText('changed coverage')
    await expect(report).not.toContainText('now have open positions')
    await expect(report).not.toContainText('appeared in the pairing pane')
    await page.screenshot({ path: `${SHOT_DIR}/rbot-l2-saved-report-Ver2.png` })

    // Server now has exactly that one ground task.
    const saved = await serverGroundTasks(context, request)
    expect(saved.map((i) => i.assignment)).toEqual(['GDO'])

    // ── 3. Restore the fixture through the same confirmed flow ───────────
    await stubReply(page, [{ type: 'unassign_task', crewId: CREW, date: DAY }])
    await ask(page, `remove ${CREW}'s GDO on ${DAY}`)
    await expect(card(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
    await expect(card(page).getByTestId('rbot-plan-line')).toHaveCount(1)
    await expect(card(page).getByTestId('rbot-plan-line')).toContainText(`Remove GDO on ${DAY} from ${CREW}`)
    await card(page).getByTestId('rbot-plan-save').click()
    if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click()
    await expect(card(page)).toHaveAttribute('data-status', 'saved', { timeout: 60_000 })
    expect(await serverGroundTasks(context, request)).toEqual([])
  })

  test('Live-RBOT-L2-3 — "save my changes" reviews everything pending; the card follows the draft when it changes', async ({ page, request }) => {
    test.setTimeout(240_000)
    await openLive(page, request)

    // Stage via R'Bot, then the user says "save my changes" — card covers ALL pending changes.
    await stubReply(page, [{ type: 'add_ground_task', crewIds: [CREW], assignment: 'GDO', date: DAY }])
    await ask(page, `give ${CREW} a GDO on ${DAY}`)
    await expect(card(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })

    await stubReply(page, [{ type: 'save_changes' }], 'Here is what will be saved — please review.')
    await ask(page, 'save my changes')
    await expect(page.getByTestId('ai-chat-applied').last()).toContainText('Reviewing 1 unsaved change before saving')
    await expect(card(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
    // Older card is superseded; the new one lists the pending change (made by R'Bot earlier).
    await expect(page.getByTestId('rbot-plan-card').first().getByTestId('rbot-plan-result')).toContainText('Superseded')
    await expect(card(page).getByTestId('rbot-plan-line')).toContainText(`Add GDO for ${CREW} on ${DAY}`)

    // The user undoes it from the real toolbar → the card follows the draft: nothing to save.
    await page.getByTestId('draft-undo-btn').click()
    await expect(card(page).getByTestId('rbot-plan-empty')).toContainText('No unsaved changes', { timeout: 30_000 })
    await expect(card(page).getByTestId('rbot-plan-save')).toHaveCount(0)
  })
})
