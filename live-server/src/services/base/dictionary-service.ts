import { eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { dictionary } from '../../models/base/dictionary.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'dictionary'
const CACHE_TTL = 86400

interface DictionaryNode {
  id: number
  parentCode: string | null
  code: string | null
  name: string | null
  idx: number | null
  codeValue: string | null
  children: DictionaryNode[]
}

export const dictionaryService = {
  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(dictionary)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(dictionary).where(eq(dictionary.id, id))
      return rows[0] ?? null
    })
  },

  async getByParentCode(fastify: FastifyInstance, parentCode: string) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:parent:${parentCode}`, CACHE_TTL, async () => {
      return fastify.db.select().from(dictionary).where(eq(dictionary.parentCode, parentCode))
    })
  },

  async getTree(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:tree`, CACHE_TTL, async () => {
      const all = await fastify.db.select().from(dictionary)
      const map = new Map<string | null, DictionaryNode[]>()

      // Group by parentCode
      for (const item of all) {
        const key = item.parentCode
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push({ ...item, children: [] })
      }

      // Build tree starting from root nodes (parentCode is null)
      const buildChildren = (nodes: DictionaryNode[]): DictionaryNode[] => {
        for (const node of nodes) {
          const children = map.get(node.code) ?? []
          node.children = buildChildren(children)
        }
        return nodes
      }

      return buildChildren(map.get(null) ?? [])
    })
  },

  async create(fastify: FastifyInstance, data: typeof dictionary.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(dictionary).values({ ...data, ...auditCreate(username) }).returning()
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:*`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof dictionary.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(dictionary).set({ ...data, ...auditUpdate(username) }).where(eq(dictionary.id, id)).returning()
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:*`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(dictionary).where(eq(dictionary.id, id))
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:*`)
  },
}

/**
 * Read SYS_PARAM rows into a code → value map (cached 24h via getByParentCode).
 * Used by features that need configurable numeric/string system params (e.g. the
 * roster-period selectable window).
 */
export async function getSysParamMap(fastify: FastifyInstance): Promise<Map<string, string>> {
  const rows = await dictionaryService.getByParentCode(fastify, 'SYS_PARAM')
  const map = new Map<string, string>()
  for (const r of rows) {
    if (r.code) map.set(r.code, r.codeValue ?? '')
  }
  return map
}
