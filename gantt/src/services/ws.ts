/**
 * WebSocket client singleton for real-time lock status updates.
 * Connects to live-server /ws/locks, auto-reconnects on disconnect.
 */

import { LIVE_API_BASE, LIVE_WS_PATH } from '@/config/api-paths'

type MessageHandler = (msg: Record<string, unknown>) => void

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
const MAX_RECONNECT_DELAY = 30000
const handlers = new Set<MessageHandler>()

const getWsUrl = (): string => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Same origin → goes through nginx → proxied to live-server
  return `${proto}//${window.location.host}${LIVE_API_BASE}${LIVE_WS_PATH}`
}

export const wsClient = {
  /** Connect and subscribe to a schema channel */
  connect(schema: string, userId: string, token: string): void {
    if (ws && ws.readyState === WebSocket.OPEN) return

    ws = new WebSocket(getWsUrl())

    ws.onopen = () => {
      reconnectDelay = 1000
      ws?.send(JSON.stringify({ type: 'authenticate', token }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg?.type === 'authenticated') {
          ws?.send(JSON.stringify({ type: 'subscribe' }))
        }
        for (const handler of handlers) {
          handler(msg)
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = (event) => {
      ws = null
      if (event.code === 1008) return
      scheduleReconnect(schema, userId, token)
    }

    ws.onerror = () => {
      ws?.close()
    }
  },

  /** Disconnect and stop reconnecting */
  disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.onclose = null // prevent auto-reconnect
      ws.close()
      ws = null
    }
  },

  /** Register a message handler */
  onMessage(handler: MessageHandler): () => void {
    handlers.add(handler)
    return () => handlers.delete(handler)
  },

  /** Send a message to the server (no-op if not connected) */
  send(msg: Record<string, unknown>): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  },

  /** Check if connected */
  isConnected(): boolean {
    return ws !== null && ws.readyState === WebSocket.OPEN
  },
}

const scheduleReconnect = (schema: string, userId: string, token: string): void => {
  reconnectTimer = setTimeout(() => {
    wsClient.connect(schema, userId, token)
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }, reconnectDelay)
}
