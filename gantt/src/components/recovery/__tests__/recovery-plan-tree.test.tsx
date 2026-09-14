import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanTree } from '../recovery-violation-dialog'
import type { RecoveryOption, RecoveryPlanGroup } from '@/services/recovery-candidates'
const option = (cost: number, extras: Partial<RecoveryOption> = {}): RecoveryOption => ({
  id: String(cost), mode: 'standby', localExecutable: true, ruleCheck: 'passed',
  metrics: { totalCost: cost, currency: 'USD', costEnrichmentFailed: false }, ...extras,
} as RecoveryOption)
const group = (id: RecoveryPlanGroup['id'], options: RecoveryOption[]): RecoveryPlanGroup => ({ id, title: id, description: '', options, excludedOptions: [] })

describe('shared Recovery method / cost tree', () => {
  it('groups by minimum executable cost and selects a method without filtering its candidates', () => {
    const select = vi.fn()
    const rows = [group('standby', [option(0), option(326.25)]), group('roster', [option(410)]), group('swap-duty', [option(2470)])]
    render(<PlanTree groups={rows} selectedPlanType="standby" onSelect={select} />)
    expect(screen.getByText('By cost tier')).toBeInTheDocument()
    expect(screen.getByTestId('recovery-cost-tier-free-standby')).toHaveTextContent('0')
    expect(screen.getByTestId('recovery-cost-tier-low-roster')).toHaveTextContent('410')
    expect(screen.getByTestId('recovery-cost-tier-low-swap-duty')).toHaveTextContent('2,470')
    expect(screen.queryByTestId('recovery-cost-tier-low-standby')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('recovery-cost-tier-low-roster'))
    expect(select).toHaveBeenCalledWith('roster')
    expect(rows[0].options).toHaveLength(2)
  })
  it('does not treat unpriced or failed/pending options as free executable options', () => {
    const rows = [group('standby', [option(0, { metrics: { totalCost: 0, currency: 'USD', costEnrichmentFailed: true } as RecoveryOption['metrics'] })]), group('roster', [option(0, { ruleCheck: 'failed' })]), group('swap-duty', [option(0, { ruleCheck: 'pending' })])]
    render(<PlanTree groups={rows} selectedPlanType="standby" onSelect={() => {}} />)
    expect(screen.queryByTestId(/recovery-cost-tier-/)).not.toBeInTheDocument()
  })
  it('does not compare different currencies and disables selection while loading', () => {
    render(<PlanTree groups={[group('standby', [option(0)]), group('roster', [option(10, { metrics: { totalCost: 10, currency: 'CNY' } as RecoveryOption['metrics'] })])]} disabled selectedPlanType="standby" onSelect={() => {}} />)
    expect(screen.queryByTestId(/recovery-cost-tier-/)).not.toBeInTheDocument()
    expect(screen.getByTestId('recovery-plan-filter-standby')).toBeDisabled()
    expect(screen.getByTestId('recovery-plan-filter-standby')).not.toHaveTextContent('★')
  })
})
