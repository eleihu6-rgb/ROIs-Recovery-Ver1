import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import {
  crewCertificateService,
  crewLicenseService,
  crewLicInstructorService,
  crewLanguageService,
} from '../../services/crew/crew-cert-service.js'
import { crewQualificationService } from '../../services/crew/crew-qual-service.js'

// ---------- common ----------

const idParam = z.object({ id: z.coerce.number().int().positive() })

const getUsername = (req: { headers: Record<string, string | string[] | undefined> }) =>
  (req.headers['x-username'] as string) || 'system'

// ---------- Certificate schemas ----------

const certCreateSchema = z.object({
  certificate: z.string().min(1).max(20),
  certificateNo: z.string().max(100).nullish(),
  effDt: z.string().datetime(),
  invalidDt: z.string().datetime().nullish(),
  expDt: z.string().datetime().nullish(),
  tmpIssueCountry: z.string().max(100).nullish(),
  tmpIssueAuthority: z.string().max(100).nullish(),
  referenceNo: z.string().max(100).nullish(),
  referenceId: z.number().int().nullish(),
  isValid: z.number().int().min(0).max(1).default(0),
  remarks: z.string().max(70).nullish(),
  interfaceCrewCertId: z.string().max(20).nullish(),
  interfaceCertId: z.string().max(40).nullish(),
  firstName: z.string().max(50).nullish(),
  middleName: z.string().max(50).nullish(),
  lastName: z.string().max(50).nullish(),
  isPrimary: z.number().int().nullish(),
  nationality: z.string().max(20).nullish(),
  surname: z.string().max(40).nullish(),
  titleName: z.string().max(40).nullish(),
  givenName: z.string().max(40).nullish(),
})

const certUpdateSchema = certCreateSchema.partial()

// ---------- License schemas ----------

const licCreateSchema = z.object({
  certificate: z.string().min(1).max(20),
  licenseType: z.string().min(1).max(20),
  licenseNo: z.string().max(20).nullish(),
  effDt: z.string().datetime(),
  renewedDt: z.string().datetime().nullish(),
  expDt: z.string().datetime().nullish(),
  acTypes: z.string().max(30).nullish(),
  refLanguageId: z.number().int().nullish(),
  refInstructorId: z.number().int().nullish(),
  isValid: z.number().int().min(0).max(1).default(1),
  remarks: z.string().max(70).nullish(),
  interfaceCrewLicId: z.string().max(20).nullish(),
})

const licUpdateSchema = licCreateSchema.partial()

// ---------- Instructor schemas ----------

const instrCreateSchema = z.object({
  acType: z.string().min(1).max(30),
  crewLicenseId: z.number().int(),
  instructor: z.string().max(30).nullish(),
  effDt: z.string().datetime(),
  renewedDt: z.string().datetime().nullish(),
  expDt: z.string().datetime().nullish(),
})

const instrUpdateSchema = instrCreateSchema.partial()

// ---------- Language schemas ----------

const langCreateSchema = z.object({
  crewLicenseId: z.number().int().nullish(),
  language: z.string().min(1).max(20),
  effDt: z.string().datetime(),
  renewedDt: z.string().datetime().nullish(),
  expDt: z.string().datetime().nullish(),
  languageLevel: z.string().max(10).nullish(),
  isValid: z.number().int().min(0).max(1).default(0),
  remarks: z.string().max(70).nullish(),
})

const langUpdateSchema = langCreateSchema.partial()

// ---------- Qualification schemas ----------

