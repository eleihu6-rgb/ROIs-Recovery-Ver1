import type { Pool } from "pg";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import type { PairingSearchActor } from "./types.js";

type ActorBaseRow = {
  base: string | null;
};

type ActorContextRow = {
  base: string | null;
  rank: string | null;
  zone_id: string | null;
};

type SinglePropertyActorContextRow = {
  rank: string | null;
  has_usable_base: boolean;
  zone_id: string | null;
  bases: string[] | null;
};

type ResolvePairingSearchActorBaseInput = {
  pgPool: Pick<Pool, "query">;
  schema: string;
  pbsSchema: string;
  actor: PairingSearchActor;
};

type ResolveSinglePropertyPreviewActorContextInput = ResolvePairingSearchActorBaseInput & {
  periodStartDate: string;
  periodEndDate: string;
};

export const PAIRING_SEARCH_ACTOR_BASE_REQUIRED_MESSAGE = "Current user base is required for pairing search.";
export const PAIRING_SEARCH_ACTOR_RANK_REQUIRED_MESSAGE = "Current user rank is required for pairing search preview.";
export const PAIRING_SEARCH_EFFECTIVE_BASE_REQUIRED_MESSAGE = "No usable crew base was found for the selected bid period.";
export const PAIRING_SEARCH_BASE_TIMEZONE_REQUIRED_MESSAGE = "A valid timezone is required for the current pairing base.";

const normalizeBase = (base: string | null | undefined) => {
  const normalized = base?.trim().toUpperCase() ?? "";
  return normalized.length > 0 ? normalized : null;
};

export const resolvePairingSearchActorBase = async ({
  pgPool,
  schema,
  actor,
}: ResolvePairingSearchActorBaseInput) => {
  const result = await pgPool.query<ActorBaseRow>(
    `
      with actor_identity as (
        select
          $1::varchar as crew_id
      )
      select
        nullif(btrim(cb.base), '') as base
      from actor_identity actor
      left join lateral (
        select crew_base.base
        from ${schema}.crew_base crew_base
        where crew_base.crew_id = actor.crew_id
          and crew_base.eff_dt <= now()
          and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        order by crew_base.is_prime_base desc, crew_base.eff_dt desc, crew_base.id desc
        limit 1
      ) cb on true
      limit 1
    `,
    [actor.crewId],
  );
  const base = normalizeBase(result.rows[0]?.base);

  if (!base) {
    throw new LineholderBidServiceError(400, PAIRING_SEARCH_ACTOR_BASE_REQUIRED_MESSAGE);
  }

  return base;
};

export const resolvePairingSearchActorContext = async ({
  pgPool,
  schema,
  actor,
}: ResolvePairingSearchActorBaseInput) => {
  const result = await pgPool.query<ActorContextRow>(
    `
      with actor_identity as (
        select
          $1::varchar as crew_id
      )
      select
        nullif(btrim(cb.base), '') as base,
        nullif(btrim(cr.rank), '') as rank,
        base_tz.name as zone_id
      from actor_identity actor
      left join lateral (
        select crew_base.base
        from ${schema}.crew_base crew_base
        where crew_base.crew_id = actor.crew_id
          and crew_base.eff_dt <= now()
          and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        order by crew_base.is_prime_base desc, crew_base.eff_dt desc, crew_base.id desc
        limit 1
      ) cb on true
      left join lateral (
        select crew_rank.rank
        from ${schema}.crew_rank crew_rank
        where crew_rank.crew_id = actor.crew_id
          and crew_rank.eff_dt <= now()
          and (crew_rank.exp_dt is null or crew_rank.exp_dt > now())
        order by crew_rank.eff_dt desc, crew_rank.id desc
        limit 1
      ) cr on true
      left join ${schema}.airport base_airport
        on upper(btrim(base_airport.airport)) = upper(btrim(cb.base))
      left join pg_timezone_names base_tz
        on base_tz.name = nullif(btrim(base_airport.zone_id), '')
      limit 1
    `,
    [actor.crewId],
  );
  const base = normalizeBase(result.rows[0]?.base);
  const rank = normalizeBase(result.rows[0]?.rank);
  const zoneId = result.rows[0]?.zone_id?.trim() || null;

  if (!base) {
    throw new LineholderBidServiceError(400, PAIRING_SEARCH_ACTOR_BASE_REQUIRED_MESSAGE);
  }

  if (!zoneId) {
    throw new LineholderBidServiceError(
      409,
      PAIRING_SEARCH_BASE_TIMEZONE_REQUIRED_MESSAGE,
      "PAIRING_BASE_TIMEZONE_REQUIRED",
    );
  }

  return { base, rank, zoneId };
};

export const resolveSinglePropertyPreviewActorContext = async ({
  pgPool,
  schema,
  actor,
  periodStartDate,
  periodEndDate,
}: ResolveSinglePropertyPreviewActorContextInput) => {
  const result = await pgPool.query<SinglePropertyActorContextRow>(
    `
      with actor_identity as (
        select
          $1::varchar as crew_id
      )
      select
        nullif(btrim(cr.rank), '') as rank,
        effective_base.has_usable_base,
        effective_base.zone_id,
        effective_base.bases
      from actor_identity actor
      left join lateral (
        select crew_rank.rank
        from ${schema}.crew_rank crew_rank
        where crew_rank.crew_id = actor.crew_id
          and crew_rank.eff_dt < (($3::date + 1)::timestamp at time zone 'UTC')
          and (
            crew_rank.exp_dt is null
            or crew_rank.exp_dt >= ($2::date::timestamp at time zone 'UTC')
          )
        order by crew_rank.eff_dt desc, crew_rank.id desc
        limit 1
      ) cr on true
      left join lateral (
        select
          count(*) > 0 as has_usable_base,
          array_agg(distinct upper(btrim(crew_base.base))) as bases,
          case
            when count(distinct crew_base_tz.name) = 1 then min(crew_base_tz.name)
            else null
          end as zone_id
          from ${schema}.crew_base crew_base
          join ${schema}.airport crew_base_airport
            on upper(btrim(crew_base_airport.airport)) = upper(btrim(crew_base.base))
          join pg_timezone_names crew_base_tz
            on crew_base_tz.name = nullif(btrim(crew_base_airport.zone_id), '')
          where crew_base.crew_id = actor.crew_id
            and crew_base.eff_dt < (($3::date + 1)::timestamp at time zone crew_base_tz.name)
            and (
              crew_base.exp_dt is null
              or crew_base.exp_dt >= ($2::date::timestamp at time zone crew_base_tz.name)
            )
      ) effective_base on true
      limit 1
    `,
    [actor.crewId, periodStartDate, periodEndDate],
  );
  const rank = normalizeBase(result.rows[0]?.rank);
  const zoneId = result.rows[0]?.zone_id?.trim() || null;
  const bases = Array.from(new Set(
    (result.rows[0]?.bases ?? []).map((base) => normalizeBase(base)).filter((base): base is string => base !== null),
  )).sort();

  if (!rank) {
    throw new LineholderBidServiceError(400, PAIRING_SEARCH_ACTOR_RANK_REQUIRED_MESSAGE);
  }

  if (result.rows[0]?.has_usable_base !== true) {
    throw new LineholderBidServiceError(400, PAIRING_SEARCH_EFFECTIVE_BASE_REQUIRED_MESSAGE);
  }

  return { rank, zoneId, bases };
};
