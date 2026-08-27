import { describe, expect, it, vi } from 'vitest'
import { DataSaveService } from '../../../services/data/data-save-service.js'

vi.mock('../../../services/data/data-validation-service.js', () => ({
  dataValidationService: { validate: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({
    createdBy: u,
    createdAt: new Date('2026-07-22T00:00:00Z'),
    updatedBy: u,
    updatedAt: new Date('2026-07-22T00:00:00Z'),
  })),
  auditUpdate: vi.fn((u: string) => ({
    updatedBy: u,
    updatedAt: new Date('2026-07-22T00:00:00Z'),
  })),
}))

vi.mock('../../../utils/cache.js', () => ({
  invalidatePattern: vi.fn(),
}))

const createFastify = () => {
  const insertValues = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn().mockReturnThis()
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateBuilder = { set: updateSet, where: updateWhere }
  const tx = {
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => updateBuilder),
  }
  const fastify = {
    db: { transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx)) },
    redis: {},
  } as any
  return { fastify, insertValues, updateSet }
}

describe('DataSaveService crew_team', () => {
  it('creates crew_team with a string team code', async () => {
    const { fastify, insertValues } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'crew-team-create',
      entityId: 'crew_team',
      action: 'create',
      after: {
        crewId: '296',
        team: 'EQ737',
        effDt: '2021-08-01T00:00:00Z',
        expDt: '2055-09-16T23:59:59Z',
        isValid: 1,
        remarks: 'Equipment 737',
      },
    } as any], 'admin')

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      crewId: '296',
      team: 'EQ737',
      remarks: 'Equipment 737',
    }))
    expect(insertValues.mock.calls[0][0]).not.toHaveProperty('teamId')
  })

  it('updates crew_team with a string team code', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'crew-team-update',
      entityId: 'crew_team',
      action: 'update',
      rowId: 88,
      after: { crewId: '296', team: 'LCP', remarks: 'Line Check Pilot' },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      team: 'LCP',
      remarks: 'Line Check Pilot',
    }))
    expect(updateSet.mock.calls[0][0]).not.toHaveProperty('teamId')
  })

  it('updates crew_team from a single-cell patch without requiring crewId', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'crew-team-cell',
      entityId: 'crew_team',
      action: 'update',
      rowId: 88,
      after: { remarks: 'Updated Team Name' },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      remarks: 'Updated Team Name',
    }))
  })
})
