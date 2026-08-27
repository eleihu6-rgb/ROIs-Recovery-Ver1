import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { fail } from '../../utils/response.js'
import { ganttService } from '../../services/gantt/gantt-service.js'

export default async function ganttRoutes(fastify: FastifyInstance) {
  // GET /api/gantt/bootstrap — 首屏合并：slim crew 首页 + 首屏窗口 roster（省一次串行往返）
  fastify.get('/bootstrap', async (request, reply) => {
    const schema = z.object({
      startDate: z.string(),
      endDate: z.string(),
      // pageSize=0 = no-limit (full slim crew), matching the list endpoints' full-load mode.
      pageSize: z.coerce.number().int().min(0).max(10000),
      sortBy: z.enum(['crew_id', 'name', 'rank', 'base', 'fleet']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      rosterWindowDays: z.coerce.number().int().positive().max(366),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await ganttService.bootstrap(fastify, parsed.data)

    // 跨洲链路性能增强：首屏 bootstrap 负载较大（slim crew + 首屏窗口 roster）。
    // 用响应体内容算 ETag，配合 `no-cache`（浏览器先缓存、再带 If-None-Match 回源校验）。
    // 整页刷新且数据未变时回 304（空体），省去整份首屏窗口跨太平洋重传。
    const body = { code: 200, data: result, message: 'ok' }
    const etag = `"${createHash('sha1').update(JSON.stringify(body)).digest('base64')}"`
    reply.header('ETag', etag)
    reply.header('Cache-Control', 'private, no-cache')
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).send()
    }
    return reply.code(200).send(body)
  })
}
