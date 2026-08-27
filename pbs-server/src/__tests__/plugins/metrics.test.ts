import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import Fastify from 'fastify'
import { register } from 'prom-client'
import metricsPlugin from '../../plugins/metrics.js'
import { env } from '../../config/env.js'
import type { FastifyInstance } from 'fastify'

describe('metricsPlugin', () => {
  let app: FastifyInstance

  before(async () => {
    app = Fastify({ logger: false })
    register.clear()
    await app.register(metricsPlugin)
    await app.ready()
  })

  after(async () => {
    await app.close()
    register.clear()
  })

  it('GET /metrics returns 200 with prometheus content type', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    assert.equal(res.statusCode, 200)
    assert.match(String(res.headers['content-type']), /text\/plain/)
  })

  it('GET /metrics body contains default Node.js metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    assert.match(res.body, /rois_pbs_server_process_cpu_user_seconds_total/)
  })

  it('GET /metrics requires the metrics token when configured', async () => {
    const originalToken = env.METRICS_TOKEN
    const token = 'metrics-test-token'
    const tokenApp = Fastify({ logger: false })

    try {
      env.METRICS_TOKEN = token
      register.clear()
      await tokenApp.register(metricsPlugin)
      await tokenApp.ready()

      const missing = await tokenApp.inject({ method: 'GET', url: '/metrics' })
      assert.equal(missing.statusCode, 403)

      const withToken = await tokenApp.inject({
        method: 'GET',
        url: '/metrics',
        headers: { 'x-metrics-token': token },
      })
      assert.equal(withToken.statusCode, 200)
    } finally {
      await tokenApp.close()
      env.METRICS_TOKEN = originalToken
      register.clear()
    }
  })
})
