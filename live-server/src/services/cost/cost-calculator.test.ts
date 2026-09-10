import { describe, expect, it } from 'vitest'

import { calculateCost } from './cost-calculator.js'
import { revisionSchema, validateParameters } from './cost-validation.js'
import type { CalculationRevision } from './cost-calculator.js'

const baseRevision = (overrides: Partial<CalculationRevision>): CalculationRevision => ({
  calculatorCode: 'quantity',
  effectiveFrom: '2026-09-01T00:00:00.000Z',
  effectiveTo: null,
  currencyCode: 'CAD',
  unitCode: 'hour',
  unitPrice: 100,
  paramsJson: {},
  applicabilityJson: {},
  reference: 'unit-test',
  ghPolicyRevisionId: null,
  ...overrides,
})

describe('cost calculator', () => {
  it('prices quantity cost from quantity and unit price', () => {
    const result = calculateCost(baseRevision({ calculatorCode: 'quantity' }), { quantity: 2.255 })

    expect(result.amount).toBe(225.5)
    expect(result.currencyCode).toBe('CAD')
    expect(result.status).toBe('priced')
    expect(result.formula).toContain('unit price')
  })

  it('prices fixed cost directly from unit price for a qualifying event', () => {
    const result = calculateCost(baseRevision({ calculatorCode: 'fixed', unitPrice: 42.345 }), { quantity: 1 })

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(42.35)
  })

  it('returns unpriced null when a price-bearing calculator has no rate', () => {
    const result = calculateCost(
      baseRevision({ calculatorCode: 'quantity', unitPrice: null }),
      { quantity: 4 },
    )

    expect(result.status).toBe('unpriced')
    expect(result.amount).toBeNull()
  })

  it('uses saved unit price for quantity and fixed costs rather than input hourlyRate', () => {
    const quantity = calculateCost(
      baseRevision({ calculatorCode: 'quantity', unitPrice: 10 }),
      { quantity: 3, hourlyRate: 999 },
    )
    const fixed = calculateCost(
      baseRevision({ calculatorCode: 'fixed', unitPrice: 25 }),
      { quantity: 1, hourlyRate: 999 },
    )

    expect(quantity.amount).toBe(30)
    expect(fixed.amount).toBe(25)
  })

  it('applies minimum quantity before multiplying by unit price', () => {
    const result = calculateCost(
      baseRevision({
        calculatorCode: 'minimum',
        paramsJson: { minimumQuantity: 4 },
        unitPrice: 25,
      }),
      { quantity: 1.5 },
    )

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(100)
    expect(result.breakdown).toContainEqual({ label: 'Billable quantity', value: '4' })
  })

  it('keeps minimum quantity zero as zero cost instead of applying the minimum floor', () => {
    const result = calculateCost(
      baseRevision({
        calculatorCode: 'minimum',
        paramsJson: { minimumQuantity: 4 },
        unitPrice: 25,
      }),
      { quantity: 0 },
    )

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(0)
  })

  it('calculates GH pay-after minus pay-before with tiers and keeps intermediate credits unrounded', () => {
    const revision = baseRevision({
      calculatorCode: 'guarantee',
      unitPrice: 100,
      paramsJson: {
        guaranteeHours: 85,
        tiers: [
          { upToHours: 90, multiplier: 1.2 },
          { upToHours: null, multiplier: 1.5 },
        ],
      },
    })

    const result = calculateCost(revision, {
      beforeCredit: 84,
      addedCredit: 6.75,
      removedCredit: 0,
    })

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(712.5)
    expect(result.breakdown).toEqual([
      { label: 'Before credit', value: '84' },
      { label: 'After credit', value: '90.75' },
    ])
  })

  it('does not charge GH when baseline is below guarantee floor and added credit remains below floor', () => {
    const result = calculateCost(
      baseRevision({
        calculatorCode: 'guarantee',
        unitPrice: 100,
        paramsJson: {
          guaranteeHours: 85,
          tiers: [
            { upToHours: 90, multiplier: 1.2 },
            { upToHours: null, multiplier: 1.5 },
          ],
        },
      }),
      { beforeCredit: 70, addedCredit: 6.75 },
    )

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(0)
  })

  it('calculates standby incremental credit against the referenced GH policy revision', () => {
    const standby = baseRevision({
      calculatorCode: 'standby',
      unitPrice: null,
      paramsJson: { creditFactor: 0.5, departureCutoffMinutes: 60 },
      ghPolicyRevisionId: 101,
    })
    const guarantee = baseRevision({
      calculatorCode: 'guarantee',
      unitPrice: 100,
      paramsJson: {
        guaranteeHours: 85,
        tiers: [
          { upToHours: 90, multiplier: 1.2 },
          { upToHours: null, multiplier: 1.5 },
        ],
      },
    })

    const result = calculateCost(
      standby,
      {
        beforeCredit: 84,
        removedCredit: 0,
        reportAt: '2026-09-10T07:00:00.000Z',
        departureAt: '2026-09-10T10:00:00.000Z',
        pairingCredit: 5.75,
      },
      guarantee,
    )

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(712.5)
    expect(result.breakdown).toContainEqual({ label: 'Standby credit', value: '1' })
    expect(result.breakdown).toContainEqual({ label: 'Assignment credit', value: '6.75' })
  })

  it('calculates delay bands as after minus before with upper rate beyond threshold', () => {
    const result = calculateCost(
      baseRevision({
        calculatorCode: 'bands',
        unitPrice: 10,
        paramsJson: { threshold: 120, upperRate: 25 },
      }),
      { delayBefore: 100, delayAfter: 150 },
    )

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(950)
  })

  it('calculates booking as new unit price minus refund plus change fee', () => {
    const result = calculateCost(
      baseRevision({
        calculatorCode: 'booking',
        unitPrice: 200,
        paramsJson: { originalAmount: 140, refundAmount: 100, changeFee: 25.555 },
      }),
      {},
    )

    expect(result.status).toBe('priced')
    expect(result.amount).toBe(125.56)
  })

  it('returns disabled status without exposing an amount when revision or GH policy is disabled', () => {
    const disabledRevision = calculateCost(
      baseRevision({ calculatorCode: 'fixed', enabled: false, unitPrice: 10 }),
      { quantity: 1 },
    )

    expect(disabledRevision.status).toBe('disabled')
    expect(disabledRevision.amount).toBeNull()

    const disabledPolicy = calculateCost(
      baseRevision({
        calculatorCode: 'standby',
        paramsJson: { creditFactor: 0.5, departureCutoffMinutes: 60 },
      }),
      {
        beforeCredit: 84,
        reportAt: '2026-09-10T07:00:00.000Z',
        departureAt: '2026-09-10T10:00:00.000Z',
        pairingCredit: 5.75,
      },
      baseRevision({
        calculatorCode: 'guarantee',
        enabled: false,
        paramsJson: { guaranteeHours: 85, tiers: [{ upToHours: null, multiplier: 1 }] },
      }),
    )

    expect(disabledPolicy.status).toBe('disabled')
    expect(disabledPolicy.amount).toBeNull()
  })

  it('rejects invalid calculator inputs and parameter dependencies', () => {
    expect(() =>
      calculateCost(baseRevision({ calculatorCode: 'quantity' }), { quantity: -1 }),
    ).toThrow()
    expect(() =>
      calculateCost(baseRevision({ calculatorCode: 'fixed' }), { quantity: 2 }),
    ).toThrow()
    expect(() =>
      calculateCost(
        baseRevision({
          calculatorCode: 'guarantee',
          paramsJson: { guaranteeHours: 85, tiers: [{ upToHours: null, multiplier: 1 }] },
        }),
        { beforeCredit: 10, addedCredit: 1, removedCredit: 11 },
      ),
    ).toThrow('Removed credit cannot exceed baseline credit')
    expect(() =>
      calculateCost(
        baseRevision({ calculatorCode: 'standby', paramsJson: { creditFactor: 0.5, departureCutoffMinutes: 60 } }),
        {
          beforeCredit: 84,
          reportAt: '2026-09-10T10:00:00.000Z',
          departureAt: '2026-09-10T07:00:00.000Z',
          pairingCredit: 1,
        },
        baseRevision({
          calculatorCode: 'guarantee',
          paramsJson: { guaranteeHours: 85, tiers: [{ upToHours: null, multiplier: 1 }] },
        }),
      ),
    ).toThrow('Departure must follow report')
  })
})