const qualCreateSchema = z.object({
  qualification: z.string().min(1).max(20),
  effDt: z.string().datetime(),
  renewedDt: z.string().datetime().nullish(),
  expDt: z.string().datetime().nullish(),
  fleetSpecific: z.string().max(20).nullish(),
  acType: z.string().max(10).nullish(),
  rank: z.string().max(10).nullish(),
  position: z.string().max(20).nullish(),
  isValid: z.number().int().min(0).max(1).default(0),
  remarks: z.string().max(255).nullish(),
  interfaceCrewQualId: z.string().max(40).nullish(),
  airport: z.string().max(20).nullish(),
  interfaceQualificationId: z.string().max(40).nullish(),
  remarkDetails: z.string().max(255).nullish(),
  bases: z.string().max(200).nullish(),
  ranks: z.string().max(200).nullish(),
  fleets: z.string().max(200).nullish(),
  teams: z.string().max(200).nullish(),
  nextPlannedDate: z.string().datetime().nullish(),
  displayFlag: z.number().int().min(0).max(1).default(1),
  status: z.string().max(16).nullish(),
  interfaceCrewRecurrentId: z.string().max(50).nullish(),
  projectDate: z.string().datetime().nullish(),
  recordStatus: z.string().max(20).nullish(),
  baseMonth: z.string().datetime().nullish(),
})

const qualUpdateSchema = qualCreateSchema.partial()

// ---------- Route registration ----------

export default async function crewCredentialRoutes(fastify: FastifyInstance) {
  // ===================== Certificates =====================

  fastify.get<{ Params: { crewId: string } }>(
    '/:crewId/certificates',
    async (request, reply) => {
      const list = await crewCertificateService.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/certificates',
    async (request, reply) => {
      const parsed = certCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewCertificateService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/certificates/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = certUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewCertificateService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'Certificate not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/certificates/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewCertificateService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
        getUsername(request),
      )
      if (!removed) return error(reply, 404, 'Certificate not found')
      return success(reply, removed)
    },
  )

  // ===================== Licenses =====================

  fastify.get<{ Params: { crewId: string } }>(
    '/:crewId/licenses',
    async (request, reply) => {
      const list = await crewLicenseService.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/licenses',
    async (request, reply) => {
      const parsed = licCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewLicenseService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/licenses/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = licUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewLicenseService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'License not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/licenses/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewLicenseService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
        getUsername(request),
      )
      if (!removed) return error(reply, 404, 'License not found')
      return success(reply, removed)
    },
  )

  // ===================== License Instructors =====================

  fastify.get<{ Params: { crewId: string; licenseId: string } }>(
    '/:crewId/licenses/:licenseId/instructors',
    async (request, reply) => {
      const licId = Number(request.params.licenseId)
      if (Number.isNaN(licId)) return fail(reply, 400, 'Invalid licenseId')
      const list = await crewLicInstructorService.listByLicense(
        fastify,
        request.params.crewId,
        licId,
      )
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/license-instructors',
    async (request, reply) => {
      const parsed = instrCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewLicInstructorService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/license-instructors/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = instrUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewLicInstructorService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'Instructor record not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/license-instructors/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewLicInstructorService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
      )
      if (!removed) return error(reply, 404, 'Instructor record not found')
      return success(reply, removed)
    },
  )

  // ===================== Languages =====================

  fastify.get<{ Params: { crewId: string } }>(
    '/:crewId/languages',
    async (request, reply) => {
      const list = await crewLanguageService.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/languages',
    async (request, reply) => {
      const parsed = langCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewLanguageService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/languages/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = langUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewLanguageService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'Language record not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/languages/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewLanguageService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
        getUsername(request),
      )
      if (!removed) return error(reply, 404, 'Language record not found')
      return success(reply, removed)
    },
  )

  // ===================== Qualifications =====================

  fastify.get<{ Params: { crewId: string } }>(
    '/:crewId/qualifications',
    async (request, reply) => {
      const list = await crewQualificationService.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/qualifications',
    async (request, reply) => {
      const parsed = qualCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewQualificationService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/qualifications/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = qualUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewQualificationService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'Qualification not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/qualifications/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewQualificationService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
        getUsername(request),
      )
      if (!removed) return error(reply, 404, 'Qualification not found')
      return success(reply, removed)
    },
  )
}
