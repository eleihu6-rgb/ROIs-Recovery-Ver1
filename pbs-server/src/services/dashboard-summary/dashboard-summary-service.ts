import type { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type {
  PbsDashboardMessageCenter,
} from "../../../../packages/contracts/pbs-dashboard-summary.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import { formatDashboardDateTimeLabel } from "../dashboard-timezone.js";
import { resolveCurrentPeriod } from "../lineholder/shared.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import type { PbsDashboardProfileService } from "../dashboard-profile/types.js";
import type {
  DashboardSummaryActor,
  PbsDashboardSummaryService,
} from "./types.js";
import type { PbsCache } from "../../utils/cache.js";

type Database = ReturnType<typeof drizzle>;
type PgPool = Pick<Pool, "query">;

type PreAssignmentRow = {
  roster_id: string | null;
  pairing_id: string | null;
  assignment_group: string | null;
  assignment: string | null;
  label: string | null;
  start_utc: string | Date | null;
  end_utc: string | Date | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

type PreAssignmentSummary = PbsDashboardMessageCenter["preAssignments"];
type PreAssignmentItem = PreAssignmentSummary["details"][number];
type PreAssignmentCategory = PreAssignmentSummary["categories"][number];

type PreAssignmentCategoryDefinition = {
  code: string;
  label: string;
  order: number;
};

type PreAssignmentGroup = PreAssignmentItem & {
  category: PreAssignmentCategoryDefinition;
  startUtcMs: number;
  endUtcMs: number;
  startTime: string | null;
  endTime: string | null;
};

type CreatePbsDashboardSummaryServiceOptions = {
  db: Pick<Database, "execute">;
  pgPool: PgPool;
  liveSchema: string;
  pbsSchema: string;
  dashboardProfileService: PbsDashboardProfileService;
  cache?: PbsCache;
};

export class DashboardSummaryServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "DashboardSummaryServiceError";
    this.statusCode = statusCode;
  }
}

