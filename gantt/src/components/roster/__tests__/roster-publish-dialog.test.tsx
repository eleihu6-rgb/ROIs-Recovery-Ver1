import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RosterPublishDialog } from '../roster-publish-dialog'

const mocks = vi.hoisted(() => ({
  diff: vi.fn(async () => ({
    items: [
      {
        key: 'F|C001|9001',
        kind: 'FLYING',
        status: 'UPDATE',
        crewId: 'C001',
        crewName: 'Crew One',
        crewFleet: 'A321',
        base: 'YVR',
        pairingId: 9001,
        pairingLabel: 'PAIR-9001',
        rosterIds: [11, 12],
        publishIds: [21, 22],
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        actingRank: 'FO',
        schStrDtUtc: '2026-06-03T10:00:00.000Z',
        schEndDtUtc: '2026-06-04T18:00:00.000Z',
        segmentCount: 2,
        changedFields: ['brief_start_utc'],
        publishStatus: 'UNPUBLISHED',
        source: 'CR',
        noc: 'Success',
      },
      {
        key: 'G|C002|13',
        kind: 'GROUND',
        status: 'NO_CHANGE',
        crewId: 'C002',
        crewName: 'Crew Two',
        crewFleet: 'B777',
        base: 'YYZ',
        pairingId: null,
        pairingLabel: 'DO',
        rosterIds: [13],
        publishIds: [31],
        assignmentGroup: 'GRD',
        assignment: 'DO',
        actingRank: 'CA',
        schStrDtUtc: '2026-06-05T00:00:00.000Z',
        schEndDtUtc: '2026-06-05T23:59:00.000Z',
        segmentCount: 1,
        changedFields: [],
        publishStatus: 'PUBLISHED',
        source: 'IMP',
        noc: 'Ignore',
      },
    ],
    total: 2,
    page: 1,
    pageSize: 100,
    summary: { add: 0, update: 1, delete: 0, noChange: 1, actionable: 1 },
  })),
  apply: vi.fn(),
  referenceState: {
    bases: [{ id: 1, base: 'YVR', name: 'Vancouver' }],
    fleets: [{ id: 1, fleet: 'A321', description: 'Airbus 321' }],
    divisions: [
      { id: 1, division: 'P', description: 'Pilot' },
      { id: 2, division: 'C', description: 'Cabin' },
    ],
    loading: false,
    load: vi.fn(async () => undefined),
  },
  airportTzState: {
    map: {
      YVR: 'America/Vancouver',
      YYZ: 'America/Toronto',
    },
    loaded: true,
    zoneIdFor: (airport: string) => ({
      YVR: 'America/Vancouver',
      YYZ: 'America/Toronto',
    })[airport],
    load: vi.fn(async () => undefined),
  },
}))

vi.mock('@/stores/roster-period-store', () => {
  const items = [
    { id: 5, rosterPeriod: '2026-05', name: '2026-05', rpStart: '2026-05-01', rpEnd: '2026-05-31', isCurrent: false },
    { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
  ]
  return {
    useRosterPeriodStore: (selector: (s: unknown) => unknown) =>
      selector({ items, loading: false, loadRosterPeriods: () => Promise.resolve() }),
  }
})

vi.mock('@/services/roster-publish-api', () => ({
  rosterPublishApi: {
    diff: mocks.diff,
    apply: mocks.apply,
  },
}))

vi.mock('@/stores/reference-store', () => ({
  useReferenceStore: vi.fn((selector: (state: typeof mocks.referenceState) => unknown) => selector(mocks.referenceState)),
}))

vi.mock('@/stores/airport-tz-store', () => ({
  useAirportTzStore: vi.fn((selector: (state: typeof mocks.airportTzState) => unknown) => selector(mocks.airportTzState)),
}))

vi.mock('@/utils/notify', () => ({
  notify: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/components/common/multi-select-dropdown', () => ({
  MultiSelectDropdown: ({
    options,
    placeholder,
    testId,
    onChange,
    selected,
  }: {
    options: Array<{ value: string; label: string }>
    placeholder: string
    testId?: string
    onChange: (values: string[]) => void
    selected: string[]
  }) => (
    <div data-testid={testId}>
      <span>{selected.length > 0 ? selected.join(',') : options[0]?.label ?? placeholder}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-testid={testId ? `${testId}-opt-${option.value}` : undefined}
          onClick={() => onChange(selected.includes(option.value)
            ? selected.filter((value) => value !== option.value)
            : [...selected, option.value])}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@rois/ui', () => ({
  AppDialog: ({
    open,
    title,
    children,
    footer,
    'data-testid': testId,
  }: {
    open: boolean
    title: string
    children: React.ReactNode
    footer?: React.ReactNode
    'data-testid'?: string
  }) => open ? <div data-testid={testId}><h1>{title}</h1>{children}{footer}</div> : null,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
    'data-testid': testId,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    'data-testid'?: string
  }) => <button data-testid={testId} disabled={disabled} onClick={onClick}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
  }) => <div data-value={value} data-on-change={Boolean(onValueChange)}>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, 'data-testid': testId }: { children: React.ReactNode; 'data-testid'?: string }) =>
    <button data-testid={testId}>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  Table: ({ children, 'data-testid': testId, className }: { children: React.ReactNode; 'data-testid'?: string; className?: string }) => <table data-testid={testId} className={className}>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th {...props}>{children}</th>,
  TableHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => <thead className={className}>{children}</thead>,
  TableRow: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props}>{children}</tr>,
  cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
}))

