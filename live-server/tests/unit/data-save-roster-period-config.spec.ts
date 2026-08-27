import { describe, expect, it, vi } from 'vitest'
import { rosterPeriodConfig } from '../../src/models/base/roster-period.js'
import { dataSaveService } from '../../src/services/data/data-save-service.js'

describe('DataSaveService roster_period_config', () => {
  it('creates, updates, and deletes roster period config rows in one transaction', async () => {
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = []
    const updated: Array<{ table: unknown; values: Record<string, unknown> }> = []
    const deleted: Array<{ table: unknown }> = []

    const tx = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          inserted.push({ table, values })
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn(async () => {
            updated.push({ table, values })
          }),
        })),
      })),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          deleted.push({ table })
        }),
      })),
    }
    const fastify = {
      db: {
        transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => {
          await callback(tx)
        }),
      },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    }

    const result = await dataSaveService.save(
      fastify as never,
      [
        {
          clientChangeId: 'create-rp-config',
          entityId: 'roster_period_config',
          action: 'create',
          after: {
            name: 'Monthly RP',
            nameType: '1',
            rpType: '1',
            period: '1',
            periodType: '3',
            startTime: '2026-01-01T00:00:00Z',
            endTime: '2026-12-31T23:59:59Z',
          },
        },
        {
          clientChangeId: 'update-rp-config',
          entityId: 'roster_period_config',
          action: 'update',
          rowId: 7,
          after: {
            name: 'Monthly RP Updated',
            period: '2',
          },
        },
        {
          clientChangeId: 'delete-rp-config',
          entityId: 'roster_period_config',
          action: 'delete',
          rowId: 7,
          after: {},
        },
      ],
      'tester',
    )

    expect(result.committed).toBe(3)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].table).toBe(rosterPeriodConfig)
    expect(inserted[0].values).toMatchObject({
      name: 'Monthly RP',
      nameType: 1,
      rpType: 1,
      period: 1,
      periodType: 3,
      createdBy: 'tester',
      updatedBy: 'tester',
    })
    expect(inserted[0].values.startTime).toBeInstanceOf(Date)
    expect(inserted[0].values.endTime).toBeInstanceOf(Date)

    expect(updated).toHaveLength(1)
    expect(updated[0].table).toBe(rosterPeriodConfig)
    expect(updated[0].values).toMatchObject({
      name: 'Monthly RP Updated',
      period: 2,
      updatedBy: 'tester',
    })

    expect(deleted).toHaveLength(1)
    expect(deleted[0].table).toBe(rosterPeriodConfig)
    expect(fastify.redis.scan).toHaveBeenCalled()
  })
})
