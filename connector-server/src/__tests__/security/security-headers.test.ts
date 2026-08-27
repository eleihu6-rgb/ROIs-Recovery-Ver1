import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import securityHeadersPlugin from '../../plugins/security-headers.js'

describe('securityHeadersPlugin (connector-server)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify({ logger: false })
    await app.register(securityHeadersPlugin)
    app.get('/health', async () => ({ status: 'ok' }))
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('adds X-Content-Type-Options: nosniff', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('denies framing and removes x-powered-by', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
