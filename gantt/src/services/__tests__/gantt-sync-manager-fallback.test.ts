import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fallback poller: when the browser WebSocket cannot stay open (a proxy rejects
 * the upgrade, the network drops the socket), the GanttSyncManager periodically
 * replays missed events over HTTP so panes still update. These tests pin that
 * it (1) fills the gap when the socket is down, (2) is a strict no-op while the
 * socket is healthy, and (3) forwards the Bearer token so /api/events accepts it.
 */

let wsMessageHandler: ((msg: Record<string, unknown>) => void) | null = null
const isConnectedMock = vi.fn<() => boolean>(() => false)

vi.mock('@/services/ws', () => ({
  wsClient: {
    onMessage: (handler: (msg: Record<string, unknown>) => void) => {
      wsMessageHandler = handler
      return () => {
        wsMessageHandler = null
      }
    },
    isConnected: () => isConnectedMock(),
  },
}))

vi.mock('@/services/api', () => ({
  api: { defaults: { headers: { common: { Authorization: 'Bearer test-token' } } } },
}))

const FALLBACK_INTERVAL_MS = 15_000

const flushMicrotasks = async (): Promise<void> => {
  // The fallback tick is async (fetch → dispatch); let its promise chain settle.
  await Promise.resolve()
  await Promise.resolve()
}

describe('ganttSyncManager fallback poller', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    wsMessageHandler = null
    isConnectedMock.mockReturnValue(false)
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: [{ type: 'roster-updated', eventId: 42, crewIds: ['7'] }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('replays missed events over HTTP when the socket is down, forwarding the Bearer token', async () => {
    const { ganttSyncManager } = await import('../gantt-sync-manager')
    const received: Array<Record<string, unknown>> = []
    ganttSyncManager.onEvent((msg) => received.push(msg))

    ganttSyncManager.init('f8')
    ganttSyncManager.onSnapshotLoaded() // → live mode
    isConnectedMock.mockReturnValue(false)

    await vi.advanceTimersByTimeAsync(FALLBACK_INTERVAL_MS)
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/events?after=0&airline=f8')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    expect(received).toEqual([{ type: 'roster-updated', eventId: 42, crewIds: ['7'] }])

    ganttSyncManager.destroy()
  })

  it('is a strict no-op while the socket is healthy', async () => {
    const { ganttSyncManager } = await import('../gantt-sync-manager')
    ganttSyncManager.init('f8')
    ganttSyncManager.onSnapshotLoaded()
    isConnectedMock.mockReturnValue(true) // socket healthy

    await vi.advanceTimersByTimeAsync(FALLBACK_INTERVAL_MS * 3)
    await flushMicrotasks()

    expect(fetchMock).not.toHaveBeenCalled()
    ganttSyncManager.destroy()
  })

  it('stops polling after destroy()', async () => {
    const { ganttSyncManager } = await import('../gantt-sync-manager')
    ganttSyncManager.init('f8')
    ganttSyncManager.onSnapshotLoaded()
    isConnectedMock.mockReturnValue(false)
    ganttSyncManager.destroy()

    await vi.advanceTimersByTimeAsync(FALLBACK_INTERVAL_MS * 2)
    await flushMicrotasks()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
