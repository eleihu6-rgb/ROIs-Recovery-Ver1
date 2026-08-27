import { describe, it, expect } from 'vitest'
import { defaultTransform, DefaultTransform } from '../../transform/default.js'
import { StandardRecord } from '../../transform/base.js'

describe('Default Transform', () => {
  const transform = new DefaultTransform()

  describe('toStandard', () => {
    it('should handle flight data with explicit recordType', () => {
      const raw = {
        recordType: 'flight',
        flightNo: 'CA1234',
        depDate: '2024-01-15',
        depAirport: 'PEK',
        arrAirport: 'SHA',
      }

      const result = transform.toStandard(raw)

      expect(result.recordType).toBe('flight')
      expect(result.data.flightNo).toBe('CA1234')
    })

    it('should infer flight recordType from flightNo', () => {
      const raw = {
        flightNo: 'CA1234',
        depDate: '2024-01-15',
        depAirport: 'PEK',
        arrAirport: 'SHA',
      }

      const result = transform.toStandard(raw)

      expect(result.recordType).toBe('flight')
    })

    it('should infer crew recordType from crewCode without rosterDate', () => {
      const raw = {
        crewCode: 'CREW001',
        crewName: 'John Doe',
        rank: 'CA',
      }

      const result = transform.toStandard(raw)

      expect(result.recordType).toBe('crew')
    })

    it('should infer roster recordType from crewCode with rosterDate', () => {
      const raw = {
        crewCode: 'CREW001',
        rosterDate: '2024-01-15',
        dutyType: 'FLT',
      }

      const result = transform.toStandard(raw)

      expect(result.recordType).toBe('roster')
    })

    it('should throw error for invalid input', () => {
      expect(() => transform.toStandard(null)).toThrow('Invalid raw data')
      expect(() => transform.toStandard('invalid')).toThrow('Invalid raw data')
    })

    it('should throw error for unrecognized data structure', () => {
      const raw = { unknownField: 'value' }
      expect(() => transform.toStandard(raw)).toThrow('Cannot determine record type')
    })
  })

  describe('fromStandard', () => {
    it('should unwrap standard record to plain object', () => {
      const record: StandardRecord = {
        recordType: 'flight',
        data: {
          flightNo: 'CA1234',
          depDate: '2024-01-15',
        },
        metadata: {
          sourceRef: 'test-001',
        },
      }

      const result = transform.fromStandard(record) as Record<string, unknown>

      expect(result.recordType).toBe('flight')
      expect(result.flightNo).toBe('CA1234')
      const metadata = result.metadata as { sourceRef?: string }
      expect(metadata?.sourceRef).toBe('test-001')
    })
  })
})

describe('StandardRecord types', () => {
  it('should allow pairing as recordType', () => {
    const record: StandardRecord = {
      recordType: 'pairing',
      data: { pairingId: '101198' },
    }
    expect(record.recordType).toBe('pairing')
  })
})