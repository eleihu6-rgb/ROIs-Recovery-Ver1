/**
 * Recovery cost calculator — bridge between `recovery-candidates` (gantt
 * frontend) and the cost library calculator.
 *
 * Hard-coded coefficients (`mode === 'standby' ? 3200 : 1500 : 900 + ...`)
 * are replaced by calls to the cost library. Each cost component maps to
 * a configured cost type (`type_code`) and is priced by the configured
 * revision's calculator; the components are summed to form the option's
 * `directCost`. `virtualCost` stays in the UI as a stability-penalty knob
 * — it is not a billable cash amount.
 *
 * Component → cost-type mapping (Daily Recovery default set):
 *   roster-transfer base      → 1009  Short-notice roster change (fixed)
 *   roster-swap base          → 1009  same, qty=2
 *   standby base              → 1007  Day-off recall (fixed)
 *   cross-base modifier       → 2005  Other-airline deadhead (quantity)
 *   cross-division modifier   → 1012  Lead cabin position premium (unpriced)
 *   cross-role modifier       → 1014  Third-pilot augmentation (fixed)
 *   per-change penalty        → 1009  Short-notice roster change (fixed)
 *   follow-on impact          → 3005  Aircraft ferry sector (quantity)
 *   DHD positioning outbound  → 2004  Own-airline deadhead (quantity)
 *   standby activation        → 1007  Day-off recall (fixed)
 *
 * If a configured revision is `unpriced` or `disabled`, the calculator
 * returns `amount: null` and the bridge treats that as 0 cash but keeps
 * the row in the breakdown so analysts can see which tariffs are missing.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { success, error } from '../../utils/response.js'
import { CostLibraryError } from '../../services/cost/cost-library-service.js'
import { calculateCost } from '../../services/cost/cost-calculator.js'
import { validateParameters } from '../../services/cost/cost-validation.js'

const costInputSchema = z.object({
  mode: z.enum(['transfer', 'swap', 'standby', 'cross-base-standby', 'cross-base-swap', 'cross-base-destination', 'cross-base-direct']),
  crossBase: z.number().int().min(0).max(8),
  crossDivision: z.number().int().min(0).max(4),
  crossRole: z.number().int().min(0).max(4),
  changed: z.number().int().min(0).max(64),
  followOnImpactCount: z.number().int().min(0).max(32),
  /** DHD positioning estimated by the recovery engine. Number of outbound sectors. */
  dhdOutboundSectors: z.number().int().min(0).max(8).default(0),
  dhdFlightCost: z.number().finite().min(0).max(1_000_000).default(0),
  dhdCostSavings: z.number().finite().min(0).max(1_000_000).default(0),
})

type CostInput = z.infer<typeof costInputSchema>

interface CostRow {
  label: string
  typeCode: number
  calculatorCode: string
  revisionId: number | null
  quantity: number
  amount: number | null
  status: 'priced' | 'unpriced' | 'disabled' | 'missing-revision'
  currencyCode: string
}

interface RecoveryCostBreakdown {
  directCost: number
  currency: string
  breakdown: CostRow[]
  /** Optional notes for the UI (e.g. "fallback to other-airline because own-airline unpriced"). */
  notes: string[]
}

type RevisionRow = {
  id: number
  calculator_code: string
  currency_code: string
  unit_code: string
  unit_price: number | null
  params_json: unknown
  applicability_json: unknown
  enabled: boolean
}
type TypeRow = {
  id: number
  type_code: number
  calculator_code: string
}

/**
 * Build the list of cost components from the recovery input. Each row is
 * `{ label, typeCode, quantity, calculatorOverride? }` so the pricing
 * stage can locate the latest enabled revision and call its calculator.
 */
