import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  pbsSupportedDaysOffPropertyCatalog,
  type PbsDaysOffBidValue,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  pbsBid,
} from "../../models/index.js";
import { deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { parseIsoDate } from "../lineholder/date-utils.js";
import { escapeCsvCell } from "./csv.js";
import {
  buildBidSourceSql,
  buildCrewScopeSql,
  compareCrewScopedRows,
  type AlgorithmExportScope,
} from "./export-scope.js";
import type { AlgorithmExportPeriodContext } from "./types.js";

type Database = ReturnType<typeof drizzle>;

type DaysOffCounterRow = {
  crewId: string;
  date: string;
  zoneId: string | null;
  startTime: string | null;
  endTime: string | null;
  counters: number[];
};

type CrewBaseTimezoneRow = {
  crewId: string;
  zoneId: string | null;
  effAt: string | null;
  expAt: string | null;
  isPrimeBase: number | null;
};

type DaysOffGroupRow = {
  crewId: string;
  zoneId: string | null;
  tier: number;
  propertyCode: number | null;
  legacyPropertyCode: number;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};

type DaysOffDayOffRow = {
  crewId: string;
  zoneId: string | null;
  tier: number;
  bidDate: string;
};

const PREFER_OFF_PROPERTY_CODE = 201;
const TIER_COUNT = 7;
const DAY_MS = 86_400_000;
const SECOND_MS = 1_000;
const LOCAL_MIDNIGHT_UTC_SEARCH_ITERATIONS = 4;
const DATE_RANGE_PATTERN = /^Between (\d{4}-\d{2}-\d{2}) - (\d{4}-\d{2}-\d{2})$/;
const WINDOW_PATTERN = /^Window (\d{2}:\d{2})-(\d{2}:\d{2})$/;
const WEEKDAY_INDEX_BY_VALUE = new Map([
  ["Sunday", 0],
  ["Monday", 1],
  ["Tuesday", 2],
  ["Wednesday", 3],
  ["Thursday", 4],
  ["Friday", 5],
  ["Saturday", 6],
]);

const DAYS_OFF_CSV_HEADER = [
  "Crew_ID",
  "DayOff_Start_Time_UTC",
  "DayOff_End_Time_UTC",
  ...Array.from({ length: TIER_COUNT }, (_, index) => `T${index + 1}_Award_Counter`),
];

const propertyCatalogByCode = new Map(
  pbsSupportedDaysOffPropertyCatalog.map((property) => [property.propertyCode, property]),
);

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

const dateTimePartsFormatterByZone = new Map<string, Intl.DateTimeFormat>();

const getDateTimePartsFormatter = (zoneId: string) => {
  const cachedFormatter = dateTimePartsFormatterByZone.get(zoneId);

  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  dateTimePartsFormatterByZone.set(zoneId, formatter);
  return formatter;
};

const getZoneDateTimeParts = (date: Date, zoneId: string) => {
  const parts = getDateTimePartsFormatter(zoneId).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
};

const formatUtcTimestamp = (date: Date) => date.toISOString().replace(".000Z", "Z");

const localDateTimeToUtc = (date: string, time: string, zoneId: string) => {
  const parsed = parseIsoDate(date);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);

  if (!parsed || !timeMatch) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const targetHour = Number.parseInt(timeMatch[1]!, 10);
  const targetMinute = Number.parseInt(timeMatch[2]!, 10);
  if (targetHour > 23 || targetMinute > 59) {
    return null;
  }
  const targetUtcMs = Date.UTC(
    Number.parseInt(yearRaw!, 10),
    Number.parseInt(monthRaw!, 10) - 1,
    Number.parseInt(dayRaw!, 10),
    targetHour,
    targetMinute,
    0,
  );
  let guessMs = targetUtcMs;

  for (let index = 0; index < LOCAL_MIDNIGHT_UTC_SEARCH_ITERATIONS; index += 1) {
    const parts = getZoneDateTimeParts(new Date(guessMs), zoneId);
    const formattedAsUtcMs = Date.UTC(
      Number.parseInt(parts.year, 10),
      Number.parseInt(parts.month, 10) - 1,
      Number.parseInt(parts.day, 10),
      Number.parseInt(parts.hour, 10),
      Number.parseInt(parts.minute, 10),
      Number.parseInt(parts.second, 10),
    );
    const diffMs = targetUtcMs - formattedAsUtcMs;

    if (diffMs === 0) {
      break;
    }

    guessMs += diffMs;
  }

  const finalParts = getZoneDateTimeParts(new Date(guessMs), zoneId);

  if (
    finalParts.year !== yearRaw
    || finalParts.month !== monthRaw
    || finalParts.day !== dayRaw
    || Number.parseInt(finalParts.hour, 10) !== targetHour
    || Number.parseInt(finalParts.minute, 10) !== targetMinute
    || finalParts.second !== "00"
  ) {
    return null;
  }

  return formatUtcTimestamp(new Date(guessMs));
};

