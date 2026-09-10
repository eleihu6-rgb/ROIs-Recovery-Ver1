import { inputsSchema, parameterSchemas, validateParameters } from './cost-validation.js'
import type { CostInputs, RevisionInput } from './cost-validation.js'

export type CalculationRevision = Omit<RevisionInput, 'expectedRevisionNo'> & { enabled?: boolean }
export interface CostCalculation { amount: number | null; currencyCode: string; status: 'priced' | 'unpriced' | 'disabled'; breakdown: { label: string; value: string }[]; formula: string }

// Rational arithmetic preserves decimal inputs and time fractions until final cents rounding.
class Decimal {
  readonly n: bigint
  readonly d: bigint
  constructor(n: bigint, d: bigint = 1n) {
    let a = n < 0n ? -n : n
    let b = d
    while (b !== 0n) { const remainder = a % b; a = b; b = remainder }
    this.n = n / a; this.d = d / a
  }
  static of(value: number): Decimal {
    const [base, exponent = '0'] = String(value).split('e')
    const digits = base!.replace('.', '')
    const scale = (base!.split('.')[1]?.length ?? 0) - Number(exponent)
    return scale >= 0 ? new Decimal(BigInt(digits), 10n ** BigInt(scale)) : new Decimal(BigInt(digits) * 10n ** BigInt(-scale))
  }
  add(b: Decimal): Decimal { return new Decimal(this.n * b.d + b.n * this.d, this.d * b.d) }
  sub(b: Decimal): Decimal { return new Decimal(this.n * b.d - b.n * this.d, this.d * b.d) }
  mul(b: Decimal): Decimal { return new Decimal(this.n * b.n, this.d * b.d) }
  min(b: Decimal): Decimal { return this.n * b.d < b.n * this.d ? this : b }
  max(b: Decimal): Decimal { return this.n * b.d > b.n * this.d ? this : b }
  number(): number { return Number(this.n) / Number(this.d) }
  cents(): number { const sign = this.n < 0n ? -1n : 1n; const n = this.n * sign * 100n; const cents = Number(sign * ((n * 2n + this.d) / (2n * this.d))); if (!Number.isSafeInteger(cents)) throw new Error('Calculated amount exceeds supported currency precision'); return cents / 100 }
}
const D = Decimal.of
const zero = D(0)
const required = (inputs: CostInputs, key: keyof CostInputs): number => {
  const value = inputs[key]
  if (typeof value !== 'number') throw new Error(`${key} is required`)
  return value
}
const pay = (credit: Decimal, revision: CalculationRevision, rate: number): Decimal => {
  const params = parameterSchemas.guarantee.parse(revision.paramsJson)
  let lower = D(params.guaranteeHours)
  let amount = lower.mul(D(rate))
  for (const tier of params.tiers) {
    const upper = tier.upToHours === null ? credit : D(tier.upToHours)
    amount = amount.add(credit.min(upper).sub(lower).max(zero).mul(D(tier.multiplier)).mul(D(rate)))
    lower = upper
  }
  return amount
}
export const calculateCost = (revision: CalculationRevision, rawInputs: unknown, ghRevision?: CalculationRevision): CostCalculation => {
  const inputs = inputsSchema.parse(rawInputs)
  validateParameters(revision.calculatorCode, revision.paramsJson)
  const result: CostCalculation = { amount: null, currencyCode: revision.currencyCode, status: 'unpriced', breakdown: [], formula: '' }
  const add = (label: string, value: Decimal): void => { result.breakdown.push({ label, value: String(value.number()) }) }
  let amount: Decimal | null = null
  const rate = revision.unitPrice
  switch (revision.calculatorCode) {
    case 'quantity': { const quantity = D(required(inputs, 'quantity')); result.formula = 'quantity × unit price'; if (rate !== null) amount = quantity.mul(D(rate)); break }
    case 'fixed': { const quantity = required(inputs,'quantity'); if (quantity !== 0 && quantity !== 1) throw new Error('Fixed cost quantity must be 0 or 1'); result.formula = 'quantity × fixed unit price'; if (rate !== null) amount = D(rate).mul(D(quantity)); break }
    case 'minimum': { const p = parameterSchemas.minimum.parse(revision.paramsJson); const requested = required(inputs,'quantity'); const quantity = requested === 0 ? zero : D(requested).max(D(p.minimumQuantity)); add('Billable quantity', quantity); result.formula = 'quantity > 0 ? max(quantity, minimum) × unit price : 0'; if (rate !== null) amount = quantity.mul(D(rate)); break }
    case 'guarantee':
    case 'standby': {
      const before = D(required(inputs, 'beforeCredit'))
      const removed = D(inputs.removedCredit ?? 0)
      if (removed.number() > before.number()) throw new Error('Removed credit cannot exceed baseline credit')
      let added: Decimal
      let policy = revision
      if (revision.calculatorCode === 'standby') {
        if (!ghRevision || ghRevision.calculatorCode !== 'guarantee' || ghRevision.currencyCode !== revision.currencyCode) throw new Error('A matching-currency GH revision is required')
        policy = ghRevision
        const p = parameterSchemas.standby.parse(revision.paramsJson)
        if (!inputs.reportAt || !inputs.departureAt) throw new Error('Report and departure timestamps are required')
        const elapsed = Date.parse(inputs.departureAt) - Date.parse(inputs.reportAt)
        if (elapsed < 0) throw new Error('Departure must follow report')
        const standby = new Decimal(BigInt(elapsed), 60000n).sub(D(p.departureCutoffMinutes)).max(zero).mul(D(p.creditFactor)).mul(new Decimal(1n, 60n))
        added = standby.add(D(required(inputs, 'pairingCredit')))
        const baseline = D(inputs.baselineStandbyCredit ?? 0)
        if (baseline.add(removed).number() > before.number()) throw new Error('Removed and baseline standby credit exceed baseline credit')
        add('Standby credit', standby); add('Assignment credit', added)
        added = added.sub(baseline)
      } else added = D(required(inputs, 'addedCredit'))
      const after = before.sub(removed).add(added)
      add('Before credit', before); add('After credit', after)
      result.formula = 'Pay(after credit) − Pay(before credit)'
      const hourlyRate = inputs.hourlyRate ?? policy.unitPrice
      if (hourlyRate !== null) amount = pay(after, policy, hourlyRate).sub(pay(before, policy, hourlyRate))
      break
    }
    case 'bands': { const p = parameterSchemas.bands.parse(revision.paramsJson); const before = D(required(inputs, 'delayBefore')); const after = D(required(inputs, 'delayAfter')); result.formula = 'Delay cost(after) − Delay cost(before)'; if (rate !== null) { const cost = (minutes: Decimal): Decimal => minutes.min(D(p.threshold)).mul(D(rate)).add(minutes.sub(D(p.threshold)).max(zero).mul(D(p.upperRate))); amount = cost(after).sub(cost(before)) } break }
    case 'booking': { const p = parameterSchemas.booking.parse(revision.paramsJson); result.formula = 'New booking price − refund + change fee'; if (rate !== null) amount = D(rate).sub(D(p.refundAmount)).add(D(p.changeFee)); break }
  }
  if (revision.enabled === false || ghRevision?.enabled === false) return { ...result, status: 'disabled' }
  if (amount !== null) { result.amount = amount.cents(); result.status = 'priced' }
  return result
}
