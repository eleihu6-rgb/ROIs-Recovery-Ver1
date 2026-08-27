import { describe, it, expect, vi } from 'vitest'
import { affectedRuleCodes, resolveAffected } from '../../src/services/rule/legality-recheck.js'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
  process.env.LIVE_SCHEMA ||= 'f8'
})

const fakePool = (rows: Record<string, unknown[]>) => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes('from rule_set')) return { rows: rows.worksets }
    if (sql.includes("category = 'RULE'")) return { rows: rows.liveFilter }
    if (sql.includes('.scenario s')) return { rows: rows.scenarios }
    return { rows: [] }
  }),
})

describe('affectedRuleCodes', () => {
  it('includes 1001 when rule 2015 DO Start changes', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ function: '2015' }] })),
    } as never
    await expect(affectedRuleCodes(pool, 2015001)).resolves.toEqual(['7505', '7507', '1001'])
  })
})

describe('resolveAffected', () => {
  it('flags enabled LIVE worksets and splits scenarios into in-window / out-of-window', async () => {
    const pool = fakePool({
      worksets: [{ workset_id: '103' }, { workset_id: '460' }],
      liveFilter: [{ id: '103' }],
      scenarios: [{ id: '6', in_window: true }, { id: '460', in_window: false }],
    }) as never
    const r = await resolveAffected(pool, 8002006)
    expect(r.affectsLiveDefault).toBe(true)
    expect(r.liveWorksetIds).toEqual([103])
    expect(r.inWindowScenarioIds).toEqual([6])
    expect(r.outOfWindowScenarioIds).toEqual([460])
    expect(r.scenarioCount).toBe(2)
  })
  it('returns empty when the rule maps to no workset', async () => {
    const pool = fakePool({ worksets: [], liveFilter: [{ id: '103' }], scenarios: [] }) as never
    const r = await resolveAffected(pool, 9999999)
    expect(r.affectsLiveDefault).toBe(false)
    expect(r.liveWorksetIds).toEqual([])
    expect(r.scenarioCount).toBe(0)
  })
  it('does not treat a non-enabled workset as affecting live (no 103 preference)', async () => {
    const pool = fakePool({
      worksets: [{ workset_id: '103' }],
      liveFilter: [],   // live filter 返回空（103 未启用）
      scenarios: [],
    }) as never
    const r = await resolveAffected(pool, 8002006)
    expect(r.affectsLiveDefault).toBe(false)
    expect(r.liveWorksetIds).toEqual([])
  })
})
