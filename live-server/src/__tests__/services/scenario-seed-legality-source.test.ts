import { describe, expect, it, vi } from 'vitest'

// The legality CLI helpers live in an .mjs script outside src so production can run
// them directly with node. TypeScript does not have a declaration file for that script.
// @ts-expect-error test imports runtime script helpers
import { buildSeedSource, selectLegalitySource } from '../../../scripts/scenario-legality-source.mjs'

describe('scenario seed legality source', () => {
  it('uses the seed source only for RO DRAFT/FAILED scenarios without loaded roster rows', () => {
    expect(selectLegalitySource(null, 672, {
      status: 'DRAFT',
      fileType: 'RO',
      loadedRosterCount: 0,
    }).kind).toBe('seed')

    expect(selectLegalitySource(null, 673, {
      status: 'DONE',
      fileType: 'RO',
      loadedRosterCount: 0,
    }).kind).toBe('scenario')

    expect(selectLegalitySource(null, 674, {
      status: 'DRAFT',
      fileType: 'RO',
      loadedRosterCount: 12,
    }).kind).toBe('scenario')
  })

  it('loads 8056 FLY duties from scoped live roster rows for seed scenarios', async () => {
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes('from f8.roster_flight')) {
        expect(values?.[0]).toEqual(['C1'])
        expect(values?.[1]).toEqual([10, 11])
        const hasZoneId = text.includes('zone_id')
        return {
          rows: [
            {
              crew_id: 'C1',
              pairing_id: 10,
              start_secs: 1000,
              end_secs: 2000,
              label: 'P10',
              assignment_group: 'FLY',
              assignment: 'FLY',
              ...(hasZoneId ? { zone_id: 'America/Vancouver' } : {}),
            },
            {
              crew_id: 'C1',
              pairing_id: 11,
              start_secs: 3000,
              end_secs: 4000,
              label: 'P11',
              assignment_group: 'FLY',
              assignment: 'FLY',
              ...(hasZoneId ? { zone_id: 'America/Edmonton' } : {}),
            },
          ],
        }
      }
      return { rows: [] }
    })
    const source = buildSeedSource({ query }, 672, {
      seedCrewIds: ['C1'],
      seedPairingIds: [10, 11],
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    })

    const rows = await source.flyByPairing(['FLY'], [])

    expect(rows).toEqual([
      {
        crew_id: 'C1',
        pairing_id: 10,
        start_secs: '1000',
        end_secs: '2000',
        label: 'P10',
        assignment_group: 'FLY',
        assignment: 'FLY',
        zone_id: 'America/Vancouver',
      },
      {
        crew_id: 'C1',
        pairing_id: 11,
        start_secs: '3000',
        end_secs: '4000',
        label: 'P11',
        assignment_group: 'FLY',
        assignment: 'FLY',
        zone_id: 'America/Edmonton',
      },
    ])
  })

  it('loads effective crew teams for seed scenario crews', async () => {
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes('from f8.crew_team')) {
        expect(values).toEqual(['2026-06-30 00:00:00', '2026-06-01 00:00:00', ['C1', 'C2']])
        expect(text).toContain('ct.eff_dt <= $1::timestamp')
        expect(text).toContain('(ct.exp_dt is null or ct.exp_dt >= $2::timestamp)')
        expect(text).toContain('ct.crew_id = any($3::varchar[])')
        return {
          rows: [
            { crew_id: 'C1', team: 'TEAM1' },
            { crew_id: 'C1', team: 'TEAM2' },
            { crew_id: 'C2', team: 'TEAM2' },
          ],
        }
      }
      return { rows: [] }
    })
    const source = buildSeedSource({ query }, 672, {
      seedCrewIds: ['C1', 'C2'],
      seedPairingIds: [10],
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    })

    const teams = await source.crewTeams()

    expect([...teams.entries()]).toEqual([
      ['C1', ['TEAM1', 'TEAM2']],
      ['C2', ['TEAM2']],
    ])
  })
})
