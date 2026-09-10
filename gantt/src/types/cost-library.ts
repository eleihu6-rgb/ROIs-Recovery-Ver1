export type CalculatorCode = 'quantity' | 'fixed' | 'minimum' | 'guarantee' | 'standby' | 'bands' | 'booking'
export interface CostRevision {
  id: number; costInstanceId: number; revisionNo: number; calculatorCode: CalculatorCode
  effectiveFrom: string; effectiveTo: string | null; currencyCode: string; unitCode: string
  unitPrice: number | null; paramsJson: Record<string, unknown>; applicabilityJson: Record<string, unknown>
  reference: string; ghPolicyRevisionId: number | null; createdBy: string; createdAt: string
}
export interface CostType {
  id: number; typeCode: number; name: string; categoryCode: string; calculatorCode: CalculatorCode
  parameterSchemaJson: Record<string, unknown>
}
export interface CostInstance {
  id: number; costTypeId: number; typeCode: number; instanceNo: number; name: string
  categoryCode: string; enabled: boolean; sourceInstanceId: number | null; latestRevision: CostRevision
}
export interface CostSet {
  id: number; name: string; description: string; division: string; enabled: boolean; isDefault: boolean; version: number
  members: { costInstanceId: number; costRevisionId: number; enabled: boolean; sortOrder: number }[]
}
export interface CostCatalog { types: CostType[]; instances: CostInstance[]; sets: CostSet[] }
export type RevisionDraft = Omit<CostRevision, 'id' | 'costInstanceId' | 'revisionNo' | 'createdBy' | 'createdAt'> & { expectedRevisionNo: number }
export type SetDraft = Pick<CostSet, 'name' | 'description' | 'division' | 'enabled'>
export interface CostResult { amount: number | null; currencyCode: string; status: 'priced' | 'unpriced' | 'disabled'; breakdown: {label: string; value: string}[]; formula: string }
export const costCode = (instance: CostInstance): string => `${instance.typeCode}/${String(instance.instanceNo).padStart(3, '0')}`
