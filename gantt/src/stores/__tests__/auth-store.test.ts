import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/api'
import { useAuthStore } from '../auth-store'

const STORAGE_KEY = 'rois-auth'

const resetStore = () => {
  useAuthStore.setState({
    user: null,
    token: null,
    permissions: null,
    loading: false,
    error: null,
    showTimeoutWarning: false,
    warningExpiresAt: null,
  })
}

const samplePermissions = {
  menus: ['LIVE', 'LIVE_ROSTER'],
  ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] },
  dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: ['B737'] },
}

describe('useAuthStore logout', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    delete api.defaults.headers.common.Authorization
    resetStore()
  })

  it('notifies the server before clearing the local session', () => {
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValue({} as never)
    const user = {
      userCode: 'Taylor',
      userName: 'Taylor',
      schema: 'f8',
      isAdmin: 0,
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token: 'jwt-token' }))
    api.defaults.headers.common.Authorization = 'Bearer jwt-token'
    useAuthStore.setState({ user, token: 'jwt-token' })

    useAuthStore.getState().logout()

    expect(deleteSpy).toHaveBeenCalledWith('/api/auth/session')
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(api.defaults.headers.common.Authorization).toBeUndefined()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().permissions).toBeNull()
  })

  it('still clears the local session when server logout fails', () => {
    vi.spyOn(api, 'delete').mockRejectedValue(new Error('network down'))
    const user = {
      userCode: 'Taylor',
      userName: 'Taylor',
      schema: 'f8',
      isAdmin: 0,
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token: 'jwt-token' }))
    api.defaults.headers.common.Authorization = 'Bearer jwt-token'
    useAuthStore.setState({ user, token: 'jwt-token', permissions: samplePermissions })

    useAuthStore.getState().logout()

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(api.defaults.headers.common.Authorization).toBeUndefined()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().permissions).toBeNull()
  })

  it('login stores menus/ctrls/dataScope from the response', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      token: 'jwt-token',
      userCode: 'Taylor',
      userName: 'Taylor',
      schema: 'f8',
      isAdmin: 0,
      menus: samplePermissions.menus,
      ctrls: samplePermissions.ctrls,
      dataScope: samplePermissions.dataScope,
    } as never)

    const ok = await useAuthStore.getState().login('Taylor', 'Our2027')

    expect(ok).toBe(true)
    expect(useAuthStore.getState().permissions).toEqual(samplePermissions)
    useAuthStore.getState().stopIdleMonitor()
  })

  it('restore parses the new /me shape (user nested + permissions)', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      user: { userCode: 'Taylor', userName: 'Taylor', schema: 'f8', isAdmin: 0 },
      menus: samplePermissions.menus,
      ctrls: samplePermissions.ctrls,
      dataScope: samplePermissions.dataScope,
    } as never)
    const user = { userCode: 'Taylor', userName: 'Taylor', schema: 'f8', isAdmin: 0 }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token: 'jwt-token' }))
    api.defaults.headers.common.Authorization = 'Bearer jwt-token'

    const ok = await useAuthStore.getState().restore()

    expect(ok).toBe(true)
    expect(useAuthStore.getState().permissions).toEqual(samplePermissions)
    useAuthStore.getState().stopIdleMonitor()
  })
})
