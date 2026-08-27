import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateDutyNodes } from '../../../services/pairing/pairing-duty-node-service.js'

vi.mock('../../../utils/cache.js', () => ({
  invalidate: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

vi.mock('../../../services/pairing/pairing-tafb-service.js', () => ({
  refreshPairingTafb: vi.fn(),
}))

import { invalidate } from '../../../utils/cache.js'
import { refreshPairingTafb } from '../../../services/pairing/pairing-tafb-service.js'

const createChainableDb = () => {
  const chain: any = {}
  const methods = ['select', 'from', 'where', 'update', 'set', 'orderBy', '$dynamic']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = vi.fn((resolve: any) => resolve([]))
  chain.transaction = vi.fn(async (fn: (tx: any) => Promise<void>) => {
    await fn(chain)
  })
  return chain
}

const createFastify = () => {
  const db = createChainableDb()
  return { db, redis: {} as any } as any
}

const T = (iso: string) => new Date(iso)

const seg = (segSeq: number, overrides: Record<string, unknown> = {}) => ({
  id: segSeq,
  segSeq,
  actStrDtUtc: T('2026-03-01T10:00:00Z'),
  actEndDtUtc: T('2026-03-01T12:00:00Z'),
  ...overrides,
})

describe('updateDutyNodes', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  it('writes pickup/brief to first segment and debrief/dropoff to last segment', async () => {
    const firstSeg = seg(1)
    const lastSeg = seg(2, { actEndDtUtc: T('2026-03-01T14:00:00Z') })
    let callIdx = 0
    fastify.db.then.mockImplementation((resolve: any) => {
      callIdx++
      if (callIdx === 1) return resolve([firstSeg, lastSeg]) // fetchSegments
      return resolve([])
    })

    await updateDutyNodes(fastify, 1, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc: '2026-03-01T09:00:00.000Z',
      debriefEndUtc: '2026-03-01T14:30:00.000Z',
      dropoffEndUtc: '2026-03-01T15:00:00.000Z',
      double: undefined,
    }], 'admin')

    // set was called twice: once for first seg, once for last seg
    expect(fastify.db.set).toHaveBeenCalledTimes(2)

    const firstCall = fastify.db.set.mock.calls[0][0]
    expect(firstCall.pickupStartUtc).toEqual(new Date('2026-03-01T08:30:00.000Z'))
    expect(firstCall.pickupEndUtc).toEqual(new Date('2026-03-01T09:00:00.000Z'))
    expect(firstCall.briefStartUtc).toEqual(new Date('2026-03-01T09:00:00.000Z'))

    const lastCall = fastify.db.set.mock.calls[1][0]
    expect(lastCall.debriefEndUtc).toEqual(new Date('2026-03-01T14:30:00.000Z'))
    expect(lastCall.dropoffStartUtc).toEqual(new Date('2026-03-01T14:30:00.000Z'))
    expect(lastCall.dropoffEndUtc).toEqual(new Date('2026-03-01T15:00:00.000Z'))
  })

  it('validates that briefStart <= briefEnd (first segment actStrDtUtc)', async () => {
    const firstSeg = seg(1, { actStrDtUtc: T('2026-03-01T09:00:00Z') })
    fastify.db.then.mockImplementation((resolve: any) => resolve([firstSeg]))

    await expect(
      updateDutyNodes(fastify, 1, [{
        dutySeq: 1,
        pickupStartUtc: '2026-03-01T09:30:00.000Z',
        briefStartUtc: '2026-03-01T09:30:00.000Z',
        debriefEndUtc: '2026-03-01T14:30:00.000Z',
        dropoffEndUtc: '2026-03-01T15:00:00.000Z',
        double: undefined,
      }], 'admin'),
    ).rejects.toThrow('briefStartUtc must be before flight actStrDtUtc')
  })

  it('clears all double_* columns on all segments when double is null', async () => {
    const segs = [seg(1), seg(2), seg(3)]
    let callIdx = 0
    fastify.db.then.mockImplementation((resolve: any) => {
      callIdx++
      if (callIdx === 1) return resolve(segs)
      return resolve([])
    })

    await updateDutyNodes(fastify, 1, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc: '2026-03-01T09:00:00.000Z',
      debriefEndUtc: '2026-03-01T14:30:00.000Z',
      dropoffEndUtc: '2026-03-01T15:00:00.000Z',
      double: null,
    }], 'admin')

    const clearCalls = fastify.db.set.mock.calls.filter((call: any[]) =>
      call[0].doublePickupStartUtc === null,
    )
    expect(clearCalls.length).toBe(3)
  })

  it('invalidates cache after successful write', async () => {
    const segs = [seg(1)]
    fastify.db.then.mockImplementation((resolve: any) => resolve(segs))

    await updateDutyNodes(fastify, 42, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc: '2026-03-01T09:00:00.000Z',
      debriefEndUtc: '2026-03-01T14:30:00.000Z',
      dropoffEndUtc: '2026-03-01T15:00:00.000Z',
      double: undefined,
    }], 'admin')

    expect(invalidate).toHaveBeenCalledWith(
      expect.anything(),
      'pairing:42',
      'pairing-segments:42',
    )
    expect(refreshPairingTafb).toHaveBeenCalledWith(fastify.db, 42, 'admin')
  })

  it('writes double block fields to correct segments', async () => {
    const firstSeg = seg(1)
    const splitSeg = seg(2, { actEndDtUtc: T('2026-03-01T12:00:00Z') })
    const lastSeg = seg(3, { actEndDtUtc: T('2026-03-02T10:00:00Z') })
    let callIdx = 0
    fastify.db.then.mockImplementation((resolve: any) => {
      callIdx++
      if (callIdx === 1) return resolve([firstSeg, splitSeg, lastSeg])
      return resolve([])
    })

    await updateDutyNodes(fastify, 1, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc: '2026-03-01T09:00:00.000Z',
      debriefEndUtc: '2026-03-01T12:30:00.000Z',
      dropoffEndUtc: '2026-03-01T13:00:00.000Z',
      double: {
        restAfterSegSeq: 2,
        pickupStartUtc: '2026-03-02T08:00:00.000Z',
        briefStartUtc: '2026-03-02T08:30:00.000Z',
        debriefEndUtc: '2026-03-02T10:30:00.000Z',
        dropoffEndUtc: '2026-03-02T11:00:00.000Z',
      },
    }], 'admin')

    const splitCall = fastify.db.set.mock.calls.find((call: any[]) =>
      call[0].doublePickupStartUtc != null,
    )
    expect(splitCall[0].doublePickupStartUtc).toEqual(new Date('2026-03-02T08:00:00.000Z'))
    expect(splitCall[0].doubleBriefStartUtc).toEqual(new Date('2026-03-02T08:30:00.000Z'))

    const lastCall = fastify.db.set.mock.calls.find((call: any[]) =>
      call[0].doubleDebriefEndUtc != null,
    )
    expect(lastCall[0].doubleDebriefEndUtc).toEqual(new Date('2026-03-02T10:30:00.000Z'))
    expect(lastCall[0].doubleDropoffEndUtc).toEqual(new Date('2026-03-02T11:00:00.000Z'))
  })
})
