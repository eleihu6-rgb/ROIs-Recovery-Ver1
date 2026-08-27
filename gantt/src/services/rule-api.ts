import { RULE_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
import type { CheckInput } from '@/utils/roster-to-check-input'
import type {
  CalcResult,
  CheckResult,
  EngineResult,
  RuleGroup,
  BatchCheckResponse,
  RosterCheckRequest,
  RosterCheckResponse,
} from '@/types/rule-check'

export type { CalcResult, CheckResult, EngineResult, RuleGroup }

const ruleClient = createHttpClient({ baseURL: RULE_API_BASE })

export const ruleApi = {
  /** Batch check multiple pairings — new /check/batch endpoint */
  async batchCheck(
    ruleGroupCode: string,
    items: { pairing: CheckInput['pairing']; crew?: CheckInput['crew'] }[],
  ): Promise<BatchCheckResponse> {
    return ruleClient.post('/check/batch', { ruleGroupCode, items }) as Promise<BatchCheckResponse>
  },

  /** Full roster check — returns pairing-level results + roster-level violations */
  async checkRoster(input: RosterCheckRequest): Promise<RosterCheckResponse> {
    return ruleClient.post('/check/roster', input) as Promise<RosterCheckResponse>
  },

  /** List available rule groups */
  async getGroups(): Promise<RuleGroup[]> {
    return ruleClient.get('/rules/groups') as Promise<RuleGroup[]>
  },
}
