import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

// Mock the shell store with a controllable activePbsItem. We rebuild the mock
// per test so each case can pick the item it wants PbsView to render.
const shellState = {
  activePbsItem: 'period' as 'period' | 'bid-definitions' | 'business-time' | 'admin-tools' | 'simulated-crew-portal',
  setPbsItem: vi.fn(),
}
vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (s: typeof shellState) => unknown) => selector(shellState),
}))

// Mock the menu store with a controllable canAccessMenu function. Update
// `menuAccess` per test; useMenuStore() reads it through the closure.
let menuAccess: (menuCode?: string | null) => boolean = () => false
const menuAccessCalls: Array<string | undefined> = []
vi.mock('@/stores/menu-store', () => ({
  useMenuStore: (selector: (s: { canAccessMenu: (menuCode?: string | null) => boolean }) => unknown) =>
    selector({ canAccessMenu: (code?: string | null) => { menuAccessCalls.push(code); return menuAccess(code) } }),
}))

// Mock each PBS sub-view so we can verify which one gets mounted without
// pulling in their real dependencies. vi.mock paths are relative to the test
// file, so use `../` to reach sibling modules.
vi.mock('../pbs-period-view', () => ({ PbsPeriodView: () => <div data-testid="pbs-period-view" /> }))
vi.mock('../pbs-admin-tools', () => ({ PbsAdminTools: () => <div data-testid="pbs-admin-tools" /> }))
vi.mock('../pbs-business-time-view', () => ({ PbsBusinessTimeView: () => <div data-testid="pbs-business-time-view" /> }))
vi.mock('../pbs-bid-definitions-view', () => ({ PbsBidDefinitionsView: () => <div data-testid="pbs-bid-definitions-view" /> }))
vi.mock('../pbs-simulated-crew-portal-view', () => ({ PbsSimulatedCrewPortalView: () => <div data-testid="pbs-simulated-crew-portal-view" /> }))

import { PbsView } from '../pbs-view'

const renderView = async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(<PbsView />)
  })
  return { container, root }
}

describe('PbsView permission gate (uses menu permission, not users.is_admin)', () => {
  beforeEach(() => {
    menuAccessCalls.length = 0
  })

  it('renders nothing when canAccessMenu("PBS") returns false (non-permitted user)', async () => {
    menuAccess = () => false
    shellState.activePbsItem = 'period'
    const { container } = await renderView()

    expect(menuAccessCalls).toContain('PBS')
    expect(container.querySelector('[data-testid="pbs-period-view"]')).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('renders the period view when canAccessMenu("PBS") returns true (admin short-circuit)', async () => {
    menuAccess = () => true
    shellState.activePbsItem = 'period'
    const { container } = await renderView()

    expect(container.querySelector('[data-testid="pbs-period-view"]')).not.toBeNull()
  })

  it('renders the bid-definitions view when permitted (previously admin-only)', async () => {
    // Old admin-only check would have hidden this; with the permission gate
    // a user granted PBS menu access sees the view even if not admin.
    menuAccess = () => true
    shellState.activePbsItem = 'bid-definitions'
    const { container } = await renderView()

    expect(container.querySelector('[data-testid="pbs-bid-definitions-view"]')).not.toBeNull()
  })

  it('routes to admin-tools sub-view when permitted', async () => {
    menuAccess = () => true
    shellState.activePbsItem = 'admin-tools'
    const { container } = await renderView()

    expect(container.querySelector('[data-testid="pbs-admin-tools"]')).not.toBeNull()
  })

  it('does not re-check menu permission for sub-view selection (only at gate)', async () => {
    // The gate checks canAccessMenu('PBS') once; the switch picks the active
    // sub-view without further permission checks. This keeps behaviour
    // consistent with the previous admin-only version (no per-item gating).
    menuAccess = (code?: string | null) => code === 'PBS'
    shellState.activePbsItem = 'business-time'
    const { container } = await renderView()

    expect(menuAccessCalls.filter((c) => c === 'PBS').length).toBe(1)
    expect(container.querySelector('[data-testid="pbs-business-time-view"]')).not.toBeNull()
  })
})