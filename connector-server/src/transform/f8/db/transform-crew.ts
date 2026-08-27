import type {
  CrewImportRecord, CrewRankRecord,
} from '../../../types/import-jobs.js'
import { normalizeRank } from './normalize.js'

type Raw = Record<string, unknown>

const FAR_PAST = new Date('0001-01-01T00:00:00Z').getTime()
const FAR_FUTURE = new Date('9999-12-31T23:59:59Z').getTime()

const str = (v: unknown): string => (v === null || v === undefined) ? '' : String(v)

const toIso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  const t = new Date(String(v).replace(' ', 'T'))
  return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

const toMs = (v: unknown, def: number): number => {
  if (v === null || v === undefined || v === '') return def
  const t = new Date(String(v).replace(' ', 'T')).getTime()
  return Number.isFinite(t) ? t : def
}

const up = (v: unknown): string => str(v).trim().toUpperCase()

const normGender = (g: unknown): string => {
  const c = str(g).trim().charAt(0).toUpperCase()
  return c === 'M' || c === 'F' ? c : 'U'
}

const parseSeniority = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  // crew.seniority_num is numeric(10,2) → max 99999999.99.
  if (!Number.isFinite(n) || n < 0 || n > 99999999.99) return null
  return n
}

const DECK = new Set(['CA', 'FO'])
const CABIN = new Set(['IFD', 'FA'])

/** Division from ranks sharing the max effDt: deck (CA/FO)→P, cabin (IFD/FA)→C. */
function deriveDivision(ranks: Raw[]): string {
  if (ranks.length === 0) return 'P'
  const maxEff = Math.max(...ranks.map(r => toMs(r['effDt'], FAR_PAST)))
  const codes = new Set<string>()
  for (const r of ranks) {
    if (toMs(r['effDt'], FAR_PAST) === maxEff) {
      const rk = up(r['rank'])
      if (rk) codes.add(rk)
    }
  }
  for (const c of codes) if (DECK.has(c)) return 'P'
  for (const c of codes) if (CABIN.has(c)) return 'C'
  return 'P'
}

const bounds = (r: Raw): [number, number] | null => {
  const e = toMs(r['effDt'], FAR_PAST)
  const x = toMs(r['expDt'], FAR_FUTURE)
  return e > x ? null : [e, x]
}
const overlaps = (a: [number, number], b: [number, number]): boolean =>
  Math.max(a[0], b[0]) <= Math.min(a[1], b[1])

/** Drop FO rows overlapping any CA, and FA rows overlapping any IFD. */
function applyOverlapRules(ranks: Raw[]): Raw[] {
  const ivs = (code: string) =>
    ranks.filter(r => up(r['rank']) === code).map(bounds).filter((x): x is [number, number] => x !== null)
  const caIvs = ivs('CA')
  const ifdIvs = ivs('IFD')
  return ranks.filter(r => {
    const rk = up(r['rank'])
    const iv = bounds(r)
    if (!iv) return true
    if (rk === 'FO' && caIvs.some(c => overlaps(iv, c))) return false
    if (rk === 'FA' && ifdIvs.some(z => overlaps(iv, z))) return false
    return true
  })
}

/** effDt ascending; same effDt → deck before cabin; among deck → CA before FO. */
function sortRanks(ranks: Raw[]): Raw[] {
  const line = (rk: string) => (rk === 'CA' ? 2 : rk === 'FO' ? 1 : 0)
  return [...ranks].sort((a, b) => {
    const ea = toMs(a['effDt'], FAR_PAST), eb = toMs(b['effDt'], FAR_PAST)
    if (ea !== eb) return ea - eb
    const da = DECK.has(up(a['rank'])) ? 1 : 0
    const db = DECK.has(up(b['rank'])) ? 1 : 0
    if (da !== db) return db - da
    return line(up(b['rank'])) - line(up(a['rank']))
  })
}

const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])

export function transformF8Crew(raw: unknown[], filiale: string): CrewImportRecord[] {
  const records: CrewImportRecord[] = []

  for (const item of raw) {
    const c = item as Raw
    // crewId may be number or string; skip only when truly absent.
    if (c['crewId'] === null || c['crewId'] === undefined || String(c['crewId']).trim() === '') continue

    // Normalize ranks first; division uses ALL ranks, crew_rank/status use overlap-filtered + sorted.
    const normRanks = arr(c['ranks']).map(r => ({ ...r, rank: normalizeRank(str(r['rank'])) }))
    const division = deriveDivision(normRanks)
    const tableRanks: CrewRankRecord[] = sortRanks(applyOverlapRules(normRanks))
      .map(r => ({ rank: str(r['rank']).slice(0, 10), effDt: toIso(r['effDt']), expDt: toIso(r['expDt']) }))
      .filter(r => r.effDt !== null && r.rank !== '')

    records.push({
      crewId: String(c['crewId']).slice(0, 30),
      interfaceId: String(c['crewId']).slice(0, 40),
      firstName: str(c['firstName']).slice(0, 100),
      middleName: str(c['middleName']).slice(0, 100),
      lastName: str(c['lastName']).slice(0, 100),
      preferredName: str(c['nickName']).slice(0, 100),
      gender: normGender(c['gender']),
      birthday: toIso(c['birthday']),
      seniorityNum: parseSeniority(c['seniorityNum']),
      homeAddress: str(c['homeAddress']).slice(0, 500),
      tel: str(c['telephone']).slice(0, 100),
      email: str(c['workEmail']).slice(0, 100),
      contractType: str(c['contractType']).slice(0, 40),
      emplDt: toIso(c['joinDate']),
      division,
      filiale,
      bases: arr(c['bases'])
        .map(b => ({ base: str(b['base']).slice(0, 3), effDt: toIso(b['effDt']), expDt: toIso(b['expDt']), isPrimary: !!b['isPrimary'] }))
        .filter(b => b.base !== '' && b.effDt !== null),
      ranks: tableRanks,
      certificates: arr(c['certificates'])
        .filter(x => str(x['certificate']) !== '')
        .map(x => ({
          certificate: str(x['certificate']).slice(0, 20),
          effDt: toIso(x['effDt']) ?? '1970-01-01T00:00:00.000Z',
          expDt: toIso(x['expDt']),
          isValid: !!x['isValid'],
          firstName: str(x['firstName']).slice(0, 50),
          middleName: str(x['middleName']).slice(0, 50),
          lastName: str(x['lastName']).slice(0, 50),
        })),
      fleets: arr(c['fleets'])
        .map(f => ({ fleet: up(f['fleet']).slice(0, 20), effDt: toIso(f['effDt']), expDt: toIso(f['expDt']) }))
        .filter(f => f.fleet !== '' && f.effDt !== null),
      qualifications: arr(c['qualifications'])
        .map(q => ({ qualification: str(q['qualification']).slice(0, 20), effDt: toIso(q['effDt']), expDt: toIso(q['expDt']), isValid: q['isValid'] !== false }))
        .filter(q => q.qualification !== '' && q.effDt !== null),
      teams: arr(c['teams'])
        .map(t => ({
          team: str(t['teamId']).slice(0, 50),
          effDt: toIso(t['effDt']),
          expDt: toIso(t['expDt']),
          isValid: t['isValid'] !== false,
          remarks: str(t['teamName']).slice(0, 512),
        }))
        .filter(t => t.team !== '' && t.effDt !== null),
    })
  }

  return records
}
