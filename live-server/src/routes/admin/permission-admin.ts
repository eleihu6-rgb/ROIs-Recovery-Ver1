import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'
import { env } from '../../config/index.js'
import {
  adminDeptService,
  adminMenuService,
  adminPbsUserService,
  adminProfileService,
  adminUserService,
  PermissionReferenceValidationError,
} from '../../services/admin/permission-admin-service.js'

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(50) })

const createUserSchema = z.object({
  userCode: z.string().min(1).max(30),
  userName: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
  branchCode: z.string().max(40).default('HQ'),
  pyAbbr: z.string().max(30),
  gender: z.string().max(1).nullish(),
  email: z.string().max(100).email().nullish(),
  effDt: z.coerce.date().default(() => new Date()),
  portalAccess: z.string().max(1).default('Y'),
  passwordAccess: z.string().max(1).default('Y'),
})
const updateUserSchema = z.object({
  userName: z.string().max(100).optional(),
  branchCode: z.string().max(40).optional(),
  gender: z.string().max(1).nullish(),
  email: z.string().max(100).email().nullish(),
  effDt: z.coerce.date().optional(),
  expDt: z.coerce.date().nullish(),
  portalAccess: z.string().max(1).optional(),
  passwordAccess: z.string().max(1).optional(),
  appAccess: z.string().max(1).optional(),
  status: z.number().int().min(0).max(2).optional(),
})
const idParam = z.object({ id: z.coerce.number().int().positive() })
const setProfilesSchema = z.object({ profileIds: z.array(z.number().int().positive()) })
const profileUsersSchema = z.object({ userIds: z.array(z.number().int().positive()).min(1) })

const profileCreateSchema = z.object({
  profileName: z.string().min(1).max(50),
  profileCode: z.string().max(50).optional(),
  filiale: z.string().max(6).default('F8'),
  division: z.string().max(1),
  idx: z.number().int().optional(),
})
const profileUpdateSchema = profileCreateSchema.partial()
// Save routes use plain non-empty strings (≤50 chars) for menuCode/ctlCode:
// validation against the actual menu tree happens in the service layer
// (adminProfileService.setMenus / setCtrls throw PermissionReferenceValidationError
// with "Unknown menu code"/"Unknown control for menu" — far clearer than zod's
// generic "Invalid"). This stays aligned with menuCreateSchema below so existing
// menus created before that schema was tightened still save cleanly.
const setMenusSchema = z.object({ menuCodes: z.array(z.string().min(1).max(50)) })
const setCtrlsSchema = z.object({ ctrls: z.array(z.object({ menuCode: z.string().min(1).max(50), ctlCode: z.string().min(1).max(50) })) })
const setDataScopeSchema = z.object({
  FILIALE: z.array(z.string()).default([]),
  DIVISION: z.array(z.string()).default([]),
  CREW_DEPARTMENT: z.array(z.string()).default([]),
  RANK: z.array(z.string()).default([]),
  FLEET: z.array(z.string()).default([]),
})

const menuCreateSchema = z.object({
  menuCode: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, 'menuCode must be uppercase letters, digits, or underscores'),
  menuName: z.string().min(1).max(50),
  parentMenuCode: z.string().max(50).default('ROOT'),
  factoryName: z.string().max(300).nullish(),
  systemType: z.string().max(1).default('S'),
  idx: z.number().int().optional(),
  apiUris: z.string().max(2000).nullish(),
  icon: z.string().max(50).nullish(),
})
const menuUpdateSchema = menuCreateSchema.partial()

const pbsUserListSchema = pageSchema.extend({
  crewId: z.string().max(30).optional(),
  base: z.string().max(3).optional(),
  rank: z.string().max(10).optional(),
  status: z.coerce.number().int().optional(),
})
const resetPwdSchema = z.object({ newPassword: z.string().min(8).max(100) })

const deptCreateSchema = z.object({
  branchCode: z.string().min(1).max(20),
  branchName: z.string().min(1).max(100),
  parentCode: z.string().max(20).nullish(),
  division: z.string().max(1).nullish(),
  filiale: z.string().max(6).nullish(),
  idx: z.number().int().optional(),
})

