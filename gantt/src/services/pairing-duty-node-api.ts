import { api } from './api'

export interface DutyNodeDoublePayload {
  restAfterSegSeq: number
  pickupStartUtc:  string
  briefStartUtc:   string
  debriefEndUtc:   string
  dropoffEndUtc:   string
}

export interface DutyNodeUpdatePayload {
  dutySeq:        number
  pickupStartUtc: string
  briefStartUtc:  string
  debriefEndUtc:  string
  dropoffEndUtc:  string
  double?:        DutyNodeDoublePayload | null
}

export interface DutyNodePatchResponse {
  updated: number
}

export const pairingDutyNodeApi = {
  async updateDutyNodes(
    pairingId: number,
    duties: DutyNodeUpdatePayload[],
  ): Promise<DutyNodePatchResponse> {
    return api.patch(`/api/pairing/${pairingId}/duty-nodes`, { duties }) as Promise<DutyNodePatchResponse>
  },
}
