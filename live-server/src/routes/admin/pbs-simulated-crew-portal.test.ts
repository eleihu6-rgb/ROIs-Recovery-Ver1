import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/index.js', () => ({
  env: {
    PBS_SERVER_URL: 'http://pbs-server.local',
    PBS_INTERNAL_API_SECRET: 'internal-secret',
  },
}))

const getOrResolvePermissionContext = vi.fn()

vi.mock('../../services/permission/permission-service.js', () => ({
  getOrResolvePermissionContext: (...args: unknown[]) =>
    (getOrResolvePermissionContext as unknown as (...a: unknown[]) => unknown)(...args),
}))

import pbsSimulatedCrewPortalAdminRoutes from './pbs-simulated-crew-portal.js'

interface PermissionMenuFixture {
  menus: string[]
}

const stubPermissionContext = (menus: string[]): PermissionMenuFixture => ({ menus })

const buildApp = async (isAdmin = 1, grantedMenus: string[] = []) => {
  getOrResolvePermissionContext.mockReset()
  if (isAdmin !== 1) {
    getOrResolvePermissionContext.mockResolvedValue(stubPermissionContext(grantedMenus))
  }

  const app = Fastify()
  app.decorate('db', {} as never)
  app.decorate('redis', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    ;(request as { authUser?: unknown }).authUser = {
      userCode: isAdmin ? 'admin' : 'crew',
      userName: isAdmin ? 'Admin User' : 'Crew User',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(pbsSimulatedCrewPortalAdminRoutes, { prefix: '/api/admin' })
  return app
}

describe('PBS simulated crew portal admin routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates simulated portal sessions through the PBS internal API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: {
        cleanUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid',
        token: 'internal-simulated-token',
        expiresAt: '2026-08-17T10:00:00.000Z',
        maxAgeSeconds: 300,
      },
      message: 'ok',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/simulated-crew-portal/sessions',
      headers: {
        host: 'crew-f8-usva-sit.roiscloud.com',
      },
      payload: { crewCode: 'B79185' },
    })

    const responseBody = response.json()
    const setCookieHeaders = response.headers['set-cookie']
    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]

    expect(response.statusCode).toBe(200)
    expect(responseBody.data.url).toBe('https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid')
    expect(JSON.stringify(responseBody)).not.toContain('internal-simulated-token')
    expect(cookies).toEqual(expect.arrayContaining([
      expect.stringContaining('__Secure-pbs-simulated-login=internal-simulated-token'),
      expect.stringContaining('Path=/pbs/api/auth/simulated-session'),
    ]))
    expect(cookies.join('\n')).toContain('HttpOnly')
    expect(cookies.join('\n')).toContain('SameSite=Lax')
    expect(cookies.join('\n')).toContain('Secure')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://pbs-server.local/api/internal/simulated-crew-portal/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Internal-Secret': 'internal-secret',
        }),
        body: JSON.stringify({
          crewCode: 'B79185',
          adminUserCode: 'admin',
          adminUserName: 'Admin User',
        }),
      }),
    )
    await app.close()
  })

  it('uses a dev-only simulated login cookie for local HTTP portal URLs', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: {
        cleanUrl: 'http://localhost:3030/pbs/login?simulate=1&redirect=%2Fbid',
        token: 'local-simulated-token',
        expiresAt: '2026-08-17T10:00:00.000Z',
        maxAgeSeconds: 120,
      },
      message: 'ok',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/simulated-crew-portal/sessions',
      headers: {
        host: 'localhost:5173',
      },
      payload: { crewCode: 'B79185' },
    })

    const setCookieHeaders = response.headers['set-cookie']
    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
    const joinedCookies = cookies.join('\n')

    expect(response.statusCode).toBe(200)
    expect(response.json().data.url).toBe('http://localhost:3030/pbs/login?simulate=1&redirect=%2Fbid')
    expect(joinedCookies).toContain('pbs-simulated-login-dev=local-simulated-token')
    expect(joinedCookies).toContain('Path=/pbs/api/auth/simulated-session')
    expect(joinedCookies).toContain('Path=/api/auth/simulated-session')
    expect(joinedCookies).toContain('HttpOnly')
    expect(joinedCookies).toContain('SameSite=Lax')
    expect(joinedCookies).not.toContain('Secure')
    await app.close()
  })

  it('loads simulated portal configuration through the PBS internal API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: {
        portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
        loginTtlSeconds: 300,
      },
      message: 'ok',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/simulated-crew-portal/config',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual({
      portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
      loginTtlSeconds: 300,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://pbs-server.local/api/internal/simulated-crew-portal/config',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-Internal-Secret': 'internal-secret',
        }),
      }),
    )
    await app.close()
  })

  it.each([401, 403])('maps downstream PBS internal auth status %s to a gateway failure', async (statusCode) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: statusCode,
      data: null,
      message: 'Authentication required. Please login first.',
    }), { status: statusCode }))
    vi.stubGlobal('fetch', fetchMock)
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/simulated-crew-portal/config',
    })

    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({
      code: 502,
      data: null,
      message: 'PBS internal service authorization failed. Check simulated portal configuration.',
    })
    await app.close()
  })

  it('saves simulated portal configuration through the PBS internal API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: {
        portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
        loginTtlSeconds: 600,
      },
      message: 'ok',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const app = await buildApp()

    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/simulated-crew-portal/config',
      payload: {
        portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
        loginTtlSeconds: 600,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.loginTtlSeconds).toBe(600)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://pbs-server.local/api/internal/simulated-crew-portal/config',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-Internal-Secret': 'internal-secret',
        }),
        body: JSON.stringify({
          portalPublicUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs',
          loginTtlSeconds: 600,
          updatedBy: 'admin',
        }),
      }),
    )
    await app.close()
  })

  it('blocks users without the PBS_SIMULATED_CREW_PORTAL menu permission', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const app = await buildApp(0, [])

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/simulated-crew-portal/sessions',
      payload: { crewCode: 'B79185' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Access denied: missing menu permission')
    await app.close()
  })

  it('allows non-admin users that have the PBS_SIMULATED_CREW_PORTAL menu permission', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: {
        cleanUrl: 'https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid',
        token: 'internal-simulated-token',
        maxAgeSeconds: 300,
      },
      message: 'ok',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const app = await buildApp(0, ['PBS_SIMULATED_CREW_PORTAL'])

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/simulated-crew-portal/sessions',
      headers: { host: 'crew-f8-usva-sit.roiscloud.com' },
      payload: { crewCode: 'B79185' },
    })

    expect(response.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalled()
    await app.close()
  })
})
