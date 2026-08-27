// Real-UI end-to-end (§Simulate-User): a user asks R'Bot in the gantt chat to run
// a crew-bid simulation; R'Bot fires create_crew_bids and replies with a live-stream
// watch link; opening that link shows real frames of the headed run streaming.
//
// Drives the ACTUAL chat UI (no API faking of the user action). The headed crew-bids
// browser is launched by ai-server on the ai-server host; this test proves its frames
// reach the watch link. Requires gantt (:5173), live-server (:3000), ai-server (:3005
// with LLM keys) up. The run it triggers genuinely places YVR-CA bids in the portal.

import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const AI_ORIGIN = process.env.AI_SERVER_URL ?? 'http://127.0.0.1:3005'

test("R'Bot crew-bids reply carries a live watch link that streams the headed run", async ({ page, request, context }) => {
  test.setTimeout(180_000)

  // 1. Real user: log into the gantt and open R'Bot.
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'commit' })
  await page.getByTestId('ai-chat-toggle').click()
  await expect(page.getByTestId('ai-chat-panel')).toBeVisible()

  // 2. Ask for a crew-bid sim with all slots filled so R'Bot fires the tool.
  await page.getByTestId('ai-chat-input').fill(
    'Run a crew bid simulation for base YVR, rank CA, for the period 2026-06-01 to 2026-06-30.',
  )
  await page.getByTestId('ai-chat-send').click()

  // 3. R'Bot replies (LLM + slot-fill) with a watch link in the chat thread.
  const thread = page.getByTestId('ai-chat-thread')
  await expect(thread).toContainText('Watch live:', { timeout: 60_000 })
  const reply = await thread.innerText()
  const match = reply.match(/\/altair\/ai\/live\/streams\/[a-z0-9]+\/watch\?token=[\w-]+/)
  expect(match, `no watch URL in R'Bot reply: ${reply}`).toBeTruthy()

  // 4. Open R'Bot's link. (Locally we resolve against the ai-server origin so the
  //    viewer's same-origin stream WS connects directly — no vite WS proxy needed.)
  const watchUrl = `${AI_ORIGIN}${match![0].replace('/altair/ai', '/ai')}`
  const viewer = await context.newPage()
  await viewer.goto(watchUrl)

  // 5. The headed crew-bids browser (spawned by ai-server) streams real frames to
  //    the viewer — proof the whole R'Bot → relay → viewer path works end to end.
  await expect
    .poll(() => viewer.evaluate(() => (window as { __liveFrames?: number }).__liveFrames ?? 0), {
      timeout: 120_000,
      message: 'viewer never received frames from the headed crew-bids run',
    })
    .toBeGreaterThan(0)

  await expect(viewer.getByTestId('live-status')).toContainText('live')
  await expect(viewer.getByTestId('live-kind')).toContainText('crewbids')
})
