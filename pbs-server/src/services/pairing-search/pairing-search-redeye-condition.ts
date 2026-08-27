import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

type AvailableRedeyeDefinition = PbsRedeyeDefinition & { available: true };

export const buildRedeyePairingWindowCondition = ({
  dateClause = null,
  liveSchema,
  redeye,
  sqlBuilder,
}: {
  dateClause?: string | null;
  liveSchema: string;
  redeye: AvailableRedeyeDefinition;
  sqlBuilder: PairingSearchSqlBuilder;
}) => {
  const startTime = sqlBuilder.addParam(redeye.startTime);
  const endTime = sqlBuilder.addParam(redeye.endTime);
  const endOffset = redeye.crossesMidnight ? " + interval '1 day'" : "";
  const anchorStartOffset = redeye.crossesMidnight
    ? " - interval '1 day'"
    : "";
  const clauses = [
    "s.pairing_id = p.id",
    "s.is_deleted = 0",
    `tstzrange(s.sch_str_dt_utc, s.sch_end_dt_utc, '[)') && tstzrange(
      (redeye_windows.redeye_date + ${startTime}::time) at time zone dep_timezone.name,
      ((redeye_windows.redeye_date + ${endTime}::time)${endOffset}) at time zone dep_timezone.name,
      '[)'
    )`,
    dateClause,
  ].filter((clause): clause is string => Boolean(clause));

  return `
    exists (
      select 1
      from ${liveSchema}.pairing_segment s
      join ${liveSchema}.airport dep_airport
        on dep_airport.airport = s.dep_arp
      join pg_timezone_names dep_timezone
        on dep_timezone.name = nullif(btrim(dep_airport.zone_id), '')
      cross join lateral (
        select generate_series(
          (s.sch_str_dt_utc at time zone dep_timezone.name)::date::timestamp${anchorStartOffset},
          (s.sch_end_dt_utc at time zone dep_timezone.name)::date::timestamp,
          interval '1 day'
        )::date as redeye_date
      ) redeye_windows
      where ${clauses.join("\n        and ")}
    )
  `;
};
