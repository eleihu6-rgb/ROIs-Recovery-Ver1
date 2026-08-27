import { describe, expect, it } from 'vitest'
import { asSafeIdentifier } from '../schema-identifier'

describe('asSafeIdentifier', () => {
  it('accepts valid schema identifiers and normalizes case', () => {
    expect(asSafeIdentifier('f8')).toBe('f8')
    expect(asSafeIdentifier('F8_PBS')).toBe('f8_pbs')
  })

  it('rejects unsafe schema identifiers', () => {
    expect(() => asSafeIdentifier('f8-pbs')).toThrow(/Invalid database schema identifier/)
    expect(() => asSafeIdentifier('1f8')).toThrow(/Invalid database schema identifier/)
    expect(() => asSafeIdentifier('f8;drop')).toThrow(/Invalid database schema identifier/)
  })
})
