import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pairingBuildService } from '../../../services/pairing/pairing-build-service.js'
import { pairingSegment } from '../../../models/pairing/pairing-segment.js'
import { pairingComposition } from '../../../models/pairing/pairing-composition.js'
import type { RoundtripScope } from '../../../services/pairing/roundtrip-chooser.js'
import { invalidate } from '../../../utils/cache.js'

vi.mock('../../../utils/cache.js', () => ({ invalidate: vi.fn(), invalidatePattern: vi.fn() }))
vi.mock('../../../services/pairing/pairing-tafb-service.js', () => ({ refreshPairingTafb: vi.fn() }))
vi.mock('../../../services/pairing/pairing-fdp.js', () => ({ computeDutyFdpMin: vi.fn(() => 360) }))
const scope: RoundtripScope = { startDate: '2026-09-20', endDate: '2026-09-23', ganttStart: '2026-09-01', ganttEnd: '2026-09-30', timezone: 'UTC', base: 'ADD', fleets: ['738'], composition: [{ rank: 'CA', plan: 3 }], rules: { checkinMin: 180, debriefMin: 30, restMin: 800, maxDutyBlockMin: 480, singleLegExemption: true } }
const flights = [
  { id: 1, airline: 'ET', fleet: '738', fltNum: 'ET1', depArp: 'ADD', arvArp: 'DIR', schDepDtUtc: new Date('2026-09-20T06:00Z'), schArvDtUtc: new Date('2026-09-20T07:00Z'), blkMin: 60, isDeleted: 0 },
  { id: 2, airline: 'ET', fleet: '738', fltNum: 'ET2', depArp: 'DIR', arvArp: 'ADD', schDepDtUtc: new Date('2026-09-20T08:00Z'), schArvDtUtc: new Date('2026-09-20T09:00Z'), blkMin: 60, isDeleted: 0 },
].map(f => ({ ...f, actDepDtUtc: f.schDepDtUtc, actArvDtUtc: f.schArvDtUtc }))
const fixture = (covered: boolean | 'C' = false, status?: { flightFlag?: string; fltSts?: string }) => {
  const events: string[] = []
  const inserts: { table: unknown; values: unknown }[] = []
  let selects = 0
  const tx = {
    select: () => {
      const index = selects++
      let pilotOnly = false
      const chain = { from: () => chain, where: (condition: SQL) => { const query = new PgDialect().sqlToQuery(condition); pilotOnly = query.sql.includes('"division"') && query.params.includes('P'); return chain }, innerJoin: () => chain, orderBy: () => chain, for: () => { events.push('locked'); return Promise.resolve(flights.map(f => ({ ...f, ...status }))) }, then: (resolve: (rows: unknown[]) => unknown) => { events.push('coverage'); return Promise.resolve(resolve(index === 0 ? flights : covered && !(covered === 'C' && pilotOnly) ? [{ fltNum: 'ET1' }] : [])) } }
      return chain
    },
    insert: (table: unknown) => ({ values: (values: unknown) => { inserts.push({ table, values }); return { returning: async () => [{ id: 99 }] } } }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }
  const fastify = { db: { transaction: async (callback: (db: typeof tx) => Promise<unknown>) => { const result = await callback(tx); events.push('committed'); return result } }, redis: {} } as unknown as FastifyInstance
  return { fastify, events, inserts }
}
describe('strict build persistence', () => {
  beforeEach(() => vi.clearAllMocks())
  it('persists selected composition and timing after locking and checking coverage', async () => {
    const f = fixture()
    await pairingBuildService.build(f.fastify, [1, 2], 'test', scope)
    expect(f.events).toEqual(['locked', 'coverage', 'committed'])
    expect(f.inserts.filter(row => row.table === pairingSegment).map(row => row.values)).toEqual(expect.arrayContaining([expect.objectContaining({ briefStartUtc: new Date('2026-09-20T03:00Z'), debriefEndUtc: new Date('2026-09-20T09:30Z'), dutySchRestMin: 800 })]))
    expect(f.inserts.find(row => row.table === pairingComposition)?.values).toEqual([expect.objectContaining({ actingRank: 'CA', plan: 3 })])
    expect(invalidate).toHaveBeenCalled()
  })
  it('rejects covered flights before inserts and does not invalidate on rollback', async () => {
    const f = fixture(true)
    await expect(pairingBuildService.build(f.fastify, [1, 2], 'test', scope)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.events).toEqual(['locked', 'coverage'])
    expect(f.inserts).toHaveLength(0)
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('rejects duplicate exact IDs before inserting', async () => {
    const f = fixture()
    await expect(pairingBuildService.build(f.fastify, [1, 2, 2], 'test', scope)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.inserts).toHaveLength(0)
  })
  it('allows cabin-only coverage for pilot builds but preserves manual global coverage', async () => {
    await expect(pairingBuildService.build(fixture('C').fastify, [1, 2], 'test', scope)).resolves.toMatchObject({ pairingId: 99 })
    await expect(pairingBuildService.build(fixture('C').fastify, [1, 2], 'test')).rejects.toMatchObject({ statusCode: 409 })
  })
  it.each([{ fltSts: 'CX' }, { fltSts: 'cx cancelled' }, { flightFlag: 'X' }, { flightFlag: 'C' }])('rejects cancelled flights under lock: %j', async (status) => {
    const f = fixture(false, status)
    await expect(pairingBuildService.build(f.fastify, [1, 2], 'test', scope)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.inserts).toHaveLength(0)
  })
})
