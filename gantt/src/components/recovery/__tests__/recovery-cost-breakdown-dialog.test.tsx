import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the project AppDialog so this test doesn't have to pull in Radix
// (which triggers a React 19 duplicate-instance error in the monorepo
// vitest environment).
vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, children, title, 'data-testid': testId }: { open: boolean; children: React.ReactNode; title: React.ReactNode; 'data-testid'?: string }) =>
    open ? <div data-testid={testId}><h2>{title}</h2>{children}</div> : null,
}))

import { RecoveryCostBreakdownDialog } from '../recovery-cost-breakdown-dialog'
import type { CostLibraryBreakdownRow } from '@/services/recovery-api'

const breakdown: CostLibraryBreakdownRow[] = [
  {
    label: 'Roster transfer base',
    typeCode: 1009,
    calculatorCode: 'fixed',
    revisionId: 4,
    quantity: 1,
    amount: 1500,
    status: 'priced',
    currencyCode: 'CNY',
  },
  {
    label: 'Standby activation',
    typeCode: 1007,
    calculatorCode: 'fixed',
    revisionId: 2,
    quantity: 1,
    amount: 1000,
    status: 'priced',
    currencyCode: 'CNY',
  },
  {
    label: 'Cross-division premium',
    typeCode: 1012,
    calculatorCode: 'quantity',
    revisionId: null,
    quantity: 1,
    amount: null,
    status: 'unpriced',
    currencyCode: 'CNY',
  },
]

describe('RecoveryCostBreakdownDialog (P0-1 lite)', () => {
  it('renders the dialog title with the plan title and the breakdown table', () => {
    render(
      <RecoveryCostBreakdownDialog
        open
        onOpenChange={() => {}}
        planTitle="Roster transfer C001 -> C002"
        breakdown={breakdown}
        currency="CNY"
        total={2500}
      />,
    )

    expect(screen.getByTestId('recovery-cost-breakdown-dialog')).toBeInTheDocument()
    expect(screen.getByText(/Cost breakdown - Roster transfer C001 -> C002/)).toBeInTheDocument()
    expect(screen.getAllByTestId('recovery-cost-breakdown-row')).toHaveLength(3)
    expect(screen.getByTestId('recovery-cost-breakdown-status')).toHaveTextContent('1 unpriced')
    expect(screen.getByTestId('recovery-cost-breakdown-total')).toHaveTextContent('¥2,500')
  })

  it('shows the per-row Cost rule label, calculator code, qty, amount, and status badge', () => {
    render(
      <RecoveryCostBreakdownDialog
        open
        onOpenChange={() => {}}
        planTitle="Test"
        breakdown={breakdown}
        currency="CNY"
        total={2500}
      />,
    )

    expect(screen.getByText('Roster transfer base')).toBeInTheDocument()
    expect(screen.getAllByText(/^fixed$/).length).toBeGreaterThan(0)
    expect(screen.getByText(/rev 4/)).toBeInTheDocument()
    // ¥1,500 may appear as both unit price and amount on the same row; just confirm presence.
    expect(screen.getAllByText('¥1,500').length).toBeGreaterThan(0)

    expect(screen.getByText('Cross-division premium')).toBeInTheDocument()
    const unpricedBadges = screen.getAllByTestId('recovery-cost-breakdown-row-status')
    const unpricedBadge = unpricedBadges.find((b) => b.getAttribute('data-status') === 'unpriced')
    expect(unpricedBadge).toHaveTextContent('unpriced')
  })

  it('shows "all priced" badge when every row is priced', () => {
    const allPriced: CostLibraryBreakdownRow[] = breakdown.filter((r) => r.status === 'priced')
    render(
      <RecoveryCostBreakdownDialog
        open
        onOpenChange={() => {}}
        planTitle="All priced"
        breakdown={allPriced}
        currency="CNY"
        total={2500}
      />,
    )
    expect(screen.getByTestId('recovery-cost-breakdown-status')).toHaveTextContent('all priced')
  })

  it('renders the empty state when breakdown is empty', () => {
    render(
      <RecoveryCostBreakdownDialog
        open
        onOpenChange={() => {}}
        planTitle="Empty"
        breakdown={[]}
        currency="CNY"
        total={0}
      />,
    )
    expect(screen.getByTestId('recovery-cost-breakdown-empty')).toBeInTheDocument()
  })

  it('renders the enrichment-failed banner when enrichmentFailed is true', () => {
    render(
      <RecoveryCostBreakdownDialog
        open
        onOpenChange={() => {}}
        planTitle="Failed"
        breakdown={[]}
        currency="CNY"
        total={3200}
        enrichmentFailed
      />,
    )
    expect(screen.getByTestId('recovery-cost-breakdown-enrichment-error')).toBeInTheDocument()
    expect(screen.getByTestId('recovery-cost-breakdown-status')).toHaveTextContent('unavailable')
  })

  it('renders notes when provided', () => {
    render(
      <RecoveryCostBreakdownDialog
        open
        onOpenChange={() => {}}
        planTitle="With notes"
        breakdown={breakdown}
        notes={['Cross-division is unpriced.']}
        currency="CNY"
        total={2500}
      />,
    )
    const notes = screen.getByTestId('recovery-cost-breakdown-notes')
    expect(notes).toBeInTheDocument()
    expect(notes).toHaveTextContent('Cross-division is unpriced.')
  })

  it('renders the mixed-currency banner when breakdown contains multiple currencies', () => {
    const mixedBreakdown: CostLibraryBreakdownRow[] = [
      { label: 'CNY cost', typeCode: 1009, calculatorCode: 'fixed', revisionId: 1, quantity: 1, amount: 2000, status: 'priced', currencyCode: 'CNY' },
      { label: 'USD cost', typeCode: 2004, calculatorCode: 'quantity', revisionId: 2, quantity: 1, amount: 100, status: 'priced', currencyCode: 'USD' },
    ]
    render(
      <RecoveryCostBreakdownDialog
        open
        onOpenChange={() => {}}
        planTitle="Mixed"
        breakdown={mixedBreakdown}
        currency="CNY"
        total={2100}
      />,
    )
    expect(screen.getByTestId('recovery-cost-breakdown-mixed-currency')).toBeInTheDocument()
  })

  it('hides content when open is false', () => {
    render(
      <RecoveryCostBreakdownDialog
        open={false}
        onOpenChange={() => {}}
        planTitle="Hidden"
        breakdown={breakdown}
        currency="CNY"
        total={2500}
      />,
    )
    expect(screen.queryByTestId('recovery-cost-breakdown-body')).not.toBeInTheDocument()
  })
})
