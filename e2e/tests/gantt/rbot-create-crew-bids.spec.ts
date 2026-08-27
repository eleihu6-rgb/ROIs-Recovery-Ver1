/**
 * R'Bot create_crew_bids — drive the AI chat to launch the crew-bid simulation.
 *
 * Two layers (see docs/superpowers/specs/2026-06-21-rbot-create-crew-bids-design.md):
 *  - Live-1097 (deterministic): the chat reply is stubbed with the server's real
 *    "Started crew-bid simulation … Run id …" confirmation, so CI asserts R'Bot
 *    surfaces it in the thread (the UI contract) without depending on the LLM.
 *  - Live-1098 (live, opt-in via RBOT_LIVE=1): drives the REAL ai-server + LLM so
 *    R'Bot actually fires the run for YVR+YYZ pilots, then asserts the run id is
 *    registered at /ai/crew-bids/runs/{id}. This is the end-to-end "use Playwright
 *    to drive R'Bot and finish the two bases' PBS entry" path. Needs ai-server
 *    (:3005) + portal (:3030) up and an LLM key in ai-server/.env.
 *
 * create_crew_bids is resolved SERVER-side (it launches a headed browser); it is
 * NOT a client AiAction, so the proof is the assistant text + the registered run,
 * never an ai-chat-applied chip.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const AI_SERVER = process.env.RBOT_AI_SERVER ?? 'http://127.0.0.1:3005'
const RUN_ID_RE = /Run id ([0-9a-f]{12})/

// R'Bot is a fixed overlay independent of board data, so we don't wait for full
// pane readiness (which needs the slow remote demo DB) — just the toggle button.
const openRbot = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  const toggle = page.getByTestId('ai-chat-toggle')
  await expect(toggle).toBeVisible({ timeout: 30_000 })
  await toggle.click()
  await expect(page.getByTestId('ai-chat-panel')).toBeVisible()
}

const sendChat = async (page: Page, text: string): Promise<void> => {
  await page.getByTestId('ai-chat-input').fill(text)
  await page.getByTestId('ai-chat-send').click()
  await expect(page.getByTestId('ai-chat-busy')).toHaveCount(0, { timeout: 60_000 })
}

test.describe('R\'Bot create_crew_bids', () => {
  test('Live-1097 — R\'Bot surfaces the run-started confirmation in the thread (stubbed)', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    // The server resolves create_crew_bids itself and replies with text + no actions.
    await page.route('**/altair/ai/chat', (route) =>
      route.fulfill({
        json: {
          role: 'assistant',
          content:
            'Started crew-bid simulation for YVR/YYZ · CA/FO — 2026-07-01 → 2026-07-31. ' +
            'A headed browser will log in as each crew and submit days-off, pairing and line ' +
            'bids, then log out. Run id abc123def456.',
          actions: [],
        },
      }),
    )

    await openRbot(page)

    await sendChat(page, 'add bids for YVR and YYZ pilots (CA and FO) for July 2026')

    const thread = page.getByTestId('ai-chat-thread')
    await expect(thread).toContainText('Started crew-bid simulation')
    await expect(thread).toContainText('YVR/YYZ')
    await expect(thread).toContainText('days-off, pairing and line')
    await expect(thread).toContainText('Run id abc123def456')
    // Server-resolved → no client action chip.
    await expect(page.getByTestId('ai-chat-applied')).toHaveCount(0)
  })

  // eslint-disable-next-line playwright/no-skipped-test
  test('Live-1098 — drives the REAL R\'Bot to launch the YVR+YYZ pilot run @live', async ({ page, request }) => {
    test.skip(process.env.RBOT_LIVE !== '1', 'opt-in: set RBOT_LIVE=1 with ai-server + portal up')
    test.setTimeout(180_000)
    await seedGanttAuth(page, request)
    await openRbot(page)

    // One unambiguous turn with the full scope + explicit dates so the LLM has
    // everything it needs to call create_crew_bids without a follow-up question.
    await sendChat(
      page,
      'Create crew bids for bases YVR and YYZ, ranks CA and FO, from 2026-07-01 to 2026-07-31.',
    )

    const thread = page.getByTestId('ai-chat-thread')
    await expect(thread).toContainText(/crew-bid simulation/i, { timeout: 60_000 })
    await expect(thread).toContainText(RUN_ID_RE)

    const runId = (await thread.textContent())?.match(RUN_ID_RE)?.[1]
    expect(runId, 'R\'Bot reply must carry a run id').toBeTruthy()

    // The run is registered server-side and is running or already finished.
    const res = await request.get(`${AI_SERVER}/ai/crew-bids/runs/${runId}`)
    expect(res.status()).toBe(200)
    const run = await res.json()
    expect(['running', 'done', 'error']).toContain(run.status)
    expect(run.params.bases).toEqual(expect.arrayContaining(['YVR', 'YYZ']))
    expect(run.params.ranks).toEqual(expect.arrayContaining(['CA', 'FO']))
  })
})
