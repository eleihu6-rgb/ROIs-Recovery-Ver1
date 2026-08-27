import { describe, expect, it } from 'vitest'
import {
  detectColumnFormat,
  getColumnTooltip,
  isDraftValid,
  validateCell,
} from '../param-format'

describe('param-format date columns', () => {
  it('detects Eff Date and Exp Date as date', () => {
    expect(detectColumnFormat('Eff Date', [])).toBe('date')
    expect(detectColumnFormat('Exp Date', [])).toBe('date')
    expect(detectColumnFormat('eff date', [])).toBe('date')
    expect(detectColumnFormat('EXP DATE', [])).toBe('date')
  })

  it('does not treat unrelated headers as date', () => {
    expect(detectColumnFormat('Crew A', ['2026-08-01'])).toBe('text')
    expect(detectColumnFormat('Start Date', [])).toBe('text')
    expect(detectColumnFormat('Period', ['28'])).toBe('integer')
  })

  it('validates YYYY-MM-DD calendar days', () => {
    expect(validateCell('2026-08-01', 'date')).toBeNull()
    expect(validateCell('', 'date')).toBe('Required')
    expect(validateCell('08/01/2026', 'date')).toBe('Use YYYY-MM-DD (e.g. 2026-08-01)')
    expect(validateCell('2026-02-31', 'date')).toBe('Use YYYY-MM-DD (e.g. 2026-08-01)')
  })

  it('tooltip and draft validity use date rules', () => {
    expect(getColumnTooltip('Eff Date', 'date')).toContain('YYYY-MM-DD')
    expect(isDraftValid(['A', 'B', '2026-08-01', '2026-08-31'], ['text', 'text', 'date', 'date'])).toBe(true)
    expect(isDraftValid(['A', 'B', 'bad', '2026-08-31'], ['text', 'text', 'date', 'date'])).toBe(false)
  })
})
