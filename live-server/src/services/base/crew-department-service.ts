import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewDepartment } from '../../models/base/crew-department.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'crewDepartment'
const CACHE_TTL = 86400

export const crewDepartmentService = {
  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(crewDepartment)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(crewDepartment).where(eq(crewDepartment.id, id))
      return rows[0] ?? null
    })
  },

  async create(fastify: FastifyInstance, data: typeof crewDepartment.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(crewDepartment).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof crewDepartment.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(crewDepartment).set({ ...data, ...auditUpdate(username) }).where(eq(crewDepartment.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(crewDepartment).where(eq(crewDepartment.id, id))
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
  },
}
