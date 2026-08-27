import { api } from './api'

// ── Types ──────────────────────────────────────────────────

export interface AuthoritativePairingViolation {
  crewId: string
  pairingId: number
  passedAll: boolean
  highestSeverity: number
  checkResults: Array<{
    ruleCode: string
    ruleName: string
    passed: boolean
    severity: number
    actualValue: number
    limitValue: number
    unit: string
    message: string
    overridable?: boolean
  }>
  calcResults: Record<string, { value: number; unit: string }>
  checkedAt: string
}

export interface PairingResultsResponse {
  byPairing: Record<string, AuthoritativePairingViolation>
  missing: Array<{ crewId: string; pairingId: number }>
}

export interface RosterResult {
  crewId: string
  resultMonth: string
  passedAll: boolean
  highestSeverity: number
  violations: Array<{
    templateCode: string
    severity: number
    message: string
    pairingIds: number[]
    actualValue: number
    limitValue: number
  }>
}

export interface OnDemandRequest {
  crewId: string
  pairingIds: number[]
  ruleGroupCode: string
}

export interface BatchStartRequest {
  ruleGroupCode: string
  dateFrom: string
  dateTo: string
  reason: string
}

export interface BatchProgress {
  batchRunId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  totalPairings: number
  completedPairings: number
  failedPairings: number
  startedAt?: string
  completedAt?: string
  errorMessage?: string
}

// ── Client ─────────────────────────────────────────────────

const RULE_CHECK_BASE = '/api/rule-check'

export const liveRuleCheckApi = {
  /**
   * Get authoritative rule-check results for specific pairings.
   * Results are sourced from the persisted rule-check cache on live-server.
   */
  async getPairingResults(
    crewIds: string[],
    dateFrom: string,
    dateTo: string,
    ruleGroupCode: string,
  ): Promise<PairingResultsResponse> {
    return api.get(`${RULE_CHECK_BASE}/pairings`, {
      params: {
        crewIds: crewIds.join(','),
        dateFrom,
        dateTo,
        ruleGroupCode,
      },
    }) as Promise<PairingResultsResponse>
  },

  /**
   * Get roster-level rule-check results summarised by month.
   */
  async getRosterResults(
    crewIds: string[],
    months: string[],
    ruleGroupCode: string,
  ): Promise<RosterResult[]> {
    return api.get(`${RULE_CHECK_BASE}/roster`, {
      params: {
        crewIds: crewIds.join(','),
        months: months.join(','),
        ruleGroupCode,
      },
    }) as Promise<RosterResult[]>
  },

  /**
   * Trigger an on-demand rule check for a single crew member on specific pairings.
   */
  async triggerOnDemand(
    crewId: string,
    pairingIds: number[],
    ruleGroupCode: string,
  ): Promise<AuthoritativePairingViolation[]> {
    return api.post(`${RULE_CHECK_BASE}/on-demand`, {
      crewId,
      pairingIds,
      ruleGroupCode,
    } satisfies OnDemandRequest) as Promise<AuthoritativePairingViolation[]>
  },

  /**
   * Start an asynchronous batch rule-check run.
   */
  async startBatch(
    ruleGroupCode: string,
    dateFrom: string,
    dateTo: string,
    reason: string,
  ): Promise<{ batchRunId: string }> {
    return api.post(`${RULE_CHECK_BASE}/batch`, {
      ruleGroupCode,
      dateFrom,
      dateTo,
      reason,
    } satisfies BatchStartRequest) as Promise<{ batchRunId: string }>
  },

  /**
   * Poll the progress of a batch rule-check run.
   */
  async getBatchProgress(batchRunId: string): Promise<BatchProgress> {
    return api.get(`${RULE_CHECK_BASE}/batch/${batchRunId}/progress`) as Promise<BatchProgress>
  },
}