export default async function permissionAdminRoutes(fastify: FastifyInstance) {
  // zod 校验失败 → 400（而非 500）
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ code: 400, data: null, message: error.issues[0]?.message ?? 'Invalid request' })
    }
    if (error instanceof PermissionReferenceValidationError) {
      return reply.status(400).send({ code: 400, data: null, message: error.message })
    }
    fastify.log.error({ err: error }, 'permission-admin route error')
    return reply.status(500).send({ code: 500, data: null, message: 'Internal server error' })
  })

  const actor = (request: FastifyRequest): string => request.authUser?.userCode ?? 'admin'
  const schema = (request: FastifyRequest): string => request.authUser?.schema ?? env.LIVE_SCHEMA

  // ---- users ----
  fastify.get('/users', async (request, reply) => {
    const { page, pageSize } = pageSchema.parse(request.query)
    const data = await adminUserService.list(fastify.db, page, pageSize)
    return success(reply, data)
  })
  fastify.post('/users', async (request, reply) => {
    const body = createUserSchema.parse(request.body)
    const row = await adminUserService.create(fastify.db, body, actor(request))
    if (!row) return fail(reply, 409, 'User creation failed (maybe duplicate user code)')
    return success(reply, row)
  })
  fastify.patch('/users/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = updateUserSchema.parse(request.body)
    const row = await adminUserService.update(fastify.db, id, body, actor(request))
    if (!row) return fail(reply, 404, 'Not found')
    return success(reply, row)
  })
  fastify.post('/users/:id/disable', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = z.object({ disabled: z.boolean() }).parse(request.body)
    const row = await adminUserService.setStatus(fastify.db, id, body.disabled ? 1 : 0, actor(request))
    return success(reply, row)
  })
  fastify.post('/users/:id/reset-password', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { newPassword } = resetPwdSchema.parse(request.body)
    const row = await adminUserService.resetPassword(fastify.db, id, newPassword, actor(request))
    return success(reply, { reset: Boolean(row) })
  })
  fastify.post('/users/:id/profiles', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { profileIds } = setProfilesSchema.parse(request.body)
    const user = await adminUserService.getById(fastify.db, id)
    if (!user) return fail(reply, 404, 'Not found')
    await adminUserService.setProfiles(fastify.db, String(user.userCode), profileIds, actor(request))
    return success(reply, { profileIds })
  })

  // ---- profiles ----
  fastify.get('/profiles', async (_request, reply) => {
    return success(reply, await adminProfileService.list(fastify.db))
  })
  fastify.post('/profiles', async (request, reply) => {
    const body = profileCreateSchema.parse(request.body)
    const row = await adminProfileService.create(fastify.db, body, actor(request))
    return success(reply, row)
  })
  fastify.patch('/profiles/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = profileUpdateSchema.parse(request.body)
    const row = await adminProfileService.update(fastify.db, id, body, actor(request))
    return success(reply, row)
  })
  fastify.delete('/profiles/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    await adminProfileService.remove(fastify.db, id)
    return success(reply, { deleted: true })
  })
  fastify.get('/profiles/:id/permissions', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const perms = await adminProfileService.getPermissions(fastify.db, id)
    return success(reply, perms)
  })
  fastify.get('/profiles/:id/users', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    return success(reply, await adminProfileService.listUsers(fastify.db, id))
  })
  fastify.post('/profiles/:id/users', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { userIds } = profileUsersSchema.parse(request.body)
    return success(reply, await adminProfileService.addUsers(fastify.db, fastify.redis, schema(request), id, userIds, actor(request)))
  })
  fastify.delete('/profiles/:id/users', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { userIds } = profileUsersSchema.parse(request.body)
    return success(reply, await adminProfileService.removeUsers(fastify.db, fastify.redis, schema(request), id, userIds))
  })
  fastify.put('/profiles/:id/menus', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { menuCodes } = setMenusSchema.parse(request.body)
    const result = await adminProfileService.setMenus(fastify.db, fastify.redis, schema(request), id, menuCodes, actor(request))
    return success(reply, result)
  })
  fastify.put('/profiles/:id/ctrls', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { ctrls } = setCtrlsSchema.parse(request.body)
    const result = await adminProfileService.setCtrls(fastify.db, fastify.redis, schema(request), id, ctrls, actor(request))
    return success(reply, result)
  })
  fastify.put('/profiles/:id/data-scope', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const scope = setDataScopeSchema.parse(request.body)
    const s = await adminProfileService.setDataScope(fastify.db, fastify.redis, schema(request), id, scope, actor(request))
    return success(reply, { dataScope: s })
  })

  // ---- pbs-users ----
  fastify.get('/pbs-users', async (request, reply) => {
    const q = pbsUserListSchema.parse(request.query)
    const data = await adminPbsUserService.list(fastify.db, q.page, q.pageSize, {
      crewId: q.crewId, base: q.base, rank: q.rank, status: q.status,
    })
    return success(reply, data)
  })
  fastify.post('/pbs-users/:id/disable', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = z.object({ disabled: z.boolean() }).parse(request.body)
    await adminPbsUserService.setStatus(fastify.db, id, body.disabled ? 1 : 0, actor(request))
    return success(reply, { disabled: body.disabled })
  })
  fastify.post('/pbs-users/:id/reset-password', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { newPassword } = resetPwdSchema.parse(request.body)
    await adminPbsUserService.resetPassword(fastify.db, id, newPassword, actor(request))
    return success(reply, { reset: true })
  })

  // ---- menus ----
  fastify.get('/menus', async (_request, reply) => {
    return success(reply, await adminMenuService.tree(fastify.db))
  })
  fastify.post('/menus', async (request, reply) => {
    const body = menuCreateSchema.parse(request.body)
    const row = await adminMenuService.createMenu(fastify.db, body, actor(request))
    return success(reply, row)
  })
  fastify.patch('/menus/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = menuUpdateSchema.parse(request.body)
    const row = await adminMenuService.updateMenu(fastify.db, id, body, actor(request))
    return success(reply, row)
  })
  fastify.delete('/menus/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    await adminMenuService.removeMenu(fastify.db, id)
    return success(reply, { deleted: true })
  })
  fastify.post('/menus/ctrls', async (request, reply) => {
    const body = z.object({ menuCode: z.string().min(1).max(50), menuCtlCode: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, 'menuCtlCode must be uppercase letters, digits, or underscores'), menuCtlName: z.string().max(30), idx: z.number().int().optional(), icon: z.string().max(50).nullish(), apiUris: z.string().max(2000).nullish() }).parse(request.body)
    const row = await adminMenuService.createCtrl(fastify.db, body, actor(request))
    return success(reply, row)
  })
  fastify.patch('/menus/ctrls/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = z.object({ menuCtlName: z.string().max(30).optional(), idx: z.number().int().optional(), icon: z.string().max(50).nullish(), apiUris: z.string().max(2000).nullish() }).parse(request.body)
    const row = await adminMenuService.updateCtrl(fastify.db, id, body, actor(request))
    return success(reply, row)
  })
  fastify.delete('/menus/ctrls/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    await adminMenuService.removeCtrl(fastify.db, id)
    return success(reply, { deleted: true })
  })

  // ---- departments ----
  fastify.get('/departments', async (request, reply) => {
    const kind = String((request.query as { kind?: string }).kind ?? 'user')
    const data = kind === 'crew' ? await adminDeptService.listCrewDepartments(fastify.db) : await adminDeptService.listUserDepartments(fastify.db)
    return success(reply, data)
  })
  fastify.post('/departments', async (request, reply) => {
    const kind = String((request.query as { kind?: string }).kind ?? 'user')
    const body = deptCreateSchema.parse(request.body)
    const row = kind === 'crew'
      ? await adminDeptService.createCrewDepartment(fastify.db, body, actor(request))
      : await adminDeptService.createUserDepartment(fastify.db, body, actor(request))
    return success(reply, row)
  })
  fastify.delete('/departments/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const kind = String((request.query as { kind?: string }).kind ?? 'user')
    if (kind === 'crew') await adminDeptService.removeCrewDepartment(fastify.db, id)
    else await adminDeptService.removeUserDepartment(fastify.db, id)
    return success(reply, { deleted: true })
  })
  fastify.patch('/departments/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const kind = String((request.query as { kind?: string }).kind ?? 'user')
    const body = deptCreateSchema.partial().parse(request.body)
    const row = kind === 'crew'
      ? await adminDeptService.updateCrewDepartment(fastify.db, id, body, actor(request))
      : await adminDeptService.updateUserDepartment(fastify.db, id, body, actor(request))
    return success(reply, row)
  })
}
