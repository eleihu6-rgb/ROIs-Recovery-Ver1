import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSaveService } from '../../../services/data/data-save-service.js'
import { dataValidationService } from '../../../services/data/data-validation-service.js'

vi.mock('../../../services/data/data-validation-service.js', () => ({
  dataValidationService: { validate: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({
    createdBy: u,
    createdAt: new Date('2026-07-07T00:00:00Z'),
    updatedBy: u,
    updatedAt: new Date('2026-07-07T00:00:00Z'),
  })),
  auditUpdate: vi.fn((u: string) => ({
    updatedBy: u,
    updatedAt: new Date('2026-07-07T00:00:00Z'),
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

describe('DataSaveService assignment isRest', () => {
  beforeEach(() => {
    vi.mocked(dataValidationService.validate).mockResolvedValue([])
  })

  it('persists isRest when creating an assignment', async () => {
    const { fastify, insertValues } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      entityId: 'assignment',
      action: 'create',
      after: {
        assignment: 'TESTOFF',
        description: 'Test Off',
        type: 'O',
        colorHex: 'CCCCCC',
        isRest: 1,
        fixedCreditMin: 240,
      },
    } as any], 'admin')

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      assignment: 'TESTOFF',
      type: 'O',
      isRest: 1,
      fixedCreditMin: 240,
    }))
  })

  it('persists isRest when updating an assignment', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      entityId: 'assignment',
      action: 'update',
      rowId: 42,
      after: { isRest: 0, type: 'W', fixedCreditMin: 180 },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      isRest: 0,
      type: 'W',
      fixedCreditMin: 180,
    }))
  })

  it('persists fixed_credit_min when updating with snake-case payload', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      entityId: 'assignment',
      action: 'update',
      rowId: 43,
      after: { fixed_credit_min: 300 },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      fixedCreditMin: 300,
    }))
  })

  it('does not save when validation rejects a percent ratio above one', async () => {
    vi.mocked(dataValidationService.validate).mockResolvedValueOnce([{
      severity: 'error',
      code: 'invalid_value',
      entityId: 'assignment',
      rowId: 11,
      field: 'btPct',
      message: 'BT % must be between 0 and 1. Use 0.33 for 33%.',
    }])
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    const result = await service.save(fastify, [{
      entityId: 'assignment',
      action: 'update',
      rowId: 11,
      after: { btPct: 33 },
    } as any], 'admin')

    expect(result.committed).toBe(0)
    expect(result.issues[0]?.message).toContain('Use 0.33 for 33%')
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('persists a valid percent ratio value', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      entityId: 'assignment',
      action: 'update',
      rowId: 11,
      after: { btPct: 0.33 },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      btPct: '0.33',
    }))
  })
})