const buildComponents = (input: CostInput): Array<{ label: string; typeCode: number; quantity: number }> => {
  const isStandby = input.mode === 'standby' || input.mode === 'cross-base-standby'
  const isSwap = input.mode === 'swap' || input.mode === 'cross-base-swap'
  const components: Array<{ label: string; typeCode: number; quantity: number }> = []
  if (isStandby) {
    components.push({ label: 'Standby activation', typeCode: 1007, quantity: 1 })
  } else if (isSwap) {
    components.push({ label: 'Roster swap base', typeCode: 1009, quantity: 2 })
  } else {
    components.push({ label: 'Roster transfer base', typeCode: 1009, quantity: 1 })
  }
  if (input.crossBase > 0) {
    components.push({ label: `Cross-base positioning ×${input.crossBase}`, typeCode: 2005, quantity: input.crossBase })
  }
  if (input.crossDivision > 0) {
    components.push({ label: `Cross-division premium ×${input.crossDivision}`, typeCode: 1012, quantity: input.crossDivision })
  }
  if (input.crossRole > 0) {
    components.push({ label: `Cross-role augmentation ×${input.crossRole}`, typeCode: 1014, quantity: input.crossRole })
  }
  if (input.changed > 0 && !isStandby) {
    components.push({ label: `Roster change penalty ×${input.changed}`, typeCode: 1009, quantity: input.changed })
  }
  if (input.followOnImpactCount > 0) {
    components.push({ label: `Follow-on impact ×${input.followOnImpactCount}`, typeCode: 3005, quantity: input.followOnImpactCount })
  }
  if (input.dhdOutboundSectors > 0) {
    components.push({ label: `DHD outbound ×${input.dhdOutboundSectors}`, typeCode: 2004, quantity: input.dhdOutboundSectors })
  }
  return components
}

/** Build per-component calculator inputs from the cost-library input shape. */
const buildCalculatorInputs = (
  component: { typeCode: number; quantity: number },
  mode: CostInput['mode'],
): unknown => {
  // Only a handful of calculators take structured inputs; the rest just
  // need `quantity`. Standby callouts use the standalone-standby code,
  // which requires `beforeCredit` and `addedCredit`; for recovery
  // scenarios we pass a synthetic minimum so the calculator returns a
  // numeric amount when priced.
  if (component.typeCode === 1007) {
    return { quantity: component.quantity, beforeCredit: 0, addedCredit: 0 }
  }
  return { quantity: component.quantity }
}

