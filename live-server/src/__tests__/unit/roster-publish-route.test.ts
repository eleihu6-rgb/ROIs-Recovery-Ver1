import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
})

import rosterPublishRoutes from '../../routes/roster/roster-publish.js'
import {
  RosterPublishProductError,
  rosterPublishService,
} from '../../services/roster/roster-publish-service.js'

const build = async () => {
  const app = Fastify()
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    request.authUser = {
      userCode: 'planner',
      userName: 'Planner',
      schema: 'f8',
      isAdmin: 1,
      tokenVersion: 1,
    }
  })
  await app.register(rosterPublishRoutes)
  return app
}

describe('roster publish route', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns a stable conflict response when the service rejects with a RosterPublishProductError', async () => {
    // Regression coverage for the route's error mapping. The omitted-crew-
    // completeness validation that originally surfaced this message was
    // removed when per-crew atomicity was relaxed — the message still
    // exists in the route contract and is also used for the other
    // RosterPublishProductError paths (missing scope, commit uncertainty).
    vi.spyOn(rosterPublishService, 'applyDiff').mockRejectedValue(
      new RosterPublishProductError('Select all changes for crew C001 before publishing.'),
    )
    const app = await build()

    const response = await app.inject({
      method: 'POST',
      url: '/apply',
      payload: { rosterPeriodId: 7, keys: ['F|C001|9001'] },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 409,
      data: null,
      message: 'Select all changes for crew C001 before publishing.',
    })
  })
})
