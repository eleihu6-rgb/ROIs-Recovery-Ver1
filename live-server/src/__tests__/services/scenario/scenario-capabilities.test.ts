import { describe, it, expect } from 'vitest'
import { capabilitiesFromDict } from '../../../services/scenario/scenario-capabilities.js'

describe('capabilitiesFromDict', () => {
  it('PO fallback (empty dict): panes & defaultPanes = pairing+flight', () => {
    const cap = capabilitiesFromDict([], 'PO')
    expect(cap.panes).toEqual(['pairing', 'flight'])
    expect(cap.defaultPanes).toEqual(['pairing', 'flight'])
    expect(cap.roster).toEqual({ canAssign: false, canRemove: false, canReassign: false })
    expect(cap.pairing.canEditSegments).toBe(false)
  })

  it('RO fallback (empty dict): panes = all three, defaultPanes = roster+pairing, roster edit enabled (P3), canEditSegments still false', () => {
    const cap = capabilitiesFromDict([], 'RO')
    expect(cap.panes).toEqual(['roster', 'pairing', 'flight'])
    expect(cap.defaultPanes).toEqual(['roster', 'pairing'])
    expect(cap.roster).toEqual({ canAssign: true, canRemove: true, canReassign: true })
    expect(cap.pairing.canEditSegments).toBe(false)
  })

  it('TO fallback (empty dict): no panes', () => {
    const cap = capabilitiesFromDict([], 'TO')
    expect(cap.panes).toEqual([])
    expect(cap.defaultPanes).toEqual([])
  })

  it('dictionary override: panes + canEditSegments applied, defaultPanes falls back', () => {
    const cap = capabilitiesFromDict(
      [
        { code: 'panes', codeValue: 'pairing' },
        { code: 'canEditSegments', codeValue: '1' },
      ],
      'PO',
    )
    expect(cap.panes).toEqual(['pairing'])
    expect(cap.pairing.canEditSegments).toBe(true)
    // defaultPanes not in dict → PO fallback
    expect(cap.defaultPanes).toEqual(['pairing', 'flight'])
  })

  it('unknown fileType → RO fallback', () => {
    const cap = capabilitiesFromDict([], 'XX')
    expect(cap.panes).toEqual(['roster', 'pairing', 'flight'])
    expect(cap.defaultPanes).toEqual(['roster', 'pairing'])
  })
})
