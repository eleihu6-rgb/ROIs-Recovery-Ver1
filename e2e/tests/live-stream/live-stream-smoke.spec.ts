// End-to-end proof of the Playwright Live Stream subsystem (the completion gate):
// a REAL browser produces CDP screencast frames -> the REAL ai-server relay -> the
// REAL viewer page renders them. Asserts actual frames painted (not just "visible").
//
// Requires ai-server (:3005) running with the /ai/live routes. No portal/gantt auth.

import { test, expect, request as pwRequest } from '@playwright/test'
import { attachLiveStream } from '../../utils/live-stream/live-stream'

const AI = process.env.AI_SERVER_URL ?? 'http://127.0.0.1:3005'
const wsBase = AI.replace(/^http/, 'ws')

// A self-contained page that repaints continuously so the screencast keeps
// emitting fresh, non-blank frames (no external dependency).
const CHANGING_PAGE =
  '<body style="margin:0">' +
  '<div id="b" style="width:100vw;height:100vh"></div>' +
  '<script>var c=["#e11","#1a1","#11e","#ee1"],i=0;' +
  'setInterval(function(){document.getElementById("b").style.background=c[i++%4];},80);</script>' +
  '</body>'

test('live stream: producer frames render on the viewer watch page', async ({ browser }) => {
  // 1. Register a stream via the relay (any producer may do this).
  const api = await pwRequest.newContext()
  const reg = await api.post(`${AI}/ai/live/streams`, { data: { kind: 'smoke', title: 'smoke-test' } })
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy()
  const { id, token } = await reg.json()
  expect(id).toBeTruthy()
  expect(token).toBeTruthy()

  // 2. Producer: a real browser context streamed via the producer lib.
  process.env.PW_STREAM_URL = `${wsBase}/ai/live/streams/${id}/ingest`
  process.env.PW_STREAM_KIND = 'smoke'
  process.env.PW_STREAM_TITLE = 'smoke-test'
  process.env.PW_STREAM_NTH = '1' // capture every frame for a fast, reliable signal
  const producer = await browser.newContext()
  await attachLiveStream(producer)
  const producerPage = await producer.newPage()
  await producerPage.setContent(CHANGING_PAGE)

  // 3. Viewer: open the REAL watch page and assert frames actually render.
  const viewer = await browser.newContext()
  const viewerPage = await viewer.newPage()
  await viewerPage.goto(`${AI}/ai/live/streams/${id}/watch?token=${token}`)

  // The viewer increments window.__liveFrames each time a frame paints onto the
  // canvas — proof the full producer→relay→viewer path delivered real frames.
  await expect
    .poll(() => viewerPage.evaluate(() => (window as { __liveFrames?: number }).__liveFrames ?? 0), {
      timeout: 30_000,
      message: 'viewer never rendered any live frames',
    })
    .toBeGreaterThan(2)

  // And the status bar reflects a live stream with the right title.
  await expect(viewerPage.getByTestId('live-status')).toContainText('live')
  await expect(viewerPage.getByTestId('live-title')).toContainText('smoke-test')
  await expect(viewerPage.getByTestId('live-frames')).toContainText(/frames: [1-9]/)

  await producer.close()
  await viewer.close()
  await api.dispose()
})
