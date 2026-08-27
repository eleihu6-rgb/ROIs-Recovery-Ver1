import { describe, it, expect, vi } from 'vitest'

// Mock config to avoid env var validation (DATABASE_URL required)
vi.mock('../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}))

const processOptions = { pbsSchema: 'sit_pbs' }

const makeMockDb = (
  existing: {
    crewIds?: string[]
    certificates?: Array<{ certificate: string; divisions: string }>
    qualifications?: Array<{ qualification: string; division: string }>
    teams?: Array<{ filiale: string; team: string; division: string }>
  } = {},
) => {
  const execute = vi.fn(async (query: unknown) => {
    const q = sqlText(query)
    if (q.includes('SELECT crew_id FROM crew WHERE')) {
      return { rows: (existing.crewIds ?? []).map((crewId) => ({ crew_id: crewId })) }
    }
    if (q.includes('FROM certificate')) return { rows: existing.certificates ?? [] }
    if (q.includes('FROM qualification')) return { rows: existing.qualifications ?? [] }
    if (q.includes('FROM team')) return { rows: existing.teams ?? [] }
    return { rows: [] }
  })
  const db = {
    execute,
    transaction: async (cb: (tx: unknown) => unknown) => cb(db),
  }
  return db
}

const sqlText = (query: unknown): string => {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks
  if (!chunks) return String(query)
  return chunks.map((chunk) => {
    if (chunk === null || chunk === undefined) return ''
    const nestedChunks = (chunk as { queryChunks?: unknown[] }).queryChunks
    if (nestedChunks) return sqlText(chunk)
    const value = (chunk as { value?: unknown }).value
    if (Array.isArray(value)) return value.join('')
    if (value !== undefined) return String(value)
    return String(chunk)
  }).join('')
}

const crewRecord = {
  crewId: 'C001', interfaceId: 'C001',
  firstName: 'Zhang', middleName: '', lastName: 'San', preferredName: '',
  gender: 'M', birthday: null, seniorityNum: 28,
  homeAddress: '', tel: '', email: '', contractType: 'Pilots',
  emplDt: '2018-06-22T00:00:00.000Z', division: 'P', filiale: 'F8',
  bases: [{ base: 'PEK', effDt: '2018-06-22T00:00:00.000Z', expDt: null, isPrimary: true }],
  ranks: [{ rank: 'CA', effDt: '2020-01-01T00:00:00.000Z', expDt: null }],
  certificates: [{ certificate: 'RHS', effDt: '1970-01-01T00:00:00.000Z', expDt: null, isValid: true, firstName: '', middleName: '', lastName: '' }],
  fleets: [{ fleet: '737', effDt: '2020-01-01T00:00:00.000Z', expDt: null }],
  qualifications: [{ qualification: '737', effDt: '2020-01-01T00:00:00.000Z', expDt: null, isValid: true }],
  teams: [{ team: 'EQ737', effDt: '2021-08-01T00:00:00.000Z', expDt: null, isValid: true, remarks: 'EQ737 Team' }],
}

const teamRecord = (team: string) => ({
  team, effDt: '2021-08-01T00:00:00.000Z', expDt: null, isValid: true, remarks: team,
})
const cabinRecord = { ...crewRecord, crewId: 'C002', division: 'C' }

describe('processCrewImportJob', () => {
  it('upserts crew and its sub-entities', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const mockDb = makeMockDb()
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [crewRecord],
    }
    const result = await processCrewImportJob(job, mockDb as never, processOptions)
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)
    // crew_base/rank/status/certificate/fleet/qualification/team inserts should have run
    expect(mockDb.execute).toHaveBeenCalled()
    const executedSql = (mockDb.execute.mock.calls as unknown[][])
      .map((call) => sqlText(call[0]))
      .join('\n')
    expect(executedSql).toContain('DELETE FROM crew_team WHERE crew_id')
    expect(executedSql).toContain('INSERT INTO crew_team')
    expect(executedSql).toContain('source, created_by, updated_by')
  })

  it('upserts PBS user projection by crew_id without overwriting auth state', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const mockDb = makeMockDb()
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [crewRecord],
    }

    const result = await processCrewImportJob(job, mockDb as never, processOptions)

    expect(result.failed).toBe(0)
    const executedSql = (mockDb.execute.mock.calls as unknown[][])
      .map((call) => sqlText(call[0]))
      .join('\n')
    expect(executedSql).toContain('INSERT INTO sit_pbs.pbs_user AS pbs_user')
    expect(executedSql).toContain('ON CONFLICT (crew_id) DO UPDATE SET')
    expect(executedSql).toContain('user_name = EXCLUDED.user_name')
    expect(executedSql).toContain('division = EXCLUDED.division')
    expect(executedSql).not.toContain('pbs_user.base')
    expect(executedSql).not.toContain('pbs_user.rank')
    expect(executedSql).not.toMatch(/\n\s+base,\n\s+rank\n/)
    expect(executedSql).toContain('password_access = COALESCE(pbs_user.password_access, EXCLUDED.password_access)')
    expect(executedSql).not.toContain('password_hash = EXCLUDED.password_hash')
    expect(executedSql).not.toContain('token_version = EXCLUDED.token_version')
    expect(executedSql).not.toContain('failed_login_count = EXCLUDED.failed_login_count')
    expect(executedSql).not.toContain('user_code = EXCLUDED.user_code')
    expect(executedSql).not.toContain('status = EXCLUDED.status')
  })

  it('counts duplicate crew source rows once in import summary', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const mockDb = makeMockDb({ crewIds: ['C001'] })
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [crewRecord, { ...crewRecord }],
    }

    const result = await processCrewImportJob(job, mockDb as never, processOptions)

    expect(result.imported).toBe(1)
    expect(result.success).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.added).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('inserts missing certificate/qualification/team code definitions before importing children', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const mockDb = makeMockDb() // empty def tables → all child codes missing
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [crewRecord],
    }

    const result = await processCrewImportJob(job, mockDb as never, processOptions)

    expect(result.failed).toBe(0)
    const executedSql = (mockDb.execute.mock.calls as unknown[][])
      .map((call) => sqlText(call[0]))
      .join('\n')
    expect(executedSql).toContain("INSERT INTO certificate (certificate, divisions, certificate_type, created_by, updated_by)\n          VALUES (RHS, P, 'O', 'F8_IMPORT', 'F8_IMPORT')")
    expect(executedSql).toContain("INSERT INTO qualification (qualification, filiale, division, created_by, updated_by)\n          VALUES (737, F8, P, 'F8_IMPORT', 'F8_IMPORT')")
    expect(executedSql).toContain("INSERT INTO team (filiale, team, division, created_by, updated_by)\n          VALUES (F8, EQ737, P, 'F8_IMPORT', 'F8_IMPORT')")
  })

  it('does not re-insert code definitions that already exist', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const mockDb = makeMockDb({
      certificates: [{ certificate: 'RHS', divisions: 'P' }],
      qualifications: [{ qualification: '737', division: 'P' }],
      teams: [{ filiale: 'F8', team: 'EQ737', division: 'P' }],
    })
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [crewRecord],
    }

    const result = await processCrewImportJob(job, mockDb as never, processOptions)

    expect(result.failed).toBe(0)
    const executedSql = (mockDb.execute.mock.calls as unknown[][])
      .map((call) => sqlText(call[0]))
      .join('\n')
    expect(executedSql).not.toContain('INSERT INTO certificate')
    expect(executedSql).not.toContain('UPDATE certificate')
    expect(executedSql).not.toContain('INSERT INTO qualification')
    expect(executedSql).not.toContain('UPDATE qualification')
    expect(executedSql).not.toContain('INSERT INTO team')
    expect(executedSql).not.toContain('UPDATE team')
  })

  it('merges an existing code definition that lacks the incoming division', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const mockDb = makeMockDb({
      certificates: [{ certificate: 'RHS', divisions: 'P' }],
      qualifications: [{ qualification: '737', division: 'P' }],
      teams: [{ filiale: 'F8', team: 'EQ737', division: 'P' }],
    })
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [cabinRecord],
    }

    const result = await processCrewImportJob(job, mockDb as never, processOptions)

    expect(result.failed).toBe(0)
    const executedSql = (mockDb.execute.mock.calls as unknown[][])
      .map((call) => sqlText(call[0]))
      .join('\n')
    expect(executedSql).toContain("UPDATE certificate SET divisions = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n          WHERE certificate = RHS")
    expect(executedSql).toContain("UPDATE qualification SET division = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n          WHERE qualification = 737")
    expect(executedSql).toContain("UPDATE team SET division = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n          WHERE filiale = F8 AND team = EQ737")
    expect(executedSql).not.toContain('INSERT INTO certificate')
    expect(executedSql).not.toContain('INSERT INTO qualification')
    expect(executedSql).not.toContain('INSERT INTO team')
  })

  it('merges a new team code referenced by both P and C records in one batch', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const mockDb = makeMockDb() // empty defs → NEWTM is new
    const pilotRec = { ...crewRecord, crewId: 'P001', division: 'P', certificates: [], qualifications: [], teams: [teamRecord('NEWTM')] }
    const cabinRec2 = { ...crewRecord, crewId: 'C002', division: 'C', certificates: [], qualifications: [], teams: [teamRecord('NEWTM')] }
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [pilotRec, cabinRec2],
    }

    const result = await processCrewImportJob(job, mockDb as never, processOptions)

    expect(result.failed).toBe(0)
    const executedSql = (mockDb.execute.mock.calls as unknown[][])
      .map((call) => sqlText(call[0]))
      .join('\n')
    expect(executedSql).toContain("INSERT INTO team (filiale, team, division, created_by, updated_by)\n          VALUES (F8, NEWTM, P, 'F8_IMPORT', 'F8_IMPORT')")
    expect(executedSql).toContain("UPDATE team SET division = P,C, updated_by = 'F8_IMPORT', updated_at = now()\n          WHERE filiale = F8 AND team = NEWTM")
  })
})
