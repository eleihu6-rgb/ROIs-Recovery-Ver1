import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

import { generate, summarize } from '../res-pairing-service'

describe('summarize', () => {
  it('groups by base+rank+assignment with day & slot counts', () => {
    const cells = [
      {
        date: '2026-06-01',
        base: 'YVR',
        assignment: 'PRAM',
        composition: [{ rank: 'CA', plan: 5 }, { rank: 'FO', plan: 5 }],
      },
      {
        date: '2026-06-08',
        base: 'YVR',
        assignment: 'PRAM',
        composition: [{ rank: 'CA', plan: 5 }, { rank: 'FO', plan: 5 }],
      },
      {
        date: '2026-06-01',
        base: 'YVR',
        assignment: 'PRMM',
        composition: [{ rank: 'CA', plan: 3 }],
      },
    ]
    const rows = summarize(cells, 'P')
    const caPram = rows.find((r) => r.base === 'YVR' && r.rank === 'CA' && r.assignment === 'PRAM')!
    expect(caPram.days).toBe(2)
    expect(caPram.slots).toBe(10)
    const caPrmm = rows.find((r) => r.base === 'YVR' && r.rank === 'CA' && r.assignment === 'PRMM')!
    expect(caPrmm.days).toBe(1)
    expect(caPrmm.slots).toBe(3)
  })

  it('ignores zero-plan composition rows in the summary', () => {
    const rows = summarize([
      {
        date: '2026-06-01',
        base: 'YVR',
        assignment: 'PRAM',
        composition: [{ rank: 'CA', plan: 0 }, { rank: 'FO', plan: 2 }],
      },
      {
        date: '2026-06-02',
        base: 'YVR',
        assignment: 'PRAM',
        composition: [{ rank: 'CA', plan: 0 }, { rank: 'FO', plan: 0 }],
      },
    ], 'P')

    expect(rows).toEqual([
      {
        base: 'YVR',
        rank: 'FO',
        assignment: 'PRAM',
        days: 1,
        slots: 2,
      },
    ])
  })
})

describe('generate', () => {
  it('skips all-zero plan cells without reading config or writing pairings', async () => {
    const fastify = {
      db: {
        select: vi.fn(),
        transaction: vi.fn(),
      },
      redis: null,
    }

    const result = await generate(fastify as never, {
      division: 'P',
      conflictPolicy: 'skip',
      cells: [
        {
          date: '2026-06-01',
          base: 'YVR',
          assignment: 'PRAM',
          composition: [{ rank: 'CA', plan: 0 }, { rank: 'FO', plan: 0 }],
        },
      ],
    }, 'tester')

    expect(result).toEqual({ created: 0, skipped: 1, summary: [] })
    expect(fastify.db.select).not.toHaveBeenCalled()
    expect(fastify.db.transaction).not.toHaveBeenCalled()
  })
})
