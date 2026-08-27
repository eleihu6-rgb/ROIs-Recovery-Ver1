import type { FastifyInstance, FastifyReply } from 'fastify'
import { error } from './response.js'
import { getOrResolvePermissionContext } from '../services/permission/permission-service.js'
import type { AuthPayload } from '../services/auth/session-auth.js'

/**
 * Resolve whether the authenticated user has access to a given `system_menu.menu_code`.
 *
 * - `isAdmin === 1` short-circuits to allow (matches the UI's behavior in
 *   `gantt/src/stores/menu-store.ts`, where admins always pass).
 * - Non-admin users defer to their `PermissionContext.menus`, which is
 *   populated from `profile_menu_privilege` by Roles/Profiles and resolved via
 *   Redis cache (`perm:{schema}:{userCode}`).
 *
 * Pair this with `requireMenuAccess` to gate route handlers — that helper
 * emits the standard 403 response so the caller only needs to check the
 * return value and early-return.
 *
 * The helper accepts the already-narrowed `authUser` (the global auth hook
 * guarantees one exists for every protected route) so call sites do not have
 * to repeat the optional-chaining dance just to satisfy TypeScript.
 */
export const hasMenuAccess = async (
  fastify: FastifyInstance,
  authUser: AuthPayload,
  menuCode: string,
): Promise<boolean> => {
  if (authUser.isAdmin === 1) return true

  const ctx = await getOrResolvePermissionContext(
    fastify.db,
    fastify.redis,
    authUser.schema,
    authUser.userCode,
  )
  return ctx.menus.includes(menuCode)
}

/**
 * Guard variant of `hasMenuAccess` that writes the 403 response on denial.
 * Returns `true` when the user is allowed; otherwise writes a 403 and returns
 * `false`. The caller must `return` immediately when the result is `false`.
 */
export const requireMenuAccess = async (
  fastify: FastifyInstance,
  authUser: AuthPayload,
  reply: FastifyReply,
  menuCode: string,
): Promise<boolean> => {
  if (!(await hasMenuAccess(fastify, authUser, menuCode))) {
    error(reply, 403, 'Access denied: missing menu permission')
    return false
  }
  return true
}