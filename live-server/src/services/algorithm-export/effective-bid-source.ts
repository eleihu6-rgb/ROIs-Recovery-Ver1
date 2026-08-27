import type { Pool } from "pg";

export type EffectiveBidSourceRow = {
  bidId: string;
  crewId: string;
  periodCode: string;
  bidContext: "Current" | "StandingLineholder" | "StandingReserve";
  hasGroup: boolean;
  hasDayOff: boolean;
};

export type EffectiveBidSource = {
  crewId: string;
  source: "Current" | "Standing";
  bidIds: string[];
};

const validateSchema = (schema: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`);
  }

  return schema;
};

export const resolveEffectiveBidSources = (
  rows: readonly EffectiveBidSourceRow[],
): EffectiveBidSource[] => {
  const rowsByCrew = new Map<string, EffectiveBidSourceRow[]>();

  for (const row of rows) {
    const crewRows = rowsByCrew.get(row.crewId) ?? [];
    crewRows.push(row);
    rowsByCrew.set(row.crewId, crewRows);
  }

  const sources: EffectiveBidSource[] = [];

  for (const [crewId, crewRows] of rowsByCrew) {
    const current = crewRows.find((row) =>
      row.bidContext === "Current" && (row.hasGroup || row.hasDayOff));

    if (current) {
      sources.push({ crewId, source: "Current", bidIds: [current.bidId] });
      continue;
    }

    const standingBidIds = crewRows
      .filter((row) =>
        (row.bidContext === "StandingLineholder" || row.bidContext === "StandingReserve")
        && row.hasGroup)
      .map((row) => row.bidId);

    if (standingBidIds.length > 0) {
      sources.push({ crewId, source: "Standing", bidIds: standingBidIds });
    }
  }

  return sources.sort((left, right) => left.crewId.localeCompare(right.crewId));
};

export const loadEffectiveBidSources = async (
  pgPool: Pool,
  liveSchemaName: string,
  pbsSchemaName: string,
  rosterPeriodId: number,
  candidateCrewIds?: readonly string[],
): Promise<EffectiveBidSource[]> => {
  if (candidateCrewIds?.length === 0) {
    return [];
  }

  const liveSchema = validateSchema(liveSchemaName);
  const pbsSchema = validateSchema(pbsSchemaName);
  const params: unknown[] = [rosterPeriodId];
  const crewScopeSql = candidateCrewIds
    ? `and b.crew_id = any($2::varchar[])`
    : "";

  if (candidateCrewIds) {
    params.push(candidateCrewIds);
  }

  const result = await pgPool.query<EffectiveBidSourceRow>(
    `
      select
        b.id::text as "bidId",
        b.crew_id::varchar as "crewId",
        b.period_code::varchar as "periodCode",
        b.bid_context::varchar as "bidContext",
        exists (
          select 1
          from ${pbsSchema}.pbs_bid_group bid_group
          where bid_group.bid_id = b.id
        ) as "hasGroup",
        exists (
          select 1
          from ${pbsSchema}.pbs_bid_day_off bid_day_off
          where bid_day_off.bid_id = b.id
        ) as "hasDayOff"
      from ${pbsSchema}.pbs_bid b
      inner join ${liveSchema}.crew crew
        on crew.crew_id = b.crew_id
      where (
        (b.roster_period_id = $1::bigint and b.bid_context = 'Current')
        or (
          b.period_code = 'STANDING'
          and b.bid_context in ('StandingLineholder', 'StandingReserve')
        )
      )
        ${crewScopeSql}
      order by b.crew_id, b.bid_context, b.id
    `,
    params,
  );

  return resolveEffectiveBidSources(result.rows);
};
