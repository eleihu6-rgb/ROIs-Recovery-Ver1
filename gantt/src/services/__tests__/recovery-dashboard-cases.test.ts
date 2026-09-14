import { describe, expect, it } from 'vitest'
import { RECOVERY_CASES } from '@/config/recovery-cases'

describe('Dashboard recovery case descriptors', () => {
  it('uses operational disruption causes, not rule names', () => {
    expect(RECOVERY_CASES.map(c => c.trigger)).toEqual([
      'Crew sick leave', 'Flight delay', 'Aircraft fleet change', 'Ad hoc new flight',
    ])
  })
  it('preserves Cases 1–3 pairing identities', () => {
    expect(RECOVERY_CASES.slice(0, 3).map(c => c.pairingId)).toEqual([152056, 152675, 152227])
  })
  it('Case 4 opens the prepared flight without claiming a pairing, assigned crew or executable result', () => {
    const case4 = RECOVERY_CASES.find(c => c.id === 'case-4')!
    expect(case4.anchorFlightId).toBe(159578)
    expect(case4.pairingId).toBeNull()
    expect(case4.ruleCode).toBeNull()
    expect(case4.result).toBeNull()
    expect(case4.sourceCrew).toEqual([])
    expect(case4.candidateCrewIds).toHaveLength(20)
    expect(case4.candidateCrewIds).toContain('C4001')
    const protectedSources = new Set(RECOVERY_CASES.slice(0, 3).flatMap(c => c.sourceCrew.map(s => s.crewId)))
    expect(case4.candidateCrewIds!.some(id => protectedSources.has(id))).toBe(false)
  })
})
