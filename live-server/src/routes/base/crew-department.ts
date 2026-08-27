import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { crewDepartmentService } from '../../services/base/crew-department-service.js'
import { filterByScope, resolveRequestDataScope } from '../../services/permission/scope-option.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const createDepartmentSchema = z.object({
  branchCode: z.string().max(20),
  branchName: z.string().max(100),
  parentCode: z.string().max(20).nullish(),
  idx: z.number().int().nullish(),
  division: z.string().max(1).nullish(),
  filiale: z.string().max(6).nullish(),
})

const updateDepartmentSchema = createDepartmentSchema.partial()

export default async function crewDepartmentRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const data = await crewDepartmentService.list(fastify)
    const scope = await resolveRequestDataScope(fastify.db, fastify.redis, request.authUser)
    return success(reply, filterByScope(data, scope, 'CREW_DEPARTMENT', (d) => d.branchCode))
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await crewDepartmentService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createDepartmentSchema.parse(request.body)
    const data = await crewDepartmentService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateDepartmentSchema.parse(request.body)
    const data = await crewDepartmentService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await crewDepartmentService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
