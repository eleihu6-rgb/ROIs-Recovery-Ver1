import { describe, expect, it, vi } from 'vitest'
import { attachCrewHistories, type CrewHistoryRow } from '../scenario-crew-history.js'

// Dummy env (no DB connection in this test) so the eager config/env parse never runs.
vi.mock('../../../config/index.js', () => ({
  env: { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/rois', LIVE_SCHEMA: 'f8', SCENARIO_SCHEMA: 'scenario' },
}))
vi.mock('../../../config/env.js', () => ({
  env: { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/rois', LIVE_SCHEMA: 'f8', SCENARIO_SCHEMA: 'scenario' },
}))

// ranks query fires first (Promise.all order), then bases.
const mockExecute = vi.fn(async () => {
  const i = mockExecute.mock.calls.length - 1
  if (i === 0) return { rows: [
    { crew_id: 'F80001', rank: 'FO', eff_dt: new Date('2026-07-01T00:00:00Z'), exp_dt: new Date('2026-08-15T00:00:00Z') },
    { crew_id: 'F80001', rank: 'CA', eff_dt: new Date('2026-08-16T00:00:00Z'), exp_dt: null },
  ] }
  return { rows: [
    { crew_id: 'F80001', base: 'YOW', eff_dt: new Date('2026-07-01T00:00:00Z'), exp_dt: null },
  ] }
})
const db = { execute: mockExecute } as never

const crew: Array<{
  crewId: string
  base: string
  division: string
  rank: string
  seniorityNum: string | null
  crewName: string | null
  ranks?: CrewHistoryRow[]
  bases?: CrewHistoryRow[]
}> = [
  { crewId: 'F80001', base: '', division: 'P', rank: 'FO', seniorityNum: null, crewName: null },
]

describe('attachCrewHistories', () => {
  it('查询按场景时间窗过滤并填充 ranks/bases（eff_dt/exp_dt → ISO）', async () => {
    await attachCrewHistories(db, crew, new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'))
    expect(crew[0].ranks).toHaveLength(2)
    expect(crew[0].ranks?.[0]).toMatchObject({ crewId: 'F80001', rank: 'FO' })
    expect(crew[0].ranks?.[0].effDt).toBe('2026-07-01T00:00:00.000Z')
    expect(crew[0].ranks?.[1].expDt).toBeNull()
    expect(crew[0].bases?.[0].base).toBe('YOW')
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })

  it('空机组列表直接返回，不发查询', async () => {
    mockExecute.mockClear()
    await attachCrewHistories(db, [], new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'))
    expect(mockExecute).not.toHaveBeenCalled()
  })
})
