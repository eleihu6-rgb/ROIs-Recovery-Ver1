import { describe, expect, it } from 'vitest'

import { pairingFilterToListParams } from '../pairing-store'
import type { PairingFilter } from '../filter-store'

const makePairingFilter = (overrides: Partial<PairingFilter> = {}): PairingFilter => ({
  bases: [],
  fleets: [],
  divisions: [],
  ranks: [],
  depArps: [],
  coverage: ['open', 'partial'],
  assignments: [],
  label: '',
  pairingIds: [],
  ...overrides,
})

describe('pairingFilterToListParams', () => {
  it('passes a trimmed label to the live pairing list query', () => {
    expect(pairingFilterToListParams(makePairingFilter({ label: '  T4101  ' }))).toMatchObject({
      label: 'T4101',
    })
  })
})
