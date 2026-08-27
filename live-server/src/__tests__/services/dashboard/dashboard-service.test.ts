import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dashboardService } from '../../../services/dashboard/dashboard-service.js'

const makeFastify = (responses: {
  flightsToday?: unknown[]
  activeCrew?: unknown[]
  crewByRank?: unknown[]
  flightsByDay?: unknown[]
}) => {
  let callIndex = 0
  const responseOrder = [
    responses.flightsToday ?? [{ count: '0' }],
    responses.activeCrew ?? [{ count: '0' }],
    responses.crewByRank ?? [],
    responses.flightsByDay ?? [],
  ]
  return {
    db: {
      execute: vi.fn().mockImplementation(() => ({
        rows: responseOrder[callIndex++] ?? [],
      })),
    },
  } as any
}

describe('dashboardService.overview', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('converts string count fields to numbers', async () => {
    const fastify = makeFastify({
      flightsToday: [{ count: '42' }],
      activeCrew: [{ count: '1847' }],
    })
    const result = await dashboardService.overview(fastify)
    expect(result.flightsToday).toBe(42)
    expect(result.totalActiveCrew).toBe(1847)
  })

  it('violations and pendingApprovals are always null', async () => {
    const fastify = makeFastify({})
    const result = await dashboardService.overview(fastify)
    expect(result.violations).toBeNull()
    expect(result.pendingApprovals).toBeNull()
  })

  it('maps crewByRank with rank and count', async () => {
    const fastify = makeFastify({
      crewByRank: [
        { rank: 'CPT', display_order: 1, count: '421' },
        { rank: 'FO',  display_order: 2, count: '512' },
      ],
    })
    const result = await dashboardService.overview(fastify)
    expect(result.crewByRank).toEqual([
      { rank: 'CPT', count: 421 },
      { rank: 'FO',  count: 512 },
    ])
  })

  it('maps flightsByDay with date and count', async () => {
    const fastify = makeFastify({
      flightsByDay: [
        { date: '2026-04-01', count: '48' },
        { date: '2026-04-14', count: '52' },
      ],
    })
    const result = await dashboardService.overview(fastify)
    expect(result.flightsByDay).toEqual([
      { date: '2026-04-01', count: 48 },
      { date: '2026-04-14', count: 52 },
    ])
  })

  it('returns empty arrays when no data', async () => {
    const fastify = makeFastify({})
    const result = await dashboardService.overview(fastify)
    expect(result.crewByRank).toEqual([])
    expect(result.flightsByDay).toEqual([])
  })
})
