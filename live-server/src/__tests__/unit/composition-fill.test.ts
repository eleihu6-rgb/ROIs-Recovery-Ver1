import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const mockDb = {
  execute: vi.fn<(query: unknown) => Promise<{ rows: unknown[] }>>(async () => ({ rows: [] })),
}

describe('composition-fill SQL', () => {
  it('renders bulk pairing fill with a PostgreSQL bigint array for ANY', async () => {
    mockDb.execute.mockClear()
    const { refreshPairingCompositionFillBulk } = await import('../../utils/composition-fill.js')

    await refreshPairingCompositionFillBulk(mockDb as never, [101, 102, 103], 'F8_IMPORT')

    const dialect = new PgDialect()
    const rendered = dialect.sqlToQuery(mockDb.execute.mock.calls[0][0] as never)
    expect(rendered.sql).toContain('ANY(ARRAY[')
    expect(rendered.sql).toContain(']::bigint[])')
    expect(rendered.sql).not.toContain('ANY(($')
    expect(rendered.params).toEqual(expect.arrayContaining([101, 102, 103, 'F8_IMPORT']))
  })

  it('renders bulk flight fill with a PostgreSQL bigint array for ANY', async () => {
    mockDb.execute.mockClear()
    const { refreshFlightCompositionFill } = await import('../../utils/composition-fill.js')

    await refreshFlightCompositionFill(mockDb as never, [201, 202], 'F8_IMPORT')

    const dialect = new PgDialect()
    const rendered = dialect.sqlToQuery(mockDb.execute.mock.calls[0][0] as never)
    expect(rendered.sql).toContain('ANY(ARRAY[')
    expect(rendered.sql).toContain(']::bigint[])')
    expect(rendered.sql).not.toContain('ANY(($')
    expect(rendered.params).toEqual(expect.arrayContaining([201, 202, 'F8_IMPORT']))
  })
})
