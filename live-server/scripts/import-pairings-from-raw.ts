/**
 * One-shot script: import all F8 pairings from raw JSON files (2026-01-01 – 2026-07-31).
 * Upserts on interface_id — safe to re-run.
 *
 * Usage (from repo root):
 *   cd live-server && npx tsx scripts/import-pairings-from-raw.ts
 */

import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pg from 'pg'

// ── Config ────────────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  throw new Error('DATABASE_URL is required')
}
const DATA_DIR = resolve(__dirname, '../../connector-server/data/raw/f8/pairing')
const FILIALE = 'F8'
const BATCH_SIZE = 200

// ── Rank normalization (mirrors connector-server normalizeRank) ───────────────
const RANK_MAP: Record<string, string> = {
  CAP: 'CA', CAPTAIN: 'CA', 'C/O': 'FO', 'F/O': 'FO', PURSER: 'PU', 'FLIGHT ATTENDANT': 'FA',
}
function normalizeRank(r: string): string {
  const u = r.trim().toUpperCase()
  return RANK_MAP[u] ?? u
}

function normalizeAssignment(a: string): string {
  const u = a.trim().toUpperCase()
  if (u === 'DH' || u === 'DEADHEAD') return 'DH'
  if (u === 'SBY' || u === 'STANDBY') return 'SBY'
  if (u === 'SIM' || u === 'SIMULATOR') return 'SIM'
  return 'FLY'
}

function toIso(v: unknown): string {
  if (!v) return ''
  try { return new Date(String(v).replace(' ', 'T')).toISOString() } catch { return '' }
}
function toInt(v: unknown): number {
  const n = Number(v ?? 0); return Number.isFinite(n) ? Math.trunc(n) : 0
}

// ── Read + deduplicate raw JSON ───────────────────────────────────────────────
console.log(`Reading JSON files from ${DATA_DIR} …`)
const deduped = new Map<string, unknown>()
let filesLoaded = 0

for (const file of readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort()) {
  const data = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'))
  const list: unknown[] = Array.isArray(data) ? data : (data.data ?? data.pairings ?? [])
  for (const p of list) {
    const id = String((p as Record<string, unknown>)['pairingId'] ?? '')
    if (id) deduped.set(id, p)  // later file wins (newer data)
  }
  if (list.length > 0) {
    console.log(`  ${file}: ${list.length} records`)
    filesLoaded++
  }
}
console.log(`\nLoaded ${filesLoaded} files → ${deduped.size} unique pairings (deduped by pairingId)\n`)

// ── Transform ─────────────────────────────────────────────────────────────────
interface CompRecord { rank: string; plan: number }
interface SegRecord {
  segSeq: number; interfaceFltId: string | null; fltNum: string; airline: string
  depArp: string; arvArp: string; fleet: string
  schStrDtUtc: string; schEndDtUtc: string; actStrDtUtc: string; actEndDtUtc: string
  segAssignment: string; isLongTransit: number; fltDt: string | null
}
interface DutyRecord {
  dutySeq: number; strArp: string; endArp: string
  schStrDtUtc: string; schEndDtUtc: string; actStrDtUtc: string; actEndDtUtc: string
  creditedMinutes: number; briefMin: number; debriefMin: number
  fdpDiscretionMin: number; maxFdpMin: number; minRestMin: number; actRestMin: number
  layoverNits: number; planFlightMin: number; planFdpMin: number
  actFlightMin: number; actFdpMin: number; actualDutyMinutes: number; comments: string
  pickupStartUtc?: string; pickupEndUtc?: string
  briefStartUtc?: string; briefEndUtc?: string
  debriefStartUtc?: string; debriefEndUtc?: string
  dropoffStartUtc?: string; dropoffEndUtc?: string
  segments: SegRecord[]
}
interface PairingRecord {
  interfaceId: string; pairingLabel: string | null; base: string; fleet: string
  division: string; assignmentGroup: string; assignment: string; comments: string
  schStrDtUtc: string; schEndDtUtc: string; actStrDtUtc: string; actEndDtUtc: string
  durationDays: number; tafb: number
  perDiemMins: number; perDiemMinsAdjustment: number; fmLhPerDiemMins: number
  wpMins: number; wpMinsAdjustment: number
  duties: DutyRecord[]; compositions: CompRecord[]
}

