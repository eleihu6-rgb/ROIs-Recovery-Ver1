import { describe, expect, it } from 'vitest'
import { formatGroundTaskStatusLine } from '../format-ground-task-status-line'

describe('formatGroundTaskStatusLine', () => {
  it('shows only ground-task fields for pairing-less tasks in base local time', () => {
    const line = formatGroundTaskStatusLine({
      id: 123,
      crewId: 'F80001',
      base: 'YVR',
      depArp: 'YVR',
      arvArp: 'YYZ',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      label: 'SIM',
      schStrDtUtc: '2026-06-10T09:00:00.000Z',
      schEndDtUtc: '2026-06-10T12:00:00.000Z',
      actCreditedMinutes: '180',
      schCreditedMinutes: null,
    }, {
      zoneIdForBase: (base) => (base === 'YVR' ? 'America/Vancouver' : undefined),
    })

    expect(line).toContain('F80001 #123')
    expect(line).toContain('YVR-YYZ')
    expect(line).toContain('GRD')
    expect(line).toContain('SIM')
    expect(line).toContain('6/10 02:00L ~ 05:00L')
    expect(line).toContain('Credit 3:00')
    expect(line).not.toContain('Pairing #—')
    expect(line).not.toContain('Base YVR')
    expect(line).not.toContain('  ·  YVR  ·  ')
  })

  it('falls back to UTC when the base timezone is unknown', () => {
    const line = formatGroundTaskStatusLine({
      id: 124,
      crewId: 'F80002',
      base: 'ZZZ',
      depArp: 'ZZZ',
      arvArp: 'YVR',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      label: 'SIM',
      schStrDtUtc: '2026-06-10T09:00:00.000Z',
      schEndDtUtc: '2026-06-10T12:00:00.000Z',
      actCreditedMinutes: null,
      schCreditedMinutes: null,
    }, {
      zoneIdForBase: () => undefined,
    })

    expect(line).toContain('6/10 09:00L ~ 12:00L')
  })
})
