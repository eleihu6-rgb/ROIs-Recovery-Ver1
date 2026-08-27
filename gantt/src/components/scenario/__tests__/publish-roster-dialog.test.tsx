import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { PublishRosterDialog } from '../publish-roster-dialog'

const mocks = vi.hoisted(() => {
  const state = {
    roster: [
      {
        kind: 'FLYING',
        crewId: 'F80001',
        pairingId: 1001,
        pairingLabel: 'PAIR-PA',
        base: 'YVR',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
        source: 'PA',
        rosterIds: [11, 12],
        schStrDtUtc: '2026-06-03T10:00:00.000Z',
        schEndDtUtc: '2026-06-04T18:00:00.000Z',
        status: 'PRE_ASSIGN',
        published: false,
        publishable: false,
      },
      {
        kind: 'FLYING',
        crewId: 'F80002',
        pairingId: 1002,
        pairingLabel: 'PAIR-CR',
        base: 'YVR',
        assignmentGroup: 'FLY',
        assignment: 'FLY',
        division: 'P',
        source: 'CR',
        rosterIds: [21],
        schStrDtUtc: '2026-06-05T10:00:00.000Z',
        schEndDtUtc: '2026-06-06T18:00:00.000Z',
        status: 'PUBLISHED',
        published: true,
        publishable: false,
      },
      {
        kind: 'GROUND',
        crewId: 'F80003',
        pairingId: null,
        pairingLabel: null,
        base: '',
        assignmentGroup: 'GRD',
        assignment: 'DO',
        division: 'P',
        source: 'CR',
        rosterIds: [31],
        schStrDtUtc: '2026-06-07T07:00:00.000Z',
        schEndDtUtc: '2026-06-08T06:59:59.000Z',
        status: 'PENDING',
        published: false,
        publishable: true,
      },
    ],
    rosterLoading: false,
    publishing: false,
    loadRoster: vi.fn(),
    publishRoster: vi.fn(async () => 1),
  }
  return { state }
})

vi.mock('@/stores/scenario-store', () => ({
  useScenarioStore: vi.fn((selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)),
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
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => <button disabled={disabled} onClick={onClick} {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Table: ({ children, className }: { children: React.ReactNode; className?: string }) => <table className={className}>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th {...props}>{children}</th>,
  TableHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => <thead className={className}>{children}</thead>,
  TableRow: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props}>{children}</tr>,
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}))

