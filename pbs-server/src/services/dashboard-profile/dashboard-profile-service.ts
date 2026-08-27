import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, QueryResultRow } from "pg";
import { pbsUser } from "../../models/index.js";
import { formatDashboardDateTimeLabel } from "../dashboard-timezone.js";
import { resolveCrewIdentity } from "../lineholder/crew-identity.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import { resolveCurrentPeriod } from "../lineholder/shared.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import type {
  DashboardProfileActor,
  PbsDashboardProfileService,
} from "./types.js";
import type { PbsCache } from "../../utils/cache.js";
import type { PbsDashboardUserProfile } from "../../../../packages/contracts/pbs-dashboard-profile.js";

type Database = ReturnType<typeof drizzle>;
type PgPool = Pick<Pool, "query">;

type LiveProfileRow = QueryResultRow & {
  seniority_num: string | null;
  fleet_values: Array<string | null> | null;
  language_values: Array<string | null> | null;
  credit: string | null;
};

type LiveProfileFields = {
  fleet: string[] | null;
  languages: string[] | null;
  seniorityLabel: string | null;
  statusLabel: string | null;
  existingCreditLabel: string | null;
  zoneId: string | null;
};

export class DashboardProfileServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "DashboardProfileServiceError";
    this.statusCode = statusCode;
  }
}

