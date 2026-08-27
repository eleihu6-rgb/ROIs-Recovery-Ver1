// A best-effort WebSocket sink for live-stream messages. Pure transport logic,
// isolated from Playwright/CDP so it can be unit-tested with a fake socket.
//
// Contract: streaming MUST NEVER stall or fail the run. Every method is a no-op
// when no URL is configured, swallows errors, and drops frames under back-pressure.

export interface LiveStreamSink {
  meta(info: { kind?: string; title?: string }): void
  page(info: { url?: string; title?: string }): void
  frame(dataBase64: string): void
  end(): void
  close(): void
}

// Minimal shape we rely on from a WebSocket (browser/Node global or a fake).
export interface MinimalSocket {
  send(data: string): void
  close(): void
  bufferedAmount?: number
  addEventListener(type: string, listener: (...args: unknown[]) => void): void
}

export interface FrameSinkOptions {
  url?: string
  kind?: string
  title?: string
  maxBuffer?: number // drop frames when bufferedAmount exceeds this (bytes)
  WebSocketImpl?: new (url: string) => MinimalSocket
}

const NOOP_SINK: LiveStreamSink = {
  meta() {},
  page() {},
  frame() {},
  end() {},
  close() {},
}

export const createFrameSink = (opts: FrameSinkOptions): LiveStreamSink => {
  const url = opts.url
  if (!url) return NOOP_SINK // unconfigured -> completely inert

  const maxBuffer = opts.maxBuffer ?? 4_000_000
  const WS = opts.WebSocketImpl ?? (globalThis as { WebSocket?: new (url: string) => MinimalSocket }).WebSocket
  if (!WS) return NOOP_SINK // no WebSocket available -> stay inert, never throw

  let open = false
  let dead = false
  let socket: MinimalSocket
  try {
    socket = new WS(url)
  } catch {
    return NOOP_SINK
  }

  const sendRaw = (obj: unknown): void => {
    if (!open || dead) return
    try {
      // Back-pressure: if the socket buffer is backed up (slow/no viewer), drop
      // this message rather than queueing — the live view tolerates gaps.
      if (typeof socket.bufferedAmount === 'number' && socket.bufferedAmount > maxBuffer) return
      socket.send(JSON.stringify(obj))
    } catch {
      // best-effort: a failed send must never bubble into the run
    }
  }

  socket.addEventListener('open', () => {
    open = true
    sendRaw({ type: 'meta', kind: opts.kind ?? 'playwright', title: opts.title ?? '' })
  })
  socket.addEventListener('error', () => {
    dead = true
  })
  socket.addEventListener('close', () => {
    open = false
    dead = true
  })

  return {
    meta: (info) => sendRaw({ type: 'meta', kind: info.kind ?? opts.kind ?? 'playwright', title: info.title ?? opts.title ?? '' }),
    page: (info) => sendRaw({ type: 'page', url: info.url, title: info.title }),
    frame: (dataBase64) => sendRaw({ type: 'frame', data: dataBase64 }),
    end: () => sendRaw({ type: 'end' }),
    close: () => {
      try {
        socket.close()
      } catch {
        // ignore
      }
    },
  }
}
