import { describe, expect, it } from 'vitest'
import { deriveFlightBlockMinutes } from '../derive-flight-block-minutes'

describe('deriveFlightBlockMinutes', () => {
  it('uses ATA − ATD when both actuals exist', () => {
    expect(
      deriveFlightBlockMinutes({
        actDepDtUtc: '2026-09-07T09:45:00.000Z',
        actArvDtUtc: '2026-09-07T15:00:00.000Z',
        schDepDtUtc: '2026-09-07T09:40:00.000Z',
        schArvDtUtc: '2026-09-07T14:50:00.000Z',
      }),
    ).toBe(315)
  })

  it('falls back to STA − STD when ATA is missing', () => {
    expect(
      deriveFlightBlockMinutes({
        actDepDtUtc: '2026-09-07T09:50:00.000Z',
        actArvDtUtc: null,
        schDepDtUtc: '2026-09-07T09:40:00.000Z',
        schArvDtUtc: '2026-09-07T14:50:00.000Z',
      }),
    ).toBe(310)
  })

  it('uses scheduled when both actuals missing', () => {
    expect(
      deriveFlightBlockMinutes({
        actDepDtUtc: null,
        actArvDtUtc: null,
        schDepDtUtc: '2026-09-07T09:40:00.000Z',
        schArvDtUtc: '2026-09-07T14:50:00.000Z',
      }),
    ).toBe(310)
  })

  it('returns null when chosen pair is invalid (arv ≤ dep)', () => {
    expect(
      deriveFlightBlockMinutes({
        actDepDtUtc: null,
        actArvDtUtc: null,
        schDepDtUtc: '2026-09-07T14:50:00.000Z',
        schArvDtUtc: '2026-09-07T09:40:00.000Z',
      }),
    ).toBeNull()
  })
})