const validateSchemaName = (schemaName: string, label: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid ${label}: ${schemaName}`);
  }

  return schemaName;
};

const trimToNullable = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

const formatRemainingLabel = (businessNow: Date, bidCloseAt: Date | null) => {
  if (!bidCloseAt) {
    return null;
  }

  const remainingMs = bidCloseAt.getTime() - businessNow.getTime();

  if (remainingMs <= 0) {
    return "Closed";
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes % 60;

  return `${days} DAYS ${hours} HRS ${minutes} MINS`;
};

const PRE_ASSIGNMENT_SOURCE = "IMP";
const ONE_DAY_MS = 86_400_000;
const EMPTY_PRE_ASSIGNMENTS: PreAssignmentSummary = {
  totalDuties: 0,
  daysTouched: 0,
  categories: [],
  details: [],
};
const PAIRING_CATEGORY: PreAssignmentCategoryDefinition = {
  code: "PAIRING",
  label: "Pairing",
  order: 10,
};
const DAYS_OFF_CATEGORY: PreAssignmentCategoryDefinition = {
  code: "DAYS_OFF",
  label: "Days Off",
  order: 20,
};
const RESERVE_CATEGORY: PreAssignmentCategoryDefinition = {
  code: "RESERVE",
  label: "Reserve",
  order: 30,
};
const TRAINING_CATEGORY: PreAssignmentCategoryDefinition = {
  code: "TRAINING",
  label: "Training",
  order: 40,
};
const DEADHEAD_CATEGORY: PreAssignmentCategoryDefinition = {
  code: "DEADHEAD",
  label: "Deadhead",
  order: 50,
};
const UNAVAILABLE_CATEGORY: PreAssignmentCategoryDefinition = {
  code: "UNAVAILABLE",
  label: "Unavailable",
  order: 60,
};
const OTHER_CATEGORY: PreAssignmentCategoryDefinition = {
  code: "OTHER",
  label: "Other",
  order: 90,
};
const DAY_OFF_ASSIGNMENTS = new Set(["DO", "GDO", "OFF"]);
const RESERVE_ASSIGNMENTS = new Set(["RES"]);
const TRAINING_ASSIGNMENTS = new Set(["SIM", "SFT", "CBT"]);
const DEADHEAD_ASSIGNMENTS = new Set(["DHD"]);
const UNAVAILABLE_ASSIGNMENTS = new Set(["VAC", "ILL"]);
const CURRENT_PERIOD_CACHE_TTL_MS = 60_000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;

const buildBaseTimeZone = (base: string | null, zoneId: string | null) => {
  const normalizedBase = trimToNullable(base)?.toUpperCase() ?? null;
  const normalizedZoneId = trimToNullable(zoneId);

  if (!normalizedBase || !normalizedZoneId) {
    return {
      zoneId: "UTC",
      timezoneLabel: "UTC",
    };
  }

  return {
    zoneId: normalizedZoneId,
    timezoneLabel: `${normalizedBase} Local Time`,
  };
};

const normalizeCode = (value: string | null | undefined) => trimToNullable(value)?.toUpperCase() ?? null;

const parseTimeMs = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const timeMs = date.getTime();

  return Number.isFinite(timeMs) ? timeMs : null;
};

const parseDateUtcMs = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const toIsoDate = (timeMs: number) => new Date(timeMs).toISOString().slice(0, 10);

const isPairingRow = (row: PreAssignmentRow) => {
  const pairingId = Number.parseInt(row.pairing_id ?? "", 10);
  return Number.isSafeInteger(pairingId) && pairingId > 0;
};

const classifyPreAssignment = (
  isPairing: boolean,
  assignmentGroup: string | null,
  assignment: string | null,
): PreAssignmentCategoryDefinition => {
  if (isPairing) {
    return PAIRING_CATEGORY;
  }

  const codes = [assignment, assignmentGroup].filter((code): code is string => Boolean(code));

  if (codes.some((code) => DAY_OFF_ASSIGNMENTS.has(code))) {
    return DAYS_OFF_CATEGORY;
  }

  if (codes.some((code) => RESERVE_ASSIGNMENTS.has(code))) {
    return RESERVE_CATEGORY;
  }

  if (codes.some((code) => TRAINING_ASSIGNMENTS.has(code))) {
    return TRAINING_CATEGORY;
  }

  if (codes.some((code) => DEADHEAD_ASSIGNMENTS.has(code))) {
    return DEADHEAD_CATEGORY;
  }

  if (codes.some((code) => UNAVAILABLE_ASSIGNMENTS.has(code))) {
    return UNAVAILABLE_CATEGORY;
  }

  return OTHER_CATEGORY;
};

const buildTimeText = (startTime: string | null, endTime: string | null) => {
  const start = trimToNullable(startTime);
  const end = trimToNullable(endTime);

  if (!start && !end) {
    return null;
  }

  if (start && end && start !== end) {
    return `${start}-${end}`;
  }

  return start ?? end;
};

const buildItemLabel = (
  category: PreAssignmentCategoryDefinition,
  label: string | null,
  code: string,
) => {
  const normalizedLabel = trimToNullable(label);

  if (!normalizedLabel || normalizedLabel.toUpperCase() === code) {
    return category.label;
  }

  return normalizedLabel;
};

const updateGroupWindow = (group: PreAssignmentGroup, row: PreAssignmentRow) => {
  const startUtcMs = parseTimeMs(row.start_utc);
  const endUtcMs = parseTimeMs(row.end_utc) ?? startUtcMs;

  if (startUtcMs !== null && startUtcMs < group.startUtcMs) {
    group.startUtcMs = startUtcMs;
    group.startDate = row.start_date ?? group.startDate;
    group.startTime = row.start_time;
  }

  if (endUtcMs !== null && endUtcMs > group.endUtcMs) {
    group.endUtcMs = endUtcMs;
    group.endDate = row.end_date ?? group.endDate;
    group.endTime = row.end_time;
  }

  group.timeText = buildTimeText(group.startTime, group.endTime);
};

const addTouchedDates = (
  touchedDates: Set<string>,
  group: PreAssignmentGroup,
  periodStartLocal: string,
  periodEndLocal: string,
) => {
  const clampedStart = group.startDate < periodStartLocal ? periodStartLocal : group.startDate;
  const clampedEnd = group.endDate > periodEndLocal ? periodEndLocal : group.endDate;
  const startMs = parseDateUtcMs(clampedStart);
  const endMs = parseDateUtcMs(clampedEnd);

  if (startMs === null || endMs === null || endMs < startMs) {
    return;
  }

  for (let timeMs = startMs; timeMs <= endMs; timeMs += ONE_DAY_MS) {
    touchedDates.add(toIsoDate(timeMs));
  }
};

const clampDateToRange = (value: string, start: string, end: string) => {
  if (value < start) {
    return start;
  }

  if (value > end) {
    return end;
  }

  return value;
};

const buildPreAssignmentSummary = (
  rows: PreAssignmentRow[],
  periodStartLocal: string,
  periodEndLocal: string,
): PreAssignmentSummary => {
  if (rows.length === 0) {
    return EMPTY_PRE_ASSIGNMENTS;
  }

  const groups = new Map<string, PreAssignmentGroup>();

  for (const row of rows) {
    const startUtcMs = parseTimeMs(row.start_utc);

    if (startUtcMs === null || !row.start_date || !row.end_date) {
      continue;
    }

    const endUtcMs = parseTimeMs(row.end_utc) ?? startUtcMs;
    const isPairing = isPairingRow(row);
    const assignmentGroup = normalizeCode(row.assignment_group);
    const assignment = normalizeCode(row.assignment);
    const category = classifyPreAssignment(isPairing, assignmentGroup, assignment);
    const code = isPairing
      ? PAIRING_CATEGORY.code
      : assignment ?? assignmentGroup ?? OTHER_CATEGORY.code;
    const groupKey = isPairing
      ? `pairing:${row.pairing_id}`
      : `ground:${assignmentGroup ?? ""}:${assignment ?? ""}:${trimToNullable(row.label) ?? ""}:${startUtcMs}:${endUtcMs}`;
    const existingGroup = groups.get(groupKey);

    if (existingGroup) {
      updateGroupWindow(existingGroup, row);
      continue;
    }

    groups.set(groupKey, {
      id: groupKey,
      type: isPairing ? "pairing" : "ground",
      code,
      label: buildItemLabel(category, row.label, code),
      startDate: row.start_date,
      endDate: row.end_date,
      timeText: buildTimeText(row.start_time, row.end_time),
      category,
      startUtcMs,
      endUtcMs,
      startTime: row.start_time,
      endTime: row.end_time,
    });
  }

  const groupedItems = [...groups.values()].sort((left, right) => left.startUtcMs - right.startUtcMs);
  const categoryCounts = new Map<string, PreAssignmentCategory & { order: number }>();
  const touchedDates = new Set<string>();

  for (const group of groupedItems) {
    addTouchedDates(touchedDates, group, periodStartLocal, periodEndLocal);

    const current = categoryCounts.get(group.category.code);
    categoryCounts.set(group.category.code, {
      code: group.category.code,
      label: group.category.label,
      count: (current?.count ?? 0) + 1,
      order: group.category.order,
    });
  }

  const details = groupedItems
    .map(({ category, startUtcMs, endUtcMs, startTime, endTime, ...item }) => ({
      ...item,
      startDate: clampDateToRange(item.startDate, periodStartLocal, periodEndLocal),
      endDate: clampDateToRange(item.endDate, periodStartLocal, periodEndLocal),
    }));

  return {
    totalDuties: groupedItems.length,
    daysTouched: touchedDates.size,
    categories: [...categoryCounts.values()]
      .sort((left, right) => left.order - right.order)
      .map(({ order, ...category }) => category),
    details,
  };
};

export const createPbsDashboardSummaryService = ({
  db,
  pgPool,
  liveSchema,
  pbsSchema,
  dashboardProfileService,
  cache,
}: CreatePbsDashboardSummaryServiceOptions): PbsDashboardSummaryService => {
  const schema = validateSchemaName(liveSchema, "live schema name");
  validateSchemaName(pbsSchema, "PBS schema name");
  const businessClock = createPbsBusinessClock({ db });
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;

  const getCurrentPeriod = async (
    actor: DashboardSummaryActor,
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

  const loadPreAssignments = async (
    crewId: string,
    rpStartLocal: string,
    rpEndLocal: string,
    zoneId: string,
  ): Promise<PreAssignmentSummary> => {
    const normalizedCrewId = trimToNullable(crewId);

    if (!normalizedCrewId) {
      return EMPTY_PRE_ASSIGNMENTS;
    }

    const result = await pgPool.query<PreAssignmentRow>(`
      with input as (
        select
          $1::varchar as crew_id,
          $2::date as start_date,
          $3::date as end_date,
          $4::text as zone_id
      )
      select
        roster_flight.id::text as roster_id,
        roster_flight.pairing_id::text as pairing_id,
        nullif(btrim(roster_flight.assignment_group), '')::text as assignment_group,
        nullif(btrim(roster_flight.assignment), '')::text as assignment,
        nullif(btrim(roster_flight.label), '')::text as label,
        roster_flight.sch_str_dt_utc as start_utc,
        coalesce(roster_flight.sch_end_dt_utc, roster_flight.sch_str_dt_utc) as end_utc,
        (roster_flight.sch_str_dt_utc at time zone input.zone_id)::date::text as start_date,
        (coalesce(roster_flight.sch_end_dt_utc, roster_flight.sch_str_dt_utc) at time zone input.zone_id)::date::text as end_date,
        to_char(roster_flight.sch_str_dt_utc at time zone input.zone_id, 'HH24:MI') as start_time,
        to_char(coalesce(roster_flight.sch_end_dt_utc, roster_flight.sch_str_dt_utc) at time zone input.zone_id, 'HH24:MI') as end_time
      from input
      join ${schema}.roster_flight roster_flight
        on roster_flight.crew_id = input.crew_id
        and roster_flight.is_deleted = 0
        and roster_flight.source = $5
        and roster_flight.sch_str_dt_utc is not null
        and roster_flight.sch_str_dt_utc < ((input.end_date + interval '1 day')::timestamp at time zone input.zone_id)
        and coalesce(roster_flight.sch_end_dt_utc, roster_flight.sch_str_dt_utc) >= (input.start_date::timestamp at time zone input.zone_id)
      order by roster_flight.sch_str_dt_utc asc, roster_flight.id asc
    `, [
      normalizedCrewId,
      rpStartLocal,
      rpEndLocal,
      zoneId,
      PRE_ASSIGNMENT_SOURCE,
    ]);

    return buildPreAssignmentSummary(result.rows, rpStartLocal, rpEndLocal);
  };

  return {
    async getCurrentSummary(actor: DashboardSummaryActor) {
      const businessNow = await businessClock.getBusinessNow();
      const period = await getCurrentPeriod(actor);
      const profilePromise = dashboardProfileService.getCurrentProfile({
        crewId: actor.crewId,
        rosterPeriodKey: period.rosterPeriodKey,
      });
      const canUsePeriodTimeZone = Boolean(trimToNullable(period.base ?? null) && trimToNullable(period.zoneId ?? null));
      const { profile, baseTimeZone, preAssignments } = canUsePeriodTimeZone
        ? await (async () => {
          const periodBaseTimeZone = buildBaseTimeZone(period.base ?? null, period.zoneId ?? null);
          const [loadedProfile, loadedPreAssignments] = await Promise.all([
            profilePromise,
            loadPreAssignments(
              actor.crewId,
              period.rpStartLocal,
              period.rpEndLocal,
              periodBaseTimeZone.zoneId,
            ),
          ]);

          return {
            profile: loadedProfile,
            baseTimeZone: periodBaseTimeZone,
            preAssignments: loadedPreAssignments,
          };
        })()
        : await (async () => {
          const loadedProfile = await profilePromise;
          const fallbackBaseTimeZone = buildBaseTimeZone(period.base ?? loadedProfile.base, period.zoneId ?? null);
          const loadedPreAssignments = await loadPreAssignments(
            actor.crewId,
            period.rpStartLocal,
            period.rpEndLocal,
            fallbackBaseTimeZone.zoneId,
          );

          return {
            profile: loadedProfile,
            baseTimeZone: fallbackBaseTimeZone,
            preAssignments: loadedPreAssignments,
          };
        })();

      return {
        profile,
        bidPackage: {
          rosterPeriodId: period.rosterPeriodId,
          rpStartLocal: period.rpStartLocal,
          rpEndLocal: period.rpEndLocal,
          periodCode: period.periodCode,
          businessNow: businessNow.toISOString(),
          timezoneLabel: baseTimeZone.timezoneLabel,
          bidStartAt: period.bidOpenAt?.toISOString() ?? null,
          bidCloseAt: period.bidCloseAt?.toISOString() ?? null,
          bidStartLabel: formatDashboardDateTimeLabel(period.bidOpenAt, baseTimeZone.zoneId),
          bidCloseLabel: formatDashboardDateTimeLabel(period.bidCloseAt, baseTimeZone.zoneId),
          remainingLabel: period.computedStage === "OPEN"
            ? formatRemainingLabel(businessNow, period.bidCloseAt)
            : period.computedStage === "CLOSED"
              ? "Closed"
              : null,
          computedStage: period.computedStage,
          targetedLine: null,
          targetedReserve: null,
          totalBidder: null,
        },
        messageCenter: {
          title: "MESSAGE CENTER",
          baseLineAverage: null,
          preAssignments,
          fleetItems: [],
          messages: [],
        },
      };
    },
  };
};
