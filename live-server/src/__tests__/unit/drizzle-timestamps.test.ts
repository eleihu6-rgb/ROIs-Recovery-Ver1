import { describe, expect, it } from 'vitest'
import { coerceTimestampFields } from '../../utils/drizzle-timestamps.js'

/**
 * Regression: saving a ground-task edit used to fail with
 * "TypeError: value.toISOString is not a function", thrown from Drizzle's
 * PgTimestamp mapper because the draft transport hands it an ISO string.
 */
describe('coerceTimestampFields', () => {
  const FIELDS = ['schStrDtUtc', 'schEndDtUtc'] as const
  type Row = Record<string, unknown>

  it('revives ISO strings into Date instances', () => {
    const out = coerceTimestampFields<Row>({
      schStrDtUtc: '2026-09-08T04:00:00.000Z',
      schEndDtUtc: '2026-09-08T07:00:00.000Z',
    }, FIELDS)
    expect(out.schStrDtUtc).toBeInstanceOf(Date)
    expect((out.schStrDtUtc as Date).toISOString()).toBe('2026-09-08T04:00:00.000Z')
    expect(out.schEndDtUtc).toBeInstanceOf(Date)
  })

  it('leaves Date, null and unknown values untouched', () => {
    const date = new Date('2026-09-08T04:00:00.000Z')
    const out = coerceTimestampFields<Row>({
      schStrDtUtc: date,
      schEndDtUtc: null,
      assignment: 'MTG',
    }, FIELDS)
    expect(out.schStrDtUtc).toBe(date)
    expect(out.schEndDtUtc).toBeNull()
    expect(out.assignment).toBe('MTG')
  })

  it('does not mutate the input object', () => {
    const input: Row = { schStrDtUtc: '2026-09-08T04:00:00.000Z' }
    coerceTimestampFields(input, FIELDS)
    expect(typeof input.schStrDtUtc).toBe('string')
  })

  it('keeps an unparsable string so the failure stays visible instead of silently writing NaN', () => {
    const out = coerceTimestampFields<Row>({ schStrDtUtc: 'not-a-date' }, FIELDS)
    expect(out.schStrDtUtc).toBe('not-a-date')
  })
})
