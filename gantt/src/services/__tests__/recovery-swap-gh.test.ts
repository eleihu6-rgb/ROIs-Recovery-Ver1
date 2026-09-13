import { describe, expect, it } from 'vitest'

import {
  enrichPlansWithLibraryCosts,
  optionToLibraryCostInput,
  type RecoveryOption,
  type RecoveryPlanGroup,
  type RecoveryPlans,
} from '@/services/recovery-candidates'

const metrics = (directCost: number): RecoveryOption['metrics'] => ({
  affectedCrewCount: 2,
  cancelledRosterCount: 2,
  addedRosterCount: 2,
  changedRosterCount: 2,
  followOnImpactCount: 0,
  rosterStability: 100,
  directCost,
  dhdFlightCost: 0,
  dhdCostSavings: 0,
  totalCost: directCost,
  currency: 'USD',
})

const option = (
  id: string,
  mode: RecoveryOption['mode'],
  overrides: Partial<RecoveryOption> = {},
): RecoveryOption => ({
  id,
  mode,
  title: id,
  targetCrewId: 'J4011',
  targetCrewName: 'J4011',
  sourceCrewId: 'J4002',
  sourcePairingId: 152097,
  targetPairingId: 152098,
  standbyTaskId: null,
  standbyWindow: null,
  timeDistanceMinutes: null,
  sameRank: true,
  sameBase: true,
  crossDivision: false,
  crossRole: false,
  localExecutable: true,
  reasons: [],
  beforeItems: [],
  afterItems: [],
  changes: [],
  metrics: metrics(99),
  ruleCheck: 'passed',
  ruleMessages: [],
  positioning: null,
  ...overrides,
})

const emptyGroup = (id: RecoveryPlanGroup['id']): RecoveryPlanGroup => ({
  id,
  title: id,
  description: '',
  options: [],
  excludedOptions: [],
})

const plansWithSwapDuty = (options: RecoveryOption[]): RecoveryPlans => ({
  alert: {
    id: 'alert-1',
    ruleCode: '1001',
    severity: 3,
    crewId: 'J4002',
    pairingId: 152097,
    flightDate: '2026-09-24',
    flightNumber: 'ET805',
    detail: 'assignment overlap',
  },
  alerts: [],
  trigger: 'assignment-overlap',
  roster: emptyGroup('roster'),
  standby: emptyGroup('standby'),
  crossBase: emptyGroup('cross-base'),
  swapDuty: { ...emptyGroup('swap-duty'), options },
  flightDelay: emptyGroup('flight-delay'),
  mixed: emptyGroup('mixed'),
  crossBaseTrace: [],
  crossBaseContext: {
    sourceCrewId: 'J4002',
    sourcePairingId: 152097,
    recoveryBase: 'ADD',
    requiredFleets: [],
    sourceStartUtc: null,
    sourceEndUtc: null,
    loadedFlightCount: 0,
    loadedFlightWindow: null,
  },
})

describe('swap-duty GH cost mapping', () => {
  it('sends both crew and pairing identities, changed=2, and no standby context', () => {
    const input = optionToLibraryCostInput(option('swap-duty', 'swap-duty'))

    expect(input).toMatchObject({
      mode: 'swap-duty',
      swapContext: {
        sourceCrewId: 'J4002',
        sourcePairingId: 152097,
        targetCrewId: 'J4011',
        targetPairingId: 152098,
      },
      changed: 2,
    })
    expect(input).not.toHaveProperty('standbyContext')
  })

  it('does not add swapContext for generic swap or transfer modes', () => {
    expect(optionToLibraryCostInput(option('swap', 'swap'))).not.toHaveProperty('swapContext')
    expect(optionToLibraryCostInput(option('transfer', 'transfer'))).not.toHaveProperty('swapContext')
  })

  it('sorts signed negative, zero, positive, then unpriced swap-duty costs', async () => {
    const plans = plansWithSwapDuty([
      option('positive', 'swap-duty', { metrics: metrics(90) }),
      option('unpriced', 'swap-duty', { metrics: metrics(80) }),
      option('negative', 'swap-duty', { metrics: metrics(70) }),
      option('zero', 'swap-duty', { metrics: metrics(60) }),
    ])

    const result = await enrichPlansWithLibraryCosts(plans, [], async (inputs) => {
      expect(inputs).toHaveLength(4)
      expect(inputs.every((input) => input.mode === 'swap-duty' && input.changed === 2)).toBe(true)
      expect(inputs.every((input) => input.swapContext != null)).toBe(true)
      return [
        { directCost: 25, currency: 'USD', breakdown: [], notes: ['positive'] },
        { directCost: null, currency: 'USD', breakdown: [], notes: ['unpriced'] },
        { directCost: -10, currency: 'USD', breakdown: [], notes: ['saving'] },
        { directCost: 0, currency: 'USD', breakdown: [], notes: ['zero'] },
      ]
    })

    expect(result.swapDuty.options.map((candidate) => candidate.id)).toEqual(['negative', 'zero', 'positive', 'unpriced'])
    expect(result.swapDuty.options.map((candidate) => candidate.metrics.directCost)).toEqual([-10, 0, 25, 80])
    expect(result.swapDuty.options[3]?.metrics.costEnrichmentFailed).toBe(true)
  })
})
