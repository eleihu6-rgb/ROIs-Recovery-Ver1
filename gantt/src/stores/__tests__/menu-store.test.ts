import { describe, it, expect, beforeEach } from 'vitest'
import { useMenuStore } from '../menu-store'
import { useAuthStore } from '../auth-store'

const reset = () => {
  useAuthStore.setState({
    user: null, token: null, permissions: null, loading: false, error: null,
    showTimeoutWarning: false, warningExpiresAt: null,
  })
  useMenuStore.setState({ nodes: null, loaded: false })
}

describe('menu-store access', () => {
  beforeEach(reset)

  it('is_admin 全放行', () => {
    useAuthStore.setState({ user: { userCode: 'root', userName: 'root', schema: 'f8', isAdmin: 1 } })
    expect(useMenuStore.getState().canAccessModule('system')).toBe(true)
    expect(useMenuStore.getState().canAccessPage('user-mgmt')).toBe(true)
  })

  it('nodes 未加载 → 放行（fail-open，不阻塞界面）', () => {
    useAuthStore.setState({ user: { userCode: 'u', userName: 'u', schema: 'f8', isAdmin: 0 } })
    expect(useMenuStore.getState().canAccessModule('system')).toBe(true)
  })

  it('按 hasAccess 过滤模块', () => {
    useAuthStore.setState({ user: { userCode: 'u', userName: 'u', schema: 'f8', isAdmin: 0 } })
    useMenuStore.setState({
      nodes: [
        { menuCode: 'LIVE', menuName: 'Live', parentMenuCode: 'ROOT', factoryName: '', systemType: 'S', idx: 1, hasAccess: true, ctrls: [] },
        { menuCode: 'SYSTEM', menuName: 'System', parentMenuCode: 'ROOT', factoryName: '', systemType: 'S', idx: 2, hasAccess: false, ctrls: [] },
      ],
    })
    expect(useMenuStore.getState().canAccessModule('live')).toBe(true)
    expect(useMenuStore.getState().canAccessModule('system')).toBe(false)
  })

  it('页面不在 nodes 中 → 不可访问', () => {
    useAuthStore.setState({ user: { userCode: 'u', userName: 'u', schema: 'f8', isAdmin: 0 } })
    useMenuStore.setState({
      nodes: [
        { menuCode: 'LIVE', menuName: 'Live', parentMenuCode: 'ROOT', factoryName: '', systemType: 'S', idx: 1, hasAccess: true, ctrls: [] },
      ],
    })
    expect(useMenuStore.getState().canAccessPage('roster')).toBe(false) // LIVE_ROSTER 未授权
  })
})
