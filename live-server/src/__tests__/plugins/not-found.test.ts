import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import notFoundPlugin from '../../plugins/not-found.js'

// 回归：#11 反射型 XSS 扫描器对 /live/?q= 报警。Fastify 默认 404 会把
// `Route GET:/?q=... not found` 反射进响应体——加固后必须返回静态消息，
// 不 echo 任何 URL / query 内容。
describe('not-found plugin (reflected-URL hardening)', () => {
  const buildApp = async () => {
    const app = Fastify({ logger: false })
    // 模拟一条真实路由，验证正常路由不受影响
    app.get('/api/health', async () => ({ ok: true }))
    await app.register(notFoundPlugin)
    await app.ready()
    return app
  }

  it('returns a static 404 message without echoing the URL or query', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/?q=<script>alert(1)</script>',
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    const body = JSON.parse(res.body)
    expect(body).toEqual({ code: 404, data: null, message: 'Not Found' })
    // 反射回归：响应体不得包含请求路径或 query 内容
    expect(res.body).not.toContain('script')
    expect(res.body).not.toContain('alert(1)')
    expect(res.body).not.toContain('q=')
    expect(res.body).not.toContain('/?')
    await app.close()
  })

  it('does not leak arbitrary path fragments', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/unknown/deep/path?x=secret-value' })
    expect(res.statusCode).toBe(404)
    expect(res.body).not.toContain('secret-value')
    expect(res.body).not.toContain('/unknown')
    await app.close()
  })

  it('leaves registered routes untouched', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    await app.close()
  })
})
