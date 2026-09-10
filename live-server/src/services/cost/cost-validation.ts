import { z } from 'zod'

export const calculatorCode = z.enum(['quantity', 'fixed', 'minimum', 'guarantee', 'standby', 'bands', 'booking'])
const nonnegative = z.number().finite().nonnegative().max(1e9)
export const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.string().datetime({ offset: true })
export const revisionSchema = z.object({
  calculatorCode, effectiveFrom: timestamp, effectiveTo: timestamp.nullable(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/), unitCode: z.string().trim().min(1).max(80),
  unitPrice: nonnegative.max(999999999999).nullable(), paramsJson: z.record(z.unknown()),
  applicabilityJson: z.record(z.unknown()), reference: z.string().max(10000),
  ghPolicyRevisionId: idSchema.nullable(), expectedRevisionNo: z.number().int().positive(),
}).strict().refine(v => !v.effectiveTo || Date.parse(v.effectiveTo) > Date.parse(v.effectiveFrom), 'Effective end must follow start').refine(v => v.calculatorCode !== 'standby' || v.unitPrice === null, 'Standby has no independent cash price')
export const setSchema = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(10000), division: z.string().trim().max(80), enabled: z.boolean() }).strict()
export const inputsSchema = z.object({
  quantity: nonnegative.optional(), beforeCredit: nonnegative.optional(), addedCredit: nonnegative.optional(),
  removedCredit: nonnegative.optional(), reportAt: timestamp.optional(), departureAt: timestamp.optional(),
  pairingCredit: nonnegative.optional(), baselineStandbyCredit: nonnegative.optional(),
  delayBefore: nonnegative.optional(), delayAfter: nonnegative.optional(), hourlyRate: nonnegative.optional(),
}).strict()
export type CostInputs = z.infer<typeof inputsSchema>
export type RevisionInput = z.infer<typeof revisionSchema>
export type SetInput = z.infer<typeof setSchema>
export const parameterSchemas = {
  quantity: z.object({}).strict(), fixed: z.object({}).strict(),
  minimum: z.object({ minimumQuantity: nonnegative }).strict(),
  guarantee: z.object({ guaranteeHours: nonnegative, tiers: z.array(z.object({ upToHours: nonnegative.nullable(), multiplier: nonnegative }).strict()).min(1).max(20) }).strict().superRefine((v, ctx) => {
    let lower = v.guaranteeHours
    v.tiers.forEach((tier, index) => {
      if (tier.upToHours === null ? index !== v.tiers.length - 1 : tier.upToHours <= lower || index === v.tiers.length - 1) ctx.addIssue({ code: 'custom', message: 'Tiers must increase from guarantee and end with an unlimited tier' })
      if (tier.upToHours !== null) lower = tier.upToHours
    })
  }),
  standby: z.object({ creditFactor: nonnegative, departureCutoffMinutes: nonnegative }).strict(),
  bands: z.object({ threshold: nonnegative, upperRate: nonnegative }).strict(),
  booking: z.object({ originalAmount: nonnegative, refundAmount: nonnegative, changeFee: nonnegative }).strict().refine(v => v.refundAmount <= v.originalAmount, 'Refund cannot exceed original amount'),
}
export const validateParameters = (code: z.infer<typeof calculatorCode>, params: unknown): void => { parameterSchemas[code].parse(params) }
