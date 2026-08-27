import { eq, and, desc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewCertificate } from '../../models/crew/crew-certificate.js'
import { crewLicense, crewLicInstructor, crewLanguage } from '../../models/crew/crew-license.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_TTL = 14400

// ===================== Certificate =====================

export const crewCertificateService = {
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `crew:cert:list:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewCertificate)
        .where(eq(crewCertificate.crewId, crewId))
        .orderBy(desc(crewCertificate.effDt)),
    )
  },

  async getById(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .select()
      .from(crewCertificate)
      .where(and(eq(crewCertificate.id, id), eq(crewCertificate.crewId, crewId)))
      .limit(1)
    return rows[0] ?? null
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewCertificate.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewCertificate)
      .values({ ...data, crewId, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `crew:cert:list:${crewId}`)
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewCertificate.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewCertificate)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewCertificate.id, id), eq(crewCertificate.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(fastify.redis, `crew:cert:list:${crewId}`)
    }
    return updated ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number, username: string) {
    const rows = await fastify.db
      .update(crewCertificate)
      .set({ isValid: 0, ...auditUpdate(username) })
      .where(and(eq(crewCertificate.id, id), eq(crewCertificate.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(fastify.redis, `crew:cert:list:${crewId}`)
    }
    return removed ?? null
  },
}

// ===================== License =====================

export const crewLicenseService = {
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `crew:lic:list:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewLicense)
        .where(eq(crewLicense.crewId, crewId))
        .orderBy(desc(crewLicense.effDt)),
    )
  },

  async getById(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .select()
      .from(crewLicense)
      .where(and(eq(crewLicense.id, id), eq(crewLicense.crewId, crewId)))
      .limit(1)
    return rows[0] ?? null
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewLicense.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewLicense)
      .values({ ...data, crewId, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `crew:lic:list:${crewId}`)
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewLicense.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewLicense)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewLicense.id, id), eq(crewLicense.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(fastify.redis, `crew:lic:list:${crewId}`)
    }
    return updated ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number, username: string) {
    const rows = await fastify.db
      .update(crewLicense)
      .set({ isValid: 0, ...auditUpdate(username) })
      .where(and(eq(crewLicense.id, id), eq(crewLicense.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(fastify.redis, `crew:lic:list:${crewId}`)
    }
    return removed ?? null
  },
}

// ===================== License Instructor =====================

export const crewLicInstructorService = {
  async listByLicense(fastify: FastifyInstance, crewId: string, crewLicenseId: number) {
    const key = `crew:lic-inst:list:${crewId}:${crewLicenseId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewLicInstructor)
        .where(
          and(
            eq(crewLicInstructor.crewId, crewId),
            eq(crewLicInstructor.crewLicenseId, crewLicenseId),
          ),
        )
        .orderBy(desc(crewLicInstructor.effDt)),
    )
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewLicInstructor.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewLicInstructor)
      .values({ ...data, crewId, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `crew:lic-inst:list:${crewId}:${data.crewLicenseId}`)
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewLicInstructor.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewLicInstructor)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewLicInstructor.id, id), eq(crewLicInstructor.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(fastify.redis, `crew:lic-inst:list:${crewId}:${updated.crewLicenseId}`)
    }
    return updated ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .delete(crewLicInstructor)
      .where(and(eq(crewLicInstructor.id, id), eq(crewLicInstructor.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(fastify.redis, `crew:lic-inst:list:${crewId}:${removed.crewLicenseId}`)
    }
    return removed ?? null
  },
}

// ===================== Language =====================

export const crewLanguageService = {
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `crew:lang:list:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewLanguage)
        .where(eq(crewLanguage.crewId, crewId))
        .orderBy(desc(crewLanguage.effDt)),
    )
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewLanguage.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewLanguage)
      .values({ ...data, crewId, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `crew:lang:list:${crewId}`)
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewLanguage.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewLanguage)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewLanguage.id, id), eq(crewLanguage.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(fastify.redis, `crew:lang:list:${crewId}`)
    }
    return updated ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number, username: string) {
    const rows = await fastify.db
      .update(crewLanguage)
      .set({ isValid: 0, ...auditUpdate(username) })
      .where(and(eq(crewLanguage.id, id), eq(crewLanguage.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(fastify.redis, `crew:lang:list:${crewId}`)
    }
    return removed ?? null
  },
}
