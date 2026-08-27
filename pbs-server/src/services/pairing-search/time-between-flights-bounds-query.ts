import type { Pool } from "pg";
import {
  parsePbsMinimumTimeBetweenFlightsDefinition,
  pbsBidDefinitionCodes,
} from "../../../../packages/contracts/pbs-bid-definitions.js";

import { LineholderBidServiceError } from "../lineholder/shared.js";
import {
  DEFAULT_PAIRING_ZONE_ID,
  buildPairingLocalOriginDateExpression,
} from "./pairing-local-date-sql.js";

type BoundsRow = {
  maximum_minutes: number | null;
};

type DictionaryRow = {
  code_value: string | null;
};

export const executeTimeBetweenFlightsBoundsQuery = async ({
  actorBase,
  actorRank,
  periodEndDate,
  periodStartDate,
  pgPool,
  schema,
}: {
  actorBase: string;
  actorRank: string | null;
  periodEndDate: string;
  periodStartDate: string;
  pgPool: Pick<Pool, "query">;
  schema: string;
}) => {
  const dictionaryResult = await pgPool.query<DictionaryRow>(
    `
      select code_value
      from ${schema}.dictionary
      where parent_code = 'SYS_PARAM'
        and code = $1
    `,
    [pbsBidDefinitionCodes.minimumTimeBetweenFlightsMinutes],
  );
  const minimumDefinition = parsePbsMinimumTimeBetweenFlightsDefinition(
    dictionaryResult.rows.length === 1
      ? { minimumMinutes: dictionaryResult.rows[0]?.code_value }
      : undefined,
  );
  if (!minimumDefinition.available) {
    throw new LineholderBidServiceError(500, "Time Between Flights minimum is not configured.");
  }
  const minimumMinutes = minimumDefinition.minimumMinutes;
  const rankFilter = actorRank
    ? `and exists (
        select 1
        from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = $5
          and pc.is_deleted = 0
      )`
    : "";
  const params = actorRank
    ? [actorBase, DEFAULT_PAIRING_ZONE_ID, periodStartDate, periodEndDate, actorRank]
    : [actorBase, DEFAULT_PAIRING_ZONE_ID, periodStartDate, periodEndDate];
  const localOriginDate = buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: "coalesce(base_timezone.name, $2::text)",
  });
  const result = await pgPool.query<BoundsRow>(
    `
      select max(connections.connection_minutes)::integer as maximum_minutes
      from ${schema}.pairing p
      left join ${schema}.airport base_airport
        on base_airport.airport = p.base
      left join pg_timezone_names base_timezone
        on base_timezone.name = nullif(btrim(base_airport.zone_id), '')
      cross join lateral (
        select extract(epoch from (
          lead(s.sch_str_dt_utc) over (partition by s.pairing_id, s.duty_seq order by s.seg_seq)
          - s.sch_end_dt_utc
        )) / 60 as connection_minutes
        from ${schema}.pairing_segment s
        where s.pairing_id = p.id
          and s.is_deleted = 0
      ) connections
      where p.is_deleted = 0
        and p.base = $1
        and ${localOriginDate} between $3::date and $4::date
        ${rankFilter}
        and connections.connection_minutes is not null
    `,
    params,
  );

  return {
    minimumMinutes,
    maximumMinutes: result.rows[0]?.maximum_minutes ?? null,
  };
};
