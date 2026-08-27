import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { dictionaryService } from '../../services/base/dictionary-service.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })
const parentCodeParamSchema = z.object({ parentCode: z.string() })

const createDictionarySchema = z.object({
  parentCode: z.string().max(40).nullish(),
  code: z.string().max(100).nullish(),
  name: z.string().max(500).nullish(),
  idx: z.number().int().nullish(),
  codeValue: z.string().max(50).nullish(),
})

const updateDictionarySchema = createDictionarySchema.partial()

export default async function dictionaryRoutes(fastify: FastifyInstance) {
  // GET / — flat list
  fastify.get('/', async (_request, reply) => {
    const data = await dictionaryService.list(fastify)
    return success(reply, data)
  })

  // GET /tree — hierarchical tree
  fastify.get('/tree', async (_request, reply) => {
    const data = await dictionaryService.getTree(fastify)
    return success(reply, data)
  })

  // GET /parent/:parentCode — children of a given parent
  fastify.get('/parent/:parentCode', async (request, reply) => {
    const { parentCode } = parentCodeParamSchema.parse(request.params)
    const data = await dictionaryService.getByParentCode(fastify, parentCode)
    return success(reply, data)
  })

  // GET /:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const data = await dictionaryService.getById(fastify, id)
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.post('/', async (request, reply) => {
    const body = createDictionarySchema.parse(request.body)
    const data = await dictionaryService.create(fastify, body, 'admin')
    return success(reply, data)
  })

  fastify.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const body = updateDictionarySchema.parse(request.body)
    const data = await dictionaryService.update(fastify, id, body, 'admin')
    if (!data) return fail(reply, 404, 'Not found')
    return success(reply, data)
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await dictionaryService.remove(fastify, id)
    return success(reply, null, 'Deleted')
  })
}