export default async function recoveryCostRoutes(fastify: FastifyInstance): Promise<void> {
  const calculate = async (input: CostInput): Promise<RecoveryCostBreakdown> => {
    const components = buildComponents(input)
    if (components.length === 0) {
      return { directCost: 0, currency: 'CNY', breakdown: [], notes: ['No cost components for the given input.'] }
    }
    const typeCodes = [...new Set(components.map((c) => c.typeCode))]
    const instancesResult = await fastify.pgPool.query<TypeRow & { instance_id: number }>(
      `SELECT i.id AS instance_id, t.id AS id, t.type_code, t.calculator_code
         FROM cost_instance i
         JOIN cost_type t ON t.id = i.cost_type_id
        WHERE t.type_code = ANY($1::int[])
        ORDER BY i.id ASC`,
      [typeCodes],
    )
    const typeByCode = new Map<number, TypeRow>()
    const instanceIds: number[] = []
    for (const row of instancesResult.rows) {
      instanceIds.push(Number(row.instance_id))
      const existing = typeByCode.get(Number(row.type_code))
      if (!existing) typeByCode.set(Number(row.type_code), { id: Number(row.id), type_code: Number(row.type_code), calculator_code: row.calculator_code })
    }
    const revisionsByCostInstanceId = new Map<number, RevisionRow>()
    for (const id of instanceIds) {
      const r = await fastify.pgPool.query<RevisionRow & { cost_instance_id: number; enabled: boolean }>(
        `SELECT r.id, r.cost_instance_id, r.calculator_code, r.currency_code, r.unit_code, r.unit_price,
                r.params_json, r.applicability_json, i.enabled
           FROM cost_revision r
           JOIN cost_instance i ON i.id = r.cost_instance_id
          WHERE r.cost_instance_id = $1
          ORDER BY r.revision_no DESC LIMIT 1`,
        [id],
      )
      if (r.rows[0]) {
        const row = r.rows[0]
        revisionsByCostInstanceId.set(Number(row.cost_instance_id), {
          id: Number(row.id),
          calculator_code: row.calculator_code,
          currency_code: row.currency_code,
          unit_code: row.unit_code,
          unit_price: row.unit_price,
          params_json: row.params_json,
          applicability_json: row.applicability_json,
          enabled: row.enabled,
        })
      }
    }
    let directCost = 0
    let firstCurrency = 'CNY'
    const breakdown: CostRow[] = []
    const notes: string[] = []
    for (const component of components) {
      const type = typeByCode.get(component.typeCode)
      if (!type) {
        breakdown.push({
          label: component.label,
          typeCode: component.typeCode,
          calculatorCode: 'unknown',
          revisionId: null,
          quantity: component.quantity,
          amount: null,
          status: 'missing-revision',
          currencyCode: 'CNY',
        })
        notes.push(`Cost type ${component.typeCode} not installed — install the cost library seed first.`)
        continue
      }
      const revision = revisionsByCostInstanceId.get(type.id)
      if (!revision) {
        breakdown.push({
          label: component.label,
          typeCode: component.typeCode,
          calculatorCode: type.calculator_code,
          revisionId: null,
          quantity: component.quantity,
          amount: null,
          status: 'missing-revision',
          currencyCode: 'CNY',
        })
        continue
      }
      const calcInput = buildCalculatorInputs(component, input.mode)
      try {
        validateParameters(revision.calculator_code as 'quantity' | 'fixed' | 'minimum' | 'guarantee' | 'standby' | 'bands' | 'booking', revision.params_json)
      } catch (err) {
        breakdown.push({
          label: component.label,
          typeCode: component.typeCode,
          calculatorCode: revision.calculator_code,
          revisionId: Number(revision.id),
          quantity: component.quantity,
          amount: null,
          status: 'missing-revision',
          currencyCode: revision.currency_code,
        })
        notes.push(`Revision ${revision.id} for cost type ${component.typeCode} has invalid params: ${err instanceof Error ? err.message : 'unknown'}.`)
        continue
      }
      let result: ReturnType<typeof calculateCost>
      try {
        result = calculateCost({
          calculatorCode: revision.calculator_code as 'quantity' | 'fixed' | 'minimum' | 'guarantee' | 'standby' | 'bands' | 'booking',
          effectiveFrom: '2026-01-01T00:00:00Z',
          effectiveTo: null,
          currencyCode: revision.currency_code,
          unitCode: revision.unit_code,
          unitPrice: revision.unit_price,
          paramsJson: revision.params_json as Record<string, unknown>,
          applicabilityJson: revision.applicability_json as Record<string, unknown>,
          reference: '',
          ghPolicyRevisionId: null,
          enabled: revision.enabled,
        }, calcInput)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        breakdown.push({
          label: component.label,
          typeCode: component.typeCode,
          calculatorCode: revision.calculator_code,
          revisionId: Number(revision.id),
          quantity: component.quantity,
          amount: null,
          status: 'unpriced',
          currencyCode: revision.currency_code,
        })
        notes.push(`Revision ${revision.id} (${revision.calculator_code}) rejected qty=${component.quantity} for type ${component.typeCode}: ${message}. Configure a quantity-based revision in the cost library.`)
        continue
      }
      breakdown.push({
        label: component.label,
        typeCode: component.typeCode,
        calculatorCode: revision.calculator_code,
        revisionId: Number(revision.id),
        quantity: component.quantity,
        amount: result.amount,
        status: result.status,
        currencyCode: result.currencyCode,
      })
      firstCurrency = result.currencyCode
      if (result.amount !== null) directCost += result.amount
    }
    // Subtract DHD cost savings (analyst input — not priced by the library).
    if (input.dhdCostSavings > 0) {
      directCost = Math.max(0, directCost - input.dhdCostSavings)
      breakdown.push({
        label: 'DHD cost savings',
        typeCode: 0,
        calculatorCode: 'manual',
        revisionId: null,
        quantity: 0,
        amount: -input.dhdCostSavings,
        status: 'priced',
        currencyCode: firstCurrency,
      })
    }
    return { directCost, currency: firstCurrency, breakdown, notes }
  }

  fastify.post('/calculate-cost', async (request: FastifyRequest, reply) => {
    if (!request.authUser) return error(reply, 401, 'Authentication required')
    const parsed = costInputSchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
    try {
      return success(reply, await calculate(parsed.data))
    } catch (err) {
      if (err instanceof CostLibraryError) return error(reply, err.statusCode, err.message)
      request.log.error({ err }, 'Recovery cost calculation failed')
      return error(reply, 500, 'Recovery cost calculation failed')
    }
  })

  const batchSchema = z.object({ inputs: z.array(costInputSchema).min(1).max(128) })
  fastify.post('/calculate-cost/batch', async (request: FastifyRequest, reply) => {
    if (!request.authUser) return error(reply, 401, 'Authentication required')
    const parsed = batchSchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
    try {
      const results = await Promise.all(parsed.data.inputs.map((input) => calculate(input).catch((err) => {
        const message = err instanceof Error ? err.message : 'unknown'
        return { directCost: 0, currency: 'CNY', breakdown: [], notes: [`Calculation failed: ${message}`] } satisfies RecoveryCostBreakdown
      })))
      return success(reply, { results })
    } catch (err) {
      request.log.error({ err }, 'Batch recovery cost calculation failed')
      return error(reply, 500, 'Batch recovery cost calculation failed')
    }
  })

  fastify.get('/calculate-cost/schema', async (_request, reply) => success(reply, costInputSchema))
}
