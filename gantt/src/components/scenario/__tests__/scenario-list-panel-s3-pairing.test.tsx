import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ScenarioListPanel } from '../scenario-list-panel'

vi.mock('@/stores/scenario-store', () => ({
  useScenarioStore: (selector: (s: Record<string, unknown>) => unknown) => selector({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    listLoading: false,
    selectedId: null,
    saving: false,
    selectScenario: vi.fn(),
    removeScenario: vi.fn(),
    renameScenario: vi.fn(),
    duplicateScenario: vi.fn(),
    createNew: vi.fn(),
    setPage: vi.fn(),
    setFilterType: vi.fn(),
    fetchList: vi.fn(),
  }),
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (s: Record<string, unknown>) => unknown) => selector({
    activeScenarioItem: 'po',
    activeModule: 'scenario',
  }),
}))

vi.mock('@/services/scenario-api', () => ({
  scenarioApi: {
    listS3PairingPoTargets: vi.fn(async () => ({ items: [] })),
    importS3Pairing: vi.fn(async () => ({
      scenarioId: 1,
      createdScenario: true,
      importedPairings: 1,
      importedSegments: 2,
      importedCompositions: 2,
      warnings: [],
    })),
  },
}))

vi.mock('@/services/reference-api', () => ({
  referenceApi: {
    listDivisions: vi.fn(async () => [
      { id: 1, division: 'P', description: 'Pilot' },
      { id: 2, division: 'C', description: 'Cabin' },
    ]),
  },
}))

vi.mock('@/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) => selector({
    user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1 },
    permissions: {
      menus: ['SCENARIO', 'SCENARIO_LIST', 'SCENARIO_ALL'],
      ctrls: {
        SCENARIO_ALL: [
          'SCENARIO_NEW',
          'SCENARIO_IMPORT_PBS',
          'SCENARIO_IMPORT_S3',
          'SCENARIO_OPEN',
        ],
      },
      dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
    },
  }),
}))

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) =>
    open ? <div data-testid="dialog"><h1>{title}</h1>{children}{footer}</div> : null,
  Button: ({ children, onClick, disabled, 'aria-label': ariaLabel, 'data-testid': testId }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; 'aria-label'?: string; 'data-testid'?: string }) =>
    <button aria-label={ariaLabel} data-testid={testId} disabled={disabled} onClick={onClick}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}))

vi.mock('../scenario-search-bar', () => ({ ScenarioSearchBar: () => <div /> }))
vi.mock('../scenario-empty-state', () => ({ ScenarioEmptyState: () => <div /> }))
vi.mock('../scenario-run-health-indicator', () => ({ ScenarioRunHealthIndicator: () => <div /> }))
vi.mock('../scenario-list-item', () => ({ ScenarioListItem: () => <div /> }))
vi.mock('../import-pbs-dialog', () => ({ ImportPbsDialog: ({ open }: { open: boolean }) => open ? <div data-testid="import-pbs-dialog" /> : null }))

describe('ScenarioListPanel S3 Pairing entry point', () => {
  it('places S3 Pairing before Import PBS material and opens the dialog', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ScenarioListPanel />)
    })

    const s3Button = container.querySelector('[aria-label="S3 Pairing"]')
    const pbsButton = container.querySelector('[aria-label="Import PBS material"]')
    expect(s3Button).not.toBeNull()
    expect(pbsButton).not.toBeNull()
    expect(s3Button?.compareDocumentPosition(pbsButton as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      ;(s3Button as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain('S3 Pairing Import')
  })
})
