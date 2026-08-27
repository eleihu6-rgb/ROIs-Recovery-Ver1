import { describe, expect, it } from 'vitest'
import { DataValidationService } from '../../../services/data/data-validation-service.js'

describe('DataValidationService assignment ratio fields', () => {
  it('rejects percent ratio values outside 0..1 with a friendly message', async () => {
    const service = new DataValidationService()

    const issues = await service.validate({} as any, [{
      clientChangeId: 'assignment-bt',
      entityId: 'assignment',
      action: 'update',
      rowId: 11,
      after: { btPct: 33 },
    }])

    expect(issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'invalid_value',
        field: 'btPct',
        message: 'BT % must be between 0 and 1. Use 0.33 for 33%.',
      }),
    ])
  })

  it('accepts valid snake-case percent ratio values', async () => {
    const service = new DataValidationService()

    const issues = await service.validate({} as any, [{
      clientChangeId: 'assignment-bt',
      entityId: 'assignment',
      action: 'update',
      rowId: 11,
      after: { bt_pct: 0.33 },
    }])

    expect(issues).toHaveLength(0)
  })
})
