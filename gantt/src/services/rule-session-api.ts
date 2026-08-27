import { ENGINE_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'

const engineClient = createHttpClient({ baseURL: ENGINE_API_BASE })

export interface SegmentPayload {
  flt_no: string
  dep_port: string
  arr_port: string
  std_utc: string
  sta_utc: string
  block_minutes: number
  is_night: boolean
  fleet_code?: string | null
}

export interface DutyPayload {
  duty_seq: number
  report_utc: string
  release_utc: string
  segments: SegmentPayload[]
  rest_after_minutes?: number | null
  report_local?: string | null
  base_utc_offset?: number | null
}

export interface PairingPayload {
  pairing_id: number
  crew_base: string
  duties: DutyPayload[]
}

export interface CrewPayload {
  crew_id: string
  division: string
  rank: string
  fleet_quals: string[]
  airport_quals: string[]
  recent_flight_hours: Record<string, number>
}

export interface SessionCheckRequest {
  sessionId: string
  userId: string
  groupCode: string
  operation: 'edit' | 'undo' | 'redo'
  pairing: PairingPayload | null
  crew?: CrewPayload | null
}

export interface ViolationItem {
  ruleCode: string
  /** Rule instance code, e.g. '006' (template 8002 → 8002/006). null if not attributable. */
  ruleInstance?: string | null
  ruleName: string
  passed: boolean
  severity: number
  actualValue: number
  limitValue: number
  unit: string
  message: string
  /** Physical anchor span from persisted rule_violation. */
  startDt?: string | null
  endDt?: string | null
  /** Effective checked window; null means use the anchor span. */
  windowStartDt?: string | null
  windowEndDt?: string | null
}

export interface SessionCheckResponse {
  sessionId: string
  pairingId: number | null
  violations: ViolationItem[]
  passedAll: boolean
  highestSeverity: number
}

export const ruleSessionApi = {
  async checkSession(req: SessionCheckRequest): Promise<SessionCheckResponse> {
    return engineClient.post('/api/rules/check/session', req) as Promise<SessionCheckResponse>
  },

  async commitSession(sessionId: string, userId: string, eventId: number): Promise<void> {
    await engineClient.post('/api/rules/session/commit', { session_id: sessionId, user_id: userId, event_id: eventId })
  },

  async discardSession(sessionId: string, userId: string): Promise<void> {
    await engineClient.post('/api/rules/session/discard', { session_id: sessionId, user_id: userId })
  },
}
