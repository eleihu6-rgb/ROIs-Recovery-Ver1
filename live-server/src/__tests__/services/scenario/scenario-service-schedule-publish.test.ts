import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
})

import { scenarioService } from '../../../services/scenario/scenario-service.js'

describe('scenarioService.createSchedulePublishRecord', () => {
  it('always creates a non-success draft without batch or file metadata', async () => {
    const returning = vi.fn(async () => [{ id: 801, published: 0 }])
    const values = vi.fn(() => ({ returning }))
    const fastify = {
      db: { insert: vi.fn(() => ({ values })) },
      redis: {
        scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
        del: vi.fn(async () => 0),
      },
    } as never

    await scenarioService.createSchedulePublishRecord(fastify, {
      strDt: new Date('2026-06-01T00:00:00.000Z'),
      endDt: new Date('2026-06-30T23:59:59.000Z'),
      division: 'P',
      published: 1,
      batchId: 99,
      filePath: 'forged.schedule.gz',
      fileSize: 123,
      checksum: 'forged',
    }, 'kevin')

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      createdBy: 'kevin',
      updatedBy: 'kevin',
      published: 0,
      batchId: null,
      filePath: null,
      fileSize: null,
      checksum: null,
    }))
  })
})
