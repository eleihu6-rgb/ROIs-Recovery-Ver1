import { beforeEach, describe, expect, it } from 'vitest'
import { useShellStore } from '../shell-store'

const resetShellStore = (): void => {
  localStorage.clear()
  useShellStore.setState({
    activeModule: 'dashboard',
    activeLiveItem: 'roster',
    activeScenarioItem: 'all',
    activeLegalityItem: 'rule-sets',
    activeSystemItem: 'scheduler',
    activePbsItem: 'period',
    openTabs: ['dashboard'],
    scenarioTabLabels: {},
    scenarioTabTypes: {},
    scenarioTabRefreshTokens: {},
    topNavVisible: true,
    sidebarState: 'expanded',
    sidebarUserOverride: false,
    sidebarStatesByModule: {},
    filterDialogOpen: false,
    filterDialogTab: null,
  })
}

describe('shell-store module-scoped sidebar state', () => {
  beforeEach(() => resetShellStore())

  it('does not let a Live sidebar expansion leak into Data', () => {
    useShellStore.getState().setModule('live')
    expect(useShellStore.getState().sidebarState).toBe('collapsed')

    useShellStore.getState().setSidebarState('expanded', true)
    expect(useShellStore.getState().sidebarState).toBe('expanded')

    useShellStore.getState().setModule('data')
    expect(useShellStore.getState().sidebarState).toBe('expanded')

    useShellStore.getState().setSidebarState('collapsed', true)
    useShellStore.getState().setModule('live')
    expect(useShellStore.getState().sidebarState).toBe('expanded')
  })

  it('shares sidebar state between Scenario list and opened scenario Gantt tabs', () => {
    useShellStore.getState().setModule('scenario')
    useShellStore.getState().setSidebarState('expanded', true)

    useShellStore.getState().setModule('scenario-gantt:596')
    expect(useShellStore.getState().sidebarState).toBe('expanded')

    useShellStore.getState().setSidebarState('collapsed', true)
    useShellStore.getState().setModule('scenario')
    expect(useShellStore.getState().sidebarState).toBe('collapsed')
  })

  it('restores persisted module states from localStorage', () => {
    localStorage.setItem('rois-shell-module', 'data')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['data']))
    localStorage.setItem('rois-shell-sidebar-by-module', JSON.stringify({
      live: 'expanded',
      data: 'collapsed',
    }))

    useShellStore.getState().loadFromStorage()
    expect(useShellStore.getState().activeModule).toBe('data')
    expect(useShellStore.getState().sidebarState).toBe('collapsed')

    useShellStore.getState().setModule('live')
    expect(useShellStore.getState().sidebarState).toBe('expanded')
  })

  it('falls back from hidden Live and Legality submenu items when restoring localStorage', () => {
    localStorage.setItem('rois-shell-live-item', 'pairing')
    localStorage.setItem('rois-shell-legality-item', 'composition')

    useShellStore.getState().loadFromStorage()

    expect(useShellStore.getState().activeLiveItem).toBe('roster')
    expect(useShellStore.getState().activeLegalityItem).toBe('rule-sets')
  })

  it('restores the System Scheduler submenu item', () => {
    localStorage.setItem('rois-shell-module', 'system')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['system']))
    localStorage.setItem('rois-shell-system-item', 'scheduler')

    useShellStore.getState().loadFromStorage()

    expect(useShellStore.getState().activeModule).toBe('system')
    expect(useShellStore.getState().activeSystemItem).toBe('scheduler')
  })

  it('restores the PBS Business Time submenu item for the authenticated view to authorize', () => {
    localStorage.setItem('rois-shell-module', 'pbs')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['pbs']))
    localStorage.setItem('rois-shell-pbs-item', 'business-time')

    useShellStore.getState().loadFromStorage()

    expect(useShellStore.getState().activePbsItem).toBe('business-time')
  })

  it('increments the scenario refresh token when a scenario gantt tab is re-opened', () => {
    useShellStore.getState().setModule('scenario-gantt:596')
    expect(useShellStore.getState().scenarioTabRefreshTokens['scenario-gantt:596']).toBe(1)

    useShellStore.getState().setModule('scenario-gantt:596')
    expect(useShellStore.getState().scenarioTabRefreshTokens['scenario-gantt:596']).toBe(2)
  })

  it('closes all open scenario gantt tabs and returns to the scenario list', () => {
    useShellStore.setState({
      activeModule: 'scenario-gantt:596',
      openTabs: ['dashboard', 'scenario', 'scenario-gantt:596', 'scenario-gantt:597'],
      scenarioTabLabels: {
        'scenario-gantt:596': '#596 Alpha',
        'scenario-gantt:597': '#597 Beta',
      },
      scenarioTabTypes: {
        'scenario-gantt:596': 'RO',
        'scenario-gantt:597': 'PO',
      },
      scenarioTabRefreshTokens: {
        'scenario-gantt:596': 2,
        'scenario-gantt:597': 1,
      },
    })

    useShellStore.getState().closeAllScenarioTabs()

    expect(useShellStore.getState().activeModule).toBe('scenario')
    expect(useShellStore.getState().openTabs).toEqual(['dashboard', 'scenario'])
    expect(useShellStore.getState().scenarioTabLabels).toEqual({})
    expect(useShellStore.getState().scenarioTabTypes).toEqual({})
    expect(useShellStore.getState().scenarioTabRefreshTokens).toEqual({})
  })
})