function getList<T>(obj: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) {
    if (Array.isArray(obj[k])) return obj[k] as T[]
  }
  return []
}

function expandNodes(
  rawNodes: Record<string, unknown>[], strArp: string, endArp: string,
): Partial<DutyRecord> {
  const kinds = new Set(rawNodes.map(n => String(n['node'] ?? '').replace('_', '').trim().toLowerCase()))
  let nodes = rawNodes
  if (kinds.has('checkin') && kinds.has('checkout') && !kinds.has('pickup')) {
    const ci = rawNodes.find(n => String(n['node'] ?? '').toLowerCase().includes('checkin'))!
    const co = rawNodes.find(n => String(n['node'] ?? '').toLowerCase().includes('checkout'))!
    nodes = [
      { node: 'PICKUP', airport: String(ci['airport'] ?? strArp), startUtc: ci['startUtc'], endUtc: ci['startUtc'] },
      { node: 'BRIEF',  airport: String(ci['airport'] ?? strArp), startUtc: ci['startUtc'], endUtc: ci['endUtc'] },
      { node: 'DEBRIEF', airport: String(co['airport'] ?? endArp), startUtc: co['startUtc'], endUtc: co['endUtc'] },
      { node: 'DROPOFF', airport: String(co['airport'] ?? endArp), startUtc: co['endUtc'], endUtc: co['endUtc'] },
    ]
  }
  const r: Partial<DutyRecord> = {}
  for (const n of nodes) {
    const k = String(n['node'] ?? '').replace('_', '').trim().toLowerCase()
    const s = toIso(n['startUtc'])
    const e = toIso(n['endUtc'])
    if (k === 'pickup')  { r.pickupStartUtc = s;  r.pickupEndUtc = e }
    if (k === 'brief')   { r.briefStartUtc = s;   r.briefEndUtc = e }
    if (k === 'debrief') { r.debriefStartUtc = s; r.debriefEndUtc = e }
    if (k === 'dropoff') { r.dropoffStartUtc = s; r.dropoffEndUtc = e }
  }
  return r
}

