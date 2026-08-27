import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { PermissionCache } from '../services/permission/permission-cache.js'
import {
  decidePermission,
  loadApiRules,
  type ApiRule,
} from '../services/permission/api-uri-index.js'
import {
  getPermissionVersion,
  loadPermissionContext,
  permissionKey,
  resolvePermissionContext,
  storePermissionContext,
} from '../services/permission/permission-service.js'
import { PERMISSION_CACHE_TTL_SEC, PERMISSION_MEMORY_TTL_MS, type PermissionContext } from '../types/permission.js'

export { PERMISSION_CODES } from '../services/permission/api-uri-index.js'

// 进程内主缓存：热路径零网络往返；权限变更时 invalidate 立即生效
const permissionCache = new PermissionCache<PermissionContext>(PERMISSION_MEMORY_TTL_MS)

/**
 * 全局权限鉴权插件（挂在 auth 插件之后）。
 * 认证插件负责验 JWT 并设置 request.authUser；本插件负责：
 * - is_admin=1 短路放行
 * - 权限上下文：内存 TTL 缓存 → Redis → DB 解析（登录时已写入 Redis）
 * - api_uris 匹配：命中 ctrl → 按钮权限；命中菜单 → 菜单可见；未命中放行
 * - permVersion 不一致 → 会话失效，提示重新登录
 */
export default fp(async (fastify: FastifyInstance) => {
  // 启动加载 api_uris 索引。若远端 schema 尚未迁移（缺 system_menu.api_uris 列），
  // 回退为空规则集（fail-open）并告警，避免服务启动崩溃；迁移后重启即启用门禁。
  let rules: ApiRule[] = []
  try {
    rules = await loadApiRules(fastify.db)
  } catch (err) {
    fastify.log.warn({ err }, 'Failed to load api_uris permission index — permission enforcement disabled until migration runs')
  }

  const getContext = (schema: string, userCode: string): Promise<PermissionContext> =>
    permissionCache.get(permissionKey(schema, userCode), async () => {
      const key = permissionKey(schema, userCode)
      const cached = await loadPermissionContext(fastify.redis, key)
      if (cached) return cached
      const version = await getPermissionVersion(fastify.redis, schema)
      const ctx = await resolvePermissionContext(fastify.db, userCode, version)
      await storePermissionContext(fastify.redis, key, ctx, PERMISSION_CACHE_TTL_SEC)
      return ctx
    })

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // auth 插件未设置 authUser（公共路径 / WebSocket 升级）→ 跳过
    const user = request.authUser
    if (!user) return
    if (user.isAdmin === 1) return

    const ctx = await getContext(user.schema, user.userCode)
    const decision = decidePermission({
      isAdmin: user.isAdmin,
      jwtPermVersion: user.permVersion,
      path: request.url,
      rules,
      ctx,
    })
    if (!decision.pass) {
      return reply.status(403).send({
        code: decision.code,
        data: null,
        message: decision.message,
      })
    }
  })
})
