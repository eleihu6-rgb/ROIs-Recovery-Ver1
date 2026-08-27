import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScenarioNavDropdown } from '../scenario-nav-dropdown'
import { useShellStore } from '@/stores/shell-store'

vi.mock('@rois/ui', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    className,
    onSelect,
  }: {
    children: React.ReactNode
    className?: string
    onSelect?: () => void
  }) => (
    <div className={className} role="menuitem" onClick={onSelect}>
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div role="tooltip">{children}</div>,
}))

const resetShellStore = (): void => {
  localStorage.clear()
  useShellStore.setState({
    activeModule: 'scenario-gantt:596',
    activeLiveItem: 'roster',
    activeScenarioItem: 'all',
    activeLegalityItem: 'rule-sets',
    activeSystemItem: 'scheduler',
    activePbsItem: 'period',
    openTabs: ['dashboard', 'scenario', 'scenario-gantt:596', 'scenario-gantt:597'],
    scenarioTabLabels: {
      'scenario-gantt:596': '#596 Alpha',
      'scenario-gantt:597': '#597 Beta',
    },
    scenarioTabTypes: {
      'scenario-gantt:596': 'RO',
      'scenario-gantt:597': 'PO',
    },
    scenarioTabRefreshTokens: {},
    topNavVisible: true,
    sidebarState: 'collapsed',
    sidebarUserOverride: false,
    sidebarStatesByModule: {},
    filterDialogOpen: false,
    filterDialogTab: null,
  })
}

describe('ScenarioNavDropdown', () => {
  beforeEach(() => resetShellStore())

  it('uses the scenario list id badge colours for the active scenario trigger', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<ScenarioNavDropdown />)
    })

    const trigger = container.querySelector('[data-testid="module-nav-scenario"]')
    expect(trigger).not.toBeNull()
    expect(trigger?.className).toContain('bg-[#DFF7EA]')
    expect(trigger?.className).toContain('text-[#065F46]')
    expect(trigger?.className).toContain('font-semibold')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders a Close All action and closes every scenario gantt tab', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<ScenarioNavDropdown />)
    })

    expect(container.textContent).toContain('Close All')
    expect(container.querySelectorAll('[role="tooltip"]').length).toBeGreaterThanOrEqual(2)

    const closeAll = container.querySelector('[data-testid="scenario-nav-close-all"]')
    expect(closeAll).not.toBeNull()

    act(() => {
      closeAll?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useShellStore.getState().activeModule).toBe('scenario')
    expect(useShellStore.getState().openTabs).toEqual(['dashboard', 'scenario'])
    expect(useShellStore.getState().scenarioTabLabels).toEqual({})
    expect(useShellStore.getState().scenarioTabTypes).toEqual({})

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('does not switch to the scenario list when the top-level trigger is opened', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<ScenarioNavDropdown />)
    })

    const trigger = container.querySelector('[data-testid="module-nav-scenario"]')
    expect(trigger).not.toBeNull()

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useShellStore.getState().activeModule).toBe('scenario-gantt:596')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('shows the version prefix on the trigger and item label for a version tab', () => {
    useShellStore.setState({
      activeModule: 'scenario-gantt:596@v1',
      openTabs: ['scenario', 'scenario-gantt:596@v1', 'scenario-gantt:596@v2'],
      scenarioTabLabels: {
        'scenario-gantt:596@v1': 'v1 #596 Alpha',
        'scenario-gantt:596@v2': 'v2 #596 Alpha',
      },
      scenarioTabTypes: {
        'scenario-gantt:596@v1': 'RO',
        'scenario-gantt:596@v2': 'RO',
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<ScenarioNavDropdown />)
    })

    const trigger = container.querySelector('[data-testid="module-nav-scenario"]')
    expect(trigger?.textContent).toContain('v1 #596 Alpha')

    // DropdownMenuItem mock does not forward data-testid — match items by role + label text.
    const items = Array.from(container.querySelectorAll('[role="menuitem"]'))
    expect(items.some((el) => el.textContent?.includes('v1 #596 Alpha'))).toBe(true)
    expect(items.some((el) => el.textContent?.includes('v2 #596 Alpha'))).toBe(true)

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('falls back to a version-aware label before the view persists one', () => {
    useShellStore.setState({
      activeModule: 'scenario-gantt:596@v3',
      openTabs: ['scenario', 'scenario-gantt:596@v3'],
      scenarioTabLabels: {},
      scenarioTabTypes: { 'scenario-gantt:596@v3': 'RO' },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<ScenarioNavDropdown />)
    })

    const items = Array.from(container.querySelectorAll('[role="menuitem"]'))
    expect(items.some((el) => el.textContent?.includes('v3 #596'))).toBe(true)

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