describe('RosterPublishDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads RP and reference filters while omitting removed legacy fields', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Publish Roster')
    expect(container.textContent).toContain('RP')
    expect(container.textContent).toContain('Fleet')
    expect(container.textContent).toContain('A321 - Airbus 321')
    expect(container.textContent).toContain('Base')
    expect(container.textContent).toContain('YVR - Vancouver')
    expect(container.textContent).toContain('Div')
    expect(container.textContent).toContain('P')
    expect(container.textContent).toContain('P - Pilot')
    expect(container.textContent).toContain('PID')
    expect(container.textContent).toContain('Label')
    expect(container.textContent).not.toContain('Flight Number')
    expect(container.textContent).not.toContain('Task Type')
    expect(container.textContent).not.toContain('Modified By')
    expect(container.textContent).not.toContain('Check Type')
    expect(container.textContent).not.toContain('TS Flag')
    expect(container.textContent).not.toContain('Publish Status')
    expect(container.textContent).not.toContain('Start UTC')
    expect(container.textContent).not.toContain('End UTC')
    expect(container.querySelectorAll('[data-value="ALL"]')).toHaveLength(0)

    expect((container.querySelector('[data-testid="roster-publish-start-date"]') as HTMLInputElement).value).toBe('2026-06-01')
    expect((container.querySelector('[data-testid="roster-publish-end-date"]') as HTMLInputElement).value).toBe('2026-06-30')
    expect(mocks.referenceState.load).toHaveBeenCalled()
    expect(mocks.airportTzState.load).toHaveBeenCalled()
  })

  it('keeps query actions in the compact filter toolbar and table headers sticky', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    const status = container.querySelector('[data-testid="roster-publish-status"]')
    const division = container.querySelector('[data-testid="roster-publish-division"]')
    const search = container.querySelector('[data-testid="roster-publish-search"]')
    const reset = container.querySelector('[data-testid="roster-publish-reset"]')

    expect(status).toBeTruthy()
    expect(division).toBeTruthy()
    expect(search).toBeTruthy()
    expect(reset).toBeTruthy()
    expect(search!.compareDocumentPosition(reset as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(status!.compareDocumentPosition(search as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(search!.closest('[data-testid="roster-publish-filters"]')).toBe(container.querySelector('[data-testid="roster-publish-filters"]'))
    expect(container.querySelector('thead th')?.className).toContain('sticky')
    expect(container.querySelector('thead th')?.className).toContain('top-0')
    expect(container.querySelector('[data-testid="roster-publish-table-scroll"]')?.className).toContain('overflow-auto')
    expect(container.querySelector('[data-testid="roster-publish-table-scroll"]')?.className).toContain('[&>div]:overflow-visible')
    expect(container.querySelector('[data-testid="roster-publish-dialog"]')?.querySelector('[data-testid="roster-publish-filters"]')).toBeTruthy()
  })

  it('searches all rows and auto-selects only actionable unpublished rows', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      ;(container.querySelector('[data-testid="roster-publish-search"]') as HTMLButtonElement).click()
    })

    expect(mocks.diff).toHaveBeenCalledWith(expect.objectContaining({
      rosterPeriodId: 6,
      divisions: ['P'],
      statuses: ['ADD', 'UPDATE', 'DELETE', 'NO_CHANGE'],
      pageSize: 0,
    }))
    expect(mocks.diff.mock.calls[0]?.[0].publishStatus).toBeUndefined()
    expect(container.textContent).toContain('PAIR-9001')
    expect(container.textContent).toContain('No change 1')
    expect(container.querySelector('[data-testid="roster-publish-selected-count"]')?.textContent).toContain('Selected: 1/2')
    expect(container.textContent).toContain('03:00')
    expect(container.textContent).toContain('11:00')

    const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
    expect(rowCheckboxes).toHaveLength(2)
    expect(rowCheckboxes[0]?.checked).toBe(true)
    expect(rowCheckboxes[1]?.disabled).toBe(true)
    expect(container.querySelector('[data-testid="roster-publish-row-G|C002|13"]')?.className).toContain('bg-muted/30')
  })

  it('auto-searches when dropdown filters change but not when text filters change', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mocks.diff).not.toHaveBeenCalled()

    await act(async () => {
      ;(container.querySelector('[data-testid="roster-publish-division-opt-C"]') as HTMLButtonElement).click()
    })

    expect(mocks.diff).toHaveBeenCalledWith(expect.objectContaining({
      rosterPeriodId: 6,
      divisions: ['P', 'C'],
      statuses: ['ADD', 'UPDATE', 'DELETE', 'NO_CHANGE'],
      pageSize: 0,
    }))

    await act(async () => {
      const crewInput = container.querySelector('[data-testid="roster-publish-crew-id"]') as HTMLInputElement
      crewInput.value = 'C001'
      crewInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(mocks.diff).toHaveBeenCalledTimes(1)
  })

  it('sends the Crew field as a trimmed exact-id query value', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    const crewInput = container.querySelector('[data-testid="roster-publish-crew-id"]') as HTMLInputElement
    await act(async () => {
      const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setNativeValue?.call(crewInput, ' C001 ')
      crewInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      ;(container.querySelector('[data-testid="roster-publish-search"]') as HTMLButtonElement).click()
    })

    expect(mocks.diff).toHaveBeenCalledWith(expect.objectContaining({
      crewId: 'C001',
    }))
  })

  it('virtualizes large publish diff lists instead of rendering every row', async () => {
    const originalDiff = mocks.diff
    mocks.diff.mockResolvedValueOnce({
      items: Array.from({ length: 8000 }, (_, i) => ({
        key: `F|C${String(i).padStart(5, '0')}|9001`,
        kind: 'FLYING',
        status: 'UPDATE',
        crewId: `C${String(i).padStart(5, '0')}`,
        crewName: `Crew ${i}`,
        crewFleet: 'A321',
        base: 'YVR',
        pairingId: 9001,
        pairingLabel: 'PAIR-9001',
        rosterIds: [10000 + i],
        publishIds: [20000 + i],
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        actingRank: 'FO',
        schStrDtUtc: '2026-06-03T10:00:00.000Z',
        schEndDtUtc: '2026-06-04T18:00:00.000Z',
        segmentCount: 1,
        changedFields: ['assignment'],
        publishStatus: 'UNPUBLISHED',
      })),
      total: 8000,
      page: 1,
      pageSize: 0,
      summary: { add: 0, update: 8000, delete: 0, noChange: 0, actionable: 8000 },
    })

    try {
      const container = document.createElement('div')
      const root = createRoot(container)

      await act(async () => {
        root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
      })
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        ;(container.querySelector('[data-testid="roster-publish-search"]') as HTMLButtonElement).click()
      })

      expect(container.querySelector('[data-testid="roster-publish-selected-count"]')?.textContent).toContain('Selected: 8000/8000')
      expect([...container.querySelectorAll('tbody tr')].length).toBeLessThan(80)
      expect(container.textContent).toContain('C00000')
      expect(container.textContent).not.toContain('C07999')
      expect(container.textContent).not.toContain('Page 1')
    } finally {
      mocks.diff = originalDiff
    }
  })

  it('renders Source and NOC columns from the diff row payload', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      ;(container.querySelector('[data-testid="roster-publish-search"]') as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain('Source')
    expect(container.textContent).toContain('NOC')
    expect(container.textContent).toContain('CR')
    expect(container.textContent).toContain('Success')
    expect(container.textContent).toContain('IMP')
    expect(container.textContent).toContain('Ignore')
  })
})
