import type { Pool } from "pg";

export interface CrewIdentity {
  base: string | null;
  rank: string | null;
  division: string | null;
  zoneId: string | null;
}

/**
 * Resolve a crew's current base / rank / division / zoneId from the LIVE schema.
 * - base: prime base (is_prime_base=1) effective-dated; fallback to any effective base.
 * - rank: latest effective-dated crew_rank row.
 * - division: crew.division.
 * - zoneId: airport.zone_id resolved from base.
 * Replaces the denormalized pbs_user.base/rank columns.
 */
export const resolveCrewIdentity = async (
  pgPool: Pick<Pool, "query">,
  liveSchema: string,
  crewId: string,
): Promise<CrewIdentity> => {
  const result = await pgPool.query<CrewIdentity>(
    `with actor as (
      select $1::varchar as crew_id
    )
    select
      base_row.base::varchar as "base",
      rank_row.rank::varchar as "rank",
      crew.division::varchar as "division",
      airport.zone_id::varchar as "zoneId"
    from actor
    left join lateral (
      select crew_base.base
      from ${liveSchema}.crew_base crew_base
      where crew_base.crew_id = actor.crew_id
        and crew_base.eff_dt <= now()
        and (crew_base.exp_dt is null or crew_base.exp_dt > now())
      order by crew_base.is_prime_base desc, crew_base.eff_dt desc
      limit 1
    ) base_row on true
    left join lateral (
      select crew_rank.rank
      from ${liveSchema}.crew_rank crew_rank
      where crew_rank.crew_id = actor.crew_id
        and crew_rank.eff_dt <= now()
        and (crew_rank.exp_dt is null or crew_rank.exp_dt > now())
      order by crew_rank.eff_dt desc
      limit 1
    ) rank_row on true
    left join ${liveSchema}.crew crew
      on crew.crew_id = actor.crew_id
    left join ${liveSchema}.airport airport
      on airport.airport = upper(base_row.base)
    limit 1`,
    [crewId],
  );
  const row = result.rows[0];

  return {
    base: row?.base ?? null,
    rank: row?.rank ?? null,
    division: row?.division ?? null,
    zoneId: row?.zoneId ?? null,
  };
};
