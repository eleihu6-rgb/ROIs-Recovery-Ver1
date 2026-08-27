import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import securityHeadersPlugin from '../../plugins/security-headers.js'

describe('securityHeadersPlugin', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify({ logger: false })
    await app.register(securityHeadersPlugin)
    app.get('/api/health', async () => ({ status: 'ok' }))
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('adds X-Content-Type-Options: nosniff', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('denies framing (X-Frame-Options: DENY)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['x-frame-options']).toBe('DENY')
  })

  it('removes x-powered-by', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('sets a Referrer-Policy', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['referrer-policy']).toBe('no-referrer')
  })
})
