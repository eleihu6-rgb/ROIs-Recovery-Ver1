import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { getOrResolvePermissionContext } from '../../services/permission/permission-service.js'
import { success, error } from '../../utils/response.js'
import { CostLibraryError, CostLibraryService } from '../../services/cost/cost-library-service.js'
import { idSchema, setSchema, revisionSchema, inputsSchema } from '../../services/cost/cost-validation.js'

export default async function costLibraryRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new CostLibraryService(fastify.pgPool)
  const menu = 'LEGALITY_RULE_SETS'
  const id = (request: FastifyRequest): number => z.object({ id: idSchema }).parse(request.params).id
  const user = (request: FastifyRequest): string => request.authUser!.userCode
  const route = (method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE', url: string, control: string | null, handler: (request: FastifyRequest) => Promise<unknown>): void => {
    fastify.route({ method,url,handler: async (request,reply) => {
      if (!request.authUser) return error(reply,401,'Authentication required')
      if (!await requireMenuAccess(fastify,request.authUser,reply,menu)) return
      if (control && request.authUser.isAdmin !== 1) {
        const context = await getOrResolvePermissionContext(fastify.db,fastify.redis,request.authUser.schema,request.authUser.userCode)
        if (!context.ctrls[menu]?.includes(control)) return error(reply,403,'Access denied: missing control permission')
      }
      try { return success(reply,await handler(request)) }
      catch (err) {
        if (err instanceof z.ZodError) return error(reply,400,err.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '))
        if (err instanceof CostLibraryError) return error(reply,err.statusCode,err.message)
        request.log.error({ err },'Cost library request failed')
        return error(reply,500,'Cost library request failed')
      }
    } })
  }
  route('GET','/catalog',null,async () => service.catalog())
  route('GET','/instances/:id/revisions',null,async r => service.revisions(id(r)))
  route('POST','/instances/:id/copy','BTN_COPY',async r => service.copyInstance(id(r),user(r)))
  route('PATCH','/instances/:id','BTN_EDIT_META',async r => service.updateInstance(id(r),z.object({ name:z.string().trim().min(1).max(200),enabled:z.boolean() }).strict().parse(r.body),user(r)))
  route('DELETE','/instances/:id','BTN_DELETE',async r => service.deleteInstance(id(r)))
  route('POST','/instances/:id/revisions','BTN_EDIT_PARAM',async r => service.addRevision(id(r),revisionSchema.parse(r.body),user(r)))
  route('POST','/sets','BTN_NEW_RULESET',async r => service.createSet(setSchema.parse(r.body),user(r)))
  route('PATCH','/sets/:id','BTN_EDIT',async r => service.updateSet(id(r),setSchema.extend({expectedVersion:z.number().int().positive()}).parse(r.body),user(r)))
  route('PUT','/sets/:id/members','BTN_ADD_RULES',async r => { const body=z.object({revisionIds:z.array(idSchema),expectedVersion:z.number().int().positive()}).strict().parse(r.body); return service.setMembers(id(r),body.revisionIds,body.expectedVersion,user(r)) })
  route('POST','/sets/:id/copy','BTN_COPY',async r => { const body=z.object({name:z.string().trim().min(1).max(200),mode:z.enum(['shared','independent'])}).strict().parse(r.body); return service.copySet(id(r),body.name,body.mode,user(r)) })
  route('DELETE','/sets/:id','BTN_DELETE',async r => service.deleteSet(id(r)))
  route('POST','/calculate','BTN_EDIT_PARAM',async r => { const body=z.object({revisionId:idSchema,inputs:inputsSchema}).strict().parse(r.body); return service.calculate(body.revisionId,body.inputs) })
}