describe('PublishRosterDialog', () => {
  it('does not reload roster when the open dialog rerenders for the same scenario', async () => {
    mocks.state.loadRoster.mockClear()
    const container = document.createElement('div')
    const root = createRoot(container)
    const onOpenChange = vi.fn()

    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={onOpenChange} scenarioId={901} />)
    })
    expect(mocks.state.loadRoster).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={onOpenChange} scenarioId={901} />)
    })
    expect(mocks.state.loadRoster).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(<PublishRosterDialog open={false} onOpenChange={onOpenChange} scenarioId={901} />)
    })
    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={onOpenChange} scenarioId={901} />)
    })
    expect(mocks.state.loadRoster).toHaveBeenCalledTimes(2)
  })

  it('shows Pairing Label and keeps only already-imported rows disabled', async () => {
    mocks.state.publishRoster.mockClear()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
    })

    expect(container.textContent).toContain('Pairing ID')
    expect(container.textContent).toContain('Pairing Label')
    expect(container.textContent).toContain('PAIR-PA')
    expect(container.textContent).toContain('PAIR-CR')
    expect(container.textContent).toContain('Pre-assign')
    expect(container.textContent).toContain('Ground')
    expect(container.textContent).toContain('CR')
    expect(container.textContent).toContain('Imported')
    expect(container.textContent).toContain('Import 0 Selected')

    const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
    expect(rowCheckboxes).toHaveLength(3)
    expect(rowCheckboxes[0]?.disabled).toBe(true)
    expect(rowCheckboxes[1]?.disabled).toBe(true)
    expect(rowCheckboxes[2]?.disabled).toBe(false)
  })

  it('keeps the table header in the table scroll container', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
    })

    expect(container.querySelector('[data-testid="publish-roster-table-scroll"]')?.className).toContain('overflow-auto')
    expect(container.querySelector('[data-testid="publish-roster-table-scroll"]')?.className).toContain('[&>div]:overflow-visible')
    expect(container.querySelector('thead th')?.className).toContain('sticky')
    expect(container.querySelector('thead th')?.className).toContain('top-0')
  })

  it('shows import progress and result summary after importing selected rows', async () => {
    mocks.state.publishRoster.mockClear()
    mocks.state.publishRoster.mockResolvedValueOnce(1)
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
    })

    const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
    await act(async () => {
      rowCheckboxes[2]?.click()
    })

    expect(container.textContent).toContain('Import 1 Selected')

    const importButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Import 1 Selected'))
    expect(importButton).toBeTruthy()

    await act(async () => {
      importButton?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 5))
    })

    expect(mocks.state.publishRoster).toHaveBeenCalledWith(901, [31])
    expect(container.textContent).toContain('Complete')
    expect(container.textContent).toContain('Imported:')
    expect(container.textContent).toContain('Elapsed:')
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100')
    expect(container.textContent).toContain('Cancel')
    expect(container.textContent).toContain('Import 0 Selected')
    expect(container.textContent).not.toContain('Close')

    const disabledImportButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Import 0 Selected'))
    expect(disabledImportButton?.disabled).toBe(true)
  })

  it('can hide imported rows and clear or reselect unpublished assignments', async () => {
    mocks.state.publishRoster.mockClear()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
    })

    expect([...container.querySelectorAll('tbody tr')]).toHaveLength(3)

    const hideButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Hide Imported'))
    await act(async () => {
      hideButton?.click()
    })

    expect(container.textContent).not.toContain('PAIR-PA')
    expect(container.textContent).not.toContain('PAIR-CR')
    expect(container.textContent).toContain('1 / 3 rows')

    const clearButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Clear Selection'))
    await act(async () => {
      clearButton?.click()
    })

    expect(container.textContent).toContain('Import 0 Selected')

    const selectButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Select Unpublished'))
    await act(async () => {
      selectButton?.click()
    })

    expect(container.textContent).toContain('Import 1 Selected')
  })

  it('renders Pairing ID and Pairing Label search controls', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
    })

    const pairingIdInput = container.querySelector<HTMLInputElement>('input[placeholder="Pairing ID"]')
    const pairingLabelInput = container.querySelector<HTMLInputElement>('input[placeholder="Pairing Label"]')
    expect(pairingIdInput).toBeTruthy()
    expect(pairingLabelInput).toBeTruthy()
    expect([...container.querySelectorAll('button')].some((button) => button.textContent?.includes('Search'))).toBe(true)
  })

  it('matches the Crew ID filter exactly instead of by substring', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
      })

      const crewInput = container.querySelector<HTMLInputElement>('input[placeholder="Crew ID"]')
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      await act(async () => {
        inputSetter?.call(crewInput, 'F8000')
        crewInput?.dispatchEvent(new Event('input', { bubbles: true }))
        crewInput?.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await act(async () => {
        const searchButton = [...container.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('Search'))
        searchButton?.click()
      })

      expect(container.textContent).toContain('0 / 3 rows')
      expect(container.textContent).not.toContain('PAIR-PA')

      await act(async () => {
        inputSetter?.call(crewInput, ' F80003 ')
        crewInput?.dispatchEvent(new Event('input', { bubbles: true }))
        crewInput?.dispatchEvent(new Event('change', { bubbles: true }))
        const searchButton = [...container.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('Search'))
        searchButton?.click()
      })

      expect(container.textContent).toContain('1 / 3 rows')
      const selectButton = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Select Unpublished'))
      await act(async () => {
        selectButton?.click()
      })
      expect(container.textContent).toContain('Import 1 Selected')
    } finally {
      container.remove()
    }
  })

  it('selects only filtered publishable assignments from Select Unpublished', async () => {
    const originalRoster = mocks.state.roster
    mocks.state.roster = [
      ...originalRoster,
      {
        ...originalRoster[2],
        crewId: 'F89999',
        rosterIds: [99],
      },
    ]

    const container = document.createElement('div')
    document.body.appendChild(container)

    try {
      mocks.state.publishRoster.mockClear()
      const root = createRoot(container)

      await act(async () => {
        root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
      })

      const crewInput = container.querySelector<HTMLInputElement>('input[placeholder="Crew ID"]')
      await act(async () => {
        if (crewInput) {
          const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
          inputSetter?.call(crewInput, 'F80003')
          crewInput.dispatchEvent(new Event('input', { bubbles: true }))
          crewInput.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      const searchButton = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Search'))
      await act(async () => {
        searchButton?.click()
      })

      expect(container.textContent).toContain('1 / 4 rows')

      const selectButton = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Select Unpublished'))
      await act(async () => {
        selectButton?.click()
      })

      expect(container.textContent).toContain('Import 1 Selected')

      const importButton = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Import 1 Selected'))
      await act(async () => {
        importButton?.click()
        await new Promise((resolve) => window.setTimeout(resolve, 5))
      })

      expect(mocks.state.publishRoster).toHaveBeenCalledWith(901, [31])
    } finally {
      container.remove()
      mocks.state.roster = originalRoster
    }
  })

  it('shows missing Live crew rows with a specific status and keeps them unselectable', async () => {
    const originalRoster = mocks.state.roster
    mocks.state.roster = [
      ...originalRoster,
      {
        ...originalRoster[2],
        crewId: '227',
        rosterIds: [22701],
        status: 'EXCEPTION',
        published: false,
        publishable: false,
      },
    ]

    try {
      mocks.state.publishRoster.mockClear()
      const container = document.createElement('div')
      const root = createRoot(container)

      await act(async () => {
        root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
      })

      expect(container.textContent).toContain('227')
      expect(container.textContent).toContain('No Live Crew')

      const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
      expect(rowCheckboxes).toHaveLength(4)
      expect(rowCheckboxes[3]?.disabled).toBe(true)
      expect(rowCheckboxes[3]?.checked).toBe(false)

      const selectButton = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Select Unpublished'))
      await act(async () => {
        selectButton?.click()
      })

      expect(container.textContent).toContain('Import 1 Selected')

      const importButton = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Import 1 Selected'))
      await act(async () => {
        importButton?.click()
        await new Promise((resolve) => window.setTimeout(resolve, 5))
      })

      expect(mocks.state.publishRoster).toHaveBeenCalledWith(901, [31])
    } finally {
      mocks.state.roster = originalRoster
    }
  })

  it('virtualizes large assignment lists instead of rendering every row', async () => {
    const originalRoster = mocks.state.roster
    mocks.state.roster = Array.from({ length: 8000 }, (_, i) => ({
      ...originalRoster[2],
      crewId: `F${String(i).padStart(5, '0')}`,
      rosterIds: [10000 + i],
    }))

    try {
      const container = document.createElement('div')
      const root = createRoot(container)

      await act(async () => {
        root.render(<PublishRosterDialog open onOpenChange={vi.fn()} scenarioId={901} />)
      })

      expect(container.textContent).toContain('8000 / 8000 rows')
      expect([...container.querySelectorAll('tbody tr')].length).toBeLessThan(80)
      expect(container.textContent).toContain('F00000')
      expect(container.textContent).not.toContain('F07999')
    } finally {
      mocks.state.roster = originalRoster
    }
  })
})
