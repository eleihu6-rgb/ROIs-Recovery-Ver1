import { test, expect } from '@playwright/test'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

/**
 * R'Bot "remove pre-assignment (PA) for solver" (Live-1305/1306).
 *
 * R'Bot is the AI chat embedded in the gantt; its prepare_pa_removal tool runs the
 * read-only de-assignment analysis and marks memo note icons on the board.
 *
 * Live-1305 — the chat endpoint understands the phrase and emits the action.
 * Live-1306 — full UI: typing the phrase to R'Bot writes the plan and renders icons.
 *
 * The LLM is non-deterministic, so waits are generous and assertions check the real
 * action / real rendered badges (§No-Illusion), never mere visibility.
 */
const AI_URL = process.env.AI_SERVER_URL ?? 'http://localhost:3005'
const FROM = '2026-06-01T00:00:00Z'
const TO = '2026-07-01T00:00:00Z'
const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } })

/** Soft-delete every visible memo for a crew so a test starts from a clean slate. */
const clearMemos = async (request: import('@playwright/test').APIRequestContext, token: string, crewId: string) => {
  const res = await request.get(`${ganttApiUrl}/api/crew-memo?crewIds=${crewId}&from=${FROM}&to=${TO}`, auth(token))
  const rows = (await res.json()).data as Array<{ id: number }>
  for (const r of rows) await request.delete(`${ganttApiUrl}/api/crew-memo/${r.id}`, auth(token))
}

test.describe("R'Bot PA-removal (Live-1305)", () => {
  test('chat endpoint emits prepare_pa_removal for the trigger phrase', async ({ request }) => {
    const res = await request.post(`${AI_URL}/ai/chat`, {
      data: { messages: [{ role: 'user', content: 'remove pre-assignment (PA) for solver for crew 113, June 2026 (2026-06-01 to 2026-06-30)' }] },
      timeout: 60_000,
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const action = (body.actions as Array<{ type: string; crewIds?: string[]; start?: string; end?: string }>)
      .find((a) => a.type === 'prepare_pa_removal')
    expect(action, `R'Bot should emit prepare_pa_removal; got ${JSON.stringify(body.actions)}`).toBeTruthy()
    expect(action?.crewIds).toContain('113')
    expect(action?.start).toBe('2026-06-01')
    expect(action?.end).toBe('2026-06-30')
  })
})

test.describe("R'Bot PA-removal end-to-end (Live-1306)", () => {
  // Drives the real R'Bot chat UI in the gantt; asserts the chat → AiAction → API
  // write actually happened (the memo→icon rendering is covered by crew-memo Live-1303).
  // Deliberately avoids the base/rank filter + full roster load, which depend on the
  // slow remote demo DB / reference data and would make this test flaky.
  test("typing the phrase to R'Bot writes the crew-113 PA-removal plan", async ({ page, request }) => {
    const token = await ganttApiLogin(request)
    await clearMemos(request, token, '113')
    const count113 = async () =>
      ((await (await request.get(`${ganttApiUrl}/api/crew-memo?crewIds=113&from=${FROM}&to=${TO}`, auth(token))).json()).data as unknown[]).length
    expect(await count113(), 'crew 113 should start with no memos').toBe(0)

    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

    // Open R'Bot (the AI chat lives in the app shell — no roster load needed).
    await page.getByTestId('ai-chat-toggle').click()
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible()
    await page.getByTestId('ai-chat-input').fill('remove pre-assignment (PA) for solver for crew 113, June 2026 (2026-06-01 to 2026-06-30)')
    await page.getByTestId('ai-chat-send').click()

    // R'Bot's prepare_pa_removal action is dispatched in-app and calls the live-server
    // API, writing the 27-duty plan (6 flying + 21 days off) as type=3 memos.
    await expect.poll(count113, { timeout: 90_000, message: "R'Bot never wrote the crew-113 plan" })
      .toBe(27)
    // The applied-action confirmation chip is shown in the chat thread.
    await expect(page.getByTestId('ai-chat-applied').first()).toBeVisible({ timeout: 10_000 })
  })
})
