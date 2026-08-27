import type { PbsEfficientFlyingPreferenceBid } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

export type EfficientFlyingBaseScopeMode =
  | "fixed"
  | "partitioned"
  | "merged"
  | "partitioned_all_bases";

export type EfficientFlyingCohortContext = {
  percentile: number;
  periodStartDate: string;
  periodEndDate: string;
  baseScopeMode: EfficientFlyingBaseScopeMode;
  bases?: readonly string[];
  actorRank?: string | null;
  divisions?: readonly string[];
  ranks?: readonly string[];
};

const normalizeValues = (values?: readonly string[]): string[] =>
  Array.from(new Set((values ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean))).sort();

const buildEndExclusiveTimestamp = (endDate: string): string => {
  const parsed = new Date(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new LineholderBidServiceError(400, "Efficient flying period is invalid.");
  }

  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return `${parsed.toISOString().slice(0, 10)} 00:00:00`;
};

export const buildEfficientFlyingCohortCondition = ({
  bid,
  context,
  schema,
  sqlBuilder,
}: {
  bid: PbsEfficientFlyingPreferenceBid;
  context?: EfficientFlyingCohortContext;
  schema: string;
  sqlBuilder: PairingSearchSqlBuilder;
}): string => {
  if (!context) {
    throw new LineholderBidServiceError(503, "Efficient flying configuration is unavailable.");
  }

  const bases = normalizeValues(context.bases);
  const divisions = normalizeValues(context.divisions);
  const ranks = normalizeValues(context.ranks);

  if (context.baseScopeMode !== "partitioned_all_bases" && bases.length === 0) {
    throw new LineholderBidServiceError(400, "Efficient flying base scope is required.");
  }

  const bundleKey = JSON.stringify({
    schema,
    percentile: context.percentile,
    periodStartDate: context.periodStartDate,
    periodEndDate: context.periodEndDate,
    baseScopeMode: context.baseScopeMode,
    bases,
    actorRank: context.actorRank?.trim().toUpperCase() || null,
    divisions,
    ranks,
  });
  const names = sqlBuilder.getOrRegisterCteBundle(bundleKey, (prefix) => {
    const scopedPairings = `${prefix}_efficient_scoped`;
    const firstDutySegments = `${prefix}_efficient_first_duty_segments`;
    const cohort = `${prefix}_efficient_cohort`;
    const stats = `${prefix}_efficient_stats`;
    const matches = `${prefix}_efficient_matches`;
    const startDate = sqlBuilder.addParam(context.periodStartDate);
    const endDate = sqlBuilder.addParam(context.periodEndDate);
    const startTimestamp = sqlBuilder.addParam(`${context.periodStartDate} 00:00:00`);
    const endTimestampExclusive = sqlBuilder.addParam(buildEndExclusiveTimestamp(context.periodEndDate));
    const percentile = sqlBuilder.addParam(context.percentile);
    const baseCondition = context.baseScopeMode === "partitioned_all_bases"
      ? "true"
      : `upper(btrim(cohort_pairing.base)) = any(${sqlBuilder.addParam(bases)}::varchar[])`;
    const scopeKeyExpression = context.baseScopeMode === "partitioned"
      || context.baseScopeMode === "partitioned_all_bases"
      ? "upper(btrim(cohort_pairing.base))"
      : "'merged'::text";
    const actorRankCondition = context.actorRank
      ? `and exists (
          select 1
          from ${schema}.pairing_composition cohort_composition
          where cohort_composition.pairing_id = cohort_pairing.id
            and cohort_composition.is_deleted = 0
            and upper(cohort_composition.acting_rank) = upper(${sqlBuilder.addParam(context.actorRank)})
        )`
      : "";
    const divisionRankParts = [
      ...(divisions.length > 0
        ? [`upper(cohort_pairing.division) = any(${sqlBuilder.addParam(divisions)}::varchar[])`]
        : []),
      ...(ranks.length > 0
        ? [`exists (
            select 1
            from ${schema}.pairing_composition scope_composition
            where scope_composition.pairing_id = cohort_pairing.id
              and scope_composition.is_deleted = 0
              and upper(scope_composition.acting_rank) = any(${sqlBuilder.addParam(ranks)}::varchar[])
          )`]
        : []),
    ];
    const divisionRankCondition = divisionRankParts.length > 0
      ? `and (${divisionRankParts.join(" or ")})`
      : "";

    return {
      names: { matches },
      fragments: [
        `${scopedPairings} as materialized (
          select
            cohort_pairing.id,
            cohort_pairing.duration_days,
            ${scopeKeyExpression} as scope_key
          from ${schema}.pairing cohort_pairing
          where cohort_pairing.is_deleted = 0
            and upper(btrim(cohort_pairing.assignment_group)) = 'FLY'
            and cohort_pairing.duration_days > 0
            and ${baseCondition}
            and (
              (
                cohort_pairing.pairing_dt is not null
                and cohort_pairing.pairing_dt between ${startDate}::date and ${endDate}::date
              )
              or (
                cohort_pairing.pairing_dt is null
                and cohort_pairing.sch_str_dt_utc >= ${startTimestamp}::timestamp
                and cohort_pairing.sch_str_dt_utc < ${endTimestampExclusive}::timestamp
              )
            )
            ${actorRankCondition}
            ${divisionRankCondition}
        )`,
        `${firstDutySegments} as materialized (
          select distinct on (credit_segment.pairing_id, credit_segment.duty_seq)
            credit_segment.pairing_id,
            credit_segment.duty_seq,
            coalesce(credit_segment.duty_act_credited_minutes, 0)::numeric as duty_credit
          from ${schema}.pairing_segment credit_segment
          join ${scopedPairings} scoped
            on scoped.id = credit_segment.pairing_id
          where credit_segment.is_deleted = 0
          order by credit_segment.pairing_id, credit_segment.duty_seq, credit_segment.seg_seq
        )`,
        `${cohort} as materialized (
          select
            scoped.id as pairing_id,
            scoped.scope_key,
            coalesce(sum(first_segment.duty_credit), 0)::numeric
              / scoped.duration_days::numeric as average_daily_credit
          from ${scopedPairings} scoped
          join ${firstDutySegments} first_segment
            on first_segment.pairing_id = scoped.id
          group by scoped.id, scoped.scope_key, scoped.duration_days
        )`,
        `${stats} as materialized (
          select
            scope_key,
            array_agg(average_daily_credit order by average_daily_credit) as credit_values,
            count(*)::integer as n,
            greatest(1, round(count(*) * ${percentile}::numeric / 100))::integer as k
          from ${cohort}
          group by scope_key
        )`,
        `${matches} as materialized (
          select
            cohort.pairing_id,
            cohort.average_daily_credit >= stats.credit_values[stats.n - stats.k + 1]
              as efficient_match,
            cohort.average_daily_credit <= stats.credit_values[stats.k]
              as inefficient_match
          from ${cohort} cohort
          join ${stats} stats
            on stats.scope_key = cohort.scope_key
          where stats.n > 0
        )`,
      ],
    };
  });
  const matchColumn = bid.mode === "efficient" ? "efficient_match" : "inefficient_match";

  return `exists (
    select 1
    from ${names.matches} efficient_match
    where efficient_match.pairing_id = p.id
      and efficient_match.${matchColumn}
  )`;
};
