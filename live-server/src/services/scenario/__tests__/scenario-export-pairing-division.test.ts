import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { pairingIdSet, type ScenarioRow } from '../scenario-export-service.js'

const dialect = new PgDialect()
const row = (
  filterParams: Record<string, unknown>,
  fileType: string = 'RO',
  division: string = 'P',
): ScenarioRow => ({
  id: 1, worksetId: 1,
  strDtLoc: new Date('2026-06-01T07:00:00Z'),
  endDtLoc: new Date('2026-06-30T07:00:00Z'),
  filterParams, rulesetId: 103, fileType, division,
})

describe('pairingIdSet division scoping', () => {
  it('uses workset.division for RO crew scope', () => {
    const { sql: text, params } = dialect.sqlToQuery(pairingIdSet(row({ crew: { bases: [] } }, 'RO', 'P')))
    expect(text).toContain('division =')
    expect(params).toContain('P')
  })

  it('defaults missing workset.division to P', () => {
    const empty = dialect.sqlToQuery(pairingIdSet({
      id: 1, worksetId: 1,
      strDtLoc: new Date('2026-06-01T07:00:00Z'),
      endDtLoc: new Date('2026-06-30T07:00:00Z'),
      filterParams: {}, rulesetId: 103, fileType: 'RO',
    }))
    expect(empty.sql).toContain('division =')
    expect(empty.params).toContain('P')
  })

  it('scopes pairings by base and fleet but not legacy source values', () => {
    const { sql: text, params } = dialect.sqlToQuery(pairingIdSet(row({
      pairing: { bases: ['YYZ'], fleets: ['7M8'], sources: ['MANUAL'] },
    }, 'RO', 'P')))

    expect(text).toContain('base = ANY')
    expect(text).toContain('fleet = ANY')
    expect(text).not.toContain('source')
    expect(params).toContain('YYZ')
    expect(params).toContain('7M8')
    expect(params).not.toContain('MANUAL')
  })

  it('scopes RO pairings by assignment code and tafb duration', () => {
    const { sql: text, params } = dialect.sqlToQuery(pairingIdSet(row({
      pairing: {
        types: ['FLT', 'SBY'],
        duration: { min: 2, max: 5 },
      },
    }, 'RO', 'P')))

    expect(text).toContain('assignment = ANY')
    expect(text).toContain('tafb >=')
    expect(text).toContain('tafb <=')
    expect(params).toContain('FLT')
    expect(params).toContain('SBY')
    expect(params).toContain(2)
    expect(params).toContain(5)
  })

  it('PO uses workset.division + filter_params bases (including legacy singular base)', () => {
    const modern = dialect.sqlToQuery(pairingIdSet(row({
      bases: ['YEG', 'YVR'],
    }, 'PO', 'C')))
    expect(modern.sql).toContain('division =')
    expect(modern.params).toContain('C')
    expect(modern.sql).toContain('base = ANY')
    expect(modern.params).toContain('YEG')
    expect(modern.params).toContain('YVR')

    const legacy = dialect.sqlToQuery(pairingIdSet(row({
      base: 'YYZ',
    }, 'PO', 'P')))
    expect(legacy.params).toContain('P')
    expect(legacy.params).toContain('YYZ')
  })

  it('end bound keeps pairings starting on the last day (strictly < end + 1 day)', () => {
    const { sql: text } = dialect.sqlToQuery(pairingIdSet(row({
      pairing: { bases: ['YYZ'] },
    }, 'RO', 'P')))
    // Boundary regression: sch_str_dt_utc must be strictly before the day AFTER
    // endDtLoc, so a pairing starting on endDtLoc itself (e.g. 2026-06-30 07:00Z)
    // stays in scope instead of being dropped at end-day midnight.
    expect(text).toContain('sch_str_dt_utc <')
    expect(text).toContain("interval '1 day'")
    expect(text).not.toContain('sch_str_dt_utc <=')
  })
})
