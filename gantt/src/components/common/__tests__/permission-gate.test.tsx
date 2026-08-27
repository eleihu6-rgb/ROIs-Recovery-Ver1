import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import type { ReactNode } from 'react'
import { PermissionGate } from '../permission-gate'
import { useAuthStore } from '@/stores/auth-store'

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

function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { container, root }
}

const user = (isAdmin: number) => ({ userCode: 'u', userName: 'u', schema: 'f8', isAdmin })

describe('PermissionGate', () => {
  beforeEach(() => resetStore())

  it('is_admin 渲染 children（不受菜单限制）', () => {
    useAuthStore.setState({ user: user(1) })
    const { container } = render(
      <PermissionGate menuCode="SYSTEM"><button>admin-btn</button></PermissionGate>,
    )
    expect(container.textContent).toContain('admin-btn')
  })

  it('无菜单权限不渲染 children，渲染 fallback', () => {
    useAuthStore.setState({
      user: user(0),
      permissions: { menus: ['LIVE'], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] } },
    })
    const { container } = render(
      <PermissionGate menuCode="SYSTEM" fallback={<span>locked</span>}><button>secret</button></PermissionGate>,
    )
    expect(container.textContent).not.toContain('secret')
    expect(container.textContent).toContain('locked')
  })

  it('有 ctl 权限渲染 children', () => {
    useAuthStore.setState({
      user: user(0),
      permissions: { menus: ['LIVE_ROSTER'], ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] }, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] } },
    })
    const { container } = render(
      <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_SAVE"><button>save-btn</button></PermissionGate>,
    )
    expect(container.textContent).toContain('save-btn')
  })

  it('无 ctl 权限不渲染 children', () => {
    useAuthStore.setState({
      user: user(0),
      permissions: { menus: ['LIVE_ROSTER'], ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] }, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] } },
    })
    const { container } = render(
      <PermissionGate menuCode="LIVE_ROSTER" ctlCode="BTN_EXPORT"><button>export-btn</button></PermissionGate>,
    )
    expect(container.textContent).not.toContain('export-btn')
  })

  it('menuCode 为空不限制（无权限用户也可见）', () => {
    useAuthStore.setState({ user: user(0), permissions: { menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] } } })
    const { container } = render(
      <PermissionGate><button>always-visible</button></PermissionGate>,
    )
    expect(container.textContent).toContain('always-visible')
  })
})
