import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { moduleToPath, pathToModule, URL_BASE } from '@/hooks/use-url-sync'
import { useUrlSync } from '@/hooks/use-url-sync'
import { useShellStore } from '@/stores/shell-store'

describe('URL sync mapping', () => {
  it('uses /altair as the URL base', () => {
    expect(URL_BASE).toBe('/altair')
  })

  it.each([
    ['/altair/', 'dashboard'],
    ['/altair', 'dashboard'],
    ['/altair/live', 'live'],
    ['/altair/scenario', 'scenario'],
    ['/altair/scenario/577', 'scenario-gantt:577'],
    ['/altair/data', 'data'],
    ['/altair/legality', 'legality'],
    ['/altair/system', 'system'],
    ['/altair/regression', 'regression'],
    ['/altair/pbs', 'pbs'],
    ['/altair/dev', 'dev'],
    ['/altair/help', 'help'],
    ['/altair/release', 'release'],
  ])('maps %s to %s', (pathname, module) => {
    expect(pathToModule(pathname)).toBe(module)
  })

  it.each([
    ['/altair/scenario/notanumber'],
    ['/altair/scenario/0'],
    ['/altair/scenario/-1'],
    ['/altair/unknown'],
    ['/fpqe/gantt/'],
    ['/'],
  ])('falls back to dashboard for %s', (pathname) => {
    expect(pathToModule(pathname)).toBe('dashboard')
  })

  it.each([
    ['dashboard', '/altair/'],
    ['live', '/altair/live'],
    ['scenario', '/altair/scenario'],
    ['scenario-gantt:577', '/altair/scenario/577'],
    ['data', '/altair/data'],
    ['legality', '/altair/legality'],
    ['system', '/altair/system'],
    ['regression', '/altair/regression'],
    ['pbs', '/altair/pbs'],
    ['dev', '/altair/dev'],
    ['help', '/altair/help'],
    ['release', '/altair/release'],
  ])('maps module %s to %s', (module, pathname) => {
    expect(moduleToPath(module)).toBe(pathname)
  })

  it.each([
    ['scenario-gantt:notanumber'],
    ['scenario-gantt:0'],
    ['unknown-module'],
  ])('falls back to dashboard path for invalid module %s', (module) => {
    expect(moduleToPath(module)).toBe('/altair/')
  })
})

const renderHook = (): { unmount: () => void } => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)

  const Probe = () => {
    useUrlSync()
    return null
  }

  act(() => {
    root.render(React.createElement(Probe))
  })

  return {
    unmount: () => {
      act(() => root.unmount())
      el.remove()
    },
  }
}

describe('useUrlSync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useShellStore.setState({
      activeModule: 'dashboard',
      openTabs: ['dashboard'],
      scenarioTabLabels: {},
      scenarioTabTypes: {},
      sidebarStatesByModule: {},
      sidebarState: 'expanded',
      sidebarUserOverride: false,
    })
    window.history.replaceState(null, '', '/altair/')
  })

  it('applies the URL module on mount and opens the tab', () => {
    window.history.replaceState(null, '', '/altair/scenario/577')

    const { unmount } = renderHook()

    expect(useShellStore.getState().activeModule).toBe('scenario-gantt:577')
    expect(useShellStore.getState().openTabs).toContain('scenario-gantt:577')
    unmount()
  })

  it('pushes a new path when activeModule changes', () => {
    const { unmount } = renderHook()

    act(() => {
      useShellStore.getState().setModule('live')
    })

    expect(window.location.pathname).toBe('/altair/live')
    unmount()
  })

  it('responds to browser popstate', () => {
    const { unmount } = renderHook()
    window.history.pushState(null, '', '/altair/data')

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(useShellStore.getState().activeModule).toBe('data')
    unmount()
  })
})
