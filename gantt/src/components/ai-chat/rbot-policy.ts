// gantt/src/components/ai-chat/rbot-policy.ts
//
// R'Bot autonomy policy from dictionary SYS_PARAM (sql/seed/34-rbot-policy.sql):
//   RBOT_AUTONOMY          L0 read only | L1 stage only | L2 may Save after the user approves a plan
//   RBOT_MAX_PLAN_CHANGES  most draft changes one approved plan may Save
// Read fresh on every plan card (no client cache), so flipping the value in Data is a
// kill switch with no deploy. Anything missing or unreadable fails closed to L1.

import { dictionaryApi } from '@/services/dictionary-api'

export type RbotAutonomy = 'L0' | 'L1' | 'L2'

export interface RbotPolicy {
  autonomy: RbotAutonomy
  /** 0 when unknown — no plan may be saved by R'Bot */
  maxPlanChanges: number
}

export const FAIL_CLOSED_POLICY: RbotPolicy = { autonomy: 'L1', maxPlanChanges: 0 }

export const parseRbotPolicy = (rows: Array<{ code?: string | null; codeValue?: string | null }>): RbotPolicy => {
  const value = (code: string): string | undefined => rows.find((r) => r.code === code)?.codeValue?.trim()
  const raw = value('RBOT_AUTONOMY')?.toUpperCase()
  const autonomy: RbotAutonomy = raw === 'L0' || raw === 'L1' || raw === 'L2' ? raw : 'L1'
  const max = Number(value('RBOT_MAX_PLAN_CHANGES'))
  return { autonomy, maxPlanChanges: Number.isInteger(max) && max > 0 ? max : 0 }
}

export const loadRbotPolicy = async (): Promise<RbotPolicy> => {
  try {
    return parseRbotPolicy(await dictionaryApi.getByParentCode('SYS_PARAM'))
  } catch {
    return FAIL_CLOSED_POLICY
  }
}
