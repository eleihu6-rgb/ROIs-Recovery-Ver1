import { TransformPlugin, StandardRecord } from './base.js'

/**
 * Default transform plugin
 * Assumes external format already matches ROIS standard format
 * Used when connector_config.transform_plugin is empty
 */
export class DefaultTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    // Assume raw is already in standard format
    // Add minimal validation
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid raw data: expected object')
    }

    const data = raw as Record<string, unknown>
    if (!data.recordType) {
      // Infer recordType from data structure if not provided
      if (data.flightNo) {
        data.recordType = 'flight'
      } else if (data.crewCode && !data.rosterDate) {
        data.recordType = 'crew'
      } else if (data.crewCode && data.rosterDate) {
        data.recordType = 'roster'
      } else {
        throw new Error('Cannot determine record type from data')
      }
    }

    return {
      recordType: data.recordType as 'flight' | 'crew' | 'roster',
      data,
      metadata: data.metadata as StandardRecord['metadata'],
    }
  }

  fromStandard(record: StandardRecord): unknown {
    // Return data directly, strip wrapper
    return {
      ...record.data,
      recordType: record.recordType,
      metadata: record.metadata,
    }
  }
}

export const defaultTransform = new DefaultTransform()