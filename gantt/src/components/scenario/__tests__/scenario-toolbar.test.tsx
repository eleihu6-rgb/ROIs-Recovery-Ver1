import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScenarioToolbar } from '../scenario-toolbar'
import type { ScenarioDetail, RoFilterParams } from '@/types'

// ─── Store mock: callable selector + getState() (used by handleSaveAndRun) ───
// vi.hoisted so the vi.mock factory (which runs before module top-level) can
// reference the mutable state without a TDZ error.
const { storeState, useScenarioStore } = vi.hoisted(() => {
  const storeState = {
    isDirty: false,
    saving: false,
    saveDetail: vi.fn(async () => {}),
    runScenario: vi.fn(async () => {}),
    transitionStatus: vi.fn(async () => {}),
    refreshDetail: vi.fn(async () => {}),
    runningId: null as number | null,
  }
  const useScenarioStore = ((selector: (s: typeof storeState) => unknown) => selector(storeState)) as unknown as {
    (selector: (s: typeof storeState) => unknown): unknown
    getState: () => typeof storeState
  }
  useScenarioStore.getState = () => storeState
  return { storeState, useScenarioStore }
})

vi.mock('@/stores/scenario-store', () => ({ useScenarioStore }))
vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (s: unknown) => unknown) =>
    selector({ setModule: vi.fn(), setScenarioTabType: vi.fn() }),
}))
vi.mock('@rois/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AppDialog: ({ open, title, children, footer, 'data-testid': testId }: {
    open: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode; 'data-testid'?: string
  }) => (open ? (
    <div data-testid={testId}>
      <div>{title}</div>
      {children}
      {footer}
    </div>
  ) : null),
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

const runnableFilterParams: RoFilterParams = {
  crew: { bases: ['YEG'], fleets: [], ranks: [], status: 'ACTIVE', birthday: { from: '', to: '' }, seniority: { min: null, max: null } },
  pairing: { bases: ['YEG'], fleets: [], ranks: [], types: [], duration: { min: null, max: null } },
}

const runnableDetail: ScenarioDetail = {
  id: 701,
  name: 'RO Scenario',
  fileType: 'RO',
  status: 'DRAFT',
  strDtLoc: '2026-07-01',
  endDtLoc: '2026-07-31',
  division: 'P',
  optimizedCount: 0,
  leadinLive: 0,
  updatedBy: null,
  updatedAt: '2026-07-01T00:00:00.000Z',
  worksetId: 1,
  version: 0,
  rulesetId: 103,
  pairingScenarioId: 0,
  filterParams: runnableFilterParams,
  comments: null,
  createdBy: null,
  createdAt: '2026-07-01T00:00:00.000Z',
}

const render = (detail: ScenarioDetail = runnableDetail): HTMLDivElement => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<ScenarioToolbar detail={detail} />)
  })
  return container
}

beforeEach(() => {
  storeState.isDirty = false
  storeState.saving = false
  storeState.saveDetail.mockReset()
  storeState.saveDetail.mockImplementation(async () => {})
  storeState.runScenario.mockReset()
  storeState.transitionStatus.mockReset()
  storeState.refreshDetail.mockReset()
})

describe('ScenarioToolbar — Save & Run guard', () => {
  it('dirty + runnable → Run opens the Save & Run dialog, does not run yet', () => {
    storeState.isDirty = true
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeTruthy()
    expect(storeState.runScenario).not.toHaveBeenCalled()
  })

  it('clean + runnable → Run starts the optimisation directly, no dialog', () => {
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeNull()
    expect(storeState.runScenario).toHaveBeenCalledWith(701)
  })

  it('dirty → Cancel closes the dialog without saving or running', () => {
    storeState.isDirty = true
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    const cancel = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cancel') as HTMLButtonElement
    act(() => cancel.click())
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeNull()
    expect(storeState.saveDetail).not.toHaveBeenCalled()
    expect(storeState.runScenario).not.toHaveBeenCalled()
  })

  it('dirty → Save & Run saves first, then starts the optimisation', async () => {
    storeState.isDirty = true
    storeState.saveDetail.mockImplementation(async () => { storeState.isDirty = false })
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    const confirm = container.querySelector('[data-testid="save-run-confirm"]') as HTMLButtonElement
    await act(async () => { confirm.click() })
    expect(storeState.saveDetail).toHaveBeenCalled()
    expect(storeState.runScenario).toHaveBeenCalledWith(701)
    expect(storeState.saveDetail.mock.invocationCallOrder[0])
      .toBeLessThan(storeState.runScenario.mock.invocationCallOrder[0])
  })

  it('dirty → Save & Run does NOT run when the save fails', async () => {
    storeState.isDirty = true
    storeState.saveDetail.mockImplementation(async () => { /* isDirty stays true → save failed */ })
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    const confirm = container.querySelector('[data-testid="save-run-confirm"]') as HTMLButtonElement
    await act(async () => { confirm.click() })
    expect(storeState.saveDetail).toHaveBeenCalled()
    expect(storeState.runScenario).not.toHaveBeenCalled()
  })

  it('dirty + blockers → Pre-run Check appears first (not Save & Run)', () => {
    storeState.isDirty = true
    const container = render({ ...runnableDetail, pairingScenarioId: null })
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="run-check-dialog"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeNull()
  })
})
