import { describe, expect, it } from 'vitest'
import { expandDraftOpsForCommit, pairingIdsFromRemoveOp } from '@/services/draft-api'

describe('pairingIdsFromRemoveOp / expandDraftOpsForCommit', () => {
  it('reads a single pairingId', () => {
    expect(pairingIdsFromRemoveOp({ type: 'remove-pairing', pairingId: 7 })).toEqual([7])
  })

  it('prefers pairingIds for a batched delete', () => {
    expect(pairingIdsFromRemoveOp({
      type: 'remove-pairing',
      pairingId: 7,
      pairingIds: [7, 8, 9],
    })).toEqual([7, 8, 9])
  })

  it('expands a batched remove-pairing into one commit op per id', () => {
    expect(expandDraftOpsForCommit([
      { type: 'remove-pairing', pairingId: 7, pairingIds: [7, 8] },
      { type: 'remove', taskId: 1 },
    ])).toEqual([
      { type: 'remove-pairing', pairingId: 7 },
      { type: 'remove-pairing', pairingId: 8 },
      { type: 'remove', taskId: 1 },
    ])
  })
})
