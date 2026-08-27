import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
})

import { buildRosterPublishCallbackPayload } from '../roster-publish-outbound-service.js'

const base = { id: 1, batch_id: 1, rp_start: null, rp_end: null, crew_id: 'C1' }

describe('buildRosterPublishCallbackPayload IMP filter', () => {
  it('drops rows where old_source or new_source is IMP', () => {
    const rows: any[] = [
      { ...base, action_type: 'ADD',    old_pairing_id: null, new_pairing_id: 10, new_pair_interface_id: 'P10', old_source: null,     new_source: 'IMP' },
      { ...base, action_type: 'DELETE', old_pairing_id: 20,   new_pairing_id: null, old_pair_interface_id: 'P20', old_source: 'IMP', new_source: null },
      { ...base, action_type: 'UPDATE', old_pairing_id: 30,   new_pairing_id: 30, old_pair_interface_id: 'P30', new_pair_interface_id: 'P30', old_source: 'MA', new_source: 'CR' },
    ]
    const payload = buildRosterPublishCallbackPayload(rows)
    expect(payload).not.toBeNull()
    expect(payload!.rosters).toHaveLength(1)
    expect(payload!.rosters[0].pairingId).toBe('P30')
  })

  it('drops DELETE rows with old_source=IMP (DELETE path from adjustDeleteSnapshotSql)', () => {
    const rows: any[] = [
      { ...base, action_type: 'DELETE', old_pairing_id: 40, new_pairing_id: null, old_pair_interface_id: 'P40', old_source: 'IMP', new_source: null },
    ]
    const payload = buildRosterPublishCallbackPayload(rows)
    // IMP DELETE should be filtered out, leaving an empty rosters array
    expect(payload).not.toBeNull()
    expect(payload!.rosters).toHaveLength(0)
  })

  it('passes DELETE rows with old_source=MA through the filter', () => {
    const rows: any[] = [
      { ...base, action_type: 'DELETE', old_pairing_id: 50, new_pairing_id: null, old_pair_interface_id: 'P50', old_source: 'MA', new_source: null },
    ]
    const payload = buildRosterPublishCallbackPayload(rows)
    expect(payload).not.toBeNull()
    expect(payload!.rosters).toHaveLength(1)
    expect(payload!.rosters[0].pairingId).toBe('P50')
    expect(payload!.rosters[0].action).toBe('Delete')
  })
})
