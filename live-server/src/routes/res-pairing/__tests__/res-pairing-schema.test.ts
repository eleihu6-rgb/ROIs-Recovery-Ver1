import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

import { genSchema, batchSchema } from '../res-pairing.js'

const validPayload = {
  division: 'P',
  conflictPolicy: 'skip',
  cells: [
    {
      date: '2026-06-01',
      base: 'YVR',
      assignment: 'PRAM',
      composition: [{ rank: 'CA', plan: 5 }],
    },
  ],
}

describe('genSchema', () => {
  it('parses a valid payload', () => {
    const result = genSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.division).toBe('P')
      expect(result.data.cells[0].base).toBe('YVR')
      expect(result.data.cells[0].assignment).toBe('PRAM')
    }
  })

  it('accepts PRMM multi-assignment cells', () => {
    const result = genSchema.safeParse({
      ...validPayload,
      cells: [
        { ...validPayload.cells[0], assignment: 'PRAM' },
        { ...validPayload.cells[0], assignment: 'PRMM' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty cells array', () => {
    const result = genSchema.safeParse({ ...validPayload, cells: [] })
    expect(result.success).toBe(false)
  })

  it('rejects invalid division', () => {
    const result = genSchema.safeParse({ ...validPayload, division: 'X' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid conflictPolicy', () => {
    const result = genSchema.safeParse({ ...validPayload, conflictPolicy: 'ignore' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const result = genSchema.safeParse({
      ...validPayload,
      cells: [{ ...validPayload.cells[0], date: '2026/06/01' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects base with wrong length', () => {
    const result = genSchema.safeParse({
      ...validPayload,
      cells: [{ ...validPayload.cells[0], base: 'YV' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing assignment', () => {
    const { assignment: _a, ...rest } = validPayload.cells[0]
    const result = genSchema.safeParse({
      ...validPayload,
      cells: [rest],
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional dryRun flag', () => {
    const result = genSchema.safeParse({ ...validPayload, dryRun: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dryRun).toBe(true)
    }
  })

  it('accepts optional window field in cells', () => {
    const result = genSchema.safeParse({
      ...validPayload,
      cells: [{ ...validPayload.cells[0], window: { start: '06:00', end: '14:00' } }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects malformed window time (25:99) in cell', () => {
    const result = genSchema.safeParse({
      ...validPayload,
      cells: [{ ...validPayload.cells[0], window: { start: '25:99', end: '14:00' } }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts well-formed boundary window times (00:00 and 23:59) in cell', () => {
    const result = genSchema.safeParse({
      ...validPayload,
      cells: [{ ...validPayload.cells[0], window: { start: '00:00', end: '23:59' } }],
    })
    expect(result.success).toBe(true)
  })
})

describe('batchSchema window validation', () => {
  const validBatch = { ids: [1, 2, 3] }

  it('accepts batch without window', () => {
    const result = batchSchema.safeParse(validBatch)
    expect(result.success).toBe(true)
  })

  it('accepts batch with valid HH:MM window', () => {
    const result = batchSchema.safeParse({ ...validBatch, window: { start: '06:00', end: '14:00' } })
    expect(result.success).toBe(true)
  })

  it('rejects batch with malformed window start (25:99)', () => {
    const result = batchSchema.safeParse({ ...validBatch, window: { start: '25:99', end: '14:00' } })
    expect(result.success).toBe(false)
  })

  it('rejects batch with malformed window end (9:0)', () => {
    const result = batchSchema.safeParse({ ...validBatch, window: { start: '06:00', end: '9:0' } })
    expect(result.success).toBe(false)
  })
})
