import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { sql, eq } from 'drizzle-orm'
import { env } from '../../config/index.js'
import { users } from '../../models/system/users.js'
import {
  createSamlSp,
  extractIdentity,
  generateMetadata,
  getAuthorizeUrl,
  validatePostResponse,
  type SamlIdentity,
  type SamlProfile,
  type SamlSpConfig,
} from '../../../../packages/saml/dist/index.js'
import {
  hasSsoPortalAccess,
  TOKEN_INVALID_MESSAGE,
  validateSsoAuthPayload,
  type AuthPayload,
} from '../../services/auth/session-auth.js'
import { buildLoginResponse } from '../../services/auth/login-response.js'

// 相对路径：src/routes/auth/sso.ts → 上 4 层（../→routes, ../../→src, ../../../→live-server, ../../../../→根）→ packages/saml/dist/index.js

const samlConfig = (): SamlSpConfig => ({
  callbackUrl: env.SSO_CALLBACK_URL!,
  entryPoint: env.SSO_IDP_ENTRY_POINT!,
  issuer: env.SSO_ENTITY_ID!,
  idpCert: env.SSO_IDP_CERT!,
  privateKey: env.SSO_PRIVATE_KEY,
  publicCert: env.SSO_PUBLIC_CERT,
  wantAssertionsSigned: true,
  acceptedClockSkewMs: 30_000,
  validateInResponseTo: 'ifPresent',
})

// node-saml 的 InResponseTo 校验依赖发起 AuthnRequest 时缓存的 request ID，
// 该缓存默认挂在 SAML 实例上（每实例独立 InMemoryCacheProvider，见 saml.js）。
// 若每次请求都新建实例，login 缓存的 ID 在 acs 校验时不可见 → 抛 "InResponseTo is not valid"。
// 因此 login / acs / metadata 必须复用同一 SP 实例；env 启动后不变，懒加载即可。
let samlSpInstance: ReturnType<typeof createSamlSp> | undefined
const getSamlSp = (): ReturnType<typeof createSamlSp> => (samlSpInstance ??= createSamlSp(samlConfig()))

const emailAttrs = (): string[] =>
  (env.SSO_EMAIL_ATTRS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const userCodeAttrs = (): string[] =>
  (env.SSO_USERCODE_ATTRS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const ok = (reply: FastifyReply, data: unknown) =>
  reply.send({ code: 200, data, message: 'ok' })

const fail = (reply: FastifyReply, code: number, message: string) =>
  reply.status(code).send({ code, data: null, message })

const callbackSchema = z.object({ token: z.string().min(1) })

async function resolveUser(
  fastify: FastifyInstance,
  identity: SamlIdentity,
): Promise<typeof users.$inferSelect | undefined> {
  if (identity.email) {
    const r = await fastify.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${identity.email})`)
      .limit(1)
    if (r[0]) return r[0]
  }
  if (identity.userCode) {
    const r = await fastify.db
      .select()
      .from(users)
      .where(eq(users.userCode, identity.userCode))
      .limit(1)
    return r[0]
  }
  return undefined
}

export default async function ssoRoutes(fastify: FastifyInstance) {
  fastify.get('/sso/login', async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = getSamlSp()
    const url = await getAuthorizeUrl(saml)
    return reply.redirect(url)
  })

  fastify.post('/sso/acs', async (request: FastifyRequest, reply: FastifyReply) => {
    const redirectBase = env.SSO_REDIRECT_BASE!
    const errorRedirect = () => reply.redirect(`${redirectBase}?sso_error=authentication_failed`)
    try {
      const body = request.body as { SAMLResponse?: string }
      if (!body?.SAMLResponse) return errorRedirect()
      const saml = getSamlSp()
      const { profile } = await validatePostResponse(saml, body.SAMLResponse)
      if (!profile) return errorRedirect()

      const identity = extractIdentity(profile as SamlProfile, { emailAttrs: emailAttrs(), userCodeAttrs: userCodeAttrs() })
      const user = await resolveUser(fastify, identity)
      if (!user) {
        // 诊断：打印断言里可序列化的属性值（跳过 getAssertion/getSamlResponseXml 等方法），
        // 便于确认 Azure 发的 claim 值能否对上 users 表的 email / user_code
        const profileValues: Record<string, unknown> = {}
        if (profile) {
          for (const key of Object.keys(profile)) {
            const value = (profile as unknown as Record<string, unknown>)[key]
            if (typeof value === 'function') continue
            profileValues[key] = value
          }
        }
        request.log.warn({ sso_identity: identity, profile: profileValues }, 'SSO identity matched no live user')
        return reply.redirect(`${redirectBase}?sso_error=user_not_found`)
      }
      if (!hasSsoPortalAccess(user, new Date())) {
        return reply.redirect(`${redirectBase}?sso_error=access_denied`)
      }

      const response = await buildLoginResponse(fastify, user, 'sso')
      return reply.redirect(`${redirectBase}?token=${encodeURIComponent(response.token)}`)
    } catch (error) {
      request.log.error(
        { error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error },
        'SAML ACS validation failed',
      )
      return errorRedirect()
    }
  })

  fastify.get('/sso/metadata', async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = getSamlSp()
    reply.type('application/xml').send(generateMetadata(saml))
  })

  fastify.post('/sso/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = callbackSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, 'token is required')

    const payload = jwt.verify(parsed.data.token, env.JWT_SECRET) as AuthPayload
    if (payload.authMode !== 'sso') return fail(reply, 401, TOKEN_INVALID_MESSAGE)

    const validated = await validateSsoAuthPayload(fastify.db, payload)
    const result = await fastify.db
      .select()
      .from(users)
      .where(eq(users.userCode, validated.userCode))
      .limit(1)
    const user = result[0]
    if (!user) return fail(reply, 401, TOKEN_INVALID_MESSAGE)

    const response = await buildLoginResponse(fastify, user, 'sso', parsed.data.token)
    return ok(reply, response)
  })

  fastify.get('/sso/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect(env.SSO_REDIRECT_BASE!)
  })
  fastify.post('/sso/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect(env.SSO_REDIRECT_BASE!)
  })
}
