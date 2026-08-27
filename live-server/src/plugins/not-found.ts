import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

/**
 * 兜底 404：静态消息，不回显 request.url / query。
 *
 * Fastify 默认 not-found handler 返回 `Route GET:/?q=... not found`，把未匹配
 * 路径连同查询串一起反射进响应体。即便 content-type 是 JSON（浏览器不会当
 * HTML 执行），也会给反射型 XSS 扫描器留下可反射的响应面，并泄漏路由结构。
 * 这里用与业务一致的 `{code, data, message}` 格式返回静态文案，从源头消除
 * 反射。
 */
export default fp(async function notFoundPlugin(fastify: FastifyInstance) {
  fastify.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ code: 404, data: null, message: 'Not Found' })
  })
})
