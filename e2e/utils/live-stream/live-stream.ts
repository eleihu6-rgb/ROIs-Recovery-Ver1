// Attach a live CDP screencast of a Playwright BrowserContext to a remote viewer,
// gated entirely by PW_STREAM_URL. With no env var this is a no-op, so plain runs
// (CLI, CI) and existing specs are untouched. Streaming is best-effort: it never
// stalls or fails the run (see frame-sink back-pressure / error swallowing).
//
// Env:
//   PW_STREAM_URL       ws:// ingest endpoint (set by ai-server for streamed runs)
//   PW_STREAM_KIND      label, e.g. "crewbids"
//   PW_STREAM_TITLE     human title, e.g. "YYC · CA/FO · Jun 2026"
//   PW_STREAM_MAXWIDTH  screencast max width (default 1280)
//   PW_STREAM_QUALITY   jpeg quality 0-100 (default 55)
//   PW_STREAM_NTH       capture every Nth frame (default 2)

import type { BrowserContext, Page } from '@playwright/test'
import { createFrameSink, type LiveStreamSink } from './frame-sink'

const num = (v: string | undefined, dflt: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : dflt
}

const attachPage = async (page: Page, sink: LiveStreamSink): Promise<void> => {
  try {
    const client = await page.context().newCDPSession(page)
    client.on('Page.screencastFrame', (e: { data: string; sessionId: number }) => {
      // Ack first or Chromium stops sending frames; ack failures are harmless.
      client.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {})
      sink.frame(e.data)
    })
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return
      sink.page({ url: page.url(), title: await page.title().catch(() => '') })
    })
    await client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: num(process.env.PW_STREAM_QUALITY, 55),
      maxWidth: num(process.env.PW_STREAM_MAXWIDTH, 1280),
      maxHeight: num(process.env.PW_STREAM_MAXHEIGHT, 800),
      everyNthFrame: num(process.env.PW_STREAM_NTH, 2),
    })
  } catch {
    // Screencast unsupported / page gone — stay silent, never fail the run.
  }
}

export const attachLiveStream = async (context: BrowserContext): Promise<void> => {
  const url = process.env.PW_STREAM_URL
  if (!url) return // not a streamed run -> no-op

  const sink = createFrameSink({
    url,
    kind: process.env.PW_STREAM_KIND,
    title: process.env.PW_STREAM_TITLE,
  })

  for (const p of context.pages()) await attachPage(p, sink)
  context.on('page', (p) => {
    void attachPage(p, sink)
  })
  context.on('close', () => {
    sink.end()
    sink.close()
  })
}
