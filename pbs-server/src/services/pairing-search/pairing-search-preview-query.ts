import type { Pool } from "pg";
import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type {
  PbsPairingDetailsRequest,
  PbsPairingDetailsResponse,
  PbsPairingSearchPreviewProperty,
  PbsSearchPairingsPreviewFilters,
  PbsSearchPairingsPreviewResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";
import type { PbsPairingFeedbackBatchItem } from "./types.js";
import {
  buildPairingDisplayLabelExpression,
  buildPairingExternalLabelExpression,
} from "./pairing-display-label.js";
import {
  formatUtcTimestampSql,
  mapPairingResult,
  type PairingSegmentRow,
  type PairingSummaryRow,
} from "./pairing-search-preview-mapper.js";
import {
  buildPairingLocalOriginDateExpression,
  buildPairingStartUtcExpression,
  buildUtcTimestampToLocalDateExpression,
  buildUtcTimestampToLocalTimeExpression,
} from "./pairing-local-date-sql.js";
import { buildPairingCreditMinutesExpression } from "./pairing-credit-sql.js";
import { buildRedeyePairingWindowCondition } from "./pairing-search-redeye-condition.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";

type PairingSummaryPageRow = {
  total_items: string;
  pairing_id_count: string;
  id: string | null;
  pairing_label: string | null;
  base: string | null;
  base_zone_id: string | null;
  pairing_start_utc: Date | string | null;
  composition_label: string | null;
  division: string | null;
  duration_days: number | null;
  duty_count: number | null;
  fleet: string | null;
  active_start_date: string | null;
  report_start_utc: Date | string | null;
  release_end_utc: Date | string | null;
};

type PairingCountRow = {
  count_key: string;
  total_items: string;
  pairing_id_count: string;
};

export type PairingSearchPreviewMetadata =
  | {
      mode: "single_property_preview";
      property: PbsPairingSearchPreviewProperty;
    }
  | {
      mode: "current_rules_preview";
      tier: string;
      properties: PbsPairingDraftProperty[];
    }
  | {
      mode: "criteria_preview";
      properties: PbsPairingDraftProperty[];
    }
  | {
      mode: "all_pairings_preview";
    };

export type PairingSearchCountTarget = {
  key: string;
  condition: string;
};

export type PairingSearchEvaluatedCountLeaf = {
  alias: string;
  condition: string;
};

export type PairingSearchEvaluatedCountTarget = {
  key: string;
  expression: string;
};

export type PairingSearchFeedbackLeaf = {
  alias: string;
  key: string;
} & (
  | { condition: string; occurrences?: never }
  | {
      condition?: never;
      occurrences: readonly { pairingId: string; originDate: string }[];
    }
);

export type PairingSearchCountValue = {
  pairingIdCount: number;
  totalItems: number;
};

const escapeLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const trimFilterValue = (value: string | undefined) => {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : null;
};

const buildLayoverCountExpression = (schema: string) => `(
  select count(distinct layover_segment.duty_seq)
  from ${schema}.pairing_segment layover_segment
  where layover_segment.pairing_id = p.id
    and layover_segment.is_deleted = 0
    and layover_segment.duty_layover_nits > 0
)`;

const buildEligibleFlyPairingFilter = (schema: string) => `
      and upper(btrim(p.assignment_group)) = 'FLY'
      and exists (
        select 1
        from ${schema}.pairing_segment eligibility_segment
        where eligibility_segment.pairing_id = p.id
          and eligibility_segment.is_deleted = 0
      )`;

const buildPairingReportStartUtcExpression = (schema: string) => `coalesce(
  (
    select min(report_segment.brief_start_utc)
    from ${schema}.pairing_segment report_segment
    where report_segment.pairing_id = p.id
      and report_segment.is_deleted = 0
  ),
  ${buildPairingStartUtcExpression({ pairingAlias: "p", schema, segmentAlias: "report_origin_segment" })}
)`;

const buildPairingReleaseEndUtcExpression = (schema: string) => `coalesce(
  (
    select max(release_segment.debrief_end_utc)
    from ${schema}.pairing_segment release_segment
    where release_segment.pairing_id = p.id
      and release_segment.is_deleted = 0
  ),
  (
    select max(release_segment.sch_end_dt_utc)
    from ${schema}.pairing_segment release_segment
    where release_segment.pairing_id = p.id
      and release_segment.is_deleted = 0
  )
)`;

const normalizeQuickQuery = (value: string | undefined) =>
  value?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";

const AIRPORT_TOKEN_PATTERN = /^[A-Z0-9]{3,4}$/;
const ROUTE_TOKEN_PATTERN = /^([A-Z0-9]{3,4})-([A-Z0-9]{3,4})$/;

const buildAllPairingsResultFilter = ({
  baseZoneExpression,
  filters,
  localOriginDateExpression,
  pairingDisplayLabelExpression,
  pairingExternalLabelExpression,
  redeye,
  schema,
  sqlBuilder,
}: {
  baseZoneExpression: string;
  filters?: PbsSearchPairingsPreviewFilters;
  localOriginDateExpression: string;
  pairingDisplayLabelExpression: string;
  pairingExternalLabelExpression: string;
  redeye?: PbsRedeyeDefinition;
  schema: string;
  sqlBuilder: PairingSearchSqlBuilder;
}) => {
  if (!filters) {
    return "";
  }

  const clauses: string[] = [];
  const pairingNumber = trimFilterValue(filters.pairingNumber);
  const pairingNumbers = filters.pairingNumbers ?? [];
  const originDateFrom = trimFilterValue(filters.originDateFrom);
  const originDateTo = trimFilterValue(filters.originDateTo);
  const airport = trimFilterValue(filters.airport)?.toUpperCase();
  const airports = filters.airports ?? [];
  const timeFrom = trimFilterValue(filters.timeFrom);
  const timeTo = trimFilterValue(filters.timeTo);
  const releaseTimeFrom = trimFilterValue(filters.releaseTimeFrom);
  const releaseTimeTo = trimFilterValue(filters.releaseTimeTo);
  const layoverAirports = filters.layoverAirports ?? [];
  const query = normalizeQuickQuery(filters.query);

  if (filters.pairingScope === "fly") {
    clauses.push("and upper(btrim(p.assignment_group)) = 'FLY'");
  }

  if (pairingNumbers.length > 0) {
    const placeholders = pairingNumbers.map((value) =>
      sqlBuilder.addParam(value),
    );
    clauses.push(
      `and upper(${pairingExternalLabelExpression}) in (${placeholders.join(", ")})`,
    );
  } else if (pairingNumber) {
    clauses.push(
      `and upper(${pairingDisplayLabelExpression}) like ${sqlBuilder.addParam(`%${escapeLikePattern(pairingNumber.toUpperCase())}%`)} escape '\\'`,
    );
  }

  if (originDateFrom) {
    clauses.push(
      `and ${localOriginDateExpression} >= ${sqlBuilder.addParam(originDateFrom)}::date`,
    );
  }

  if (originDateTo) {
    clauses.push(
      `and ${localOriginDateExpression} <= ${sqlBuilder.addParam(originDateTo)}::date`,
    );
  }

  if (airports.length > 0 || airport) {
    const airportPlaceholders = (
      airports.length > 0 ? airports : [airport!]
    ).map((value) => sqlBuilder.addParam(value));
    const airportList = airportPlaceholders.join(", ");

    clauses.push(`and exists (
      select 1
      from ${schema}.pairing_segment filter_segment
      where filter_segment.pairing_id = p.id
        and filter_segment.is_deleted = 0
        and (
          upper(filter_segment.dep_arp) in (${airportList})
          or upper(filter_segment.arv_arp) in (${airportList})
          or upper(filter_segment.duty_str_arp) in (${airportList})
          or upper(filter_segment.duty_end_arp) in (${airportList})
        )
    )`);
  }

  if (timeFrom || timeTo) {
    const localReportTimeExpression = buildUtcTimestampToLocalTimeExpression({
      timestampExpression: buildPairingReportStartUtcExpression(schema),
      zoneExpression: baseZoneExpression,
    });

    if (timeFrom && timeTo && timeFrom > timeTo) {
      clauses.push(`and (
        ${localReportTimeExpression} >= ${sqlBuilder.addParam(timeFrom)}::time
        or ${localReportTimeExpression} <= ${sqlBuilder.addParam(timeTo)}::time
      )`);
    } else if (timeFrom && timeTo) {
      clauses.push(
        `and ${localReportTimeExpression} >= ${sqlBuilder.addParam(timeFrom)}::time`,
      );
      clauses.push(
        `and ${localReportTimeExpression} <= ${sqlBuilder.addParam(timeTo)}::time`,
      );
    } else if (timeFrom) {
      clauses.push(
        `and ${localReportTimeExpression} >= ${sqlBuilder.addParam(timeFrom)}::time`,
      );
    } else if (timeTo) {
      clauses.push(
        `and ${localReportTimeExpression} <= ${sqlBuilder.addParam(timeTo)}::time`,
      );
    }
  }

  if (releaseTimeFrom || releaseTimeTo) {
    const localReleaseTimeExpression = buildUtcTimestampToLocalTimeExpression({
      timestampExpression: buildPairingReleaseEndUtcExpression(schema),
      zoneExpression: baseZoneExpression,
    });

    if (releaseTimeFrom) {
      clauses.push(
        `and ${localReleaseTimeExpression} >= ${sqlBuilder.addParam(releaseTimeFrom)}::time`,
      );
    }

    if (releaseTimeTo) {
      clauses.push(
        `and ${localReleaseTimeExpression} <= ${sqlBuilder.addParam(releaseTimeTo)}::time`,
      );
    }
  }

  if (filters.durationDaysMin !== undefined) {
    clauses.push(
      `and p.duration_days >= ${sqlBuilder.addParam(filters.durationDaysMin)}::integer`,
    );
  }

  if (filters.durationDaysMax !== undefined) {
    clauses.push(
      `and p.duration_days <= ${sqlBuilder.addParam(filters.durationDaysMax)}::integer`,
    );
  }

  if (filters.creditMinutesMin !== undefined) {
    clauses.push(
      `and ${buildPairingCreditMinutesExpression(schema, "p")} >= ${sqlBuilder.addParam(filters.creditMinutesMin)}::integer`,
    );
  }

  if (filters.creditMinutesMax !== undefined) {
    clauses.push(
      `and ${buildPairingCreditMinutesExpression(schema, "p")} <= ${sqlBuilder.addParam(filters.creditMinutesMax)}::integer`,
    );
  }

  if (layoverAirports.length > 0) {
    const layoverAirportPlaceholders = layoverAirports.map((value) =>
      sqlBuilder.addParam(value),
    );
    const layoverAirportList = layoverAirportPlaceholders.join(", ");

    clauses.push(`and exists (
      select 1
      from ${schema}.pairing_segment layover_airport_segment
      where layover_airport_segment.pairing_id = p.id
        and layover_airport_segment.is_deleted = 0
        and layover_airport_segment.duty_layover_nits > 0
        and upper(layover_airport_segment.duty_end_arp) in (${layoverAirportList})
    )`);
  }

  if (filters.layoverCountMin !== undefined) {
    clauses.push(
      `and ${buildLayoverCountExpression(schema)} >= ${sqlBuilder.addParam(filters.layoverCountMin)}::integer`,
    );
  }

  if (filters.layoverCountMax !== undefined) {
    clauses.push(
      `and ${buildLayoverCountExpression(schema)} <= ${sqlBuilder.addParam(filters.layoverCountMax)}::integer`,
    );
  }

  if (filters.hasDeadhead) {
    clauses.push(`and exists (
      select 1
      from ${schema}.pairing_segment deadhead_segment
      where deadhead_segment.pairing_id = p.id
        and deadhead_segment.is_deleted = 0
        and upper(btrim(coalesce(deadhead_segment.seg_assignment, ''))) = 'DHD'
    )`);
  }

  if (filters.hasRedeye) {
    if (!redeye?.available) {
      throw new LineholderBidServiceError(
        503,
        "Redeye configuration is unavailable for Pairing Filters.",
      );
    }

    clauses.push(`and ${buildRedeyePairingWindowCondition({
      liveSchema: schema,
      redeye,
      sqlBuilder,
    })}`);
  }

  for (const token of query ? query.split(" ").slice(0, 6) : []) {
    const routeMatch = token.match(ROUTE_TOKEN_PATTERN);

    if (routeMatch) {
      const fromAirport = sqlBuilder.addParam(routeMatch[1]);
      const toAirport = sqlBuilder.addParam(routeMatch[2]);

      clauses.push(`and exists (
        select 1
        from ${schema}.pairing_segment route_from_segment
        where route_from_segment.pairing_id = p.id
          and route_from_segment.is_deleted = 0
          and (${fromAirport} = upper(route_from_segment.dep_arp) or ${fromAirport} = upper(route_from_segment.arv_arp))
      ) and exists (
        select 1
        from ${schema}.pairing_segment route_to_segment
        where route_to_segment.pairing_id = p.id
          and route_to_segment.is_deleted = 0
          and (${toAirport} = upper(route_to_segment.dep_arp) or ${toAirport} = upper(route_to_segment.arv_arp))
      )`);
      continue;
    }

    const tokenClauses = [
      `upper(${pairingDisplayLabelExpression}) like ${sqlBuilder.addParam(`%${escapeLikePattern(token)}%`)} escape '\\'`,
      `upper(p.base) = ${sqlBuilder.addParam(token)}`,
      `exists (
        select 1
        from ${schema}.pairing_composition query_composition
        where query_composition.pairing_id = p.id
          and query_composition.is_deleted = 0
          and upper(query_composition.acting_rank) = ${sqlBuilder.addParam(token)}
      )`,
    ];

    if (AIRPORT_TOKEN_PATTERN.test(token)) {
      const airportToken = sqlBuilder.addParam(token);
      tokenClauses.push(`exists (
        select 1
        from ${schema}.pairing_segment query_airport_segment
        where query_airport_segment.pairing_id = p.id
          and query_airport_segment.is_deleted = 0
          and (${airportToken} = upper(query_airport_segment.dep_arp) or ${airportToken} = upper(query_airport_segment.arv_arp))
      )`);
    }

    clauses.push(`and (${tokenClauses.join(" or ")})`);
  }

  return clauses.join("\n          ");
};

const isPairingSummaryPageHit = (
  row: PairingSummaryPageRow,
): row is PairingSummaryPageRow & PairingSummaryRow =>
  row.id !== null &&
  row.base !== null &&
  row.division !== null &&
  row.duration_days !== null &&
  row.duty_count !== null &&
  row.fleet !== null;

export const loadSegmentsByPairingId = async (
  pgPool: Pool,
  schema: string,
  pairingIds: number[],
) => {
  if (pairingIds.length === 0) {
    return new Map<string, PairingSegmentRow[]>();
  }

  const segmentResult = await pgPool.query<PairingSegmentRow>(
    `
      select
        s.pairing_id::text as pairing_id,
        s.duty_seq,
        s.seg_seq,
        s.flt_num,
        s.airline,
        s.dep_arp,
        s.arv_arp,
        ${formatUtcTimestampSql("coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc)")} as duty_start_utc,
        ${formatUtcTimestampSql("coalesce(s.debrief_end_utc, s.duty_sch_end_dt_utc, s.sch_end_dt_utc)")} as duty_end_utc,
        s.duty_assignment,
        s.duty_acc_state,
        s.duty_ref_tz,
        s.duty_etr_tz,
        s.duty_layover_nits,
        s.duty_sch_dp_min::text as duty_sch_dp_min,
        s.duty_act_dp_min::text as duty_act_dp_min,
        s.duty_sch_rest_min::text as duty_sch_rest_min,
        s.duty_act_rest_min::text as duty_act_rest_min,
        ${formatUtcTimestampSql("s.pickup_start_utc")} as pickup_start_utc,
        ${formatUtcTimestampSql("s.pickup_end_utc")} as pickup_end_utc,
        ${formatUtcTimestampSql("s.brief_start_utc")} as brief_start_utc,
        ${formatUtcTimestampSql("s.brief_end_utc")} as brief_end_utc,
        ${formatUtcTimestampSql("s.debrief_start_utc")} as debrief_start_utc,
        ${formatUtcTimestampSql("s.debrief_end_utc")} as debrief_end_utc,
        ${formatUtcTimestampSql("s.dropoff_start_utc")} as dropoff_start_utc,
        ${formatUtcTimestampSql("s.dropoff_end_utc")} as dropoff_end_utc,
        ${formatUtcTimestampSql("s.sch_str_dt_utc")} as sch_str_dt_utc,
        ${formatUtcTimestampSql("s.sch_end_dt_utc")} as sch_end_dt_utc,
        ${formatUtcTimestampSql("s.act_str_dt_utc")} as act_str_dt_utc,
        ${formatUtcTimestampSql("s.act_end_dt_utc")} as act_end_dt_utc,
        s.fleet_seg,
        s.seg_assignment,
        s.duty_sch_fdp_min::text as duty_sch_fdp_min,
        s.duty_act_fdp_min::text as duty_act_fdp_min,
        s.duty_sch_flt_min::text as duty_sch_flt_min,
        s.duty_act_flt_min::text as duty_act_flt_min,
        s.duty_sch_duty_min::text as duty_sch_duty_min,
        s.duty_act_duty_min::text as duty_act_duty_min,
        s.duty_sch_credited_minutes::text as duty_sch_credited_minutes,
        s.duty_act_credited_minutes::text as duty_act_credited_minutes,
        s.act_credited_minutes_seg::text as act_credited_minutes_seg
      from ${schema}.pairing_segment s
      where s.is_deleted = 0
        and s.pairing_id = any($1::bigint[])
      order by s.pairing_id asc, s.duty_seq asc, s.seg_seq asc
    `,
    [pairingIds],
  );

  const segmentsByPairingId = new Map<string, PairingSegmentRow[]>();

  for (const segment of segmentResult.rows) {
    const existing = segmentsByPairingId.get(segment.pairing_id);

    if (existing) {
      existing.push(segment);
    } else {
      segmentsByPairingId.set(segment.pairing_id, [segment]);
    }
  }

  return segmentsByPairingId;
};

type PairingFeedbackRow = PairingSummaryRow & {
  matched_property_indexes: number[];
  rank_label: string | null;
  tafb_days: number | null;
  active_end_date: string | null;
  route_label: string | null;
  total_credit_minutes: string | null;
};

export const executeFeedbackMatchQuery = async ({
  leaves,
  periodEndDate,
  periodStartDate,
  pgPool,
  schema,
  sqlBuilder,
  useCurrentRulesFacts,
}: {
  leaves: PairingSearchFeedbackLeaf[];
  periodEndDate: string;
  periodStartDate: string;
  pgPool: Pool;
  schema: string;
  sqlBuilder: PairingSearchSqlBuilder;
  useCurrentRulesFacts: boolean;
}): Promise<PbsPairingFeedbackBatchItem[]> => {
  if (leaves.length === 0) return [];

  const baseZoneExpression = "base_tz.name";
  const localOriginDateExpression = buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: baseZoneExpression,
  });
  const localEndDateExpression = buildUtcTimestampToLocalDateExpression({
    timestampExpression: buildPairingReleaseEndUtcExpression(schema),
    zoneExpression: baseZoneExpression,
  });
  const periodStartPlaceholder = sqlBuilder.addParam(periodStartDate);
  const periodEndPlaceholder = sqlBuilder.addParam(periodEndDate);
  const rpFilter = `and (
    ${localOriginDateExpression} is null
    or ${localEndDateExpression} is null
    or (
      ${localOriginDateExpression} <= ${periodEndPlaceholder}::date
      and ${localEndDateExpression} >= ${periodStartPlaceholder}::date
    )
  )`;
  const matchExpressions = leaves.map((leaf, index) => {
    const alias = validateEvaluatedCountAlias(leaf.alias);
    const condition = "condition" in leaf
      ? leaf.condition
      : leaf.occurrences.length > 0
        ? leaf.occurrences.map((occurrence) => `(
            p.id::text = ${sqlBuilder.addParam(occurrence.pairingId)}::text
            and candidate.local_origin_date = ${sqlBuilder.addParam(occurrence.originDate)}::date
          )`).join(" or ")
        : "false";
    return `case when (${condition}) then ${index + 1}::integer end as ${alias}`;
  });
  const matchedArrayExpression = `array_remove(array[${matchExpressions.map((entry) => entry.replace(/ as [a-z][a-z0-9_]*$/, "")).join(", ")}], null)`;
  const keyByMatchedIndex = new Map<number, string>(
    leaves.map((leaf, index) => [index + 1, leaf.key]),
  );
  const factsCtes = useCurrentRulesFacts ? buildCurrentRulesFactsCtes(schema) : "";
  const factsJoin = useCurrentRulesFacts ? "join current_rules_facts facts on facts.id = p.id" : "";
  const registeredCtes = sqlBuilder.renderCtes();
  const withPrefix = registeredCtes ? `with ${registeredCtes},\n` : "with ";
  const result = await pgPool.query<PairingFeedbackRow>(
    `
      ${withPrefix}candidate_pairings as materialized (
        select
          p.id,
          base_tz.name as base_zone_id,
          ${localOriginDateExpression} as local_origin_date
        from ${schema}.pairing p
        left join ${schema}.airport base_airport
          on base_airport.airport = p.base
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        where p.is_deleted = 0
          and base_tz.name is not null
          ${buildEligibleFlyPairingFilter(schema)}
          ${rpFilter}
      ),
      ${factsCtes}
      evaluated_match_keys as materialized (
        select
          p.id,
          p.id::text as id_text,
          ${buildPairingDisplayLabelExpression("p")} as pairing_label,
          p.base,
          candidate.base_zone_id,
          p.sch_str_dt_utc as pairing_start_utc_raw,
          p.sch_end_dt_utc as pairing_end_utc_raw,
          p.division,
          p.duration_days,
          p.tafb as tafb_days,
          p.duty_count,
          p.fleet,
          candidate.local_origin_date::text as active_start_date,
          ${matchedArrayExpression} as matched_property_indexes
        from candidate_pairings candidate
        join ${schema}.pairing p on p.id = candidate.id
        ${factsJoin}
      ),
      matched_pairings as materialized (
        select *
        from evaluated_match_keys matched
        where cardinality(matched_property_indexes) > 0
      ),
      matched_segments as materialized (
        select s.*
        from matched_pairings matched
        join ${schema}.pairing_segment s
          on s.pairing_id = matched.id
         and s.is_deleted = 0
      ),
      segment_rollup as materialized (
        select
          s.pairing_id,
          min(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc)) as min_start,
          max(coalesce(s.debrief_end_utc, s.duty_sch_end_dt_utc, s.sch_end_dt_utc)) as max_end,
          min(s.brief_start_utc) as min_brief_start,
          max(s.debrief_end_utc) as max_debrief_end,
          concat_ws(
            '-',
            string_agg(s.dep_arp, '-' order by s.duty_seq, s.seg_seq),
            (array_agg(s.arv_arp order by s.duty_seq desc, s.seg_seq desc))[1]
          ) as route_label
        from matched_segments s
        group by s.pairing_id
      ),
      segment_duty_credit as materialized (
        select
          duty_credit.pairing_id,
          sum(duty_credit.credit_minutes) as total_credit_minutes
        from (
          select
            s.pairing_id,
            s.duty_seq,
            max(coalesce(
              s.duty_act_credited_minutes,
              s.duty_sch_credited_minutes,
              0
            )) as credit_minutes
          from matched_segments s
          group by s.pairing_id, s.duty_seq
        ) duty_credit
        group by duty_credit.pairing_id
      ),
      composition_rollup as materialized (
        select
          pc.pairing_id,
          string_agg(
            concat(btrim(pc.acting_rank), '(', coalesce(pc.plan, 0)::text, ')'),
            '' order by pc.id
          ) as composition_label
        from matched_pairings matched
        join ${schema}.pairing_composition pc
          on pc.pairing_id = matched.id
         and pc.is_deleted = 0
        where nullif(btrim(coalesce(pc.acting_rank, '')), '') is not null
        group by pc.pairing_id
      ),
      rank_rollup as materialized (
        select
          ranked.pairing_id,
          string_agg(ranked.acting_rank, '+' order by ranked.display_order, ranked.acting_rank) as rank_label
        from (
          select
            pc.pairing_id,
            upper(btrim(pc.acting_rank)) as acting_rank,
            min(coalesce(r.display_order, 2147483647)) as display_order
          from matched_pairings matched
          join ${schema}.pairing_composition pc
            on pc.pairing_id = matched.id
           and pc.is_deleted = 0
          left join ${schema}.rank r
            on upper(btrim(r.rank)) = upper(btrim(pc.acting_rank))
          where nullif(btrim(coalesce(pc.acting_rank, '')), '') is not null
          group by pc.pairing_id, upper(btrim(pc.acting_rank))
        ) ranked
        group by ranked.pairing_id
      ),
      evaluated_pairings as materialized (
        select
          matched.id,
          matched.id_text,
          matched.pairing_label,
          matched.base,
          rank_rollup.rank_label,
          matched.base_zone_id,
          ${formatUtcTimestampSql("matched.pairing_start_utc_raw")} as pairing_start_utc,
          coalesce(composition_rollup.composition_label, '') as composition_label,
          matched.division,
          matched.duration_days,
          matched.tafb_days,
          matched.duty_count,
          matched.fleet,
          matched.active_start_date,
          (coalesce(segment_rollup.max_end, matched.pairing_end_utc_raw) at time zone matched.base_zone_id)::date::text as active_end_date,
          ${formatUtcTimestampSql("segment_rollup.min_brief_start")} as report_start_utc,
          ${formatUtcTimestampSql("segment_rollup.max_debrief_end")} as release_end_utc,
          coalesce(segment_rollup.route_label, '') as route_label,
          coalesce(segment_duty_credit.total_credit_minutes, 0)::text as total_credit_minutes,
          matched.matched_property_indexes
        from matched_pairings matched
        left join segment_rollup
          on segment_rollup.pairing_id = matched.id
        left join segment_duty_credit
          on segment_duty_credit.pairing_id = matched.id
        left join composition_rollup
          on composition_rollup.pairing_id = matched.id
        left join rank_rollup
          on rank_rollup.pairing_id = matched.id
      )
      select *
      from evaluated_pairings
      order by active_start_date, pairing_start_utc, pairing_label, id
    `,
    sqlBuilder.params,
  );
  return result.rows.map((row) => ({
      pairing: {
      pairingId: row.id,
      pairingNumber: row.pairing_label ?? row.id,
      rank: row.rank_label ?? "—",
      base: row.base,
      zoneId: row.base_zone_id ?? "UTC",
      originDate: row.active_start_date ?? "",
      endDate: row.active_end_date ?? row.active_start_date ?? "",
      routeLabel: row.route_label ?? "",
      reportTime: row.report_start_utc
        ? new Intl.DateTimeFormat("en-CA", { timeZone: row.base_zone_id ?? "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(row.report_start_utc))
        : "--:--",
      releaseTime: row.release_end_utc
        ? new Intl.DateTimeFormat("en-CA", { timeZone: row.base_zone_id ?? "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(row.release_end_utc))
        : "--:--",
      durationDays: row.duration_days,
      tafbDays: row.tafb_days,
      totalCredit: (() => {
        const minutes = Number.parseInt(row.total_credit_minutes ?? "0", 10);
        return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
      })(),
      },
      matchedPropertyKeys: row.matched_property_indexes.flatMap((index) => {
        const key = keyByMatchedIndex.get(index);
        return key ? [key] : [];
      }),
    }));
};

export const executePreviewCountQueries = async ({
  targets,
  pgPool,
  schema,
  sqlBuilder,
  actorBase,
  actorRank,
  periodStartDate,
  periodEndDate,
}: {
  targets: PairingSearchCountTarget[];
  pgPool: Pool;
  schema: string;
  sqlBuilder: PairingSearchSqlBuilder;
  actorBase: string;
  actorRank: string | null;
  periodStartDate: string;
  periodEndDate: string;
}): Promise<Map<string, PairingSearchCountValue>> => {
  if (targets.length === 0) {
    return new Map();
  }

  const actorRankFilter = actorRank
    ? `and exists (
        select 1 from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = ${sqlBuilder.addParam(actorRank)}
          and pc.is_deleted = 0
      )`
    : "";
  const baseZoneExpression = "base_tz.name";
  const rpFilter = `and ${buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: baseZoneExpression,
  })} between ${sqlBuilder.addParam(periodStartDate)}::date and ${sqlBuilder.addParam(periodEndDate)}::date`;
  const actorBasePlaceholder = sqlBuilder.addParam(actorBase);
  const registeredCtes = sqlBuilder.renderCtes();
  const targetQueries = targets.map(
    (target) => `
    select
      ${sqlBuilder.addParam(target.key)}::text as count_key,
      count(*)::bigint as total_items,
      count(distinct p.id::text)::bigint as pairing_id_count
    from ${schema}.pairing p
    left join ${schema}.airport base_airport
      on base_airport.airport = p.base
    left join pg_timezone_names base_tz
      on base_tz.name = nullif(btrim(base_airport.zone_id), '')
    where p.is_deleted = 0
      and base_tz.name is not null
      ${buildEligibleFlyPairingFilter(schema)}
      and p.base = ${actorBasePlaceholder}
      ${actorRankFilter}
      ${rpFilter}
      and ${target.condition}
  `,
  );
  const result = await pgPool.query<PairingCountRow>(
    `${registeredCtes ? `with ${registeredCtes}\n` : ""}${targetQueries.join("\nunion all\n")}`,
    sqlBuilder.params,
  );

  return new Map(
    result.rows.map((row) => [
      row.count_key,
      {
        pairingIdCount: Number.parseInt(row.pairing_id_count, 10),
        totalItems: Number.parseInt(row.total_items, 10),
      },
    ]),
  );
};

const validateEvaluatedCountAlias = (alias: string): string => {
  if (!/^match_[1-9]\d*$/.test(alias)) {
    throw new Error(`Invalid evaluated count alias: ${alias}`);
  }

  return alias;
};

const buildCurrentRulesFactsCtes = (schema: string): string => `
      current_rules_segments as materialized (
        select
          s.pairing_id,
          s.id,
          s.duty_seq,
          s.seg_seq,
          s.seg_assignment,
          s.brief_start_utc,
          s.debrief_end_utc,
          s.arv_arp,
          s.duty_end_arp,
          s.duty_layover_nits,
          s.duty_sch_rest_min,
          s.duty_act_rest_min,
          (
            (s.brief_start_utc at time zone 'UTC')
            at time zone coalesce(dep_valid_timezone.name, 'UTC')
          ) as check_in_local,
          (
            (s.debrief_end_utc at time zone 'UTC')
            at time zone coalesce(arv_valid_timezone.name, 'UTC')
          ) as check_out_local,
          upper(s.arv_arp) as landing_airport_code,
          upper(arv_airport.city) as landing_city_code,
          ((s.sch_end_dt_utc at time zone 'UTC') at time zone arv_airport.zone_id)::date as landing_event_date,
          upper(s.duty_end_arp) as layover_airport_code,
          upper(duty_end_airport.city) as layover_city_code,
          (
            (coalesce(s.duty_sch_end_dt_utc, s.sch_end_dt_utc) at time zone 'UTC')
            at time zone duty_end_airport.zone_id
          )::date as layover_event_date,
          arv_airport.airport is not null as has_landing_airport,
          duty_end_airport.airport is not null as has_layover_airport,
          (
            s.duty_seq < max(s.duty_seq) over (partition by s.pairing_id)
            or s.seg_seq < max(s.seg_seq) over (partition by s.pairing_id, s.duty_seq)
          ) as has_later_segment
        from candidate_pairings candidate
        join ${schema}.pairing_segment s
          on s.pairing_id = candidate.id
         and s.is_deleted = 0
        left join ${schema}.airport dep_airport
          on dep_airport.airport = s.dep_arp
        left join pg_timezone_names dep_valid_timezone
          on dep_valid_timezone.name = nullif(btrim(dep_airport.zone_id), '')
        left join ${schema}.airport arv_airport
          on arv_airport.airport = s.arv_arp
        left join pg_timezone_names arv_valid_timezone
          on arv_valid_timezone.name = nullif(btrim(arv_airport.zone_id), '')
        left join ${schema}.airport duty_end_airport
          on duty_end_airport.airport = s.duty_end_arp
      ),
      current_rules_check_facts as materialized (
        select
          pairing_id,
          (array_agg(check_in_local order by brief_start_utc, duty_seq, seg_seq)
            filter (where brief_start_utc is not null))[1] as check_in_local,
          (array_agg(check_out_local order by debrief_end_utc desc, duty_seq desc, seg_seq desc)
            filter (where debrief_end_utc is not null))[1] as check_out_local
        from current_rules_segments
        group by pairing_id
      ),
      current_rules_duty_rows as materialized (
        select
          pairing_id,
          duty_seq,
          count(*) filter (
            where upper(btrim(coalesce(seg_assignment, ''))) in ('FLT', 'FLY')
          )::numeric as leg_count,
          (array_agg(check_in_local order by brief_start_utc, seg_seq)
            filter (where brief_start_utc is not null))[1]::date as event_date
        from current_rules_segments
        group by pairing_id, duty_seq
      ),
      current_rules_duty_facts as materialized (
        select
          pairing_id,
          jsonb_agg(
            jsonb_build_object(
              'duty_seq', duty_seq,
              'leg_count', leg_count,
              'event_date', event_date
            ) order by duty_seq
          ) as duty_counts
        from current_rules_duty_rows
        group by pairing_id
      ),
      current_rules_airport_event_rows as materialized (
        select
          pairing_id,
          'landing'::text as event_type,
          landing_airport_code as airport_code,
          landing_city_code as city_code,
          landing_event_date as event_date,
          null::numeric as layover_minutes
        from current_rules_segments
        where arv_arp is not null
          and has_landing_airport
          and has_later_segment

        union all

        select
          layover_events.pairing_id,
          layover_events.event_type,
          layover_events.airport_code,
          layover_events.city_code,
          layover_events.event_date,
          layover_events.layover_minutes
        from (
          select distinct on (pairing_id, duty_seq)
            pairing_id,
            duty_seq,
            seg_seq,
            'layover'::text as event_type,
            layover_airport_code as airport_code,
            layover_city_code as city_code,
            layover_event_date as event_date,
            coalesce(duty_sch_rest_min, duty_act_rest_min)::numeric as layover_minutes
          from current_rules_segments
          where duty_layover_nits > 0
            and duty_end_arp is not null
            and has_layover_airport
          order by pairing_id, duty_seq, seg_seq
        ) layover_events
      ),
      current_rules_airport_facts as materialized (
        select
          pairing_id,
          jsonb_agg(
            jsonb_build_object(
              'event_type', event_type,
              'airport_code', airport_code,
              'city_code', city_code,
              'event_date', event_date,
              'layover_minutes', layover_minutes
            )
          ) as airport_events
        from current_rules_airport_event_rows
        group by pairing_id
      ),
      current_rules_facts as materialized (
        select
          candidate.id,
          check_facts.check_in_local,
          check_facts.check_out_local,
          coalesce(duty_facts.duty_counts, '[]'::jsonb) as duty_counts,
          coalesce(airport_facts.airport_events, '[]'::jsonb) as airport_events
        from candidate_pairings candidate
        left join current_rules_check_facts check_facts
          on check_facts.pairing_id = candidate.id
        left join current_rules_duty_facts duty_facts
          on duty_facts.pairing_id = candidate.id
        left join current_rules_airport_facts airport_facts
          on airport_facts.pairing_id = candidate.id
      ),
`;

export const executeCurrentRulesCountQuery = async ({
  leaves,
  targets,
  pgPool,
  schema,
  sqlBuilder,
  actorBase,
  actorRank,
  periodStartDate,
  periodEndDate,
  useCurrentRulesFacts,
}: {
  leaves: PairingSearchEvaluatedCountLeaf[];
  targets: PairingSearchEvaluatedCountTarget[];
  pgPool: Pool;
  schema: string;
  sqlBuilder: PairingSearchSqlBuilder;
  actorBase: string;
  actorRank: string | null;
  periodStartDate: string;
  periodEndDate: string;
  useCurrentRulesFacts: boolean;
}): Promise<Map<string, PairingSearchCountValue>> => {
  if (leaves.length === 0 || targets.length === 0) {
    return new Map();
  }

  const actorRankFilter = actorRank
    ? `and exists (
        select 1 from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = ${sqlBuilder.addParam(actorRank)}
          and pc.is_deleted = 0
      )`
    : "";
  const baseZoneExpression = "base_tz.name";
  const rpFilter = `and ${buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: baseZoneExpression,
  })} between ${sqlBuilder.addParam(periodStartDate)}::date and ${sqlBuilder.addParam(periodEndDate)}::date`;
  const actorBasePlaceholder = sqlBuilder.addParam(actorBase);
  const evaluatedColumns = leaves.map((leaf) => {
    const alias = validateEvaluatedCountAlias(leaf.alias);
    return `(${leaf.condition})::boolean as ${alias}`;
  });
  const targetQueries = targets.map(
    (target) => `
    select
      ${sqlBuilder.addParam(target.key)}::text as count_key,
      count(*)::bigint as total_items,
      count(distinct evaluated.id::text)::bigint as pairing_id_count
    from evaluated_pairings evaluated
    where ${target.expression}
  `,
  );
  const factsCtes = useCurrentRulesFacts
    ? buildCurrentRulesFactsCtes(schema)
    : "";
  const factsJoin = useCurrentRulesFacts
    ? `join current_rules_facts facts on facts.id = p.id`
    : "";
  const registeredCtes = sqlBuilder.renderCtes();
  const withPrefix = registeredCtes ? `with ${registeredCtes},\n` : "with ";
  const result = await pgPool.query<PairingCountRow>(
    `
      ${withPrefix}candidate_pairings as materialized (
        select p.id
        from ${schema}.pairing p
        left join ${schema}.airport base_airport
          on base_airport.airport = p.base
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        where p.is_deleted = 0
          and base_tz.name is not null
          ${buildEligibleFlyPairingFilter(schema)}
          and p.base = ${actorBasePlaceholder}
          ${actorRankFilter}
          ${rpFilter}
      ),
      ${factsCtes}
      evaluated_pairings as materialized (
        select
          p.id,
          ${evaluatedColumns.join(",\n          ")}
        from candidate_pairings candidate
        join ${schema}.pairing p
          on p.id = candidate.id
        ${factsJoin}
      )
      ${targetQueries.join("\nunion all\n")}
    `,
    sqlBuilder.params,
  );

  return new Map(
    result.rows.map((row) => [
      row.count_key,
      {
        pairingIdCount: Number.parseInt(row.pairing_id_count, 10),
        totalItems: Number.parseInt(row.total_items, 10),
      },
    ]),
  );
};

export const executePreviewQuery = async ({
  condition,
  metadata,
  page,
  pageSize,
  periodStartDate,
  periodEndDate,
  pgPool,
  schema,
  sqlBuilder,
  actorBase,
  actorRank,
  effectiveCrewBaseCrewId,
  resultFilters,
  resultRedeye,
}: {
  condition: string;
  metadata: PairingSearchPreviewMetadata;
  page: number;
  pageSize: number;
  periodStartDate: string;
  periodEndDate: string;
  pgPool: Pool;
  schema: string;
  sqlBuilder: PairingSearchSqlBuilder;
  actorBase?: string;
  actorRank: string | null;
  effectiveCrewBaseCrewId?: string;
  resultFilters?: PbsSearchPairingsPreviewFilters;
  resultRedeye?: PbsRedeyeDefinition;
}): Promise<PbsSearchPairingsPreviewResponse> => {
  const actorRankFilter = actorRank
    ? `and exists (
        select 1 from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = ${sqlBuilder.addParam(actorRank)}
          and pc.is_deleted = 0
      )`
    : "";
  const usesEffectiveCrewBase = typeof effectiveCrewBaseCrewId === "string";
  const baseZoneExpression = "base_tz.name";
  const localOriginDateExpression = buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: baseZoneExpression,
  });
  const rpFilter = `and ${localOriginDateExpression} between ${sqlBuilder.addParam(periodStartDate)}::date and ${sqlBuilder.addParam(periodEndDate)}::date`;
  const resultFilter = buildAllPairingsResultFilter({
    baseZoneExpression,
    filters: resultFilters,
    localOriginDateExpression,
    pairingDisplayLabelExpression: buildPairingDisplayLabelExpression("p"),
    pairingExternalLabelExpression: buildPairingExternalLabelExpression("p"),
    redeye: resultRedeye,
    schema,
    sqlBuilder,
  });
  const baseEligibilityFilter = usesEffectiveCrewBase
    ? `and base_tz.name is not null
      and upper(btrim(p.base)) = (
        select upper(btrim(crew_base.base))
        from ${schema}.crew_base crew_base
        join ${schema}.airport crew_base_airport
          on upper(btrim(crew_base_airport.airport)) = upper(btrim(crew_base.base))
        join pg_timezone_names crew_base_tz
          on crew_base_tz.name = nullif(btrim(crew_base_airport.zone_id), '')
        where crew_base.crew_id = ${sqlBuilder.addParam(effectiveCrewBaseCrewId)}
          and crew_base.eff_dt < ((${localOriginDateExpression} + 1)::timestamp at time zone crew_base_tz.name)
          and (
            crew_base.exp_dt is null
            or crew_base.exp_dt >= (${localOriginDateExpression}::timestamp at time zone crew_base_tz.name)
          )
        order by crew_base.is_prime_base desc, crew_base.eff_dt desc, crew_base.id desc
        limit 1
      )`
    : `and base_tz.name is not null
      and p.base = ${sqlBuilder.addParam(actorBase)}`;
  const offset = (page - 1) * pageSize;
  const registeredCtes = sqlBuilder.renderCtes();
  const withPrefix = registeredCtes ? `with ${registeredCtes},\n` : "with ";
  const pageParams = [...sqlBuilder.params, pageSize, offset];
  const pairingDisplayLabelExpression = buildPairingDisplayLabelExpression("p");
  const pageResult = await pgPool.query<PairingSummaryPageRow>(
    `
      ${withPrefix}filtered_pairings as (
        select
          p.id,
          p.id::text as id_text,
          ${pairingDisplayLabelExpression} as pairing_label,
          p.base,
          ${baseZoneExpression} as base_zone_id,
          p.division,
          p.duration_days,
          p.duty_count,
          p.fleet,
          p.sch_str_dt_utc,
          ${localOriginDateExpression} as local_origin_date
        from ${schema}.pairing p
        left join ${schema}.airport base_airport
          on base_airport.airport = p.base
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        where p.is_deleted = 0
          ${buildEligibleFlyPairingFilter(schema)}
          ${baseEligibilityFilter}
          ${actorRankFilter}
          ${rpFilter}
          ${resultFilter}
          and ${condition}
      ),
      summary as (
        select
          count(*)::bigint as total_items,
          count(distinct id_text)::bigint as pairing_id_count
        from filtered_pairings
      ),
      paged_pairings as (
        select
          fp.id_text as id,
          fp.pairing_label,
          fp.base,
          fp.base_zone_id,
          ${formatUtcTimestampSql("fp.sch_str_dt_utc")} as pairing_start_utc,
          coalesce(comp.composition_label, '') as composition_label,
          fp.division,
          fp.duration_days,
          fp.duty_count,
          fp.fleet,
          fp.local_origin_date::text as active_start_date,
          ${formatUtcTimestampSql("seg.min_brief_start")} as report_start_utc,
          ${formatUtcTimestampSql("seg.max_debrief_end")} as release_end_utc
        from filtered_pairings fp
        left join lateral (
          select
            min(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc)) as min_start,
            min(s.brief_start_utc) as min_brief_start,
            max(s.debrief_end_utc) as max_debrief_end
          from ${schema}.pairing_segment s
          where s.pairing_id = fp.id
            and s.is_deleted = 0
        ) seg on true
        left join lateral (
          select string_agg(
            concat(btrim(pc.acting_rank), '(', coalesce(pc.plan, 0)::text, ')'),
            '' order by pc.id
          ) as composition_label
          from ${schema}.pairing_composition pc
          where pc.pairing_id = fp.id
            and pc.is_deleted = 0
            and nullif(btrim(coalesce(pc.acting_rank, '')), '') is not null
        ) comp on true
        order by fp.local_origin_date asc, fp.sch_str_dt_utc asc, fp.pairing_label asc nulls last, fp.id asc
        limit $${pageParams.length - 1}
        offset $${pageParams.length}
      )
      select
        summary.total_items,
        summary.pairing_id_count,
        paged_pairings.id,
        paged_pairings.pairing_label,
        paged_pairings.base,
        paged_pairings.base_zone_id,
        paged_pairings.pairing_start_utc,
        paged_pairings.composition_label,
        paged_pairings.division,
        paged_pairings.duration_days,
        paged_pairings.duty_count,
        paged_pairings.fleet,
        paged_pairings.active_start_date,
        paged_pairings.report_start_utc,
        paged_pairings.release_end_utc
      from summary
      left join paged_pairings on true
    `,
    pageParams,
  );

  const summaryRow = pageResult.rows[0];
  const totalItems = Number.parseInt(summaryRow?.total_items ?? "0", 10);
  const pairingIdCount = Number.parseInt(
    summaryRow?.pairing_id_count ?? "0",
    10,
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const baseResponse = {
    ...metadata,
    summary: {
      pairingIdCount,
      totalItems,
    },
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
  const pageRows = pageResult.rows.filter(isPairingSummaryPageHit);

  if (totalItems === 0 || pageRows.length === 0) {
    return {
      ...baseResponse,
      results: [],
    };
  }

  const segmentsByPairingId = await loadSegmentsByPairingId(
    pgPool,
    schema,
    pageRows.map((row) => Number.parseInt(row.id, 10)),
  );

  return {
    ...baseResponse,
    results: pageRows.map((pairing) =>
      mapPairingResult(pairing, segmentsByPairingId.get(pairing.id) ?? []),
    ),
  };
};

export const executePairingDetailsQuery = async ({
  pgPool,
  request,
  schema,
  actorBase,
  actorRank,
  periodStartDate,
  periodEndDate,
}: {
  pgPool: Pool;
  request: PbsPairingDetailsRequest;
  schema: string;
  actorBase: string;
  actorRank: string | null;
  periodStartDate: string;
  periodEndDate: string;
}): Promise<PbsPairingDetailsResponse> => {
  const normalizedTargets = Array.from(
    new Map(
      request.targets.map((target) => [
        `${target.pairingId.trim()}:${target.originDate?.trim() ?? ""}`,
        {
          pairingId: target.pairingId.trim(),
          originDate: target.originDate?.trim() || null,
        },
      ]),
    ).values(),
  );

  if (normalizedTargets.length === 0) {
    return { results: [] };
  }

  const targetClauses: string[] = [];
  const params: unknown[] = [
    Array.from(new Set(normalizedTargets.map((target) => target.pairingId))),
    actorBase,
  ];
  const actorRankFilter = actorRank
    ? `and exists (
        select 1
        from ${schema}.pairing_composition actor_composition
        where actor_composition.pairing_id = p.id
          and actor_composition.is_deleted = 0
          and upper(actor_composition.acting_rank) = upper($${params.push(actorRank)}::varchar)
      )`
    : "";

  normalizedTargets.forEach((target) => {
    const pairingIdPlaceholder = `$${params.push(target.pairingId)}`;
    const originDatePlaceholder = `$${params.push(target.originDate)}`;

    targetClauses.push(
      `(cp.id = ${pairingIdPlaceholder}::bigint and (${originDatePlaceholder}::date is null or cp.origin_date = ${originDatePlaceholder}::date))`,
    );
  });

  const periodFilter = `and cp.origin_date between $${params.push(periodStartDate)}::date and $${params.push(periodEndDate)}::date`;
  const pairingDisplayLabelExpression = buildPairingDisplayLabelExpression("p");
  const baseZoneExpression = "base_tz.name";
  const result = await pgPool.query<
    PairingSummaryRow & { origin_date: string }
  >(
    `
      with candidate_pairings as (
        select
          p.id,
          p.id::text as id_text,
          ${pairingDisplayLabelExpression} as pairing_label,
          p.base,
          ${baseZoneExpression} as base_zone_id,
          ${formatUtcTimestampSql("p.sch_str_dt_utc")} as pairing_start_utc,
          coalesce(comp.composition_label, '') as composition_label,
          p.division,
          p.duration_days,
          p.duty_count,
          p.fleet,
          p.sch_str_dt_utc,
          ${buildUtcTimestampToLocalDateExpression({
            timestampExpression: "coalesce(seg.min_start, p.sch_str_dt_utc)",
            zoneExpression: baseZoneExpression,
          })} as origin_date,
          ${formatUtcTimestampSql("seg.min_brief_start")} as report_start_utc,
          ${formatUtcTimestampSql("seg.max_debrief_end")} as release_end_utc
        from ${schema}.pairing p
        left join ${schema}.airport base_airport
          on base_airport.airport = p.base
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        left join lateral (
          select
            min(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc)) as min_start,
            min(s.brief_start_utc) as min_brief_start,
            max(s.debrief_end_utc) as max_debrief_end
          from ${schema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        ) seg on true
        left join lateral (
          select string_agg(
            concat(btrim(pc.acting_rank), '(', coalesce(pc.plan, 0)::text, ')'),
            '' order by pc.id
          ) as composition_label
          from ${schema}.pairing_composition pc
          where pc.pairing_id = p.id
            and pc.is_deleted = 0
            and nullif(btrim(coalesce(pc.acting_rank, '')), '') is not null
        ) comp on true
        where p.is_deleted = 0
          and base_tz.name is not null
          and p.id = any($1::bigint[])
          and p.base = $2::varchar
          ${actorRankFilter}
      )
      select
        cp.id_text as id,
        cp.pairing_label,
        cp.base,
        cp.base_zone_id,
        cp.pairing_start_utc,
        cp.composition_label,
        cp.division,
        cp.duration_days,
        cp.duty_count,
        cp.fleet,
        cp.origin_date::text as active_start_date,
        cp.report_start_utc,
        cp.release_end_utc,
        cp.origin_date::text as origin_date
      from candidate_pairings cp
      where (${targetClauses.join(" or ")})
        ${periodFilter}
      order by cp.origin_date asc, cp.pairing_label asc nulls last, cp.id asc
    `,
    params,
  );
  const segmentsByPairingId = await loadSegmentsByPairingId(
    pgPool,
    schema,
    result.rows.map((row) => Number.parseInt(row.id, 10)),
  );

  return {
    results: result.rows.map((pairing) =>
      mapPairingResult(pairing, segmentsByPairingId.get(pairing.id) ?? []),
    ),
  };
};
