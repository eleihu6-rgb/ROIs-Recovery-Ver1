import { describe, it, expect } from 'vitest'
import { READ_ONLY_CAPABILITIES } from '../gantt-pane-source'

describe('READ_ONLY_CAPABILITIES', () => {
  it('disables all editing and shows all three panes', () => {
    expect(READ_ONLY_CAPABILITIES.roster).toEqual({ canAssign: false, canRemove: false, canReassign: false })
    expect(READ_ONLY_CAPABILITIES.pairing.canEditSegments).toBe(false)
    expect(READ_ONLY_CAPABILITIES.panes).toEqual(['roster', 'pairing', 'flight'])
  })
})