const localDateMidnightToUtc = (date: string, zoneId: string) =>
  localDateTimeToUtc(date, "00:00", zoneId);

const safeLocalDateMidnightToUtc = (date: string, zoneId: string) => {
  try {
    return localDateMidnightToUtc(date, zoneId);
  } catch {
    return null;
  }
};

const safeLocalDateTimeToUtc = (date: string, time: string, zoneId: string) => {
  try {
    return localDateTimeToUtc(date, time, zoneId);
  } catch {
    return null;
  }
};

const listPeriodDates = (periodStartDate: string, periodEndDate: string) => {
  const start = parseIsoDate(periodStartDate);
  const end = parseIsoDate(periodEndDate);

  if (!start || !end || start > end) {
    throw new Error("The roster period date range is invalid for DAYSOFF export.");
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const isDateInPeriod = (date: string, periodDates: Set<string>) => periodDates.has(date);

const listIsoDatesInRange = (
  from: string,
  to: string,
  periodDates: Set<string>,
) => {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);

  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    const isoDate = toIsoDate(cursor);

    if (isDateInPeriod(isoDate, periodDates)) {
      dates.push(isoDate);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const listWeekdayDates = (
  weekdayIndex: number,
  periodDates: string[],
) => periodDates.filter((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() === weekdayIndex);

export const extractPreferOffDates = (
  bid: PbsDaysOffBidValue,
  periodStartDate: string,
  periodEndDate: string,
) => {
  if (bid.type !== "tag-list") {
    return [];
  }

  const periodDates = listPeriodDates(periodStartDate, periodEndDate);
  const periodDateSet = new Set(periodDates);
  const dates: string[] = [];

  for (const rawValue of bid.values) {
    const value = rawValue.trim();

    if (WINDOW_PATTERN.test(value)) {
      continue;
    }

    if (parseIsoDate(value)) {
      if (!isDateInPeriod(value, periodDateSet)) {
        throw new Error(`Prefer Off date ${value} is outside the selected roster period.`);
      }

      dates.push(value);

      continue;
    }

    const rangeMatch = value.match(DATE_RANGE_PATTERN);

    if (rangeMatch) {
      if (!isDateInPeriod(rangeMatch[1]!, periodDateSet) || !isDateInPeriod(rangeMatch[2]!, periodDateSet)) {
        throw new Error(`Prefer Off date range ${value} is outside the selected roster period.`);
      }

      dates.push(...listIsoDatesInRange(rangeMatch[1]!, rangeMatch[2]!, periodDateSet));
      continue;
    }

    if (value === "Weekends") {
      dates.push(...listWeekdayDates(0, periodDates), ...listWeekdayDates(6, periodDates));
      continue;
    }

    const weekdayIndex = WEEKDAY_INDEX_BY_VALUE.get(value);

    if (weekdayIndex !== undefined) {
      dates.push(...listWeekdayDates(weekdayIndex, periodDates));
    }
  }

  return dates.sort();
};

const createCounterRows = () => new Map<string, DaysOffCounterRow>();

const incrementCounter = (
  rowsByKey: Map<string, DaysOffCounterRow>,
  crewId: string,
  date: string,
  zoneId: string | null,
  tier: number,
  startTime: string | null = null,
  endTime: string | null = null,
) => {
  if (tier < 1 || tier > TIER_COUNT) {
    return;
  }

  const key = `${crewId}|${date}|${startTime ?? ""}|${endTime ?? ""}`;
  const row = rowsByKey.get(key) ?? {
    crewId,
    date,
    zoneId,
    startTime,
    endTime,
    counters: Array.from({ length: TIER_COUNT }, () => 0),
  };

  if (!row.zoneId && zoneId) {
    row.zoneId = zoneId;
  }

  row.counters[tier - 1] += 1;
  rowsByKey.set(key, row);
};

const formatUtcStart = (row: DaysOffCounterRow) =>
  row.zoneId
    ? row.startTime
      ? safeLocalDateTimeToUtc(row.date, row.startTime, row.zoneId) ?? ""
      : safeLocalDateMidnightToUtc(row.date, row.zoneId) ?? ""
    : "";

const formatUtcEnd = (row: DaysOffCounterRow) => {
  if (!row.zoneId) {
    return "";
  }

  if (row.endTime) {
    const parsed = parseIsoDate(row.date);
    if (!parsed) {
      return "";
    }
    const endDate = row.startTime && row.endTime <= row.startTime
      ? toIsoDate(new Date(parsed.getTime() + DAY_MS))
      : row.date;
    return safeLocalDateTimeToUtc(endDate, row.endTime, row.zoneId) ?? "";
  }

  const parsed = parseIsoDate(row.date);

  if (!parsed) {
    return "";
  }

  const nextLocalMidnightUtc = safeLocalDateMidnightToUtc(
    toIsoDate(new Date(parsed.getTime() + DAY_MS)),
    row.zoneId,
  );

  if (!nextLocalMidnightUtc) {
    return "";
  }

  return formatUtcTimestamp(new Date(new Date(nextLocalMidnightUtc).getTime() - SECOND_MS));
};

const compareDaysOffRows = (
  left: DaysOffCounterRow,
  right: DaysOffCounterRow,
  scope?: AlgorithmExportScope,
) => {
  const crewCompare = compareCrewScopedRows(left, right, scope);

  if (crewCompare !== 0) {
    return crewCompare;
  }

  return left.date.localeCompare(right.date)
    || (left.startTime ?? "").localeCompare(right.startTime ?? "")
    || (left.endTime ?? "").localeCompare(right.endTime ?? "");
};

export const serializeDaysOffRowsToCsv = (
  rows: DaysOffCounterRow[],
  scope?: AlgorithmExportScope,
) => {
  const lines = [
    DAYS_OFF_CSV_HEADER.join(","),
    ...rows
      .sort((left, right) => compareDaysOffRows(left, right, scope))
      .map((row) => {
        const start = formatUtcStart(row);
        const end = formatUtcEnd(row);
        if (!start || !end) {
          throw new Error(`DAYSOFF export could not resolve UTC window for crew ${row.crewId} on ${row.date}.`);
        }
        return [row.crewId, start, end, ...row.counters].map(escapeCsvCell).join(",");
      }),
  ];

  return `${lines.join("\n")}\n`;
};

export const buildDaysOffCsvFromRows = (
  groupRows: DaysOffGroupRow[],
  dayOffRows: DaysOffDayOffRow[],
  period: Pick<AlgorithmExportPeriodContext, "rpStartLocal" | "rpEndLocal">,
  scope?: AlgorithmExportScope,
  crewBaseRows?: CrewBaseTimezoneRow[],
) => {
  const rowsByKey = createCounterRows();
  const basesByCrew = new Map<string, CrewBaseTimezoneRow[]>();

  for (const baseRow of crewBaseRows ?? []) {
    const rows = basesByCrew.get(baseRow.crewId) ?? [];
    rows.push(baseRow);
    basesByCrew.set(baseRow.crewId, rows);
  }

  const resolveZoneId = (crewId: string, date: string, fallback: string | null) => {
    if (!crewBaseRows) {
      return fallback;
    }

    const dayStart = Date.parse(`${date}T00:00:00Z`);
    const dayEnd = dayStart + DAY_MS;
    return (basesByCrew.get(crewId) ?? [])
      .filter((base) => {
        const effAt = base.effAt ? Date.parse(base.effAt) : Number.NaN;
        const expAt = base.expAt ? Date.parse(base.expAt) : null;
        return base.zoneId && Number.isFinite(effAt) && effAt < dayEnd && (expAt === null || expAt >= dayStart);
      })
      .sort((left, right) =>
        (right.isPrimeBase ?? 0) - (left.isPrimeBase ?? 0)
        || Date.parse(right.effAt ?? "") - Date.parse(left.effAt ?? ""))[0]?.zoneId ?? null;
  };

  for (const row of dayOffRows) {
    if (row.bidDate < period.rpStartLocal || row.bidDate > period.rpEndLocal) {
      throw new Error(`DAYSOFF export date ${row.bidDate} is outside the selected roster period.`);
    }

    incrementCounter(
      rowsByKey,
      row.crewId,
      row.bidDate,
      resolveZoneId(row.crewId, row.bidDate, row.zoneId),
      row.tier,
    );
  }

  for (const row of groupRows) {
    const propertyCode = row.propertyCode ?? row.legacyPropertyCode;

    if (propertyCode !== PREFER_OFF_PROPERTY_CODE) {
      continue;
    }

    const definition = propertyCatalogByCode.get(propertyCode);

    if (!definition) {
      continue;
    }

    const bid = deserializeRuleBid(definition, {
      operator: row.operator,
      paramA: row.paramA,
      paramB: row.paramB,
      paramC: row.paramC,
    });
    const window = bid.type === "tag-list"
      ? bid.values.map((value) => value.trim().match(WINDOW_PATTERN)).find(Boolean)
      : undefined;

    for (const date of extractPreferOffDates(bid, period.rpStartLocal, period.rpEndLocal)) {
      incrementCounter(
        rowsByKey,
        row.crewId,
        date,
        resolveZoneId(row.crewId, date, row.zoneId),
        row.tier,
        window?.[1] ?? null,
        window?.[2] ?? null,
      );
    }
  }

  return serializeDaysOffRowsToCsv(Array.from(rowsByKey.values()), scope);
};

export const loadDaysOffCsv = async (
  db: Pick<Database, "execute">,
  periodCode: string,
  liveSchema: string,
  pbsSchemaName: string,
  scope?: AlgorithmExportScope,
  period?: AlgorithmExportPeriodContext,
) => {
  if (!period) {
    throw new Error("Roster period context is required for DAYSOFF export.");
  }
  const schema = validateLiveSchema(liveSchema);
  const pbsSchema = validateLiveSchema(pbsSchemaName);
  const crewScopeSql = buildCrewScopeSql(scope?.crewIds, sql`${pbsBid.crewId}`);
  const bidSourceSql = buildBidSourceSql(
    scope?.bidIds,
    periodCode,
    sql`${pbsBid.id}`,
    sql`${pbsBid.periodCode}`,
    sql`${pbsBid.bidContext}`,
  );
  const [groupRows, dayOffRows, crewBaseRows] = await Promise.all([
    db
      .execute<DaysOffGroupRow>(sql`
        select
          ${pbsBid.crewId}::varchar as "crewId",
          null::varchar as "zoneId",
          pbs_bid_tier.tier::integer as tier,
          pbs_bid_property.property_code::integer as "propertyCode",
          pbs_bid_group.property_id::integer as "legacyPropertyCode",
          pbs_bid_group.operator::varchar as operator,
          pbs_bid_group.param_a::varchar as "paramA",
          pbs_bid_group.param_b::varchar as "paramB",
          pbs_bid_group.param_c::varchar as "paramC"
        from ${sql.raw(`${pbsSchema}.pbs_bid_group`)} pbs_bid_group
        inner join ${pbsBid}
          on pbs_bid_group.bid_id = ${pbsBid.id}
        inner join ${sql.raw(`${pbsSchema}.pbs_bid_tier`)} pbs_bid_tier
          on pbs_bid_group.tier_id = pbs_bid_tier.id
        left join ${sql.raw(`${pbsSchema}.pbs_bid_property`)} pbs_bid_property
          on pbs_bid_group.property_definition_id = pbs_bid_property.id
        inner join ${sql.raw(`${schema}.crew`)} crew
          on crew.crew_id = ${pbsBid.crewId}
        where ${bidSourceSql}
          and pbs_bid_group.bid_type = 'DaysOff'
          and ${crewScopeSql}
        order by ${pbsBid.crewId}, pbs_bid_tier.tier, pbs_bid_group.group_seq
      `),
    db
      .execute<DaysOffDayOffRow>(sql`
        select
          ${pbsBid.crewId}::varchar as "crewId",
          null::varchar as "zoneId",
          pbs_bid_day_off.tier::integer as tier,
          pbs_bid_day_off.bid_date::varchar as "bidDate"
        from ${sql.raw(`${pbsSchema}.pbs_bid_day_off`)} pbs_bid_day_off
        inner join ${pbsBid}
          on pbs_bid_day_off.bid_id = ${pbsBid.id}
        inner join ${sql.raw(`${schema}.crew`)} crew
          on crew.crew_id = ${pbsBid.crewId}
        where ${bidSourceSql}
          and pbs_bid_day_off.request_type = 'DAY_OFF'
          and ${crewScopeSql}
        order by ${pbsBid.crewId}, pbs_bid_day_off.bid_date, pbs_bid_day_off.tier
      `),
    db
      .execute<CrewBaseTimezoneRow>(sql`
        select
          ${pbsBid.crewId}::varchar as "crewId",
          airport.zone_id::varchar as "zoneId",
          crew_base.eff_dt::varchar as "effAt",
          crew_base.exp_dt::varchar as "expAt",
          crew_base.is_prime_base::integer as "isPrimeBase"
        from ${pbsBid}
        inner join ${sql.raw(`${schema}.crew`)} crew
          on crew.crew_id = ${pbsBid.crewId}
        left join ${sql.raw(`${schema}.crew_base`)} crew_base
          on crew_base.crew_id = crew.crew_id
        left join ${sql.raw(`${schema}.airport`)} airport
          on airport.airport = crew_base.base
        where ${bidSourceSql}
          and ${crewScopeSql}
        order by ${pbsBid.crewId}, crew_base.is_prime_base desc, crew_base.eff_dt desc
      `),
  ]);

  return buildDaysOffCsvFromRows(groupRows.rows, dayOffRows.rows, period, scope, crewBaseRows.rows);
};
