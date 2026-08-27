import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eq, ne } from 'drizzle-orm'
import { systemMenu } from '../../models/index.js'
import {
  buildAdminContext,
  getOrResolvePermissionContext,
} from '../../services/permission/permission-service.js'

interface MenuNode {
  menuCode: string
  menuName: string
  parentMenuCode: string
  factoryName: string | null
  systemType: string
  idx: number | null
  hasAccess: boolean
  ctrls: string[]
}

/**
 * GET /api/auth/menus — 返回按当前用户权限过滤的菜单树节点（扁平，前端组树）。
 * is_admin 全量 hasAccess；非 admin 按 permission context 过滤。
 */
export default async function authMenusRoutes(fastify: FastifyInstance) {
  fastify.get('/menus', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.authUser
    if (!user) {
      return reply.status(401).send({ code: 401, data: null, message: 'Authentication required.' })
    }

    const [menuRows, ctrlRows, ctx] = await Promise.all([
      fastify.db.select().from(systemMenu).where(ne(systemMenu.systemType, 'B')).orderBy(systemMenu.idx),
      fastify.db.select({ menuCode: systemMenu.parentMenuCode, ctlCode: systemMenu.menuCode }).from(systemMenu).where(eq(systemMenu.systemType, 'B')),
      user.isAdmin === 1
        ? buildAdminContext(fastify.db)
        : getOrResolvePermissionContext(fastify.db, fastify.redis, user.schema, user.userCode),
    ])

    const ctrlMap = new Map<string, string[]>()
    for (const c of ctrlRows) {
      const arr = ctrlMap.get(c.menuCode) ?? []
      arr.push(c.ctlCode)
      ctrlMap.set(c.menuCode, arr)
    }

    const allowed = new Set(ctx.menus)
    const nodes: MenuNode[] = menuRows.map((m) => ({
      menuCode: m.menuCode,
      menuName: m.menuName,
      parentMenuCode: m.parentMenuCode,
      factoryName: m.factoryName,
      systemType: m.systemType,
      idx: m.idx,
      hasAccess: user.isAdmin === 1 || allowed.has(m.menuCode),
      ctrls: ctx.ctrls[m.menuCode] ?? [],
    }))

    return reply.send({ code: 200, data: { nodes }, message: 'ok' })
  })
}
