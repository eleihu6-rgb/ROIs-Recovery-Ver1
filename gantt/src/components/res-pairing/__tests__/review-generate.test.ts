import { describe, expect, it } from 'vitest'
import { buildSummary } from '../review-generate'

describe('buildSummary', () => {
  it('shows the date range for each RES summary row', () => {
    const rows = buildSummary([
      {
        date: '2026-09-15',
        base: 'YEG',
        assignment: 'PRAM',
        window: { start: '04:00', end: '16:00' },
        composition: [{ rank: 'CA', plan: 5 }, { rank: 'FO', plan: 0 }],
      },
      {
        date: '2026-09-01',
        base: 'YEG',
        assignment: 'PRAM',
        window: { start: '04:00', end: '16:00' },
        composition: [{ rank: 'CA', plan: 5 }, { rank: 'FO', plan: 0 }],
      },
    ])

    expect(rows).toEqual([
      {
        base: 'YEG',
        rank: 'CA',
        assignment: 'PRAM',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-15',
        dateRangeLabel: '2026-09-01 - 2026-09-15',
        days: 2,
        slotsPerDay: 5,
        totalSlots: 10,
      },
    ])
  })
})
