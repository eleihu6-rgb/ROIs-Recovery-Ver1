import { describe, it, expect, vi, beforeEach } from 'vitest'

const IMP_ROW = { id: 1, source: 'IMP', crewId: 'C1' }
const MA_ROW = { id: 2, source: 'MA', crewId: 'C2' }

const redisMock = { del: () => Promise.resolve(), incr: () => Promise.resolve(1) }

describe('rosterService IMP immutability + create default', () => {
  beforeEach(() => vi.resetModules())

  it('update on an IMP row throws statusCode 409', async () => {
    // update() first does SELECT to check source, then UPDATE.
    // Mock SELECT returns IMP_ROW, so the guard should throw before UPDATE.
    const fastify: any = {
      db: {
        select: () => ({ from: () => ({ where: () => Promise.resolve([IMP_ROW]) }) }),
        update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([MA_ROW]) }) }) }),
      },
      redis: redisMock,
    }
    const { rosterService } = await import('../roster-service.js')
    await expect(rosterService.update(fastify, 1, { comments: 'x' }, 'u'))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('update on a MA row succeeds (no guard triggered)', async () => {
    // SELECT returns MA_ROW (not IMP), guard passes, then UPDATE proceeds.
    const fastify: any = {
      db: {
        select: () => ({ from: () => ({ where: () => Promise.resolve([MA_ROW]) }) }),
        update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([MA_ROW]) }) }) }),
      },
      redis: redisMock,
    }
    const { rosterService } = await import('../roster-service.js')
    const res = await rosterService.update(fastify, 2, { comments: 'y' }, 'u')
    expect(res).toMatchObject({ id: 2, source: 'MA' })
  })

  it('update copies depArp into base for ground-task compatibility', async () => {
    let updatePayload: Record<string, unknown> | undefined
    const fastify: any = {
      db: {
        select: () => ({ from: () => ({ where: () => Promise.resolve([MA_ROW]) }) }),
        update: () => ({
          set: (payload: Record<string, unknown>) => {
            updatePayload = payload
            return { where: () => ({ returning: () => Promise.resolve([{ ...MA_ROW, ...payload }]) }) }
          },
        }),
      },
      redis: redisMock,
    }
    const { rosterService } = await import('../roster-service.js')
    const res = await rosterService.update(fastify, 2, { depArp: 'YVR', arvArp: 'YYZ' }, 'u')
    expect(updatePayload).toMatchObject({ depArp: 'YVR', arvArp: 'YYZ', base: 'YVR' })
    expect(res).toMatchObject({ id: 2, depArp: 'YVR', arvArp: 'YYZ', base: 'YVR' })
  })

  it('remove on an IMP row succeeds (delete allowed)', async () => {
    const fastify: any = {
      db: { update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([IMP_ROW]) }) }) }) },
      redis: redisMock,
    }
    const { rosterService } = await import('../roster-service.js')
    const res = await rosterService.remove(fastify, 1, 'u')
    expect(res).toMatchObject({ source: 'IMP' })
  })
})
