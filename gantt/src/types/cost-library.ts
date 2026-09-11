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

// ── Normalized error helpers (added 2026-09-11 to fix vague "Cost library request failed" toast) ──

export type CostErrorCategory =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unprocessable'
  | 'rate_limited'
  | 'unavailable'
  | 'internal'

export interface NormalizedCostError {
  /** HTTP status (defaults to 0 for non-HTTP errors like network failures) */
  status: number
  category: CostErrorCategory
  message: string
  hint?: string
  sqlState?: string
  /** True when the user can safely retry the same operation */
  retryable: boolean
}

export interface CostErrorCategoryMeta {
  label: string
  tone: 'muted' | 'warning' | 'destructive'
  retryable: boolean
}

/**
 * Stable display metadata for each error category — keep severity/label/wording
 * consistent across cost sets, cost templates, and any future cost-library UI.
 * Also drives the `<CostErrorBanner>` icon and Retry button visibility.
 */
export const COST_ERROR_CATEGORY_META: Record<CostErrorCategory, CostErrorCategoryMeta> = {
  validation:        { label: 'Invalid input',    tone: 'warning',     retryable: false },
  unauthorized:      { label: 'Sign in required', tone: 'warning',     retryable: false },
  forbidden:         { label: 'No permission',    tone: 'warning',     retryable: false },
  not_found:         { label: 'Not found',        tone: 'muted',       retryable: false },
  conflict:          { label: 'Conflict',         tone: 'warning',     retryable: false },
  payload_too_large: { label: 'Too large',        tone: 'warning',     retryable: false },
  unprocessable:     { label: 'Cannot process',   tone: 'warning',     retryable: false },
  rate_limited:      { label: 'Slow down',        tone: 'warning',     retryable: true  },
  unavailable:       { label: 'Temporarily down', tone: 'destructive', retryable: true  },
  internal:          { label: 'Server error',     tone: 'destructive', retryable: true  },
}

const KNOWN_CATEGORIES = new Set<string>(Object.keys(COST_ERROR_CATEGORY_META))
const isStatusLikelyOffline = (status: number): boolean => status === 0 || status === 503 || status === 504

/** Coerce any thrown value into a NormalizedCostError shape for UI rendering. */
export const toNormalizedCostError = (error: unknown): NormalizedCostError => {
  if (!error) {
    return { status: 0, category: 'unavailable', message: 'An unknown error occurred.', retryable: true }
  }
  const e = error as {
    status?: number
    category?: string
    hint?: string
    sqlState?: string
    message?: string
    response?: { status?: number; data?: { data?: { category?: string; hint?: string; sqlState?: string } } }
  }
  const status = typeof e.status === 'number' ? e.status : (e.response?.status ?? 0)
  let category = (typeof e.category === 'string' ? e.category : e.response?.data?.data?.category) as CostErrorCategory | undefined
  if (!category || !KNOWN_CATEGORIES.has(category)) {
    if (status === 401) category = 'unauthorized'
    else if (status === 403) category = 'forbidden'
    else if (status === 404) category = 'not_found'
    else if (status === 409) category = 'conflict'
    else if (status === 413) category = 'payload_too_large'
    else if (status === 422) category = 'unprocessable'
    else if (status === 429) category = 'rate_limited'
    else if (isStatusLikelyOffline(status)) category = 'unavailable'
    else category = 'internal'
  }
  const hint = typeof e.hint === 'string'
    ? e.hint
    : typeof e.response?.data?.data?.hint === 'string'
      ? e.response.data.data.hint
      : undefined
  const sqlState = typeof e.sqlState === 'string'
    ? e.sqlState
    : typeof e.response?.data?.data?.sqlState === 'string'
      ? e.response.data.data.sqlState
      : undefined
  const meta = COST_ERROR_CATEGORY_META[category]
  const message = (typeof e.message === 'string' && e.message.trim()) || 'An unexpected error occurred.'
  return {
    status,
    category,
    message,
    hint,
    sqlState,
    retryable: meta.retryable,
  }
}
