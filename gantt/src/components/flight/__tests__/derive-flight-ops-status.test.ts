import { describe, expect, it } from 'vitest'
import { deriveFlightOpsStatus } from '../derive-flight-ops-status'

describe('deriveFlightOpsStatus', () => {
  it('Cancelled wins even with actuals', () => {
    expect(
      deriveFlightOpsStatus({
        isCancelled: true,
        actDepDtUtc: '2026-09-07T10:00:00.000Z',
        actArvDtUtc: '2026-09-07T14:00:00.000Z',
        schDepDtUtc: '2026-09-07T09:40:00.000Z',
      }).label,
    ).toBe('Cancelled')
  })

  it('Finished when ATD and ATA exist', () => {
    expect(
      deriveFlightOpsStatus({
        isCancelled: false,
        actDepDtUtc: '2026-09-07T09:45:00.000Z',
        actArvDtUtc: '2026-09-07T14:50:00.000Z',
        schDepDtUtc: '2026-09-07T09:40:00.000Z',
      }).label,
    ).toBe('Finished')
  })

  it('Delayed when ATD only and ATD-STD > 15', () => {
    const r = deriveFlightOpsStatus({
      isCancelled: false,
      actDepDtUtc: '2026-09-07T10:00:00.000Z',
      actArvDtUtc: null,
      schDepDtUtc: '2026-09-07T09:40:00.000Z',
    })
    expect(r.label).toBe('Delayed')
    expect(r.unit).toBe('+20 min')
  })

  it('On Time when ATD only and delay ≤ 15', () => {
    expect(
      deriveFlightOpsStatus({
        isCancelled: false,
        actDepDtUtc: '2026-09-07T09:50:00.000Z',
        actArvDtUtc: null,
        schDepDtUtc: '2026-09-07T09:40:00.000Z',
      }).label,
    ).toBe('On Time')
  })

  it('Scheduled when no ATD', () => {
    expect(
      deriveFlightOpsStatus({
        isCancelled: false,
        actDepDtUtc: null,
        actArvDtUtc: null,
        schDepDtUtc: '2026-09-07T09:40:00.000Z',
      }).label,
    ).toBe('Scheduled')
  })
})
