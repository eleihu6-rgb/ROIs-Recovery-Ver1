import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyPluginAsync } from 'fastify'
import { register } from 'prom-client'

// env.ts requires DATABASE_URL at parse time; metrics plugin now imports env.
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

// Load a fresh metrics plugin under a specific env. vi.resetModules() forces
// config/env.ts (and prom-client) to re-evaluate so each scenario sees its own
// METRICS_* / APP_ENV values (env is parsed once per module load).
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
    expect(res.body).toContain('rois_live_server_process_cpu_user_seconds_total')
    await app.close()
  })

  it('records per-route latency + payload metrics using the route template (no id leakage)', async () => {
    const plugin = await loadMetricsPlugin({ METRICS_ENABLED: 'true' })
    const app = Fastify({ logger: false })
    await app.register(plugin)
    // Concrete url carries an id; the metric must label by the route *template*.
    app.get('/api/test-route/:id', async () => ({ hello: 'world' }))
    await app.ready()

    await app.inject({ method: 'GET', url: '/api/test-route/12345' })

    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('rois_live_server_http_request_duration_seconds')
    expect(res.body).toContain('rois_live_server_http_response_bytes')
    // Low-cardinality template label present...
    expect(res.body).toContain('route="/api/test-route/:id"')
    // ...and the concrete id is NOT used as a label value.
    expect(res.body).not.toContain('12345')
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

    const missing = await app.inject({ method: 'GET', url: '/metrics' })
    expect(missing.statusCode).toBe(403)

    const wrong = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer nope' },
    })
    expect(wrong.statusCode).toBe(403)

    const okBearer = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer super-secret-token' },
    })
    expect(okBearer.statusCode).toBe(200)

    const okHeader = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-metrics-token': 'super-secret-token' },
    })
    expect(okHeader.statusCode).toBe(200)
    await app.close()
  })

  it('production-like + enabled without token: registration fails fast', async () => {
    const plugin = await loadMetricsPlugin({
      APP_ENV: 'production',
      // valid 32+ char non-default secret so env passes its own JWT guard first
      JWT_SECRET: 'x'.repeat(40),
      METRICS_ENABLED: 'true',
      METRICS_TOKEN: undefined,
    })
    const app = Fastify({ logger: false })
    await expect(app.register(plugin).ready()).rejects.toThrow(/METRICS_TOKEN is required/)
    await app.close()
  })
})
