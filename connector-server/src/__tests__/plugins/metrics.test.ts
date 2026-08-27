import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyPluginAsync } from 'fastify'
import { register } from 'prom-client'

// env.ts requires DATABASE_URL at parse time; metrics plugin now imports env.
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

async function loadMetricsPlugin(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  register.clear() // prom-client's default registry is a singleton across resetModules
  const keys = ['APP_ENV', 'METRICS_ENABLED', 'METRICS_TOKEN', 'JWT_SECRET']
  for (const k of keys) delete process.env[k]
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  const mod = await import('../../plugins/metrics.js')
  return mod.default as unknown as FastifyPluginAsync
}

describe('metricsPlugin exposure controls', () => {
  it('dev default: GET /metrics returns 200 with prometheus metrics', async () => {
    const plugin = await loadMetricsPlugin({ METRICS_ENABLED: 'true' })
    const app = Fastify({ logger: false })
    await app.register(plugin)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body).toContain('rois_connector_server_process_cpu_user_seconds_total')
    await app.close()
  })

  it('METRICS_ENABLED=false: /metrics is not registered (404)', async () => {
    const plugin = await loadMetricsPlugin({ METRICS_ENABLED: 'false' })
    const app = Fastify({ logger: false })
    await app.register(plugin)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('METRICS_TOKEN set: missing/wrong token rejected (403), correct token accepted (200)', async () => {
    const plugin = await loadMetricsPlugin({ METRICS_ENABLED: 'true', METRICS_TOKEN: 'super-secret-token' })
    const app = Fastify({ logger: false })
    await app.register(plugin)
    await app.ready()

    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(403)
    expect(
      (await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer nope' } })).statusCode,
    ).toBe(403)
    expect(
      (await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer super-secret-token' } }))
        .statusCode,
    ).toBe(200)
    await app.close()
  })

  it('production-like + enabled without token: registration fails fast', async () => {
    const plugin = await loadMetricsPlugin({
      APP_ENV: 'production',
      JWT_SECRET: 'x'.repeat(40),
      METRICS_ENABLED: 'true',
      METRICS_TOKEN: undefined,
    })
    const app = Fastify({ logger: false })
    await expect(app.register(plugin).ready()).rejects.toThrow(/METRICS_TOKEN is required/)
    await app.close()
  })
})
