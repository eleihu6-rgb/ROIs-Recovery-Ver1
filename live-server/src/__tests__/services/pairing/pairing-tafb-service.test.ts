import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

import {
  refreshPairingTafb,
  refreshScenarioPairingsTafb,
} from '../../../services/pairing/pairing-tafb-service.js'

describe('refreshPairingTafb', () => {
  it('writes tafb as min-1 Base-local calendar span with sch/duration_days fallback', async () => {
    const execute = vi.fn().mockResolvedValue({ rowCount: 1 })
    await refreshPairingTafb({ execute } as never, 42, 'tester')

    const dialect = new PgDialect()
    const query = dialect.sqlToQuery(execute.mock.calls[0][0])
    const normalized = query.sql.replace(/\s+/g, ' ').trim()

    expect(normalized).toMatch(/min\(ps\.brief_start_utc\)/)
    expect(normalized).toMatch(/max\(ps\.debrief_end_utc\)/)
    expect(normalized).toMatch(/at time zone 'UTC'\) at time zone base_zone\.name\)::date/)
    expect(normalized).toMatch(/greatest\(\s*1,\s*coalesce\(/)
    expect(normalized).toMatch(/p\.sch_end_dt_utc/)
    expect(normalized).toMatch(/p\.duration_days/)
    expect(normalized).toMatch(/p\.tafb is distinct from calculated\.tafb/)
    expect(query.params).toEqual([42, 'tester'])
  })
})

describe('refreshScenarioPairingsTafb', () => {
  it('batch-recomputes scenario tafb with UTC wall-clock and sch/duration fallback', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await refreshScenarioPairingsTafb({ query } as never, 'scenario', [1, 2, 3], 'tester')

    const [text, params] = query.mock.calls[0]

    expect(text).toMatch(/update scenario\.pairing p/)
    expect(text).toMatch(/max\(ps\.debrief_end_utc\)::date - min\(ps\.brief_start_utc\)::date \+ 1/)
    expect(text).toMatch(/p\.sch_end_dt_utc::date - p\.sch_str_dt_utc::date \+ 1/)
    expect(text).toMatch(/p\.duration_days/)
    expect(text).toMatch(/p\.id = any\(\$1::bigint\[\]\)/)
    expect(params).toEqual([[1, 2, 3], 'tester'])
  })
})
