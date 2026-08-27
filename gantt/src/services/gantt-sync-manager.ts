/**
 * GanttSyncManager — handles the "Late Joiner" problem during page initialization.
 *
 * When the Gantt page loads:
 * 1. WebSocket connects and server sends { type: 'connected', lastEventId: N }
 * 2. Manager enters BUFFERING mode and records anchorEventId = N
 * 3. WS messages arrive in the meantime and are buffered
 * 4. HTTP snapshot request completes, caller signals via onSnapshotLoaded()
 * 5. Manager drains buffered messages (eventId > anchorEventId) and switches to LIVE
 * 6. Future WS messages are dispatched immediately
 *
 * On reconnect:
 * 1. WS reconnects, server sends { type: 'connected', lastEventId: M }
 * 2. If M > lastProcessedEventId, fetch and replay missed events
 * 3. Switch to LIVE mode
 */

import { LIVE_API_BASE } from '@/config/api-paths'
import { wsClient } from '@/services/ws'

type SyncMode = 'idle' | 'buffering' | 'live'

type EventMessage = {
  type: string
  eventId?: number
  [key: string]: unknown
}

type SyncMessageHandler = (msg: EventMessage) => void

class GanttSyncManager {
  private mode: SyncMode = 'idle'
  private anchorEventId = 0
  private lastProcessedEventId = 0
  private buffer: EventMessage[] = []
  private handlers = new Set<SyncMessageHandler>()
  private airline = ''
  private unsubscribeWs: (() => void) | null = null

  /**
   * Initialize the manager. Call once on app startup after wsClient.connect().
   * Registers itself as a WS message handler to intercept 'connected' handshake
   * and buffer all messages until onSnapshotLoaded() is called.
   */
  init(airline: string): void {
    this.airline = airline
    if (this.unsubscribeWs) this.unsubscribeWs()

    this.unsubscribeWs = wsClient.onMessage((raw) => {
      this._handleWsMessage(raw as EventMessage)
    })
    this.mode = 'buffering'
  }

  /**
   * Signal that the HTTP snapshot has been applied to the UI.
   * Drains the buffer, processes buffered messages (in order, by eventId),
   * and switches to LIVE mode for future WS messages.
   */
  onSnapshotLoaded(): void {
    if (this.mode !== 'buffering') return

    const toProcess = this.buffer
      .filter((msg) => (msg.eventId ?? 0) > this.anchorEventId)
      .sort((a, b) => (a.eventId ?? 0) - (b.eventId ?? 0))

    this.buffer = []
    this.mode = 'live'

    for (const msg of toProcess) {
      this._dispatch(msg)
    }
  }

  /**
   * Register a handler for sync events (post-dedup, post-buffer drain).
   * Returns unsubscribe function.
   */
  onEvent(handler: SyncMessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /**
   * Clean up on page unload or logout.
   */
  destroy(): void {
    if (this.unsubscribeWs) {
      this.unsubscribeWs()
      this.unsubscribeWs = null
    }
    this.handlers.clear()
    this.buffer = []
    this.mode = 'idle'
  }

  private _handleWsMessage(msg: EventMessage): void {
    if (msg.type === 'connected') {
      const connectedMsg = msg as { type: 'connected'; lastEventId: number }
      const serverLastEventId = connectedMsg.lastEventId

      if (this.lastProcessedEventId > 0 && serverLastEventId > this.lastProcessedEventId) {
        void this._catchup(this.lastProcessedEventId)
      } else {
        this.anchorEventId = serverLastEventId
        this.mode = 'buffering'
        this.buffer = []
      }
      return
    }

    if (this.mode === 'buffering') {
      this.buffer.push(msg)
    } else if (this.mode === 'live') {
      this._dispatch(msg)
    }
  }

  private _dispatch(msg: EventMessage): void {
    if (msg.eventId !== undefined) {
      this.lastProcessedEventId = Math.max(this.lastProcessedEventId, msg.eventId)
    }
    for (const handler of this.handlers) {
      handler(msg)
    }
  }

  private async _catchup(afterEventId: number): Promise<void> {
    try {
      const url = `${LIVE_API_BASE}/api/events?after=${afterEventId}&airline=${this.airline}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) {
        this.mode = 'live'
        return
      }

      type ApiResponse = {
        code: number
        data: unknown[]
      }
      const body = (await res.json()) as ApiResponse
      const events = body.data ?? []

      this.mode = 'live'
      for (const event of events) {
        const msg = event as EventMessage
        this._dispatch(msg)
      }
    } catch {
      this.mode = 'live'
    }
  }
}

export const ganttSyncManager = new GanttSyncManager()
