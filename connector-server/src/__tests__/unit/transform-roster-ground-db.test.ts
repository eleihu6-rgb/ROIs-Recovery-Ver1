import { describe, it, expect } from 'vitest'
import { transformF8RosterGround } from '../../transform/f8/db/transform-roster-ground.js'

const crewSet = new Set(['C001', 'C002'])

describe('transformF8RosterGround', () => {
  it('maps non-Flight assignments to ground records', () => {
    const ground = [{
      crewId: 'C001', assignment: 'Illness', assignmentGroup: 'GRD',
      location: 'PEK', division: 'P', label: 'sick',
      trainingRole: 'x',
      credit: 155,
      startTimeUtc: '2026-06-10T00:00:00Z', endTimeUtc: '2026-06-11T00:00:00Z',
    }]
    const { groundRecords, singleLegRecords, rejected } =
      transformF8RosterGround(ground, [], crewSet, 'F8')
    expect(rejected).toHaveLength(0)
    expect(singleLegRecords).toHaveLength(0)
    expect(groundRecords).toHaveLength(1)
    expect(groundRecords[0].assignment).toBe('ILL')
    expect(groundRecords[0].strDtUtc).toBe('2026-06-10T00:00:00.000Z')
    expect(groundRecords[0].endDtUtc).toBe('2026-06-11T00:00:00.000Z')
    expect(groundRecords[0].credit).toBe(155)
  })

  it('maps single-leg Flight (pairingId=0) records', () => {
    const singleLeg = [{
      crewId: 'C002', fltId: 'IF123', label: 'F8001',
      division: 'C', startTimeUtc: '2026-06-01T08:00:00Z',
      Credit: 210,
    }]
    const { groundRecords, singleLegRecords } =
      transformF8RosterGround([], singleLeg, crewSet, 'F8')
    expect(groundRecords).toHaveLength(0)
    expect(singleLegRecords).toHaveLength(1)
    expect(singleLegRecords[0].interfaceFltId).toBe('IF123')
    expect(singleLegRecords[0].airline).toBe('F8')
    expect(singleLegRecords[0].label).toBe('001')
    expect(singleLegRecords[0].division).toBe('C')
    expect(singleLegRecords[0].credit).toBe(210)
  })

  it('maps Reserve assignment to RES (not SBY)', () => {
    const ground = [{
      crewId: 'C001', assignment: 'Reserve', assignmentGroup: 'GRD',
      location: 'TPE', division: 'P', label: 'reserve',
      startTimeUtc: '2026-06-10T00:00:00Z', endTimeUtc: '2026-06-11T00:00:00Z',
    }]
    const { groundRecords, rejected } = transformF8RosterGround(ground, [], crewSet, 'F8')
    expect(rejected).toHaveLength(0)
    expect(groundRecords).toHaveLength(1)
    expect(groundRecords[0].assignment).toBe('RES')
  })

  it('rejects records for crew not in DB', () => {
    const ground = [{
      crewId: 'UNKNOWN', assignment: 'Vacation', assignmentGroup: 'GRD',
      startTimeUtc: '2026-06-10T00:00:00Z', endTimeUtc: '2026-06-11T00:00:00Z',
    }]
    const { groundRecords, rejected } = transformF8RosterGround(ground, [], crewSet, 'F8')
    expect(groundRecords).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toContain('crew_id not found')
  })

  it('keeps the original label and uses the configured airline when the label has no matching prefix', () => {
    const singleLeg = [{
      // No 2-char F8 prefix — could be a codeshare or a malformed label.
      crewId: 'C002', fltId: 'IF999', label: 'NH9501',
      division: 'C', startTimeUtc: '2026-06-01T08:00:00Z',
      Credit: 90,
    }]
    const { singleLegRecords } = transformF8RosterGround([], singleLeg, crewSet, 'F8')
    expect(singleLegRecords).toHaveLength(1)
    expect(singleLegRecords[0].airline).toBe('F8')
    expect(singleLegRecords[0].label).toBe('NH9501')
  })

  it('falls back to the configured airline when the label is too short to split', () => {
    const singleLeg = [{
      // 2-char label with no flight number after the prefix — split returns null.
      crewId: 'C002', fltId: 'IF998', label: 'F8',
      division: 'C', startTimeUtc: '2026-06-01T08:00:00Z',
      Credit: 30,
    }]
    const { singleLegRecords } = transformF8RosterGround([], singleLeg, crewSet, 'F8')
    expect(singleLegRecords).toHaveLength(1)
    expect(singleLegRecords[0].airline).toBe('F8')
    expect(singleLegRecords[0].label).toBe('F8')
  })
})