const trimToNullable = (value: string | null) => {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

const normalizeUniqueList = (values: Array<string | null>) => {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalized = trimToNullable(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedValues.push(normalized);
  }

  return normalizedValues.length > 0 ? normalizedValues : null;
};

const formatNumericLabel = (value: string | null) => {
  const normalized = trimToNullable(value);

  if (!normalized) {
    return null;
  }

  const numericValue = Number(normalized);

  if (!Number.isFinite(numericValue)) {
    return normalized;
  }

  return numericValue.toString();
};

const resolveCreditTable = (division: string | null) => {
  const normalized = trimToNullable(division)?.toUpperCase();

  if (normalized === "P") {
    return "crew_manday_fd_period";
  }

  if (normalized === "C" || normalized === "A") {
    return "crew_manday_cc_am_period";
  }

  return null;
};

type CreatePbsDashboardProfileServiceOptions = {
  db: Database;
  pgPool?: PgPool;
  liveSchema?: string;
  cache?: PbsCache;
};

const CURRENT_PERIOD_CACHE_TTL_MS = 60_000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;
const DASHBOARD_PROFILE_CACHE_TTL_MS = 60_000;
const DASHBOARD_PROFILE_CACHE_TTL_SECONDS = DASHBOARD_PROFILE_CACHE_TTL_MS / 1000;

const cloneDashboardProfile = (profile: PbsDashboardUserProfile): PbsDashboardUserProfile => ({
  ...profile,
  fleet: profile.fleet ? [...profile.fleet] : null,
  languages: profile.languages ? [...profile.languages] : null,
});

const deserializeDashboardProfile = (value: unknown): PbsDashboardUserProfile =>
  cloneDashboardProfile(value as PbsDashboardUserProfile);

export const createPbsDashboardProfileService = ({
  db,
  pgPool,
  liveSchema,
  cache,
}: CreatePbsDashboardProfileServiceOptions): PbsDashboardProfileService => {
  const schema = pgPool && liveSchema ? validateLiveSchema(liveSchema) : null;
  const businessClock = createPbsBusinessClock({ db });
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;
  let profileCache: {
    key: string;
    expiresAt: number;
    value: PbsDashboardUserProfile;
  } | null = null;

  const queryRows = async <TRow extends QueryResultRow>(
    query: string,
    values: unknown[],
  ) => {
    if (!pgPool) {
      return [] as TRow[];
    }

    const result = await pgPool.query<TRow>(query, values);
    return result.rows;
  };

  const getCurrentPeriod = async (
    actor: Pick<DashboardProfileActor, "crewId">,
  ): Promise<Awaited<ReturnType<typeof resolveCurrentPeriod>>> => {
    if (cache) {
      const period = await cache.getOrSet(
        cache.key("period", "current", "v3", actor.crewId),
        CURRENT_PERIOD_CACHE_TTL_SECONDS,
        async () => resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow()),
        {
          serialize: serializeLineholderPeriodContext,
          deserialize: deserializeLineholderPeriodContext,
        },
      );

      return cloneLineholderPeriodContext(period);
    }

    const now = Date.now();
    if (currentPeriodCache?.crewId === actor.crewId && currentPeriodCache.expiresAt > now) {
      return cloneLineholderPeriodContext(currentPeriodCache.value);
    }

    const period = await resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow());
    currentPeriodCache = {
      crewId: actor.crewId,
      expiresAt: now + CURRENT_PERIOD_CACHE_TTL_MS,
      value: cloneLineholderPeriodContext(period),
    };

    return cloneLineholderPeriodContext(period);
  };

  const resolveEffectiveRosterPeriodKey = async (actor: DashboardProfileActor) => {
    const explicitRosterPeriodKey = trimToNullable(actor.rosterPeriodKey ?? null);

    if (explicitRosterPeriodKey) {
      return explicitRosterPeriodKey;
    }

    const period = await getCurrentPeriod({ crewId: actor.crewId });
    return period.rosterPeriodKey;
  };

  const resolveCreditRosterPeriodKey = (
    division: string | null,
    effectiveRosterPeriodKey: string,
  ) => {
    if (!resolveCreditTable(division)) {
      return null;
    }

    return effectiveRosterPeriodKey;
  };

  const loadLiveProfileRow = async (
    crewId: string,
    base: string | null,
    division: string | null,
    yearMonth: string | null,
  ) => {
    if (!schema) {
      return null;
    }

    const creditTable = yearMonth ? resolveCreditTable(division) : null;
    const creditJoin = creditTable
      ? `
        left join lateral (
          select credit::varchar as credit
          from ${schema}.${creditTable}
          where crew_id = actor.crew_id
            and roster_period = $3
            and scenario_id = 0
          limit 1
        ) credit on true
      `
      : `
        left join lateral (
          select null::varchar as credit
        ) credit on true
      `;

    const values = creditTable
      ? [crewId, base?.toUpperCase() ?? null, yearMonth]
      : [crewId, base?.toUpperCase() ?? null];
    const rows = await queryRows<LiveProfileRow>(`
      with actor as (
        select
          $1::varchar as crew_id,
          $2::varchar as base
      )
      select
        crew.seniority_num::varchar as seniority_num,
        fleet.fleet_values,
        languages.language_values,
        credit.credit
      from actor
      left join ${schema}.crew crew
        on crew.crew_id = actor.crew_id
      left join lateral (
        select array_agg(value order by value) as fleet_values
        from (
          select distinct nullif(btrim(fleet_specific::varchar), '') as value
          from ${schema}.crew_fleet
          where crew_id = actor.crew_id
            and eff_dt <= now()
            and (exp_dt is null or exp_dt >= now())
        ) fleet_rows
        where value is not null
      ) fleet on true
      left join lateral (
        select array_agg(label order by language, language_level) as language_values
        from (
          select distinct
            nullif(btrim(language::varchar), '') as language,
            nullif(btrim(language_level::varchar), '') as language_level,
            case
              when nullif(btrim(language::varchar), '') is null then null
              when nullif(btrim(language_level::varchar), '') is null then nullif(btrim(language::varchar), '')
              else concat(nullif(btrim(language::varchar), ''), ' ', nullif(btrim(language_level::varchar), ''))
            end as label
          from ${schema}.crew_language
          where crew_id = actor.crew_id
            and is_valid = 1
            and eff_dt <= now()
            and (exp_dt is null or exp_dt >= now())
        ) language_rows
        where label is not null
      ) languages on true
      ${creditJoin}
      limit 1
    `, values);

    return rows[0] ?? null;
  };

  const loadLiveProfileFields = async (
    crewId: string,
    base: string | null,
    division: string | null,
    zoneId: string | null,
    effectiveRosterPeriodKey: string,
  ): Promise<LiveProfileFields> => {
    if (!schema) {
      return {
        fleet: null,
        languages: null,
        seniorityLabel: null,
        statusLabel: null,
        existingCreditLabel: null,
        zoneId: null,
      };
    }

    const resolvedRosterPeriodKey = resolveCreditRosterPeriodKey(division, effectiveRosterPeriodKey);
    const row = await loadLiveProfileRow(crewId, base, division, resolvedRosterPeriodKey);

    return {
      fleet: normalizeUniqueList(row?.fleet_values ?? []),
      languages: normalizeUniqueList(row?.language_values ?? []),
      seniorityLabel: formatNumericLabel(row?.seniority_num ?? null),
      statusLabel: null,
      existingCreditLabel: formatNumericLabel(row?.credit ?? null),
      zoneId: trimToNullable(zoneId),
    };
  };

  const loadProfile = async (
    actor: DashboardProfileActor,
    effectiveRosterPeriodKey: string,
  ): Promise<PbsDashboardUserProfile> => {
    const result = await db
      .select({
        id: pbsUser.id,
        crewId: pbsUser.crewId,
        userName: pbsUser.userName,
        email: pbsUser.email,
        division: pbsUser.division,
        lastLoginAt: pbsUser.lastLoginAt,
      })
      .from(pbsUser)
      .where(eq(pbsUser.crewId, actor.crewId))
      .limit(1);

    const user = result[0];

    if (!user) {
      throw new DashboardProfileServiceError(404, "PBS user profile was not found.");
    }

    const identity = pgPool && schema
      ? await resolveCrewIdentity(pgPool, schema, user.crewId)
      : { base: null, rank: null, division: null, zoneId: null };
    const base = trimToNullable(identity.base);
    const liveProfile = await loadLiveProfileFields(
      user.crewId,
      base,
      user.division,
      identity.zoneId,
      effectiveRosterPeriodKey,
    );

    return {
      id: String(user.id),
      employeeNo: user.crewId,
      name: user.userName,
      email: trimToNullable(user.email),
      base,
      rank: trimToNullable(identity.rank),
      division: trimToNullable(user.division),
      fleet: liveProfile.fleet,
      languages: liveProfile.languages,
      seniorityLabel: liveProfile.seniorityLabel,
      statusLabel: liveProfile.statusLabel,
      existingCreditLabel: liveProfile.existingCreditLabel,
      trainingMonthLabel: null,
      lastLoginLabel: formatDashboardDateTimeLabel(user.lastLoginAt, liveProfile.zoneId ?? "UTC"),
    };
  };

  const getCachedProfile = async (
    actor: DashboardProfileActor,
    effectiveRosterPeriodKey: string,
  ): Promise<PbsDashboardUserProfile> => {
    const keyParts = ["dashboard", "profile", "v1", actor.crewId, effectiveRosterPeriodKey] as const;

    if (cache) {
      const profile = await cache.getOrSet(
        cache.key(...keyParts),
        DASHBOARD_PROFILE_CACHE_TTL_SECONDS,
        async () => loadProfile(actor, effectiveRosterPeriodKey),
        {
          serialize: cloneDashboardProfile,
          deserialize: deserializeDashboardProfile,
        },
      );

      return cloneDashboardProfile(profile);
    }

    const memoryKey = keyParts.join(":");
    const now = Date.now();
    if (profileCache?.key === memoryKey && profileCache.expiresAt > now) {
      return cloneDashboardProfile(profileCache.value);
    }

    const profile = await loadProfile(actor, effectiveRosterPeriodKey);
    profileCache = {
      key: memoryKey,
      expiresAt: now + DASHBOARD_PROFILE_CACHE_TTL_MS,
      value: cloneDashboardProfile(profile),
    };

    return cloneDashboardProfile(profile);
  };

  return {
    async getCurrentProfile(actor: DashboardProfileActor) {
      const effectiveRosterPeriodKey = await resolveEffectiveRosterPeriodKey(actor);
      return getCachedProfile(actor, effectiveRosterPeriodKey);
    },
  };
};
