import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ruleCheckDataService } from '../../../services/rule-check/rule-check-data-service.js'

const mockPgPool = {
  query: vi.fn(),
}
const mockFastify = { pgPool: mockPgPool, log: { warn: vi.fn() } } as any

describe('ruleCheckDataService.loadPairingInput', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when pairing not found', async () => {
    mockPgPool.query.mockResolvedValueOnce({ rows: [] })
    const result = await ruleCheckDataService.loadPairingInput(mockFastify, 999)
    expect(result).toBeNull()
  })

  it('builds PairingInput from segment rows', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [{
        pairing_id: 1,
        base: 'TPE',
        duty_seq: 1,
        duty_sch_str_dt_utc: new Date('2026-05-01T02:00:00Z'),
        duty_sch_end_dt_utc: new Date('2026-05-01T10:00:00Z'),
        duty_sch_rest_min: 600,
        brief_start_utc: new Date('2026-05-01T01:30:00Z'),
        debrief_end_utc: new Date('2026-05-01T10:30:00Z'),
        seg_seq: 1,
        flt_num: 'F8001',
        dep_arp: 'TPE',
        arv_arp: 'NRT',
        sch_str_dt_utc: new Date('2026-05-01T02:00:00Z'),
        sch_end_dt_utc: new Date('2026-05-01T05:00:00Z'),
        fleet_seg: 'A320',
        blk_min: 180,
      }],
    })
    const result = await ruleCheckDataService.loadPairingInput(mockFastify, 1)
    expect(result).not.toBeNull()
    expect(result!.pairingId).toBe(1)
    expect(result!.crewBase).toBe('TPE')
    expect(result!.duties).toHaveLength(1)
    expect(result!.duties[0].dutySeq).toBe(1)
    expect(result!.duties[0].reportUtc).toEqual(new Date('2026-05-01T01:30:00Z'))
    expect(result!.duties[0].releaseUtc).toEqual(new Date('2026-05-01T10:30:00Z'))
    expect(result!.duties[0].restAfterMinutes).toBe(600)
    expect(result!.duties[0].segments).toHaveLength(1)
    expect(result!.duties[0].segments[0].fltNo).toBe('F8001')
    expect(result!.duties[0].segments[0].depPort).toBe('TPE')
    expect(result!.duties[0].segments[0].arrPort).toBe('NRT')
    expect(result!.duties[0].segments[0].stdUtc).toEqual(new Date('2026-05-01T02:00:00Z'))
    expect(result!.duties[0].segments[0].staUtc).toEqual(new Date('2026-05-01T05:00:00Z'))
    expect(result!.duties[0].segments[0].blockMinutes).toBe(180)
    expect(result!.duties[0].segments[0].fleetCode).toBe('A320')
  })

  it('handles null brief_start_utc / debrief_end_utc using duty_sch_* fallback', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [{
        pairing_id: 2,
        base: 'TPE',
        duty_seq: 1,
        duty_sch_str_dt_utc: new Date('2026-05-01T04:00:00Z'),
        duty_sch_end_dt_utc: new Date('2026-05-01T12:00:00Z'),
        duty_sch_rest_min: null,
        brief_start_utc: null,
        debrief_end_utc: null,
        seg_seq: 1,
        flt_num: 'F8002',
        dep_arp: 'TPE',
        arv_arp: 'KHH',
        sch_str_dt_utc: new Date('2026-05-01T04:00:00Z'),
        sch_end_dt_utc: new Date('2026-05-01T05:30:00Z'),
        fleet_seg: 'B738',
        blk_min: 90,
      }],
    })
    const result = await ruleCheckDataService.loadPairingInput(mockFastify, 2)
    expect(result).not.toBeNull()
    expect(result!.duties[0].reportUtc).toEqual(new Date('2026-05-01T04:00:00Z'))
    expect(result!.duties[0].releaseUtc).toEqual(new Date('2026-05-01T12:00:00Z'))
    expect(result!.duties[0].restAfterMinutes).toBeUndefined()
  })

  it('groups multiple duties and segments correctly', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [
        // duty 1, seg 1
        { pairing_id: 3, base: 'TPE', duty_seq: 1, duty_sch_str_dt_utc: new Date('2026-05-01T02:00:00Z'), duty_sch_end_dt_utc: new Date('2026-05-01T10:00:00Z'), duty_sch_rest_min: null, brief_start_utc: new Date('2026-05-01T01:30:00Z'), debrief_end_utc: new Date('2026-05-01T10:30:00Z'), seg_seq: 1, flt_num: 'F8001', dep_arp: 'TPE', arv_arp: 'NRT', sch_str_dt_utc: new Date('2026-05-01T02:00:00Z'), sch_end_dt_utc: new Date('2026-05-01T05:00:00Z'), fleet_seg: 'A320', blk_min: 180 },
        // duty 1, seg 2
        { pairing_id: 3, base: 'TPE', duty_seq: 1, duty_sch_str_dt_utc: new Date('2026-05-01T02:00:00Z'), duty_sch_end_dt_utc: new Date('2026-05-01T10:00:00Z'), duty_sch_rest_min: null, brief_start_utc: new Date('2026-05-01T01:30:00Z'), debrief_end_utc: new Date('2026-05-01T10:30:00Z'), seg_seq: 2, flt_num: 'F8002', dep_arp: 'NRT', arv_arp: 'TPE', sch_str_dt_utc: new Date('2026-05-01T07:00:00Z'), sch_end_dt_utc: new Date('2026-05-01T09:00:00Z'), fleet_seg: 'A320', blk_min: 120 },
        // duty 2, seg 1
        { pairing_id: 3, base: 'TPE', duty_seq: 2, duty_sch_str_dt_utc: new Date('2026-05-02T02:00:00Z'), duty_sch_end_dt_utc: new Date('2026-05-02T06:00:00Z'), duty_sch_rest_min: 600, brief_start_utc: new Date('2026-05-02T01:30:00Z'), debrief_end_utc: new Date('2026-05-02T06:30:00Z'), seg_seq: 1, flt_num: 'F8003', dep_arp: 'TPE', arv_arp: 'HND', sch_str_dt_utc: new Date('2026-05-02T02:00:00Z'), sch_end_dt_utc: new Date('2026-05-02T05:00:00Z'), fleet_seg: 'B789', blk_min: 180 },
      ],
    })
    const result = await ruleCheckDataService.loadPairingInput(mockFastify, 3)
    expect(result).not.toBeNull()
    expect(result!.duties).toHaveLength(2)
    expect(result!.duties[0].segments).toHaveLength(2)
    expect(result!.duties[1].segments).toHaveLength(1)
    expect(result!.duties[0].segments[0].fltNo).toBe('F8001')
    expect(result!.duties[0].segments[1].fltNo).toBe('F8002')
    expect(result!.duties[1].segments[0].fltNo).toBe('F8003')
    expect(result!.duties[1].restAfterMinutes).toBe(600)
  })

  it('marks night flights correctly (UTC hour >= 22 or < 6)', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [
        // Night flight: hour 23 UTC
        { pairing_id: 4, base: 'TPE', duty_seq: 1, duty_sch_str_dt_utc: new Date('2026-05-01T22:00:00Z'), duty_sch_end_dt_utc: new Date('2026-05-02T04:00:00Z'), duty_sch_rest_min: null, brief_start_utc: new Date('2026-05-01T21:30:00Z'), debrief_end_utc: new Date('2026-05-02T04:30:00Z'), seg_seq: 1, flt_num: 'F8010', dep_arp: 'TPE', arv_arp: 'NRT', sch_str_dt_utc: new Date('2026-05-01T23:00:00Z'), sch_end_dt_utc: new Date('2026-05-02T02:00:00Z'), fleet_seg: 'A320', blk_min: 180 },
        // Day flight: hour 10 UTC
        { pairing_id: 4, base: 'TPE', duty_seq: 1, duty_sch_str_dt_utc: new Date('2026-05-01T22:00:00Z'), duty_sch_end_dt_utc: new Date('2026-05-02T04:00:00Z'), duty_sch_rest_min: null, brief_start_utc: new Date('2026-05-01T21:30:00Z'), debrief_end_utc: new Date('2026-05-02T04:30:00Z'), seg_seq: 2, flt_num: 'F8011', dep_arp: 'NRT', arv_arp: 'TPE', sch_str_dt_utc: new Date('2026-05-02T10:00:00Z'), sch_end_dt_utc: new Date('2026-05-02T12:00:00Z'), fleet_seg: 'A320', blk_min: 120 },
        // Night flight: hour 3 UTC
        { pairing_id: 4, base: 'TPE', duty_seq: 1, duty_sch_str_dt_utc: new Date('2026-05-01T22:00:00Z'), duty_sch_end_dt_utc: new Date('2026-05-02T04:00:00Z'), duty_sch_rest_min: null, brief_start_utc: new Date('2026-05-01T21:30:00Z'), debrief_end_utc: new Date('2026-05-02T04:30:00Z'), seg_seq: 3, flt_num: 'F8012', dep_arp: 'TPE', arv_arp: 'KHH', sch_str_dt_utc: new Date('2026-05-02T03:00:00Z'), sch_end_dt_utc: new Date('2026-05-02T04:00:00Z'), fleet_seg: 'A320', blk_min: 60 },
      ],
    })
    const result = await ruleCheckDataService.loadPairingInput(mockFastify, 4)
    expect(result).not.toBeNull()
    expect(result!.duties[0].segments[0].isNight).toBe(true)   // 23 UTC
    expect(result!.duties[0].segments[1].isNight).toBe(false)  // 10 UTC
    expect(result!.duties[0].segments[2].isNight).toBe(true)   // 3 UTC
  })
})

