import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ScenarioGanttToolbar } from '../scenario-gantt-toolbar'
import { READ_ONLY_CAPABILITIES } from '@/components/gantt/source/gantt-pane-source'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

vi.mock('@rois/ui', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/common/timezone-switcher', () => ({
  TimezoneSwitcher: () => <div data-testid="timezone-switcher" />,
}))

vi.mock('@/components/common/zoom-control', () => ({
  ZoomControlView: () => <div data-testid="zoom-control" />,
}))

vi.mock('@/components/common/rule-group-display', () => ({
  RuleGroupDisplay: ({ rulesetId }: { rulesetId?: number | null }) => (
    <div data-testid="sg-rule-group-display">{rulesetId == null ? 'Rule Set' : 'PBS Solver Ruleset'}</div>
  ),
}))

const scenarioData: ScenarioGanttData = {
  scenarioId: 679,
  scenarioName: 'Copy of YVR-Aug kltest',
  fileType: 'RO',
  rulesetId: 103,
  strDtLoc: '2026-07-01T00:00:00',
  endDtLoc: '2026-07-31T23:59:59',
  scenarioStrDt: '2026-07-01T00:00:00',
  scenarioEndDt: '2026-07-31T23:59:59',
  leadinLive: 0,
  dataSource: 'snapshot',
  capabilities: READ_ONLY_CAPABILITIES,
  crew: [],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
}

describe('ScenarioGanttToolbar', () => {
  const renderToolbar = (
    data: ScenarioGanttData = scenarioData,
    overrides: Partial<React.ComponentProps<typeof ScenarioGanttToolbar>> = {},
  ): { container: HTMLElement; root: ReturnType<typeof createRoot> } => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <ScenarioGanttToolbar
          data={data}
          lockStatus={null}
          isDirty={false}
          saving={false}
          acquiringLock={false}
          pendingCount={0}
          canDelete={false}
          canUndo={false}
          canRedo={false}
          pxPerHour={1}
          zoomMin={1}
          zoomMax={4}
          openPaneTypes={new Set(['roster'])}
          allowedPanes={['roster', 'pairing', 'flight']}
          onZoomIn={() => undefined}
          onZoomOut={() => undefined}
          onRefresh={() => undefined}
          onDelete={() => undefined}
          onUndo={() => undefined}
          onRedo={() => undefined}
          onAcquireLock={() => undefined}
          onReleaseLock={() => undefined}
          onSave={() => undefined}
          onAddPane={() => undefined}
          onResetLayout={() => undefined}
          {...overrides}
        />,
      )
    })

    return { container, root }
  }

  it('does not show a source badge for snapshot data', () => {
    const { container, root } = renderToolbar()

    expect(container.querySelector('[data-testid="sg-source-badge"]')).toBeNull()
    expect(container.textContent).not.toContain('Snapshot')

    act(() => root.unmount())
    container.remove()
  })

  it('shows the scenario-owned rule set in the toolbar', () => {
    const { container, root } = renderToolbar()

    expect(container.querySelector('[data-testid="sg-rule-group-display"]')?.textContent)
      .toBe('PBS Solver Ruleset')

    act(() => root.unmount())
    container.remove()
  })

  it('keeps the source badge for live lead-in preview data', () => {
    const { container, root } = renderToolbar({
      ...scenarioData,
      dataSource: 'seed',
    })

    expect(container.querySelector('[data-testid="sg-source-badge"]')?.textContent).toBe('Live lead-in · preview')

    act(() => root.unmount())
    container.remove()
  })

  it('uses the active scenario nav colours for the scenario and type badges', () => {
    const { container, root } = renderToolbar()

    const badges = Array.from(container.querySelectorAll('span'))
    const scenarioBadge = badges.find((badge) => badge.textContent === 'Scenario')
    const typeBadge = badges.find((badge) => badge.textContent === 'RO')

    expect(scenarioBadge).not.toBeUndefined()
    expect(typeBadge).not.toBeUndefined()
    expect(scenarioBadge?.className).toContain('bg-[#DFF7EA]')
    expect(scenarioBadge?.className).toContain('text-[#065F46]')
    expect(typeBadge?.className).toContain('bg-[#DFF7EA]')
    expect(typeBadge?.className).toContain('text-[#065F46]')

    act(() => root.unmount())
    container.remove()
  })

  it('does not repeat the scenario name inside the gantt toolbar', () => {
    const { container, root } = renderToolbar()

    expect(container.querySelector('[data-testid="scenario-gantt-toolbar"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="sg-scenario-name"]')).toBeNull()
    expect(container.textContent).not.toContain('Copy of YVR-Aug kltest')
    expect(container.querySelector('[data-testid="sg-acquire-lock-btn"]')?.textContent).toContain('View')
    expect(container.querySelector('[data-testid="sg-acquire-lock-btn"]')?.textContent).not.toContain('Viewing · Read-only')
    expect(container.textContent).toContain('Enable editing')
    expect(container.textContent).not.toContain('Acquire edit lock')

    act(() => root.unmount())
    container.remove()
  })

  it('renders scenario edit controls and invokes their handlers', () => {
    const onRefresh = vi.fn()
    const onDelete = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const onSave = vi.fn()
    const { container, root } = renderToolbar(scenarioData, {
      lockStatus: { locked: true, owner: 'me', ttl: 600, isOwner: true },
      isDirty: true,
      pendingCount: 2,
      canDelete: true,
      canUndo: true,
      canRedo: true,
      onRefresh,
      onDelete,
      onUndo,
      onRedo,
      onSave,
    })

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="sg-refresh-btn"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="sg-delete-btn"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="sg-undo-btn"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="sg-redo-btn"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="sg-save-btn"]')?.click())

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="sg-save-btn"]')?.textContent).toContain('2')
    const releaseLockBtn = container.querySelector('[data-testid="sg-release-lock-btn"]')
    expect(releaseLockBtn?.textContent).toContain('Edit')
    expect(releaseLockBtn?.textContent).not.toContain('Editing')
    expect(releaseLockBtn?.querySelector('svg')?.getAttribute('class')).toContain('lucide-pencil-line')
    expect(releaseLockBtn?.className).toContain('border-amber-600/40')
    expect(releaseLockBtn?.className).toContain('bg-amber-500/15')
    expect(releaseLockBtn?.className).toContain('text-amber-700')
    expect(container.textContent).toContain('Exit editing')
    expect(container.textContent).not.toContain('Release edit lock')

    act(() => root.unmount())
    container.remove()
  })
})
