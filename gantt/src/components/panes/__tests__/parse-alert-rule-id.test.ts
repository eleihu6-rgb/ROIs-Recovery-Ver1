import { describe, expect, it } from 'vitest'
import { parseAlertRuleId } from '../parse-alert-rule-id'

describe('parseAlertRuleId', () => {
  it('splits function/instance', () => {
    expect(parseAlertRuleId('8030/001')).toEqual({ functionCode: '8030', instanceCode: '001' })
  })

  it('handles bare function code', () => {
    expect(parseAlertRuleId('8030')).toEqual({ functionCode: '8030', instanceCode: null })
  })

  it('trims whitespace', () => {
    expect(parseAlertRuleId('  8002/006  ')).toEqual({ functionCode: '8002', instanceCode: '006' })
  })
})
