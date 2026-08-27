import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

const recomputeSpy = vi.fn(async (..._args: unknown[]) => ({ crews: 2, daily: 3, monthly: 2, yearly: 2 }))
const findStaleFdCrewsSpy = vi.fn(async (..._args: unknown[]) => ['390'])

vi.mock('../../services/manday/manday-tool.js', () => ({
  recompute: (...args: unknown[]) => recomputeSpy(...args),
  findStaleFdCrews: (...args: unknown[]) => findStaleFdCrewsSpy(...args),
}))

import mandayCreditRefreshAdminRoutes from './manday-credit-refresh.js'

const buildApp = async (rows = [{ crew_id: '390' }, { crew_id: '391' }], isAdmin = 1) => {
  const app = Fastify({ logger: false })
  app.decorate('pgPool', {
    query: vi.fn(async () => ({ rows })),
  } as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    ;(request as { authUser?: unknown }).authUser = {
      userCode: isAdmin ? 'admin' : 'crew',
      userName: isAdmin ? 'Admin' : 'Crew',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(mandayCreditRefreshAdminRoutes, { prefix: '/api/admin' })
  return app
}

type RecomputeOpts = {
  schema: string
  crewIds?: string[]
  startDt?: string
  endDt?: string
  updatedBy?: string
}

const lastRecomputeOpts = (): RecomputeOpts => recomputeSpy.mock.calls.at(-1)?.[1] as RecomputeOpts

describe('manday credit refresh admin route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recomputes credit + blh for window-active crew (scope=all)', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/manday-credit-refresh?startDt=2026-06-01&endDt=2026-06-30',
    })

    expect(response.statusCode).toBe(200)
    expect(recomputeSpy).toHaveBeenCalledTimes(1)
    expect(lastRecomputeOpts()).toEqual({
      schema: 'f8',
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      updatedBy: 'admin:admin',
    })
    await app.close()
  })

  it('recomputes ghost crews with blh', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/manday-credit-refresh?scope=ghosts&startDt=2026-06-01&endDt=2026-06-30',
    })

    expect(response.statusCode).toBe(200)
    expect(findStaleFdCrewsSpy).toHaveBeenCalledWith(app.pgPool, {
      yearMonth: '2026-06',
      startDt: '2026-06-01',
      endDt: '2026-06-30',
    })
    expect(lastRecomputeOpts()).toMatchObject({
      schema: 'f8',
      crewIds: ['390'],
    })
    await app.close()
  })
})
