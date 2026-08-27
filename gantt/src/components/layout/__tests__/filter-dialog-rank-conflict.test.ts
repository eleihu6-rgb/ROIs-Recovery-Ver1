import { describe, expect, it } from 'vitest'

import { getPairingRankDivisionConflict } from '../filter-dialog'

const WARNING = 'Invalid rank for selected division. Use P with CA/FO, or C with FA/IFD.'

describe('getPairingRankDivisionConflict', () => {
  it('allows pilot division with pilot ranks', () => {
    expect(getPairingRankDivisionConflict(['P'], ['CA', 'FO'])).toBeNull()
  })

  it('allows cabin division with cabin ranks', () => {
    expect(getPairingRankDivisionConflict(['C'], ['FA', 'IFD'])).toBeNull()
  })

  it('warns when pilot division is combined with cabin ranks', () => {
    expect(getPairingRankDivisionConflict(['P'], ['FA'])).toBe(WARNING)
  })

  it('warns when cabin division is combined with pilot ranks', () => {
    expect(getPairingRankDivisionConflict(['C'], ['CA'])).toBe(WARNING)
  })

  it('allows rank-only filtering without a selected division', () => {
    expect(getPairingRankDivisionConflict([], ['CA', 'FA'])).toBeNull()
  })
})
