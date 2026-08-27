import type { Pool, QueryResultRow } from "pg";
import type { PbsReserveCoverageResponse } from "../../../../packages/contracts/pbs-reserve-bids.js";
import {
  assertRosterPeriodContext,
  LineholderBidServiceError,
  type LineholderDraftActor,
  type LineholderPeriodContext,
} from "../lineholder/shared.js";

type PgPool = Pick<Pool, "query">;

type CoverageRow = QueryResultRow & {
  base_code: string | null;
  division: string | null;
  date: string | Date;
  required_reserve_count: number | string | null;
  available_off_count: number | string | null;
};

type CreatePbsReserveCoverageServiceOptions = {
  pgPool: PgPool;
  liveSchema: string;
  pbsSchema: string;
};

const validateSchemaName = (schemaName: string, label: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid ${label}: ${schemaName}`);
  }

  return schemaName;
};

const normalizeScopeCode = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase() ?? "";

  return normalized.length > 0 ? normalized : null;
};

const formatIsoDate = (value: string | Date) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
};

const toInteger = (value: number | string | null | undefined) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

export const createPbsReserveCoverageService = ({
  pgPool,
  liveSchema,
  pbsSchema,
}: CreatePbsReserveCoverageServiceOptions) => {
  const schema = validateSchemaName(liveSchema, "live schema name");
  const pbsSchemaName = validateSchemaName(pbsSchema, "PBS schema name");

  const loadCoverageRows = async ({
    actor,
    rangeStart,
    rangeEnd,
  }: {
    actor: LineholderDraftActor;
    rangeStart: string;
    rangeEnd: string;
  }) => {
    const result = await pgPool.query<CoverageRow>(`
      with calendar as (
        select generate_series(
          $1::date,
          $2::date,
          interval '1 day'
        )::date as coverage_date
      ),
      res_call_codes as (
        select distinct upper(coalesce(nullif(btrim(code_value), ''), nullif(btrim(code), '')))::varchar as code
        from ${schema}.dictionary
        where parent_code = 'RES_CALL_TYPE'
          and coalesce(nullif(btrim(code_value), ''), nullif(btrim(code), '')) is not null
      ),
      actor_identity as (
        select
          $3::varchar as crew_id,
          $4::varchar as user_code
      ),
      actor_scope as (
        select
          nullif(btrim(crew_base.base), '')::varchar as base,
          nullif(btrim(pbs_user.division), '')::varchar as division
        from actor_identity
        left join ${pbsSchemaName}.pbs_user pbs_user
          on pbs_user.crew_id = actor_identity.crew_id
            and pbs_user.user_code = actor_identity.user_code
        left join ${schema}.crew_base crew_base
          on crew_base.crew_id = actor_identity.crew_id
         and crew_base.is_prime_base = 1
         and crew_base.eff_dt <= now()
         and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        order by pbs_user.id asc
        limit 1
      ),
      pilot_res_pairings as materialized (
        select
          p.id,
          p.pairing_dt::date as coverage_date
        from ${schema}.pairing p
        cross join actor_scope
        where p.is_deleted = 0
          and actor_scope.base is not null
          and actor_scope.division = 'P'
          and p.base = actor_scope.base
          and p.division = actor_scope.division
          and p.pairing_dt >= $1::date
          and p.pairing_dt <= $2::date
          and (
            p.assignment_group = 'RES'
            or upper(p.assignment) in (select code from res_call_codes)
          )
      ),
      cabin_res_pairings as materialized (
        select
          p.id,
          p.pairing_dt::date as coverage_date
        from ${schema}.pairing p
        cross join actor_scope
        where p.is_deleted = 0
          and actor_scope.base is not null
          and coalesce(actor_scope.division, '') <> 'P'
          and p.base = actor_scope.base
          and p.division = actor_scope.division
          and p.pairing_dt >= $1::date
          and p.pairing_dt <= $2::date
          and (
            p.assignment_group = 'RES'
            or upper(p.assignment) in (select code from res_call_codes)
          )
      ),
      reserve_pairings as (
        select id, coverage_date from pilot_res_pairings
        union all
        select id, coverage_date from cabin_res_pairings
      ),
      reserve_need as (
        select
          reserve_pairings.coverage_date,
          coalesce(sum(composition.required_reserve_count), 0)::int as required_reserve_count,
          coalesce(sum(composition.open_reserve_need), 0)::int as open_reserve_need
        from reserve_pairings
        cross join lateral (
          select
            coalesce(sum(coalesce(pc.plan, 0)), 0)::int as required_reserve_count,
            coalesce(sum(greatest(coalesce(pc.open, 0), 0)), 0)::int as open_reserve_need
          from ${schema}.pairing_composition pc
          where pc.pairing_id = reserve_pairings.id
            and pc.is_deleted = 0
        ) composition
        group by reserve_pairings.coverage_date
      ),
      pilot_active_crew_rows as (
        select distinct
          calendar.coverage_date,
          crew.crew_id
        from calendar
        cross join actor_scope
        inner join ${schema}.crew_base crew_base
          on crew_base.base = actor_scope.base
            and crew_base.is_prime_base = 1
            and crew_base.eff_dt < (calendar.coverage_date + interval '1 day')
            and (crew_base.exp_dt is null or crew_base.exp_dt >= calendar.coverage_date)
        inner join ${schema}.crew crew
          on crew.crew_id = crew_base.crew_id
            and actor_scope.division = 'P'
            and crew.division = actor_scope.division
            and crew.status = 0
            and crew.empl_dt < (calendar.coverage_date + interval '1 day')
            and (crew.term_dt is null or crew.term_dt >= calendar.coverage_date)
            and (crew.retire_dt is null or crew.retire_dt >= calendar.coverage_date)
      ),
      cabin_active_crew_rows as (
        select distinct
          calendar.coverage_date,
          crew.crew_id
        from calendar
        cross join actor_scope
        inner join ${schema}.crew_base crew_base
          on crew_base.base = actor_scope.base
            and crew_base.is_prime_base = 1
            and crew_base.eff_dt < (calendar.coverage_date + interval '1 day')
            and (crew_base.exp_dt is null or crew_base.exp_dt >= calendar.coverage_date)
        inner join ${schema}.crew crew
          on crew.crew_id = crew_base.crew_id
            and coalesce(actor_scope.division, '') <> 'P'
            and crew.division = actor_scope.division
            and crew.status = 0
            and crew.empl_dt < (calendar.coverage_date + interval '1 day')
            and (crew.term_dt is null or crew.term_dt >= calendar.coverage_date)
            and (crew.retire_dt is null or crew.retire_dt >= calendar.coverage_date)
      ),
      active_crew_rows as (
        select coverage_date, crew_id from pilot_active_crew_rows
        union all
        select coverage_date, crew_id from cabin_active_crew_rows
      ),
      active_crew as (
        select
          coverage_date,
          count(*)::int as active_crew_count
        from active_crew_rows
        group by coverage_date
      ),
      pilot_unavailable_crew as (
        select
          pilot_active_crew_rows.coverage_date,
          count(distinct pilot_active_crew_rows.crew_id)::int as unavailable_crew_count
        from pilot_active_crew_rows
        inner join ${schema}.crew_manday_fd_daily manday
          on manday.crew_id = pilot_active_crew_rows.crew_id
            and manday.crew_base_dt = pilot_active_crew_rows.coverage_date
            and manday.crew_base_dt >= $1::date
            and manday.crew_base_dt <= $2::date
            and manday.scenario_id = 0
        where manday.is_day_off = 1
          or manday.is_leave = 1
          or manday.is_al = 1
          or manday.standby > 0
          or manday.ground > 0
          or manday.credit > 0
          or manday.blh > 0
        group by pilot_active_crew_rows.coverage_date
      ),
      cabin_unavailable_crew as (
        select
          cabin_active_crew_rows.coverage_date,
          count(distinct cabin_active_crew_rows.crew_id)::int as unavailable_crew_count
        from cabin_active_crew_rows
        inner join ${schema}.crew_manday_cc_am_daily manday
          on manday.crew_id = cabin_active_crew_rows.crew_id
            and manday.crew_base_dt = cabin_active_crew_rows.coverage_date
            and manday.crew_base_dt >= $1::date
            and manday.crew_base_dt <= $2::date
            and manday.scenario_id = 0
        where manday.is_day_off = 1
          or manday.is_leave = 1
          or manday.is_al = 1
          or manday.standby > 0
          or manday.ground > 0
          or manday.credit > 0
          or manday.blh > 0
        group by cabin_active_crew_rows.coverage_date
      ),
      unavailable_crew as (
        select
          coverage_date,
          sum(unavailable_crew_count)::int as unavailable_crew_count
        from (
          select coverage_date, unavailable_crew_count from pilot_unavailable_crew
          union all
          select coverage_date, unavailable_crew_count from cabin_unavailable_crew
        ) rows
        group by coverage_date
      )
      select
        actor_scope.base::varchar as base_code,
        actor_scope.division::varchar as division,
        calendar.coverage_date::text as date,
        coalesce(reserve_need.required_reserve_count, 0)::int as required_reserve_count,
        greatest(
          coalesce(active_crew.active_crew_count, 0)
            - coalesce(unavailable_crew.unavailable_crew_count, 0)
            - coalesce(reserve_need.open_reserve_need, 0),
          0
        )::int as available_off_count
      from calendar
      cross join actor_scope
      left join reserve_need
        on reserve_need.coverage_date = calendar.coverage_date
      left join active_crew
        on active_crew.coverage_date = calendar.coverage_date
      left join unavailable_crew
        on unavailable_crew.coverage_date = calendar.coverage_date
      order by calendar.coverage_date
    `, [rangeStart, rangeEnd, actor.crewId, actor.userCode]);

    return result.rows;
  };

  return {
    async getCurrentCoverage(
      actor: LineholderDraftActor,
      period: LineholderPeriodContext,
    ): Promise<PbsReserveCoverageResponse> {
      assertRosterPeriodContext(period);

      const rows = await loadCoverageRows({
        actor,
        rangeStart: period.rpStartLocal,
        rangeEnd: period.rpEndLocal,
      });
      const baseCode = normalizeScopeCode(rows[0]?.base_code);
      const division = normalizeScopeCode(rows[0]?.division);

      if (!baseCode || !division) {
        throw new LineholderBidServiceError(
          409,
          "Current user base and division are required for reserve coverage.",
          "PERIOD_CONTEXT_REQUIRED",
        );
      }

      return {
        rosterPeriodId: period.rosterPeriodId,
        rpStartLocal: period.rpStartLocal,
        rpEndLocal: period.rpEndLocal,
        periodCode: period.periodCode,
        baseCode,
        days: rows.map((row) => ({
          date: formatIsoDate(row.date),
          requiredReserveCount: toInteger(row.required_reserve_count),
          availableOffCount: toInteger(row.available_off_count),
        })),
        warnings: [],
      };
    },
  };
};