function transform(raw: unknown[]): PairingRecord[] {
  const result: PairingRecord[] = []
  for (const item of raw) {
    const p = item as Record<string, unknown>
    const id = String(p['pairingId'] ?? '')
    if (!id) continue

    const rawComps = getList<Record<string, unknown>>(p, 'pairingCompositions')
    const compositions: CompRecord[] = rawComps
      .map(c => ({ rank: normalizeRank(String(c['actingRank'] ?? c['acting_rank'] ?? '')), plan: toInt(c['planValue'] ?? c['plan_value'] ?? c['plan']) }))
      .filter(c => c.rank && c.plan > 0)

    const rawDuties = getList<Record<string, unknown>>(p, 'pairingDutyList', 'pairingDuties', 'duties')
    const duties: DutyRecord[] = []

    rawDuties.forEach((duty, di) => {
      const strArp = String(duty['strArp'] ?? duty['str_arp'] ?? '')
      const endArp = String(duty['endArp'] ?? duty['end_arp'] ?? '')
      let dutyActStr = toIso(duty['actStrDtUtc'] ?? duty['act_str_dt_utc'])
      let dutyActEnd = toIso(duty['actEndDtUtc'] ?? duty['act_end_dt_utc'])
      const rawNodes = getList<Record<string, unknown>>(duty, 'pairingDutyNodes', 'nodes')
      const rawSegs  = getList<Record<string, unknown>>(duty, 'pairingDutySegments', 'segments')
      const nodeFields = expandNodes(rawNodes, strArp, endArp)

      // Compute segment times first so we can fall back to them for duty-level times
      const segTimesRaw = rawSegs.map(seg => ({
        str: toIso(seg['actStrDtUtc'] ?? seg['stdUtc']),
        end: toIso(seg['actEndDtUtc'] ?? seg['staUtc']),
      }))
      // Fill duty times from first/last segment if duty-level times are missing
      if (!dutyActStr) dutyActStr = segTimesRaw[0]?.str ?? ''
      if (!dutyActEnd) dutyActEnd = segTimesRaw[segTimesRaw.length - 1]?.end ?? ''

      const segments: SegRecord[] = rawSegs.map((seg, si) => ({
        segSeq: si + 1,
        interfaceFltId: seg['fltId'] ? String(seg['fltId']) : null,
        fltNum: String(seg['fltNum'] ?? ''),
        airline: String(seg['airline'] ?? FILIALE),
        depArp: String(seg['depArp'] ?? seg['dep_arp'] ?? ''),
        arvArp: String(seg['arvArp'] ?? seg['arv_arp'] ?? ''),
        fleet: String(seg['fleet'] ?? ''),
        schStrDtUtc: segTimesRaw[si].str || dutyActStr,
        schEndDtUtc: segTimesRaw[si].end || dutyActEnd,
        actStrDtUtc: toIso(seg['actStrDtUtc']) || dutyActStr,
        actEndDtUtc: toIso(seg['actEndDtUtc']) || dutyActEnd,
        segAssignment: normalizeAssignment(String(seg['assignment'] ?? 'FLY')),
        isLongTransit: toInt(seg['isLongTransit']),
        fltDt: seg['fltDt'] ? String(seg['fltDt']).slice(0, 10) : null,
      }))

      duties.push({
        dutySeq: di + 1, strArp, endArp,
        schStrDtUtc: dutyActStr, schEndDtUtc: dutyActEnd,
        actStrDtUtc: dutyActStr, actEndDtUtc: dutyActEnd,
        creditedMinutes: toInt(duty['creditedMinutes'] ?? duty['credited_minutes']),
        briefMin: toInt(duty['briefMin']), debriefMin: toInt(duty['debriefMin']),
        fdpDiscretionMin: toInt(duty['fdpDiscretionMin']), maxFdpMin: toInt(duty['maxFdpMin']),
        minRestMin: toInt(duty['minRestMin']), actRestMin: toInt(duty['actRestMin']),
        layoverNits: toInt(duty['layoverNits']),
        planFlightMin: toInt(duty['planFlightMin']), planFdpMin: toInt(duty['planFdpMin']),
        actFlightMin: toInt(duty['actFlightMin']), actFdpMin: toInt(duty['actFdpMin']),
        actualDutyMinutes: toInt(duty['actualDutyMinutes']),
        comments: String(duty['comments'] ?? '').slice(0, 255),
        ...nodeFields, segments,
      })
    })

    const schStr = toIso(p['schStrDtUtc']) || duties[0]?.actStrDtUtc || toIso(p['pairingDt'])
    const schEnd = toIso(p['schEndDtUtc']) || duties[duties.length-1]?.actEndDtUtc || schStr
    const computedTafbDays = schStr && schEnd
      ? Math.max(1, Math.floor((new Date(schEnd).getTime() - new Date(schStr).getTime()) / 86_400_000))
      : 1

    const comps = getList<Record<string, unknown>>(p, 'pairingCompositions')
    const hasCabin = comps.some(c => !['CA','FO'].includes(normalizeRank(String(c['actingRank'] ?? ''))))
    const divRaw = String(p['division'] ?? '').trim().toUpperCase().slice(0, 1)
    const division = (divRaw === 'P' || divRaw === 'C') ? divRaw : (hasCabin ? 'C' : 'P')

    result.push({
      interfaceId: id,
      pairingLabel: (p['label'] as string | null) ?? null,
      base: String(p['base'] ?? ''), fleet: String(p['fleet'] ?? ''),
      division, assignmentGroup: String(p['assignmentGroup'] ?? 'FLY'),
      assignment: String(p['assignment'] ?? 'FLY'),
      comments: String(p['comments'] ?? '').slice(0, 120),
      schStrDtUtc: schStr, schEndDtUtc: schEnd,
      actStrDtUtc: toIso(p['actStrDtUtc']) || schStr,
      actEndDtUtc: toIso(p['actEndDtUtc']) || schEnd,
      durationDays: toInt(p['durationDays']) || computedTafbDays,
      tafb: toInt(p['durationDays']) || computedTafbDays,
      perDiemMins: toInt(p['perDiemMins']), perDiemMinsAdjustment: toInt(p['perDiemMinsAdjustment']),
      fmLhPerDiemMins: toInt(p['fmLhPerDiemMins']),
      wpMins: toInt(p['wpMins']), wpMinsAdjustment: toInt(p['wpMinsAdjustment']),
      duties, compositions,
    })
  }
  return result
}