describe('cost validation', () => {
  it('accepts strict revision shape and rejects bad dates or unknown fields', () => {
    const parsed = revisionSchema.parse({
      calculatorCode: 'quantity',
      effectiveFrom: '2026-09-01T00:00:00.000Z',
      effectiveTo: null,
      currencyCode: 'CAD',
      unitCode: 'hour',
      unitPrice: 100,
      paramsJson: {},
      applicabilityJson: {},
      reference: '',
      ghPolicyRevisionId: null,
      expectedRevisionNo: 1,
    })

    expect(parsed.calculatorCode).toBe('quantity')
    expect(() =>
      revisionSchema.parse({
        ...parsed,
        effectiveTo: '2026-08-31T00:00:00.000Z',
      }),
    ).toThrow()
    expect(() =>
      revisionSchema.parse({
        ...parsed,
        unexpected: true,
      }),
    ).toThrow()
  })

  it('validates calculator parameter schemas including contiguous GH tiers', () => {
    expect(() =>
      validateParameters('guarantee', {
        guaranteeHours: 85,
        tiers: [
          { upToHours: 90, multiplier: 1 },
          { upToHours: null, multiplier: 1.5 },
        ],
      }),
    ).not.toThrow()

    expect(() =>
      validateParameters('guarantee', {
        guaranteeHours: 85,
        tiers: [
          { upToHours: null, multiplier: 1 },
          { upToHours: 95, multiplier: 1.5 },
        ],
      }),
    ).toThrow()

    expect(() =>
      validateParameters('standby', {
        creditFactor: 1.25,
        departureCutoffMinutes: 60,
      }),
    ).not.toThrow()
  })
})
