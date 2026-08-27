import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { paginationQuerySchema } from '../../utils/pagination.js'
import { pairingTemplateService } from '../../services/pairing/pairing-template-service.js'

export default async function pairingTemplateRoutes(fastify: FastifyInstance) {
  // GET /api/pairing/template — list templates
  fastify.get('/', async (request, reply) => {
    const parsed = paginationQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await pairingTemplateService.list(fastify, parsed.data)
    return success(reply, result)
  })

  // GET /api/pairing/template/:id — detail with template details
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const result = await pairingTemplateService.getById(fastify, numId)
    if (!result) {
      return fail(reply, 404, 'Template not found')
    }
    return success(reply, result)
  })

  // POST /api/pairing/template — create template
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingTemplateService.create(fastify, body as never, username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PUT /api/pairing/template/:id — update template
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingTemplateService.update(fastify, numId, body as never, username)
      if (!result) {
        return fail(reply, 404, 'Template not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/pairing/template/:id — delete template + details
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    try {
      await pairingTemplateService.remove(fastify, numId)
      return success(reply, null)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // --- Template Detail CRUD ---

  // POST /api/pairing/template/:id/detail
  fastify.post('/:id/detail', async (request, reply) => {
    const { id } = request.params as { id: string }
    const templateId = Number(id)
    if (Number.isNaN(templateId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingTemplateService.createDetail(
        fastify,
        { ...body, templateId } as never,
        username,
      )
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PUT /api/pairing/template/detail/:detailId
  fastify.put('/detail/:detailId', async (request, reply) => {
    const { detailId } = request.params as { detailId: string }
    const numId = Number(detailId)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid detailId')
    }

    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await pairingTemplateService.updateDetail(fastify, numId, body as never, username)
      if (!result) {
        return fail(reply, 404, 'Template detail not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/pairing/template/detail/:detailId
  fastify.delete('/detail/:detailId', async (request, reply) => {
    const { detailId } = request.params as { detailId: string }
    const numId = Number(detailId)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid detailId')
    }

    try {
      const result = await pairingTemplateService.removeDetail(fastify, numId)
      if (!result) {
        return fail(reply, 404, 'Template detail not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })
}
