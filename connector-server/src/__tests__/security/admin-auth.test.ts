import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import type { FastifyPluginAsync } from 'fastify'
import jwt from 'jsonwebtoken'

process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

let jwtSecret: string
const sign = (payload: object) => jwt.sign(payload, jwtSecret, { expiresIn: '5m' })

describe('connector admin authorization (verifyAdminJwt)', () => {
  let app: FastifyInstance
  let redisGet: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    // Loaded here (after env is set) — avoids top-level await (CJS build).
    jwtSecret = (await import('../../config/index.js')).env.JWT_SECRET
    const authPlugin = (await import('../../plugins/auth.js')).default as unknown as FastifyPluginAsync
    app = Fastify({ logger: false })
    redisGet = vi.fn(async () => null)
    ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('redis', { get: redisGet })
    await app.register(authPlugin)
    app.get('/api/admin/ping', async () => ({ ok: true }))
    // Endpoints exercised by live-server's PBS Material Import flow.
    app.get('/api/admin/connectors', async () => ({ ok: true }))
    app.post('/api/admin/connectors/:id/trigger', async () => ({ ok: true }))
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  const ping = (headers?: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/api/admin/ping', headers })

  const listConnectors = (headers?: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/api/admin/connectors', headers })

  const triggerConnector = (id: number, headers?: Record<string, string>) =>
    app.inject({ method: 'POST', url: `/api/admin/connectors/${id}/trigger`, headers })

  it('returns 401 when no token is provided', async () => {
    const res = await ping()
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for an invalid/garbage token', async () => {
    const res = await ping({ authorization: 'Bearer not-a-jwt' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 for a valid non-admin Live JWT', async () => {
    const token = sign({ userCode: 'u1', userName: 'User', schema: 'f8', isAdmin: 0 })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(403)
  })

  it('allows a Live admin JWT (isAdmin === 1)', async () => {
    const token = sign({ userCode: 'a1', userName: 'Admin', schema: 'f8', isAdmin: 1 })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(200)
  })

  it('returns 403 for a connector JWT without connector:admin scope', async () => {
    const token = sign({ clientId: 'cid', schema: '', scopes: ['connector:read'], type: 'connector' })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(403)
  })

  it('allows a connector JWT with connector:admin scope', async () => {
    const token = sign({ clientId: 'cid', schema: '', scopes: ['connector:admin'], type: 'connector' })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(200)
  })

  it('allows a non-admin Live JWT whose perm context includes SYSTEM_QUEUE_TASKS', async () => {
    redisGet.mockResolvedValue(JSON.stringify({ menus: ['LIVE', 'SYSTEM', 'SYSTEM_QUEUE_TASKS'], ctrls: {}, dataScope: {}, permVersion: 1 }))
    const token = sign({ userCode: 'ops', userName: 'Ops', schema: 'f8', isAdmin: 0 })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(200)
    expect(redisGet).toHaveBeenCalledWith('perm:f8:ops')
  })

  it('forbids a non-admin Live JWT whose perm context lacks SYSTEM_QUEUE_TASKS', async () => {
    redisGet.mockResolvedValue(JSON.stringify({ menus: ['LIVE'], ctrls: {}, dataScope: {}, permVersion: 1 }))
    const token = sign({ userCode: 'viewer', userName: 'Viewer', schema: 'f8', isAdmin: 0 })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(403)
  })

  it('forbids a non-admin Live JWT when the perm context is missing from Redis', async () => {
    redisGet.mockResolvedValue(null)
    const token = sign({ userCode: 'u1', userName: 'User', schema: 'f8', isAdmin: 0 })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(403)
  })

  // ----- Path-aware menu code check (PBS Material Import cross-service fix) -----

  it('allows non-admin Live JWT with SCENARIO_IMPORT_PBS ctl to list /api/admin/connectors', async () => {
    redisGet.mockResolvedValue(JSON.stringify({
      menus: ['SCENARIO_ALL'],
      ctrls: { SCENARIO_ALL: ['SCENARIO_IMPORT_PBS'] },
      dataScope: {},
      permVersion: 1,
    }))
    const token = sign({ userCode: 'yuan.z', userName: 'Yuan', schema: 'f8', isAdmin: 0 })
    const res = await listConnectors({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(200)
    expect(redisGet).toHaveBeenCalledWith('perm:f8:yuan.z')
  })

  it('allows non-admin Live JWT with SCENARIO_IMPORT_PBS ctl to trigger a connector', async () => {
    redisGet.mockResolvedValue(JSON.stringify({
      menus: ['SCENARIO_ALL'],
      ctrls: { SCENARIO_ALL: ['SCENARIO_IMPORT_PBS'] },
      dataScope: {},
      permVersion: 1,
    }))
    const token = sign({ userCode: 'yuan.z', userName: 'Yuan', schema: 'f8', isAdmin: 0 })
    const res = await triggerConnector(9, { authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(200)
  })

  it('forbids non-admin Live JWT lacking SCENARIO_IMPORT_PBS ctl from listing connectors', async () => {
    redisGet.mockResolvedValue(JSON.stringify({
      menus: ['SCENARIO_ALL'],
      ctrls: {},
      dataScope: {},
      permVersion: 1,
    }))
    const token = sign({ userCode: 'viewer', userName: 'Viewer', schema: 'f8', isAdmin: 0 })
    const res = await listConnectors({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(403)
  })

  it('forbids non-admin Live JWT lacking SCENARIO_IMPORT_PBS ctl from triggering a connector', async () => {
    redisGet.mockResolvedValue(JSON.stringify({
      menus: ['SCENARIO_ALL'],
      ctrls: {},
      dataScope: {},
      permVersion: 1,
    }))
    const token = sign({ userCode: 'viewer', userName: 'Viewer', schema: 'f8', isAdmin: 0 })
    const res = await triggerConnector(9, { authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(403)
  })

  it('still requires SYSTEM_QUEUE_TASKS for unrelated admin paths (regression)', async () => {
    // User has SCENARIO_IMPORT_PBS but NOT SYSTEM_QUEUE_TASKS — must NOT pass /api/admin/ping
    redisGet.mockResolvedValue(JSON.stringify({
      menus: ['SCENARIO_ALL'],
      ctrls: { SCENARIO_ALL: ['SCENARIO_IMPORT_PBS'] },
      dataScope: {},
      permVersion: 1,
    }))
    const token = sign({ userCode: 'yuan.z', userName: 'Yuan', schema: 'f8', isAdmin: 0 })
    const res = await ping({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(403)
  })

  it('SCENARIO_IMPORT_PBS granted as parent menu (menus array) is also accepted', async () => {
    // Defensive: covers the case where SCENARIO_IMPORT_PBS appears in menus
    // (e.g., older grants or promoted-to-parent code) instead of under ctrls.
    redisGet.mockResolvedValue(JSON.stringify({
      menus: ['SCENARIO_ALL', 'SCENARIO_IMPORT_PBS'],
      ctrls: {},
      dataScope: {},
      permVersion: 1,
    }))
    const token = sign({ userCode: 'yuan.z', userName: 'Yuan', schema: 'f8', isAdmin: 0 })
    const res = await listConnectors({ authorization: `Bearer ${token}` })
    expect(res.statusCode).toBe(200)
  })
})