// ── DB Import ─────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: DB_URL, max: 5 })

async function importBatch(records: PairingRecord[]): Promise<{ imported: number; errors: { id: string; reason: string }[] }> {
  const { rows: fltRows } = await pool.query<{ id: number; interface_flt_id: string }>(
    `SELECT id, interface_flt_id FROM flight WHERE interface_flt_id IS NOT NULL`
  )
  const fltMap = new Map<string, number>(fltRows.map(r => [r.interface_flt_id, r.id]))

  const client = await pool.connect()
  let imported = 0
  const errors: { id: string; reason: string }[] = []

  try {
    await client.query('BEGIN')
    for (const p of records) {
      try {
        await client.query('SAVEPOINT pair_sp')

        const { rows: [{ id: pairingId }] } = await client.query<{ id: number }>(`
          INSERT INTO pairing (
            pairing_label, filiale, division, base, fleet,
            assignment_group, assignment,
            sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
            duration_days, tafb, duty_count, seg_count, comments,
            per_diem_mins, per_diem_mins_adjustment,
            wp_mins, wp_mins_adjustment, fm_lh_per_diem_mins,
            source, interface_id, created_by, updated_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'F8_IMPORT','F8_IMPORT')
          ON CONFLICT (interface_id) WHERE interface_id IS NOT NULL
          DO UPDATE SET
            pairing_label  = EXCLUDED.pairing_label,
            base           = EXCLUDED.base, fleet = EXCLUDED.fleet,
            sch_str_dt_utc = EXCLUDED.sch_str_dt_utc, sch_end_dt_utc = EXCLUDED.sch_end_dt_utc,
            act_str_dt_utc = EXCLUDED.act_str_dt_utc, act_end_dt_utc = EXCLUDED.act_end_dt_utc,
            duration_days  = EXCLUDED.duration_days, duty_count = EXCLUDED.duty_count,
            seg_count = EXCLUDED.seg_count, comments = EXCLUDED.comments,
            per_diem_mins = EXCLUDED.per_diem_mins,
            per_diem_mins_adjustment = EXCLUDED.per_diem_mins_adjustment,
            wp_mins = EXCLUDED.wp_mins, wp_mins_adjustment = EXCLUDED.wp_mins_adjustment,
            fm_lh_per_diem_mins = EXCLUDED.fm_lh_per_diem_mins,
            updated_by = 'F8_IMPORT', updated_at = now()
          RETURNING id`,
          [
            p.pairingLabel, FILIALE, p.division, p.base, p.fleet,
            p.assignmentGroup, p.assignment,
            p.schStrDtUtc || null, p.schEndDtUtc || null,
            p.actStrDtUtc || null, p.actEndDtUtc || null,
            p.durationDays, p.tafb,
            p.duties.length,
            p.duties.reduce((s, d) => s + d.segments.length, 0),
            p.comments,
            p.perDiemMins, p.perDiemMinsAdjustment,
            p.wpMins, p.wpMinsAdjustment, p.fmLhPerDiemMins,
            'F8', p.interfaceId,
          ]
        )

        await client.query('DELETE FROM pairing_segment WHERE pairing_id = $1', [pairingId])

        for (const duty of p.duties) {
          for (const seg of duty.segments) {
            const fltId = seg.interfaceFltId ? (fltMap.get(seg.interfaceFltId) ?? null) : null
            await client.query(`
              INSERT INTO pairing_segment (
                pairing_id, duty_seq, seg_seq,
                duty_str_arp, duty_end_arp,
                duty_sch_str_dt_utc, duty_sch_end_dt_utc,
                duty_act_str_dt_utc, duty_act_end_dt_utc,
                duty_acc_state,
                duty_fdp_discretion_min, duty_max_fdp_min,
                duty_sch_rest_min, duty_act_rest_min, duty_layover_nits,
                duty_sch_flt_min, duty_sch_fdp_min,
                duty_act_flt_min, duty_act_fdp_min, duty_act_duty_min,
                duty_act_credited_minutes, duty_brief_min, duty_debrief_min, duty_comments,
                pickup_start_utc, pickup_end_utc,
                brief_start_utc, brief_end_utc,
                debrief_start_utc, debrief_end_utc,
                dropoff_start_utc, dropoff_end_utc,
                flt_id, flt_num, flt_dt, airline, dep_arp, arv_arp, fleet_seg,
                sch_str_dt_utc, sch_end_dt_utc,
                act_str_dt_utc, act_end_dt_utc,
                seg_assignment, is_long_transit,
                created_by, updated_by
              ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,'D',
                $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
                $24,$25,$26,$27,$28,$29,$30,$31,
                $32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,
                'F8_IMPORT','F8_IMPORT'
              )`,
              [
                pairingId, duty.dutySeq, seg.segSeq,
                duty.strArp, duty.endArp,
                duty.schStrDtUtc || null, duty.schEndDtUtc || null,
                duty.actStrDtUtc || null, duty.actEndDtUtc || null,
                duty.fdpDiscretionMin, duty.maxFdpMin,
                duty.minRestMin, duty.actRestMin, duty.layoverNits,
                duty.planFlightMin, duty.planFdpMin,
                duty.actFlightMin, duty.actFdpMin, duty.actualDutyMinutes,
                duty.creditedMinutes, duty.briefMin, duty.debriefMin, duty.comments,
                duty.pickupStartUtc || null, duty.pickupEndUtc || null,
                duty.briefStartUtc || null, duty.briefEndUtc || null,
                duty.debriefStartUtc || null, duty.debriefEndUtc || null,
                duty.dropoffStartUtc || null, duty.dropoffEndUtc || null,
                fltId, seg.fltNum, seg.fltDt || null, seg.airline,
                seg.depArp, seg.arvArp, seg.fleet,
                seg.schStrDtUtc || null, seg.schEndDtUtc || null,
                seg.actStrDtUtc || null, seg.actEndDtUtc || null,
                seg.segAssignment, seg.isLongTransit,
              ]
            )
          }
        }

        await client.query('DELETE FROM pairing_composition WHERE pairing_id = $1', [pairingId])
        for (const comp of p.compositions) {
          await client.query(`
            INSERT INTO pairing_composition (pairing_id, division, acting_rank, plan, is_deleted, created_by, updated_by)
            VALUES ($1,$2,$3,$4,0,'F8_IMPORT','F8_IMPORT')`,
            [pairingId, p.division, comp.rank, comp.plan]
          )
        }

        await client.query('RELEASE SAVEPOINT pair_sp')
        imported++
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT pair_sp')
        errors.push({ id: p.interfaceId, reason: err instanceof Error ? err.message : String(err) })
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return { imported, errors }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const records = transform([...deduped.values()])
  console.log(`Transformed ${records.length} PairingImportRecords`)
  console.log(`Pairings with compositions: ${records.filter(r => r.compositions.length > 0).length}`)
  console.log(`Total segments: ${records.reduce((s, r) => s + r.duties.reduce((ds, d) => ds + d.segments.length, 0), 0)}\n`)

  let totalImported = 0
  let totalErrors = 0
  const batches = Math.ceil(records.length / BATCH_SIZE)

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const batch = records.slice(i, i + BATCH_SIZE)
    process.stdout.write(`Batch ${batchNum}/${batches} (${batch.length} records) … `)
    const { imported, errors } = await importBatch(batch)
    totalImported += imported
    totalErrors += errors.length
    console.log(`imported ${imported}, errors ${errors.length}`)
    if (errors.length > 0) {
      for (const e of errors.slice(0, 3)) console.error(`  ✗ ${e.id}: ${e.reason}`)
      if (errors.length > 3) console.error(`  … and ${errors.length - 3} more`)
    }
  }

  // Refresh flight_composition.fill for all flights after bulk insert
  console.log('\nRefreshing flight_composition.fill …')
  await pool.query(`
    UPDATE flight_composition fc
    SET fill = (
      SELECT COALESCE(SUM(pc.plan), 0)
      FROM   pairing_composition pc
      JOIN   pairing_segment     ps ON ps.pairing_id = pc.pairing_id
      WHERE  ps.flt_id      = fc.flt_id
        AND  pc.acting_rank = fc.acting_rank
        AND  pc.is_deleted  = 0
    ),
    updated_at = now(), updated_by = 'F8_IMPORT'
  `)
  console.log('Done.')

  await pool.end()
  console.log(`\n✅ Import complete — imported: ${totalImported}, errors: ${totalErrors}`)
}

main().catch(err => { console.error(err); process.exit(1) })
