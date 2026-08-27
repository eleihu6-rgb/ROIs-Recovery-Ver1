import type { Pool } from "pg";
import type {
  PbsPairingDateOccurrencesResponse,
  PbsPairingOccurrence,
  PbsPairingOccurrencesResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import { isIsoDateInRange, isValidIsoDate } from "../lineholder/date-utils.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import { buildPairingDisplayLabelExpression } from "./pairing-display-label.js";
import { isStablePairingId, normalizeStablePairingIds } from "./pairing-id-utils.js";
import { buildUtcTimestampToLocalDateExpression } from "./pairing-local-date-sql.js";

type PairingOccurrenceRow = {
  pairing_id: string;
  pairing_label: string | null;
  origin_date: string | null;
  start_date: string | null;
  end_date: string | null;
  start_local: string | null;
  end_local: string | null;
};

type SearchPairingOccurrencesInput = {
  pgPool: Pool;
  schema: string;
  actorBase: string;
  actorRank?: string | null;
  pairingId: string;
  rosterPeriodId: number;
  periodCode: string;
  periodStartDate: string;
  periodEndDate: string;
};

type SearchPairingOccurrencesByDateInput = {
  pgPool: Pool;
  schema: string;
  actorBase: string;
  actorRank?: string | null;
  originDate: string;
  rosterPeriodId: number;
  periodCode: string;
  periodStartDate: string;
  periodEndDate: string;
};

type LoadPairingOccurrencesInput = {
  pgPool: Pool;
  schema: string;
  pairingIds: string[];
  periodStartDate: string;
  periodEndDate: string;
  actorBase?: string;
  actorRank?: string | null;
};

const buildOccurrenceLabel = (pairingNumber: string, originDate: string) =>
  `${pairingNumber} · ${originDate}`;

const mapOccurrenceRow = (row: PairingOccurrenceRow): PbsPairingOccurrence | null => {
  if (!row.origin_date || !row.start_date || !row.end_date) {
    return null;
  }

  const pairingNumber = row.pairing_label?.trim() || row.pairing_id;

  return {
    occurrenceId: `${row.pairing_id}:${row.origin_date}`,
    pairingNumber,
    pairingId: row.pairing_id,
    originDate: row.origin_date,
    startDate: row.start_date,
    endDate: row.end_date,
    ...(row.start_local && row.end_local
      ? { startLocal: row.start_local, endLocal: row.end_local }
      : {}),
    label: buildOccurrenceLabel(pairingNumber, row.origin_date),
  };
};

const mapOccurrenceRowByDate = (row: PairingOccurrenceRow): PbsPairingOccurrence | null => {
  if (!row.origin_date || !row.start_date || !row.end_date) {
    return null;
  }

  const pairingNumber = row.pairing_label?.trim();

  if (!pairingNumber) {
    return null;
  }

  return {
    occurrenceId: `${row.pairing_id}:${row.origin_date}`,
    pairingNumber,
    pairingId: row.pairing_id,
    originDate: row.origin_date,
    startDate: row.start_date,
    endDate: row.end_date,
    ...(row.start_local && row.end_local
      ? { startLocal: row.start_local, endLocal: row.end_local }
      : {}),
    label: buildOccurrenceLabel(pairingNumber, row.origin_date),
  };
};

export const loadPairingOccurrences = async ({
  pgPool,
  schema,
  pairingIds,
  periodStartDate,
  periodEndDate,
  actorBase,
  actorRank,
}: LoadPairingOccurrencesInput): Promise<Map<string, PbsPairingOccurrence[]>> => {
  const normalizedPairingIds = normalizeStablePairingIds(pairingIds);

  if (normalizedPairingIds.length === 0) {
    return new Map();
  }

  const queryParams: unknown[] = actorBase
    ? [normalizedPairingIds, actorBase, periodStartDate, periodEndDate]
    : [normalizedPairingIds, periodStartDate, periodEndDate];
  const actorBaseFilter = actorBase
    ? "and p.base = $2::varchar"
    : "";
  const startDatePlaceholder = actorBase ? "$3" : "$2";
  const endDatePlaceholder = actorBase ? "$4" : "$3";
  const actorRankFilter = actorBase && actorRank
    ? `and exists (
        select 1
        from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = $${queryParams.push(actorRank)}::varchar
          and pc.is_deleted = 0
      )`
    : "";
  const pairingDisplayLabelExpression = buildPairingDisplayLabelExpression("p");
  const result = await pgPool.query<PairingOccurrenceRow>(
    `
      with matched_pairings as (
        select
          p.id,
          p.id::text as pairing_id,
          ${pairingDisplayLabelExpression} as pairing_label,
          base_tz.name as zone_id,
          coalesce(
            (
              select min(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc))
              from ${schema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            ),
            p.sch_str_dt_utc
          ) as start_utc,
          coalesce(
            (
              select max(coalesce(s.debrief_end_utc, s.sch_end_dt_utc))
              from ${schema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            ),
            p.sch_end_dt_utc,
            p.sch_str_dt_utc + (greatest(coalesce(p.duration_days, 1), 1) - 1) * interval '1 day'
          ) as end_utc
        from ${schema}.pairing p
        join ${schema}.airport base_airport
          on upper(btrim(base_airport.airport)) = upper(btrim(p.base))
        join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        where p.is_deleted = 0
          and p.id = any($1::bigint[])
          ${actorBaseFilter}
          ${actorRankFilter}
      )
      select
        pairing_id,
        pairing_label,
        ${buildUtcTimestampToLocalDateExpression({
          timestampExpression: "start_utc",
          zoneExpression: "zone_id",
        })}::text as origin_date,
        ${buildUtcTimestampToLocalDateExpression({
          timestampExpression: "start_utc",
          zoneExpression: "zone_id",
        })}::text as start_date,
        ${buildUtcTimestampToLocalDateExpression({
          timestampExpression: "end_utc",
          zoneExpression: "zone_id",
        })}::text as end_date,
        to_char(start_utc at time zone zone_id, 'YYYY-MM-DD"T"HH24:MI:SS') as start_local,
        to_char(end_utc at time zone zone_id, 'YYYY-MM-DD"T"HH24:MI:SS') as end_local
      from matched_pairings
      where ${buildUtcTimestampToLocalDateExpression({
        timestampExpression: "start_utc",
        zoneExpression: "zone_id",
      })} between ${startDatePlaceholder}::date and ${endDatePlaceholder}::date
      order by origin_date asc, pairing_id asc
    `,
    queryParams,
  );

  const occurrencesByPairingId = new Map<string, PbsPairingOccurrence[]>(
    normalizedPairingIds.map((pairingId) => [pairingId, []]),
  );

  for (const row of result.rows) {
    const occurrence = mapOccurrenceRow(row);

    if (occurrence) {
      const key = occurrencesByPairingId.has(row.pairing_id) ? row.pairing_id : undefined;

      if (key) {
        occurrencesByPairingId.get(key)!.push(occurrence);
      }
    }
  }

  return occurrencesByPairingId;
};

export const searchPairingOccurrences = async ({
  pgPool,
  schema,
  actorBase,
  actorRank,
  pairingId,
  rosterPeriodId,
  periodCode,
  periodStartDate,
  periodEndDate,
}: SearchPairingOccurrencesInput): Promise<PbsPairingOccurrencesResponse> => {
  const normalizedPairingId = pairingId.trim();

  if (!isStablePairingId(normalizedPairingId)) {
    throw new LineholderBidServiceError(400, "A valid Pairing ID is required.");
  }

  const occurrencesByPairingId = await loadPairingOccurrences({
    pgPool,
    schema,
    pairingIds: [normalizedPairingId],
    periodStartDate,
    periodEndDate,
    actorBase,
    actorRank,
  });
  const occurrences = occurrencesByPairingId.get(normalizedPairingId) ?? [];
  const firstOccurrence = occurrences[0];

  return {
    pairingNumber: firstOccurrence?.pairingNumber ?? normalizedPairingId,
    rosterPeriodId,
    periodCode: periodCode.trim(),
    occurrences,
  };
};

export const searchPairingOccurrencesByDate = async ({
  pgPool,
  schema,
  actorBase,
  actorRank,
  originDate,
  rosterPeriodId,
  periodCode,
  periodStartDate,
  periodEndDate,
}: SearchPairingOccurrencesByDateInput): Promise<PbsPairingDateOccurrencesResponse> => {
  const normalizedOriginDate = originDate.trim();

  if (!isValidIsoDate(normalizedOriginDate)) {
    throw new LineholderBidServiceError(400, "A valid origin date is required.");
  }

  if (!isIsoDateInRange(normalizedOriginDate, periodStartDate, periodEndDate)) {
    throw new LineholderBidServiceError(
      400,
      "The origin date must be inside the selected roster period.",
      "DATE_OUTSIDE_ROSTER_PERIOD",
    );
  }

  const pairingDisplayLabelExpression = buildPairingDisplayLabelExpression("p");
  const queryParams: unknown[] = [actorBase, periodStartDate, periodEndDate, normalizedOriginDate];
  const actorRankFilter = actorRank
    ? `and exists (
        select 1
        from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = $${queryParams.push(actorRank)}::varchar
          and pc.is_deleted = 0
      )`
    : "";
  const result = await pgPool.query<PairingOccurrenceRow>(
    `
      with matched_pairings as (
        select
          p.id,
          p.id::text as pairing_id,
          ${pairingDisplayLabelExpression} as pairing_label,
          base_tz.name as zone_id,
          coalesce(
            (
              select min(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc))
              from ${schema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            ),
            p.sch_str_dt_utc
          ) as start_utc,
          coalesce(
            (
              select max(coalesce(s.debrief_end_utc, s.sch_end_dt_utc))
              from ${schema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            ),
            p.sch_end_dt_utc,
            p.sch_str_dt_utc + (greatest(coalesce(p.duration_days, 1), 1) - 1) * interval '1 day'
          ) as end_utc
        from ${schema}.pairing p
        join ${schema}.airport base_airport
          on upper(btrim(base_airport.airport)) = upper(btrim(p.base))
        join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        where p.is_deleted = 0
          and p.base = $1::varchar
          and ${pairingDisplayLabelExpression} is not null
          ${actorRankFilter}
      )
      select
        pairing_id,
        pairing_label,
        ${buildUtcTimestampToLocalDateExpression({
          timestampExpression: "start_utc",
          zoneExpression: "zone_id",
        })}::text as origin_date,
        ${buildUtcTimestampToLocalDateExpression({
          timestampExpression: "start_utc",
          zoneExpression: "zone_id",
        })}::text as start_date,
        ${buildUtcTimestampToLocalDateExpression({
          timestampExpression: "end_utc",
          zoneExpression: "zone_id",
        })}::text as end_date,
        to_char(start_utc at time zone zone_id, 'YYYY-MM-DD"T"HH24:MI:SS') as start_local,
        to_char(end_utc at time zone zone_id, 'YYYY-MM-DD"T"HH24:MI:SS') as end_local
      from matched_pairings
      where ${buildUtcTimestampToLocalDateExpression({
        timestampExpression: "start_utc",
        zoneExpression: "zone_id",
      })} between $2::date and $3::date
        and ${buildUtcTimestampToLocalDateExpression({
          timestampExpression: "start_utc",
          zoneExpression: "zone_id",
        })} = $4::date
      order by pairing_label asc nulls last, pairing_id asc
    `,
    queryParams,
  );

  return {
    originDate: normalizedOriginDate,
    rosterPeriodId,
    periodCode: periodCode.trim(),
    occurrences: result.rows
      .map(mapOccurrenceRowByDate)
      .filter((occurrence): occurrence is PbsPairingOccurrence => occurrence !== null),
  };
};
