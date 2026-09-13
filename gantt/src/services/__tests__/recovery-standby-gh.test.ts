import { describe, expect, it } from 'vitest'

import {
  enrichPlansWithLibraryCosts,
  optionToLibraryCostInput,
  type RecoveryOption,
  type RecoveryPlanGroup,
  type RecoveryPlans,
} from '@/services/recovery-candidates'

const metrics = (directCost: number): RecoveryOption['metrics'] => ({
  affectedCrewCount: 1,
  cancelledRosterCount: 1,
  addedRosterCount: 1,
  changedRosterCount: 1,
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
  targetPairingId: null,
  standbyTaskId: 1355001,
  standbyWindow: '2026-09-24T02:00:00.000Z - 2026-09-24T10:00:00.000Z',
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

const plansWithStandby = (options: RecoveryOption[]): RecoveryPlans => ({
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
  standby: { ...emptyGroup('standby'), options },
  crossBase: emptyGroup('cross-base'),
  swapDuty: emptyGroup('swap-duty'),
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

describe('recovery standby GH cost mapping', () => {
  it('includes crew, source pairing, and standby task identity only for standby pricing', () => {
    const standbyInput = optionToLibraryCostInput(option('standby', 'standby'))
    expect(standbyInput).toMatchObject({
      mode: 'standby',
      standbyContext: { crewId: 'J4011', pairingId: 152097, standbyTaskId: 1355001 },
    })

    const swapInput = optionToLibraryCostInput(option('swap', 'swap'))
    expect(swapInput).toMatchObject({ mode: 'swap', crossRole: 1, changed: 2 })
    expect(swapInput).not.toHaveProperty('standbyContext')

    const delayInput = optionToLibraryCostInput(option('delay', 'flight-delay'))
    expect(delayInput).toMatchObject({ mode: 'flight-delay', changed: 1 })
    expect(delayInput).not.toHaveProperty('standbyContext')
  })

  it('keeps a priced zero ahead of priced costs and places null/unpriced last', async () => {
    const plans = plansWithStandby([
      option('unpriced', 'standby', { metrics: metrics(77) }),
      option('zero', 'standby', { metrics: metrics(88) }),
      option('priced', 'standby', { metrics: metrics(99) }),
    ])
    const result = await enrichPlansWithLibraryCosts(plans, [], async (inputs) => {
      expect(inputs).toHaveLength(3)
      return [
        { directCost: null, currency: 'USD', breakdown: [], notes: ['unpriced'] },
        { directCost: 0, currency: 'USD', breakdown: [], notes: ['zero'] },
        { directCost: 25, currency: 'USD', breakdown: [], notes: ['priced'] },
      ]
    })

    expect(result.standby.options.map((candidate) => candidate.id)).toEqual(['zero', 'priced', 'unpriced'])
    expect(result.standby.options[0]?.metrics).toMatchObject({ directCost: 0, totalCost: 0, costEnrichmentFailed: false })
    expect(result.standby.options[1]?.metrics).toMatchObject({ directCost: 25, totalCost: 25, costEnrichmentFailed: false })
    expect(result.standby.options[2]?.metrics).toMatchObject({ directCost: 77, totalCost: 77, costEnrichmentFailed: true })
  })
})
