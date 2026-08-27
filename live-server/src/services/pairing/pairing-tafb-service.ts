import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

type TafbDb = Pick<NodePgDatabase<Record<string, unknown>>, 'execute'>

/**
 * 重算单个 live pairing 的 tafb 为 PBS 口径日历日：
 * Base 当地时区从 brief_start（签到开始）到 debrief_end（签到结束）覆盖的日历日数。
 * 兜底链：sch_str→sch_end 日历日 → duration_days → 1；tafb NOT NULL，最小值 1。
 */
export const refreshPairingTafb = async (
  db: TafbDb,
  pairingId: number,
  updatedBy: string,
): Promise<void> => {
  await db.execute(sql`
    with calculated as (
      select
        p.id,
        greatest(
          1,
          coalesce(
            case
              when base_zone.name is null
                or segment_bounds.brief_start_utc is null
                or segment_bounds.debrief_end_utc is null
              then null
              else (
                ((segment_bounds.debrief_end_utc at time zone 'UTC') at time zone base_zone.name)::date
                - ((segment_bounds.brief_start_utc at time zone 'UTC') at time zone base_zone.name)::date
                + 1
              )::smallint
            end,
            (
              ((p.sch_end_dt_utc at time zone 'UTC') at time zone coalesce(base_zone.name, 'UTC'))::date
              - ((p.sch_str_dt_utc at time zone 'UTC') at time zone coalesce(base_zone.name, 'UTC'))::date
              + 1
            ),
            p.duration_days,
            1
          )
        )::smallint as tafb
      from pairing p
      left join lateral (
        select valid_timezone.name
        from airport base_airport
        join pg_timezone_names valid_timezone
          on valid_timezone.name = nullif(btrim(base_airport.zone_id), '')
        where upper(btrim(base_airport.airport)) = upper(btrim(p.base))
        order by base_airport.id
        limit 1
      ) base_zone on true
      left join lateral (
        select
          min(ps.brief_start_utc) as brief_start_utc,
          max(ps.debrief_end_utc) as debrief_end_utc
        from pairing_segment ps
        where ps.pairing_id = p.id
          and coalesce(ps.is_deleted, 0) = 0
      ) segment_bounds on true
      where p.id = ${pairingId}
    )
    update pairing p
    set
      tafb       = calculated.tafb,
      updated_by = ${updatedBy},
      updated_at = now()
    from calculated
    where calculated.id = p.id
      and p.tafb is distinct from calculated.tafb
  `)
}

/**
 * 批量重算 scenario pairing 的 tafb 为 PBS 口径日历日（UTC 墙钟）：
 * scenario 无 airport/base 时区表，直接用 UTC 日期差（Brief→Debrief 覆盖日历日）。
 * 兜底链：sch_str→sch_end 日历日 → duration_days → 1。
 * 注意：scenario 导入走 raw pg PoolClient.query，因此本函数用 $n 占位符，不走 Drizzle。
 */
export const refreshScenarioPairingsTafb = async (
  db: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  schema: string,
  pairingIds: number[],
  updatedBy: string,
): Promise<void> => {
  if (pairingIds.length === 0) return
  await db.query(
    `
    update ${schema}.pairing p
    set
      tafb       = greatest(
        1,
        coalesce(
          (
            select (max(ps.debrief_end_utc)::date - min(ps.brief_start_utc)::date + 1)
            from ${schema}.pairing_segment ps
            where ps.pairing_id = p.id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.brief_start_utc is not null
              and ps.debrief_end_utc is not null
          ),
          (p.sch_end_dt_utc::date - p.sch_str_dt_utc::date + 1),
          p.duration_days,
          1
        )
      )::smallint,
      updated_by = $2,
      updated_at = now()
    where p.id = any($1::bigint[])
    `,
    [pairingIds, updatedBy],
  )
}
