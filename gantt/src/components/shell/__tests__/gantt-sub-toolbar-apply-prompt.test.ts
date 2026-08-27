import { describe, expect, it } from 'vitest'
import { resolveLiveApplyPrompt } from '../gantt-sub-toolbar'

describe('resolveLiveApplyPrompt', () => {
  it('never applied → shows "No data loaded"', () => {
    const r = resolveLiveApplyPrompt(null, ['8'], true)
    expect(r.show).toBe(true)
    expect(r.text).toBe('No data loaded — apply filters to pull data')
  })

  it('never applied → shows "No data loaded" even with an RP selected', () => {
    const r = resolveLiveApplyPrompt(null, ['8', '9'], true)
    expect(r.show).toBe(true)
    expect(r.text).toBe('No data loaded — apply filters to pull data')
  })

  it('applied and RP selection unchanged → no prompt', () => {
    const r = resolveLiveApplyPrompt({ selectedRosterPeriodIds: ['8'] }, ['8'], true)
    expect(r.show).toBe(false)
  })

  it('applied but RP selection changed → "RP Date changed"', () => {
    const r = resolveLiveApplyPrompt({ selectedRosterPeriodIds: ['8'] }, ['8', '9'], true)
    expect(r.show).toBe(true)
    expect(r.text).toBe('RP Date changed — apply filters to pull data')
  })

  it('applied but RP selection swapped (same count) → "RP Date changed"', () => {
    const r = resolveLiveApplyPrompt({ selectedRosterPeriodIds: ['8', '9'] }, ['8', '10'], true)
    expect(r.show).toBe(true)
    expect(r.text).toBe('RP Date changed — apply filters to pull data')
  })

  it('applied but RP deselected (shorter) → "RP Date changed"', () => {
    const r = resolveLiveApplyPrompt({ selectedRosterPeriodIds: ['8', '9'] }, ['8'], true)
    expect(r.show).toBe(true)
    expect(r.text).toBe('RP Date changed — apply filters to pull data')
  })

  it('non-Live module → never shows, even never applied', () => {
    const r = resolveLiveApplyPrompt(null, [], false)
    expect(r.show).toBe(false)
  })
})
