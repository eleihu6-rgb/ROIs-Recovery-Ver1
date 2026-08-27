import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

// ── Store mock ───────────────────────────────────────────────────────────────

const shellState = {
  init: vi.fn(async () => undefined),
  selectSet: vi.fn(),
  sets: [] as Array<{ id: number; name: string; type: string; division: string; enabled: boolean; isDefault: boolean; category: string | null }>,
  selectedId: null as number | null,
  loadingRules: false,
  worksetName: '',
  rules: [] as Array<{ id: number; function: number; instance: string | null; description: string | null; reference: string | null; category: string | null; severity: number; updatedBy: string | null; paramJson: unknown }>,
  catalogRules: [] as Array<{ id: number; function: number; instance: string | null; isTemplate: boolean; reference: string | null; category: string | null; description: string | null; severity: number; updatedBy: string | null; paramJson: unknown }>,
  selectedCatalogRuleId: null as number | null,
  recordParamSave: vi.fn(),
  updateRuleMeta: vi.fn(async () => undefined),
  lastSave: null as null | { at: string; by: string },
  removeRule: vi.fn(async () => undefined),
  deleteSet: vi.fn(async () => undefined),
  fetchRuleSets: vi.fn(async () => undefined),
  fetchCatalog: vi.fn(async () => undefined),
  fetchRules: vi.fn(async () => undefined),
  addRule: vi.fn(async () => undefined),
  select: vi.fn(),
  selectCatalogRule: vi.fn(),
  recheck: { lastRecheckAt: null, isRunning: false, ruleSetCode: null },
}
vi.mock('@/stores/legality-store', () => ({
  useLegalityStore: (selector: (s: typeof shellState) => unknown) => selector(shellState),
}))

vi.mock('@/stores/filter-store', () => ({
  useFilterStore: (selector: (s: { dateRange: { start: Date; end: Date } }) => unknown) =>
    selector({ dateRange: { start: new Date('2026-01-01'), end: new Date('2026-01-31') } }),
}))

vi.mock('@/stores/timezone-store', () => ({
  useTimezoneStore: (selector: (s: { timezone: string }) => unknown) => selector({ timezone: 'UTC' }),
}))

// The permission hook is what we're testing against. Tests override the
// returned canAccessCtl via a mutable closure; each test sets it before
// rendering so the component picks up the right gating.
let ctlMap: Record<string, string[]> = {}
vi.mock('@/hooks/use-permission', () => ({
  usePermission: () => ({
    canAccessMenu: () => true,
    canAccessCtl: (menuCode: string, ctlCode: string) => (ctlMap[menuCode] ?? []).includes(ctlCode),
    canAccessPage: () => true,
    canAccessModule: () => true,
  }),
}))

vi.mock('@/services/legality-api', () => ({ legalityApi: {} }))
vi.mock('@/services/dictionary-api', () => ({
  dictionaryApi: { getByParentCode: vi.fn(async () => []) },
}))
vi.mock('@/services/reference-api', () => ({
  referenceApi: { listDivisions: vi.fn(async () => []) },
}))
vi.mock('@/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

// Strip child components down to bare data-testids so we can target buttons
// without pulling in their real implementations.
vi.mock('./legality-rule-row', () => ({
  LegalityRuleRow: () => <tr><td /></tr>,
  ruleDisplayName: (rule: { function: number; instance: string | null; description?: string | null }) =>
    `${rule.function}/${rule.instance ?? ''}${rule.description ? ` - ${rule.description}` : ''}`,
}))
vi.mock('./rule-inline-cell', () => ({
  RuleInlineCell: ({ value }: { value: string | null }) => <span>{value ?? '—'}</span>,
}))
vi.mock('./legality-recheck-indicator', () => ({ LegalityRecheckIndicator: () => <div data-testid="legality-recheck-indicator" /> }))
vi.mock('./legality-param-table', () => ({ LegalityParamTable: () => <div data-testid="legality-param-table" /> }))
vi.mock('./legality-param-table-editor', () => ({ LegalityParamTableEditor: () => <div data-testid="legality-param-table-editor" /> }))
vi.mock('./rule-catalog-tree', () => ({ RuleCatalogTree: () => <div data-testid="rule-catalog-tree" /> }))
vi.mock('./rule-set-dialogs', () => ({
  NewRuleSetDialog: () => null,
  EditRuleSetDialog: () => null,
  CopyRuleSetDialog: () => null,
  AddRulesDialog: () => null,
}))
vi.mock('./legality-column-splitter', () => ({ LegalityColumnSplitter: () => <div data-testid="legality-column-splitter" /> }))

vi.mock('@rois/ui', () => ({
  AppDialog: () => null,
  Button: ({ children, onClick, 'data-testid': testId }: { children: React.ReactNode; onClick?: () => void; 'data-testid'?: string }) =>
    <button data-testid={testId} onClick={onClick}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { LegalityRuleSetsView } from '../legality-rule-sets-view'

const renderView = async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(<LegalityRuleSetsView />)
  })
  return { container, root }
}

describe('LegalityRuleSetsView permission gating (uses LEGALITY_RULE_SETS ctl, not isAdmin)', () => {
  it('hides the New Rule Set button when BTN_NEW_RULESET is not granted', async () => {
    ctlMap = {}
    const { container } = await renderView()
    expect(container.querySelector('[data-testid="rule-set-new-btn"]')).toBeNull()
  })

  it('shows the New Rule Set button when BTN_NEW_RULESET is granted', async () => {
    ctlMap = { LEGALITY_RULE_SETS: ['BTN_NEW_RULESET'] }
    const { container } = await renderView()
    expect(container.querySelector('[data-testid="rule-set-new-btn"]')).not.toBeNull()
  })

  it('hides per-set management buttons (Add/Edit/Copy/Delete) when respective ctls are not granted', async () => {
    shellState.selectedId = 1
    shellState.selectedCatalogRuleId = null
    ctlMap = {}

    const { container } = await renderView()
    expect(container.querySelector('[data-testid="rule-set-add-rules-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="rule-set-edit-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="rule-set-copy-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="rule-set-delete-btn"]')).toBeNull()
  })

  it('shows per-set management buttons (Add/Edit/Copy/Delete) when respective ctls are granted', async () => {
    shellState.selectedId = 1
    shellState.selectedCatalogRuleId = null
    ctlMap = {
      LEGALITY_RULE_SETS: ['BTN_ADD_RULES', 'BTN_EDIT', 'BTN_COPY', 'BTN_DELETE'],
    }

    const { container } = await renderView()
    expect(container.querySelector('[data-testid="rule-set-add-rules-btn"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="rule-set-edit-btn"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="rule-set-copy-btn"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="rule-set-delete-btn"]')).not.toBeNull()
  })

  it('gates buttons individually — granting one ctl does not surface unrelated buttons', async () => {
    shellState.selectedId = 1
    shellState.selectedCatalogRuleId = null
    ctlMap = { LEGALITY_RULE_SETS: ['BTN_ADD_RULES'] }

    const { container } = await renderView()
    expect(container.querySelector('[data-testid="rule-set-add-rules-btn"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="rule-set-edit-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="rule-set-copy-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="rule-set-delete-btn"]')).toBeNull()
  })
})