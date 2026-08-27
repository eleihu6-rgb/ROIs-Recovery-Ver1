import type { FastifyInstance } from 'fastify'
import airportRoutes from './airport.js'
import aircraftRoutes from './aircraft.js'
import fleetRoutes from './fleet.js'
import baseRoutes from './base.js'
import rankRoutes from './rank.js'
import divisionRoutes from './division.js'
import crewDepartmentRoutes from './crew-department.js'
import dictionaryRoutes from './dictionary.js'
import assignmentRoutes from './assignment.js'
import compositionRoutes from './composition.js'
import rosterPeriodsRoutes from './roster-periods.js'
import rankActingRoutes from './rank-acting.js'

export default async function baseDataRoutes(fastify: FastifyInstance) {
  // 跨洲链路性能增强：这些都是低频变更的主数据（机场/机型/机队/基地/职级/字典等，
  // 服务端 Redis TTL 已是 24h）。给 GET 响应加 `private` 浏览器缓存（仅本机，避免多航司
  // schema 隔离下被共享代理缓存），让会话内重复打开/刷新无需再跨太平洋拉取。max-age 取 1h，
  // 把陈旧窗口限制在可接受范围；写操作（POST/PUT/DELETE）不缓存。此 hook 受 Fastify 封装作用域
  // 限制，仅作用于本插件下注册的 base 子路由。
  fastify.addHook('onSend', async (request, reply) => {
    if (request.method === 'GET' && reply.statusCode === 200) {
      reply.header('Cache-Control', 'private, max-age=3600')
    }
  })

  fastify.register(airportRoutes, { prefix: '/api/airport' })
  fastify.register(aircraftRoutes, { prefix: '/api/aircraft' })
  fastify.register(fleetRoutes, { prefix: '/api/fleet' })
  fastify.register(baseRoutes, { prefix: '/api/base' })
  fastify.register(rankRoutes, { prefix: '/api/rank' })
  fastify.register(divisionRoutes, { prefix: '/api/division' })
  fastify.register(crewDepartmentRoutes, { prefix: '/api/department' })
  fastify.register(dictionaryRoutes, { prefix: '/api/dictionary' })
  fastify.register(assignmentRoutes, { prefix: '/api/assignment' })
  fastify.register(compositionRoutes, { prefix: '/api/composition' })
  fastify.register(rosterPeriodsRoutes, { prefix: '/api/roster-periods' })
  fastify.register(rankActingRoutes, { prefix: '/api/rank-acting' })
}
