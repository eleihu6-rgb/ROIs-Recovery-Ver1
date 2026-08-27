import { describe, expect, it, vi } from 'vitest'
import { DataSaveService } from '../../../services/data/data-save-service.js'

vi.mock('../../../services/data/data-validation-service.js', () => ({
  dataValidationService: { validate: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({
    createdBy: u,
    createdAt: new Date('2026-07-29T00:00:00Z'),
    updatedBy: u,
    updatedAt: new Date('2026-07-29T00:00:00Z'),
  })),
  auditUpdate: vi.fn((u: string) => ({
    updatedBy: u,
    updatedAt: new Date('2026-07-29T00:00:00Z'),
  })),
}))

vi.mock('../../../utils/cache.js', () => ({
  invalidatePattern: vi.fn(),
}))

const createFastify = () => {
  const updateSet = vi.fn().mockReturnThis()
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateBuilder = { set: updateSet, where: updateWhere }
  const tx = { update: vi.fn(() => updateBuilder) }
  const fastify = {
    db: { transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx)) },
    redis: {},
  } as any
  return { fastify, updateSet }
}

describe('DataSaveService crew partial updates', () => {
  it('updates crew_base expDt without requiring crewId', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'crew-base-cell',
      entityId: 'crew_base',
      action: 'update',
      rowId: 17,
      after: { expDt: '2026-12-31' },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      expDt: expect.any(Date),
    }))
  })

  it('updates crew_rank rank without requiring crewId', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'crew-rank-cell',
      entityId: 'crew_rank',
      action: 'update',
      rowId: 18,
      after: { rank: 'CA' },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      rank: 'CA',
    }))
  })
})
