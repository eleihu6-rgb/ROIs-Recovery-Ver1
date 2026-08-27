import { api } from './api'

export interface ViolationsInitStatus {
  status: string       // 'idle' | 'running' | 'processing' | 'done' | 'completed' | ...
  doneCount: number
  totalCount: number
  progress: number     // 0–100, server-computed
}

export interface ViolationsInitTriggerResult {
  airline: string
  ruleGroupCode: string
  yearsBack: number
}

/**
 * Manual refresh of the live `rule_violation` table for a rule set.
 * Backed by the admin-only violations-init job (BullMQ worker).
 */
export const violationsInitApi = {
  trigger: (ruleGroupCode: string): Promise<ViolationsInitTriggerResult> =>
    api.post('/api/admin/violations-init', { ruleGroupCode }) as Promise<ViolationsInitTriggerResult>,

  getStatus: (ruleGroupCode: string): Promise<ViolationsInitStatus> =>
    api.get(`/api/admin/violations-init/status?ruleGroupCode=${encodeURIComponent(ruleGroupCode)}`) as Promise<ViolationsInitStatus>,
}