describe('ruleCheckDataService.loadFlightHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns zero object when no flight history found', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [{ last_24h: null, last_7d: null, last_28d: null, last_90d: null, last_365d: null }],
    })
    const result = await ruleCheckDataService.loadFlightHistory(
      mockFastify, 'CA001', new Date('2026-05-10T08:00:00Z'),
    )
    expect(result).toEqual({ last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 })
  })

  it('returns computed rolling sums from single query', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [{
        last_24h: 180,
        last_7d: 540,
        last_28d: 1200,
        last_90d: 3600,
        last_365d: 15000,
      }],
    })
    const result = await ruleCheckDataService.loadFlightHistory(
      mockFastify, 'CA001', new Date('2026-05-10T08:00:00Z'),
    )
    expect(result).toEqual({ last24h: 180, last7d: 540, last28d: 1200, last90d: 3600, last365d: 15000 })
  })
})

describe('ruleCheckDataService.loadCrewFlightRows', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns FlightRow[] for a crew in a date range', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [
        { sch_str_dt_utc: new Date('2026-05-01T02:00:00Z'), sch_end_dt_utc: new Date('2026-05-01T05:00:00Z'), blk_min: 180 },
        { sch_str_dt_utc: new Date('2026-05-02T04:00:00Z'), sch_end_dt_utc: new Date('2026-05-02T06:00:00Z'), blk_min: 120 },
      ],
    })
    const result = await ruleCheckDataService.loadCrewFlightRows(
      mockFastify, 'CA001', new Date('2026-05-01T00:00:00Z'), new Date('2026-05-31T00:00:00Z'),
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      stdUtc: new Date('2026-05-01T02:00:00Z'),
      staUtc: new Date('2026-05-01T05:00:00Z'),
      blkMin: 180,
    })
    expect(result[1]).toEqual({
      stdUtc: new Date('2026-05-02T04:00:00Z'),
      staUtc: new Date('2026-05-02T06:00:00Z'),
      blkMin: 120,
    })
  })

  it('returns empty array when no flights found', async () => {
    mockPgPool.query.mockResolvedValueOnce({ rows: [] })
    const result = await ruleCheckDataService.loadCrewFlightRows(
      mockFastify, 'NONEXIST', new Date('2026-01-01T00:00:00Z'), new Date('2026-01-31T00:00:00Z'),
    )
    expect(result).toEqual([])
  })
})

