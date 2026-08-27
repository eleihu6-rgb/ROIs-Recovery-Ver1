import { api } from './api'

export interface DraftOp {
  type: 'move' | 'swap' | 'add' | 'remove' | 'update' | 'remove-pairing' | 'remove-pairing-from-crew' | 'add-flight-to-pairing' | 'create-pairing-from-flights' | 'assign-pairing' | 'add-ground-task'
  taskId?: number
  toCrewId?: string
  taskIdA?: number
  taskIdB?: number
  task?: Record<string, unknown>
  mockItem?: Record<string, unknown>
  tasks?: Record<string, unknown>[]  // placeholder items for assign-pairing
  data?: Record<string, unknown>
  pairingId?: number
  /** Multi-delete in one undo step. Commit expands these to one remove-pairing per id. */
  pairingIds?: number[]
  crewId?: string
  rosterActingRank?: string
  flightId?: number
  flightIds?: number[]
  base?: string
  division?: string
  // add-ground-task fields
  groundTaskData?: {
    crewIds: string[]
    assignment: string
    depArp: string
    arvArp: string
    startDtUtc: string
    endDtUtc: string
    comments?: string
    creditMin?: number | null
    fixedCreditMin?: number | null
  }
  mockItems?: Record<string, unknown>[]
}

/** Pairing ids covered by a remove-pairing draft op (single or batched). */
export const pairingIdsFromRemoveOp = (op: DraftOp): number[] => {
  if (op.type !== 'remove-pairing') return []
  if (op.pairingIds && op.pairingIds.length > 0) return [...new Set(op.pairingIds)]
  return op.pairingId != null ? [op.pairingId] : []
}

/** Expand batched remove-pairing ops so the commit API still receives one pairingId each. */
export const expandDraftOpsForCommit = (operations: DraftOp[]): DraftOp[] =>
  operations.flatMap((op) => {
    if (op.type !== 'remove-pairing') return [op]
    return pairingIdsFromRemoveOp(op).map((pairingId) => ({ type: 'remove-pairing' as const, pairingId }))
  })

export interface CommitRequest {
  operations: DraftOp[]
  username: string
  affectedCrewIds: string[]
  affectedPairingIds: number[]
  /** Optional RULE workset id for post-commit live legality recheck. */
  rulesetId?: number
}

export const draftApi = {
  async commit(request: CommitRequest): Promise<{ committed: number }> {
    return api.post('/api/draft/commit', request) as Promise<{ committed: number }>
  },
}
