import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'

describe('security headers (pbs-server)', () => {
  let server: FastifyInstance

  before(async () => {
    const { buildServer } = await import('../../app.js')
    server = await buildServer({ skipDatabase: true })
    await server.ready()
  })

  after(async () => {
    await server.close()
  })

  it('GET /api/health includes baseline security headers', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' })
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-frame-options'], 'DENY')
    assert.equal(res.headers['referrer-policy'], 'no-referrer')
  })

  it('does not leak x-powered-by', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' })
    assert.equal(res.headers['x-powered-by'], undefined)
  })
})
