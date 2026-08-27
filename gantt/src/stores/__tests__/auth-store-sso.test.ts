import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const api = {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  }
  return { api }
})

vi.mock('@/services/api', () => ({
  api: h.api,
  getLastActivityAt: () => 0,
  resetActivity: vi.fn(),
  setOnUnauthorized: vi.fn(),
}))

import { useAuthStore } from '../auth-store'

const loginShape = {
  token: 'jwt-1',
  userCode: 'Ryan',
  userName: 'Ryan',
  schema: 'f8',
  isAdmin: 0,
  menus: ['LIVE'],
  ctrls: {},
  dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
}

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, permissions: null, loading: false, error: null })
  h.api.post.mockReset()
  sessionStorage.clear()
})

describe('completeSso', () => {
  it('POST /api/auth/sso/callback 并写入会话', async () => {
    h.api.post.mockResolvedValue(loginShape)
    const ok = await useAuthStore.getState().completeSso('url-token')
    expect(ok).toBe(true)
    expect(h.api.post).toHaveBeenCalledWith('/api/auth/sso/callback', { token: 'url-token' })
    const s = useAuthStore.getState()
    expect(s.user?.userCode).toBe('Ryan')
    expect(s.token).toBe('jwt-1')
    expect(s.permissions?.menus).toEqual(['LIVE'])
    expect(sessionStorage.getItem('rois-auth')).toContain('jwt-1')
  })

  it('失败 → 返回 false 并设 error', async () => {
    h.api.post.mockRejectedValue(new Error('SSO login failed'))
    const ok = await useAuthStore.getState().completeSso('bad')
    expect(ok).toBe(false)
    expect(useAuthStore.getState().error).toBe('SSO login failed')
  })
})
