import { describe, expect, it, vi } from 'vitest'
import { DataSaveService } from '../../../services/data/data-save-service.js'

vi.mock('../../../services/data/data-validation-service.js', () => ({
  dataValidationService: { validate: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../../utils/cache.js', () => ({
  invalidatePattern: vi.fn(),
}))

const createFastify = () => {
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  }
  const fastify = {
    db: { transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx)) },
    redis: {},
  } as any
  return { fastify, tx }
}

const queryText = (query: unknown): string => {
  const render = (chunk: unknown): string => {
    if (typeof chunk === 'string' || typeof chunk === 'number') return String(chunk)
    if (typeof chunk !== 'object' || chunk === null) return ''
    if ('queryChunks' in chunk) {
      return ((chunk as { queryChunks: unknown[] }).queryChunks).map(render).join('')
    }
    if ('value' in chunk) {
      const value = (chunk as { value: unknown }).value
      return Array.isArray(value) ? value.map(render).join('') : String(value)
    }
    return ''
  }
  return render(query).replace(/\s+/g, ' ').trim()
}

describe('DataSaveService generic Data entity save', () => {
  it('creates a previously unsupported base entity with audit columns', async () => {
    const { fastify, tx } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'create-base',
      entityId: 'base',
      action: 'create',
      after: {
        filiale: 'F8',
        base: 'YVR',
        name: 'Vancouver',
        displayOrder: 3,
      },
    } as any], 'admin')

    const query = queryText(tx.execute.mock.calls[0][0])
    expect(query).toContain('insert into base')
    expect(query).toContain('filiale')
    expect(query).toContain('display_order')
    expect(query).toContain('created_by')
    expect(query).toContain('updated_by')
  })

  it('deletes a previously unsupported base entity by id', async () => {
    const { fastify, tx } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'delete-base',
      entityId: 'base',
      action: 'delete',
      rowId: 17,
      after: {},
    } as any], 'admin')

    const query = queryText(tx.execute.mock.calls[0][0])
    expect(query).toContain('delete from base')
    expect(query).toContain('where id =')
  })

  it('deletes rank as a single-table row without touching code-based references', async () => {
    const { fastify, tx } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'delete-rank-37',
      entityId: 'rank',
      action: 'delete',
      rowId: 37,
      after: {},
    } as any], 'admin')

    expect(tx.delete).toHaveBeenCalledTimes(1)
    expect(tx.execute).not.toHaveBeenCalled()
  })

  it('updates a previously unsupported base entity by id', async () => {
    const { fastify, tx } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      clientChangeId: 'update-base',
      entityId: 'base',
      action: 'update',
      rowId: 17,
      after: {
        name: 'Vancouver Updated',
        displayOrder: 4,
      },
    } as any], 'admin')

    const query = queryText(tx.execute.mock.calls[0][0])
    expect(query).toContain('update base')
    expect(query).toContain('display_order')
    expect(query).toContain('updated_by')
    expect(query).toContain('where id =')
  })

  it('creates and deletes a registry Data entity that only uses generic support', async () => {
    const { fastify, tx } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [
      {
        clientChangeId: 'create-query',
        entityId: 'query',
        action: 'create',
        after: { name: 'Daily Query' },
      } as any,
      {
        clientChangeId: 'delete-query',
        entityId: 'query',
        action: 'delete',
        rowId: 99,
        after: {},
      } as any,
    ], 'admin')

    expect(queryText(tx.execute.mock.calls[0][0])).toContain('insert into query')
    expect(queryText(tx.execute.mock.calls[1][0])).toContain('delete from query')
  })
})
