import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/index.js', () => ({
  env: { LIVE_SCHEMA: 'f8_dev_live' },
}))

import {
  appendNotification,
  listForCrew,
  markRead,
  type CrewNotifyServiceOptions,
} from '../crew-notify-service.js'

type MockRow = Record<string, unknown>

const NOW = new Date('2026-09-11T12:00:00.000Z')

const row = (overrides: MockRow = {}): MockRow => ({
  seq: 7,
  airline: 'F8',
  crew_id: '113',
  notif_id: 'n-1',
  notif_type: 'roster_change',
  created_utc: '2026-09-11T10:00:00.000Z',
  title: 'Roster updated',
  body: 'F8123 was assigned to you.',
  status: 'unread',
  read_utc: null,
  related_pairing_id: '12345',
  related_flight_id: null,
  related_duty_id: null,
  payload: {},
  ...overrides,
})

/** Queue-based fake pool: each query pops the next canned { rows } result. */
const createPool = (results: Array<{ rows: MockRow[] }>) => {
  const calls: Array<{ text: string; values?: unknown[] }> = []
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    calls.push({ text, values })
    return results.shift() ?? { rows: [] }
  })
  return { query, calls }
}

const options = (pool: ReturnType<typeof createPool>): CrewNotifyServiceOptions => ({
  pgPool: pool as unknown as CrewNotifyServiceOptions['pgPool'],
  liveSchema: 'f8_dev_live',
  now: NOW,
})

describe('listForCrew', () => {
  it('returns rows in ascending seq order with the max seq as the cursor', async () => {
    const pool = createPool([
      { rows: [row({ seq: 9, notif_id: 'n-9' }), row({ seq: 8, notif_id: 'n-8' })] },
    ])

    const feed = await listForCrew(options(pool), { airline: 'F8', crewId: ' 113 ', since: 7 })

    expect(feed.cursor).toBe(9)
    expect(feed.notifications.map((n) => n.seq)).toEqual([8, 9])
    expect(feed.notifications[0]).toMatchObject({
      notifId: 'n-8',
      crewId: '113',
      type: 'roster_change',
      status: 'unread',
      readUtc: null,
      discretionId: null,
    })
    expect(feed.openDiscretions).toEqual([])
  })

  it('scopes the query by airline and crew and bounds the page', async () => {
    const pool = createPool([{ rows: [] }])

    await listForCrew(options(pool), { airline: 'ET', crewId: '113', since: 0 })

    const [call] = pool.calls
    expect(call!.text).toContain('from "f8_dev_live".crew_notification')
    expect(call!.text).toContain('airline = $1')
    expect(call!.text).toContain('crew_id = $2')
    expect(call!.text).toContain('order by seq desc')
    expect(call!.values).toEqual(['ET', '113', 0, 200])
  })

  it('keeps the incoming cursor when there is nothing new', async () => {
    const pool = createPool([{ rows: [] }])

    const feed = await listForCrew(options(pool), { airline: 'F8', crewId: '113', since: 42 })

    expect(feed.cursor).toBe(42)
    expect(feed.notifications).toEqual([])
  })

  it('treats a missing cursor as the start of history', async () => {
    const pool = createPool([{ rows: [row()] }])

    await listForCrew(options(pool), { airline: 'F8', crewId: '113' })

    expect(pool.calls[0]!.values).toEqual(['F8', '113', 0, 200])
  })
})

describe('markRead', () => {
  it('reports success when the crew owns the notification', async () => {
    const pool = createPool([{ rows: [{ notif_id: 'n-1' }] }])

    await expect(markRead(options(pool), { airline: 'F8', crewId: '113', notifId: 'n-1' }))
      .resolves.toBe(true)

    expect(pool.calls[0]!.text).toContain('airline = $1')
    expect(pool.calls[0]!.values).toEqual(['F8', '113', 'n-1', NOW.toISOString()])
  })

  it('reports failure for a notification the crew cannot see', async () => {
    const pool = createPool([{ rows: [] }])

    await expect(markRead(options(pool), { airline: 'F8', crewId: '113', notifId: 'n-999' }))
      .resolves.toBe(false)
  })
})

describe('appendNotification', () => {
  it('inserts a notification and returns the stored row', async () => {
    const pool = createPool([{ rows: [row()] }])

    const stored = await appendNotification(options(pool), {
      airline: 'F8',
      crewId: '113',
      notifId: 'n-1',
      type: 'roster_change',
      title: 'Roster updated',
      body: 'F8123 was assigned to you.',
      relatedPairingId: '12345',
    })

    expect(stored.notifId).toBe('n-1')
    expect(pool.calls[0]!.text).toContain('on conflict (notif_id) do nothing')
    expect(pool.calls[0]!.values).toContain('F8')
    expect(pool.calls[0]!.values).toContain('n-1')
    // The select list must read the payload back, or the crew app can never
    // render a roster change's before/after sides.
    expect(pool.calls[0]!.text).toContain('payload')
    expect(stored.payload).toEqual({})
  })

  it('returns the structured payload a roster change carries', async () => {
    const payload = {
      kind: 'absence',
      absenceId: 3,
      before: [{ pairingId: 151529, date: '2026-09-11', legs: [] }],
      after: [{ date: '2026-09-11', assignment: 'ILL', label: 'Sick leave', base: 'ADD' }],
    }
    const pool = createPool([{ rows: [row({ payload })] }])

    const stored = await listForCrew(options(pool), { airline: 'F8', crewId: '113' })

    expect(stored.notifications[0]!.payload).toEqual(payload)
  })

  it('normalises a missing or malformed payload column to an empty object', async () => {
    const pool = createPool([
      { rows: [row({ payload: null }), row({ notif_id: 'n-2', seq: 8, payload: ['nope'] })] },
    ])

    const feed = await listForCrew(options(pool), { airline: 'F8', crewId: '113' })

    // Older rows and any non-object value must still satisfy the app contract.
    expect(feed.notifications.map((n) => n.payload)).toEqual([{}, {}])
  })

  it('returns the existing row when the idempotency key was already stored', async () => {
    const pool = createPool([{ rows: [] }, { rows: [row()] }])

    const stored = await appendNotification(options(pool), {
      airline: 'F8',
      crewId: '113',
      notifId: 'n-1',
      type: 'roster_change',
      title: 'Roster updated',
    })

    expect(stored.notifId).toBe('n-1')
    expect(pool.calls).toHaveLength(2)
    expect(pool.calls[1]!.text).toContain('where notif_id = $1')
  })
})
