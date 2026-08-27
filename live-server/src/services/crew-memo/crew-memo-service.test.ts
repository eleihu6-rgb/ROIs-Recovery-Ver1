import { describe, it, expect } from 'vitest'
import { toMemoDTO } from './crew-memo-service.js'

describe('toMemoDTO', () => {
  it('maps a row to ISO-stringed DTO', () => {
    const dto = toMemoDTO({
      id: 5, createdBy: 'u', createdAt: new Date(), updatedBy: 'u', updatedAt: new Date(),
      crewId: '113', strDtLoc: new Date('2026-06-03T01:12:00Z'), endDtLoc: new Date('2026-06-03T12:00:00Z'),
      memo: 'V4110 (10827)', userId: 'u', tmst: new Date(), status: 'Y', rosterId: 42, type: 3,
      name: 'De-assign pairing', pbsStatus: null,
    })
    expect(dto).toMatchObject({
      id: 5, crewId: '113', memo: 'V4110 (10827)', name: 'De-assign pairing',
      type: 3, status: 'Y', rosterId: 42,
      strDtLoc: '2026-06-03T01:12:00.000Z', endDtLoc: '2026-06-03T12:00:00.000Z',
    })
  })

  it('tolerates null dates', () => {
    const dto = toMemoDTO({
      id: 1, createdBy: 'u', createdAt: new Date(), updatedBy: 'u', updatedAt: new Date(),
      crewId: '113', strDtLoc: null, endDtLoc: null, memo: null, userId: 'u', tmst: new Date(),
      status: 'Y', rosterId: null, type: 1, name: null, pbsStatus: null,
    })
    expect(dto.strDtLoc).toBeNull()
    expect(dto.endDtLoc).toBeNull()
  })
})
