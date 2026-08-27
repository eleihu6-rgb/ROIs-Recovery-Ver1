import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScenarioDetailPanel } from '../scenario-detail-panel'
import type { ScenarioDetail, ScenarioRunProgress } from '@/types'

const patchDraft = vi.fn()
const clearFocusNameField = vi.fn()

const baseDetail: ScenarioDetail = {
  id: 701,
  name: 'Done RO Scenario',
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-07-01',
  endDtLoc: '2026-07-31',
  leadinLive: 0,
  worksetId: 1,
  rulesetId: 103,
  pairingScenarioId: 0,
  division: 'P',
  filterParams: null,
  comments: null,
}

let storeState: {
  detail: ScenarioDetail
  draftDetail: ScenarioDetail
  kpis: []
  results: { kpi: []; creditHours: []; uncovered: []; distribution: []; rawResult: null }
  progress: ScenarioRunProgress | null
  detailLoading: boolean
  patchDraft: typeof patchDraft
  focusNameField: boolean
  clearFocusNameField: typeof clearFocusNameField
}

const resetStoreState = (overrides: Partial<typeof storeState> = {}): void => {
  storeState = {
    detail: baseDetail,
    draftDetail: baseDetail,
    kpis: [],
    results: { kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null },
    progress: null,
    detailLoading: false,
    patchDraft,
    focusNameField: false,
    clearFocusNameField,
    ...overrides,
  }
}

resetStoreState()

vi.mock('@/stores/scenario-store', () => ({
  useScenarioStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}))

vi.mock('@rois/ui', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}))

vi.mock('../scenario-basic-info', () => ({
  ScenarioBasicInfo: () => <div data-testid="mock-basic-info" />,
}))

vi.mock('../scenario-filter-section', () => ({
  ScenarioFilterSection: () => <div data-testid="mock-filter-section" />,
}))

vi.mock('../scenario-kpi-section', () => ({
  ScenarioKpiSection: () => <div data-testid="mock-kpi-section" />,
  ScenarioRunProgressBar: () => <div data-testid="mock-run-progress" />,
}))

vi.mock('../scenario-toolbar', () => ({
  ScenarioToolbar: () => <div data-testid="mock-toolbar" />,
}))

vi.mock('../scenario-empty-state', () => ({
  ScenarioEmptyState: () => <div data-testid="mock-empty-state" />,
}))

const renderPanel = (): HTMLDivElement => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<ScenarioDetailPanel />)
  })
  return container
}

describe('ScenarioDetailPanel', () => {
  beforeEach(() => {
    resetStoreState()
  })

  it('renders Done status with the readable no-border success palette', () => {
    const container = renderPanel()

    const statusBadge = container.querySelector('[data-testid="scenario-status-badge"]')
    expect(statusBadge?.textContent).toBe('Done')
    expect(statusBadge?.className).toContain('bg-[#DFF7EA]')
    expect(statusBadge?.className).toContain('text-[#065F46]')
    expect(statusBadge?.className).toContain('font-semibold')
    expect(statusBadge?.className).not.toContain('border')
  })

  it('shows the scenario id badge before the larger name', () => {
    const container = renderPanel()

    const idBadge = container.querySelector('[data-testid="scenario-id-badge"]')
    expect(idBadge?.textContent).toBe('701')
    expect(idBadge?.className).toContain('bg-[#DFF7EA]')
    expect(idBadge?.className).toContain('text-[#065F46]')
    expect(idBadge?.className).toContain('text-sm')
    expect(idBadge?.className).toContain('font-bold')
    expect(container.querySelector('[data-testid="scenario-name-input"]')?.className).toContain('text-base')
  })

  it('renders running progress in the header instead of depending on the KPI tab', () => {
    const running = { ...baseDetail, status: 'RUNNING' as const }
    resetStoreState({ detail: running, draftDetail: running })

    const container = renderPanel()

    expect(container.querySelector('[data-testid="scenario-header-progress"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="mock-run-progress"]')).not.toBeNull()
  })
})
