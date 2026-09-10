import { describe, expect, it } from 'vitest'
import { destinationAdjustedPairingBase } from '../roster-service.js'

describe('destinationAdjustedPairingBase', () => {
  it('uses the first retained flight departure airport instead of the removed DHD base', () => {
    // Pairing 135950 begins YUL -> YYZ as DHD. Once that leg is removed, the
    // recovered Pairing begins with the YYZ -> YVR operating flight.
    expect(destinationAdjustedPairingBase({ depArp: 'yyz' })).toBe('YYZ')
  })

  it('fails closed when the retained Pairing has no usable departure airport', () => {
    expect(destinationAdjustedPairingBase(undefined)).toBeNull()
    expect(destinationAdjustedPairingBase({ depArp: '   ' })).toBeNull()
  })
})
