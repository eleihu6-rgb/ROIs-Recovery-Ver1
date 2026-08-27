import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

import { mandayMutationWindow } from './manday-mutation-window.js'

describe('mandayMutationWindow', () => {
  it('uses crew-base local dates for the recompute window', async () => {
    const fastify = {
      pgPool: {
        query: vi.fn(async () => ({
          rows: [
            { crew_id: '386', zone_id: 'America/Los_Angeles' },
            { crew_id: '390', zone_id: 'UTC' },
          ],
        })),
      },
    } as never

    const window = await mandayMutationWindow(
      fastify,
      ['386', '390'],
      [new Date('2026-07-01T03:00:00Z'), new Date('2026-07-31T19:00:00Z')],
      { backDays: 2, forwardDays: 10 },
    )

    expect(window).toEqual({ startDt: '2026-06-28', endDt: '2026-08-10' })
  })

  it('uses the CrewBase effective at each mutation timestamp', async () => {
    const fastify = {
      pgPool: {
        query: vi.fn(async () => ({
          rows: [
            { crew_id: '386', zone_id: 'America/Toronto', eff_dt: '2026-08-01T00:00:00Z', exp_dt: null, is_prime_base: 1 },
            { crew_id: '386', zone_id: 'America/Vancouver', eff_dt: '2026-01-01T00:00:00Z', exp_dt: '2026-08-01T00:00:00Z', is_prime_base: 1 },
          ],
        })),
      },
    } as never

    const window = await mandayMutationWindow(
      fastify,
      ['386'],
      [new Date('2026-08-01T00:30:00Z')],
      { backDays: 2, forwardDays: 10 },
    )

    // New Toronto base is effective at the instant: 00:30Z is July 31 locally.
    expect(window).toEqual({ startDt: '2026-07-29', endDt: '2026-08-10' })
  })
})
