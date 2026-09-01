/**
 * Pairing build-rule audit — validates every MANUAL pairing against ALL pairing build rules.
 *
 * Ryan (2026-08-31): "think about a way to validate all pairing build rules we have setup,
 * i suspect there might be more violation." This is that validator. Run it any time; it exits
 * non-zero when any rule is violated, so it can gate CI or a repair loop.
 *
 * Scope: pairing.source='MANUAL' only. Imported source='F8' pairings use a different rest model
 * (rest_min 600, multi-day) and are NOT built by our builder — never audit or recut them here.
 *
 * Rules (the full set the builder must respect):
 *   A  base-loop        first dep_arp === pairing.base AND last arv_arp === pairing.base (#150497)
 *   B  rest floor       every duty-boundary ground gap >= REST_FLOOR_MIN (720) (#150707)
 *   C  block cap        a duty with >1 segment has total block <= MAX_DUTY_BLOCK_MIN (480) (#150717)
 *                       (single-segment long-haul duties are exempt — augmented-crew ops)
 *   D  continuity       within a duty, next seg's dep_arp === prev seg's arv_arp
 *   E  unique coverage  no flight welded into more than one MANUAL pairing
 *   F  no time overlap  within a pairing, ordered segments never overlap in time
 *
 * Usage (from live-server/, so .env + node_modules resolve):
 *   node scripts/audit-pairing-build-rules.mjs            # summary + up to 20 rows per rule
 *   node scripts/audit-pairing-build-rules.mjs --json     # machine-readable full output
 */
import 'dotenv/config'
import pg from 'pg'

const REST_FLOOR_MIN = 720
const MAX_DUTY_BLOCK_MIN = 480
const JSON_MODE = process.argv.includes('--json')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

/** All checks share this base: MANUAL pairings + their segments joined to flights. */
const MAN_SEGS = `
  man as (select id, base from pairing where source='MANUAL' and is_deleted=0),
  seg as (
    select ps.pairing_id, man.base, ps.duty_seq, ps.seg_seq, ps.dep_arp, ps.arv_arp,
           ps.sch_str_dt_utc, ps.sch_end_dt_utc, ps.flt_id, f.flt_num, f.blk_min,
           row_number() over (partition by ps.pairing_id order by ps.duty_seq, ps.seg_seq) rn,
           count(*)     over (partition by ps.pairing_id) n
    from pairing_segment ps
    join man on man.id = ps.pairing_id
    join flight f on f.id = ps.flt_id)`

const RULES = [
  {
    code: 'A',
    name: 'base-loop (first dep and last arv = pairing.base)',
    sql: `with ${MAN_SEGS}
      select m.id pairing_id, m.base, f.dep_arp first_dep, l.arv_arp last_arv
      from man m
      join seg f on f.pairing_id = m.id and f.rn = 1
      join seg l on l.pairing_id = m.id and l.rn = l.n
      where f.dep_arp <> m.base or l.arv_arp <> m.base
      order by m.id`,
  },
  {
    code: 'B',
    name: `rest floor (duty-boundary gap >= ${REST_FLOOR_MIN}min)`,
    sql: `with ${MAN_SEGS},
      duty as (select pairing_id, duty_seq, min(sch_str_dt_utc) dep, max(sch_end_dt_utc) arv
               from seg group by pairing_id, duty_seq),
      bnd as (select d.*, lead(d.dep) over (partition by d.pairing_id order by d.duty_seq) next_dep
              from duty d)
      select pairing_id, duty_seq, round(extract(epoch from (next_dep - arv)) / 60) gap_min
      from bnd
      where next_dep is not null and extract(epoch from (next_dep - arv)) / 60 < ${REST_FLOOR_MIN}
      order by pairing_id, duty_seq`,
  },
  {
    code: 'C',
    name: `block cap (multi-seg duty block <= ${MAX_DUTY_BLOCK_MIN}min)`,
    sql: `with ${MAN_SEGS}
      select pairing_id, duty_seq, count(*) legs, sum(blk_min) blk_sum,
             string_agg(flt_num || ' ' || dep_arp || '-' || arv_arp, ',' order by seg_seq) route
      from seg group by pairing_id, duty_seq
      having count(*) > 1 and sum(blk_min) > ${MAX_DUTY_BLOCK_MIN}
      order by sum(blk_min) desc`,
  },
  {
    code: 'D',
    name: 'station continuity within a duty',
    sql: `with ${MAN_SEGS},
      nxt as (select *,
        lead(dep_arp)   over (partition by pairing_id order by duty_seq, seg_seq) next_dep,
        lead(duty_seq)  over (partition by pairing_id order by duty_seq, seg_seq) next_duty
        from seg)
      select pairing_id, duty_seq, flt_num, arv_arp, next_dep
      from nxt
      where next_dep is not null and next_duty = duty_seq and next_dep <> arv_arp
      order by pairing_id`,
  },
  {
    code: 'E',
    name: 'unique coverage (flight in exactly one MANUAL pairing)',
    sql: `with ${MAN_SEGS}
      select flt_id, min(flt_num) flt_num, count(distinct pairing_id) pairings,
             array_agg(distinct pairing_id) pairing_ids
      from seg group by flt_id having count(distinct pairing_id) > 1
      order by flt_id`,
  },
  {
    code: 'F',
    name: 'no time overlap between consecutive segments',
    sql: `with ${MAN_SEGS},
      nxt as (select *,
        lead(sch_str_dt_utc) over (partition by pairing_id order by duty_seq, seg_seq) next_dep_dt,
        lead(flt_num)        over (partition by pairing_id order by duty_seq, seg_seq) next_flt
        from seg)
      select pairing_id, flt_num, next_flt,
             to_char(sch_end_dt_utc, 'MM-DD HH24:MI') arv,
             to_char(next_dep_dt,    'MM-DD HH24:MI') next_dep
      from nxt
      where next_dep_dt is not null and next_dep_dt < sch_end_dt_utc
      order by pairing_id`,
  },
]

const results = []
for (const rule of RULES) {
  const { rows } = await client.query(rule.sql)
  results.push({ code: rule.code, name: rule.name, violations: rows.length, rows })
}
await client.end()

const total = results.reduce((n, r) => n + r.violations, 0)
if (JSON_MODE) {
  console.log(JSON.stringify({ total, rules: results }, null, 2))
} else {
  console.log('=== Pairing build-rule audit (source=MANUAL) ===')
  for (const r of results) {
    console.log(`Rule ${r.code} — ${r.name}: ${r.violations === 0 ? 'PASS' : `${r.violations} VIOLATIONS`}`)
    for (const row of r.rows.slice(0, 20)) console.log('   ', JSON.stringify(row))
    if (r.rows.length > 20) console.log(`    … and ${r.rows.length - 20} more`)
  }
  console.log(total === 0 ? '\nALL RULES PASS' : `\nTOTAL VIOLATIONS: ${total}`)
}
process.exit(total === 0 ? 0 : 1)
