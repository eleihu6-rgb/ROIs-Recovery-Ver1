import { describe, expect, it } from 'vitest'
import { resolveAssignmentRank } from '../scenario-assignment-rank'
import type { CrewRankRecord } from '@/types/crew'

const ranks: CrewRankRecord[] = [
  { id: 1, crewId: 'F80001', rank: 'FO', effDt: '2026-07-01T00:00:00Z', expDt: '2026-08-15T00:00:00Z' },
  { id: 2, crewId: 'F80001', rank: 'CA', effDt: '2026-08-16T00:00:00Z', expDt: null },
]
const openSlots = [
  { rank: 'CA', plan: 1, fill: 0 },
  { rank: 'FO', plan: 1, fill: 1 },
]
const rankOrder = new Map([['CA', 1], ['FO', 2]])

describe('resolveAssignmentRank', () => {
  it('任务日期在 FO 生效期 → actingRank=FO（与 Open 槽位匹配，非跨职级）', () => {
    const r = resolveAssignmentRank({ crewRanks: ranks, openSlots, taskDate: new Date('2026-08-01T00:00:00Z'), rankOrder })
    expect(r).toMatchObject({ status: 'ok', actingRank: 'FO', crossRank: false })
  })

  it('无有效 rank → no-valid-rank', () => {
    const r = resolveAssignmentRank({ crewRanks: ranks, openSlots, taskDate: new Date('2026-06-01T00:00:00Z'), rankOrder })
    expect(r.status).toBe('no-valid-rank')
  })

  it('无 Open 槽位 → no-open-position', () => {
    const r = resolveAssignmentRank({ crewRanks: ranks, openSlots: [], taskDate: new Date('2026-08-01T00:00:00Z'), rankOrder })
    expect(r.status).toBe('no-open-position')
  })

  it('无与 Open 槽位匹配的 rank → 跨职级，actingRank 取 open 槽位 display_order 最小者', () => {
    const r = resolveAssignmentRank({
      crewRanks: [
        { id: 1, crewId: 'F80001', rank: 'PU', effDt: '2026-06-01T00:00:00Z', expDt: null },
        { id: 2, crewId: 'F80001', rank: 'FO', effDt: '2026-05-01T00:00:00Z', expDt: null },
      ],
      openSlots: [{ rank: 'CA', plan: 1, fill: 0 }], // 只有 CA 是 Open 槽位
      taskDate: new Date('2026-08-01T00:00:00Z'),
      rankOrder,
    })
    // PU/FO 都不匹配 Open 的 CA → 跨职级；actingRank 应为 open 槽位中 display_order 最小者（CA=1）
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.crossRank).toBe(true)
      expect(r.actingRank).toBe('CA')
    }
  })

  it('多 rank 匹配多个 Open 槽位时按 display_order 最小者', () => {
    const r = resolveAssignmentRank({
      crewRanks: [
        { id: 1, crewId: 'F80001', rank: 'FO', effDt: '2026-06-01T00:00:00Z', expDt: null },
        { id: 2, crewId: 'F80001', rank: 'CA', effDt: '2026-07-01T00:00:00Z', expDt: null },
      ],
      openSlots: [
        { rank: 'CA', plan: 1, fill: 0 },
        { rank: 'FO', plan: 1, fill: 0 },
      ],
      taskDate: new Date('2026-08-01T00:00:00Z'),
      rankOrder, // CA display_order=1 < FO=2
    })
    expect(r).toMatchObject({ status: 'ok', actingRank: 'CA', crossRank: false })
  })
})
