import type { Pool } from "pg";
import type {
  PbsPairingIdOption,
  PbsPairingIdSearchResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  buildPairingDisplayLabelExpression,
  buildPairingExternalLabelExpression,
} from "./pairing-display-label.js";
import { buildPairingLocalOriginDateExpression, buildUtcTimestampToLocalDateExpression } from "./pairing-local-date-sql.js";

type PairingIdSearchRow = {
  pairing_id: string;
  pairing_label: string;
  start_date: string | null;
  end_date: string | null;
};

type SearchPairingIdOptionsInput = {
  pgPool: Pool;
  schema: string;
  actorBase: string;
  actorRank?: string | null;
  query?: string;
  limit?: number;
  rosterPeriodId: number;
  periodCode: string;
  periodStartDate: string;
  periodEndDate: string;
};

const DEFAULT_PAIRING_ID_SEARCH_LIMIT = 20;
const MAX_PAIRING_ID_SEARCH_LIMIT = 50;

const normalizeSearchQuery = (query?: string) => (query ?? "").trim().toUpperCase();

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

export const clampPairingIdSearchLimit = (limit?: number) => {
  if (!Number.isFinite(limit)) {
    return DEFAULT_PAIRING_ID_SEARCH_LIMIT;
  }

  return Math.min(MAX_PAIRING_ID_SEARCH_LIMIT, Math.max(1, Math.trunc(limit as number)));
};

const buildPairingOptionLabel = (value: string, startDate: string | null, endDate: string | null) => {
  if (!startDate || !endDate) {
    return `${value} (Date unavailable)`;
  }

  return `${value} (${startDate} - ${endDate})`;
};

const mapPairingIdOption = (row: PairingIdSearchRow): PbsPairingIdOption => {
  const pairingLabel = row.pairing_label.trim();

  return {
    value: pairingLabel,
    label: buildPairingOptionLabel(pairingLabel, row.start_date, row.end_date),
    pairingId: row.pairing_id,
    pairingLabel,
    startDate: row.start_date,
    endDate: row.end_date,
  };
};

export const searchPairingIdOptions = async ({
  pgPool,
  schema,
  actorBase,
  actorRank,
  query,
  limit,
  rosterPeriodId,
  periodCode,
  periodStartDate,
  periodEndDate,
}: SearchPairingIdOptionsInput): Promise<PbsPairingIdSearchResponse> => {
  const normalizedQuery = normalizeSearchQuery(query);
  const safeLimit = clampPairingIdSearchLimit(limit);

  if (normalizedQuery.length === 0) {
    return {
      query: normalizedQuery,
      rosterPeriodId,
      periodCode,
      limit: safeLimit,
      options: [],
    };
  }

  const escapedQuery = escapeLikePattern(normalizedQuery);
  const containsPattern = `%${escapedQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const pairingSearchLabelExpression = buildPairingExternalLabelExpression("p");
  const pairingDisplayLabelExpression = buildPairingDisplayLabelExpression("p");
  const queryParams: unknown[] = [containsPattern, normalizedQuery, prefixPattern, actorBase];
  const baseZoneExpression = "base_tz.name";
  const actorRankFilter = actorRank
    ? `and exists (
        select 1
        from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = $${queryParams.push(actorRank)}::varchar
          and pc.is_deleted = 0
      )`
    : "";
  const periodFilter = `and ${buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: baseZoneExpression,
  })} between $${queryParams.push(periodStartDate)}::date and $${queryParams.push(periodEndDate)}::date`;
  const limitPlaceholder = `$${queryParams.push(safeLimit)}`;
  const result = await pgPool.query<PairingIdSearchRow>(
    `
      with matched_pairings as (
        select
          p.id,
          p.id::text as pairing_id,
          ${pairingDisplayLabelExpression} as pairing_label,
          p.sch_str_dt_utc,
          p.duration_days,
          ${baseZoneExpression} as base_zone_id,
          case
            when upper(${pairingSearchLabelExpression}) = $2 then 0
            when upper(${pairingSearchLabelExpression}) like $3 escape '\\' then 1
            else 2
          end as sort_rank
        from ${schema}.pairing p
        left join ${schema}.airport base_airport
          on base_airport.airport = p.base
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        where p.is_deleted = 0
          and base_tz.name is not null
          and p.base = $4::varchar
          and ${pairingSearchLabelExpression} is not null
          and upper(${pairingSearchLabelExpression}) like $1 escape '\\'
          ${actorRankFilter}
          ${periodFilter}
        order by sort_rank asc, p.sch_str_dt_utc desc nulls last, ${pairingDisplayLabelExpression} asc nulls last, p.id asc
        limit ${limitPlaceholder}
      )
      select
        mp.pairing_id,
        mp.pairing_label,
        coalesce(
          ${buildUtcTimestampToLocalDateExpression({
            timestampExpression: "min(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc))",
            zoneExpression: "mp.base_zone_id",
          })}::text,
          ${buildUtcTimestampToLocalDateExpression({
            timestampExpression: "mp.sch_str_dt_utc",
            zoneExpression: "mp.base_zone_id",
          })}::text
        ) as start_date,
        coalesce(
          ${buildUtcTimestampToLocalDateExpression({
            timestampExpression: "max(coalesce(s.debrief_end_utc, s.sch_end_dt_utc))",
            zoneExpression: "mp.base_zone_id",
          })}::text,
          (${buildUtcTimestampToLocalDateExpression({
            timestampExpression: "mp.sch_str_dt_utc",
            zoneExpression: "mp.base_zone_id",
          })} + greatest(coalesce(mp.duration_days, 1), 1) - 1)::text
        ) as end_date
      from matched_pairings mp
      left join ${schema}.pairing_segment s
        on s.pairing_id = mp.id
       and s.is_deleted = 0
      group by mp.id, mp.pairing_id, mp.pairing_label, mp.sch_str_dt_utc, mp.duration_days, mp.base_zone_id, mp.sort_rank
      order by mp.sort_rank asc, start_date desc nulls last, mp.pairing_label asc nulls last, mp.id asc
    `,
    queryParams,
  );

  return {
    query: normalizedQuery,
    rosterPeriodId,
    periodCode,
    limit: safeLimit,
    options: result.rows.map(mapPairingIdOption),
  };
};
