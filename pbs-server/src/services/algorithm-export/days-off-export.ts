import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  pbsSupportedDaysOffPropertyCatalog,
  type PbsDaysOffBidValue,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  expandPbsWeekendIntervals,
  expandPreferOffBidValues,
} from "../../../../packages/contracts/pbs-prefer-off.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import {
  pbsBid,
} from "../../models/index.js";
import { deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { parseIsoDate, parsePeriodMonth } from "../lineholder/date-utils.js";
import { escapeCsvCell } from "./csv.js";
import { buildCrewScopeSql, compareCrewScopedRows, type AlgorithmExportScope } from "./export-scope.js";
import {
  buildPreferOffConfigFromDictionaryRows,
  type PreferOffDictionaryRow,
} from "../days-off/prefer-off-config.js";

type Database = ReturnType<typeof drizzle>;

// This module only supports the retired pbs-server export routes (HTTP 410).
// The active algorithm export is owned by live-server and receives a real RP context.
const resolveRetiredExportRange = (periodCode: string) => {
  const periodMonth = parsePeriodMonth(periodCode);

  if (!periodMonth) {
    throw new Error("Retired PBS export requires a recognizable period label.");
  }

  return {
    startDate: new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex, 1)).toISOString().slice(0, 10),
    endDate: new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex + 1, 0)).toISOString().slice(0, 10),
  };
};

type DaysOffCounterRow = {
  crewId: string;
  date: string;
  zoneId: string | null;
  startTime: string;
  endTime: string;
  counters: number[];
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
  if (!parseIsoDate(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const [hourRaw, minuteRaw] = time.split(":");
  const targetUtcMs = Date.UTC(
    Number.parseInt(yearRaw!, 10),
    Number.parseInt(monthRaw!, 10) - 1,
    Number.parseInt(dayRaw!, 10),
    Number.parseInt(hourRaw!, 10),
    Number.parseInt(minuteRaw!, 10),
    0,
  );
  const getOffsetMs = (instantMs: number) => {
    const parts = getZoneDateTimeParts(new Date(instantMs), zoneId);
    const localAsUtcMs = Date.UTC(
      Number.parseInt(parts.year, 10),
      Number.parseInt(parts.month, 10) - 1,
      Number.parseInt(parts.day, 10),
      Number.parseInt(parts.hour, 10),
      Number.parseInt(parts.minute, 10),
      Number.parseInt(parts.second, 10),
    );
    return localAsUtcMs - instantMs;
  };
  const offsets = [...new Set([
    getOffsetMs(targetUtcMs - DAY_MS),
    getOffsetMs(targetUtcMs),
    getOffsetMs(targetUtcMs + DAY_MS),
  ])];
  const matchingInstants = offsets
    .map((offsetMs) => targetUtcMs - offsetMs)
    .filter((instantMs) => {
      const parts = getZoneDateTimeParts(new Date(instantMs), zoneId);
      return parts.year === yearRaw
        && parts.month === monthRaw
        && parts.day === dayRaw
        && parts.hour === hourRaw
        && parts.minute === minuteRaw;
    })
    .sort((left, right) => left - right);

  if (matchingInstants.length > 0) {
    return formatUtcTimestamp(new Date(matchingInstants[0]!));
  }

  // Temporal-compatible gap policy: apply the offset before the transition,
  // which shifts a nonexistent wall time forward by the gap duration.
  return formatUtcTimestamp(new Date(targetUtcMs - getOffsetMs(targetUtcMs - DAY_MS)));
};

const safeLocalDateTimeToUtc = (date: string, time: string, zoneId: string) => {
  try {
    return localDateTimeToUtc(date, time, zoneId);
  } catch {
    return null;
  }
};

export const extractPreferOffDates = (
  bid: PbsDaysOffBidValue,
  periodCode: string,
  preferOffConfig?: PbsPreferOffConfig,
) => {
  if (bid.type !== "tag-list") {
    return [];
  }

  const periodRange = resolveRetiredExportRange(periodCode);
  const expansion = expandPreferOffBidValues(
    bid.values,
    periodRange.startDate,
    periodRange.endDate,
    preferOffConfig,
  );
  return expansion.isValid ? expansion.dates : [];
};

const createCounterRows = () => new Map<string, DaysOffCounterRow>();

const incrementCounter = (
  rowsByKey: Map<string, DaysOffCounterRow>,
  crewId: string,
  date: string,
  zoneId: string | null,
  tier: number,
  startTime = "00:00",
  endTime = "24:00",
) => {
  if (tier < 1 || tier > TIER_COUNT) {
    return;
  }

  const key = `${crewId}|${date}|${startTime}|${endTime}`;
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

const formatUtcStart = (date: string, time: string, zoneId: string | null) =>
  zoneId ? safeLocalDateTimeToUtc(date, time, zoneId) ?? "" : "";

const formatUtcEnd = (date: string, time: string, zoneId: string | null) => {
  if (!zoneId) {
    return "";
  }

  const parsed = parseIsoDate(date);

  if (!parsed) {
    return "";
  }

  const endDate = time === "24:00" ? toIsoDate(new Date(parsed.getTime() + DAY_MS)) : date;
  const endTime = time === "24:00" ? "00:00" : time;
  const endBoundaryUtc = safeLocalDateTimeToUtc(endDate, endTime, zoneId);

  if (!endBoundaryUtc) {
    return "";
  }

  return formatUtcTimestamp(new Date(new Date(endBoundaryUtc).getTime() - SECOND_MS));
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

  return left.date.localeCompare(right.date);
};

export const serializeDaysOffRowsToCsv = (
  rows: DaysOffCounterRow[],
  scope?: AlgorithmExportScope,
) => {
  const lines = [
    DAYS_OFF_CSV_HEADER.join(","),
    ...rows
      .sort((left, right) => compareDaysOffRows(left, right, scope))
      .map((row) => [
        row.crewId,
        formatUtcStart(row.date, row.startTime, row.zoneId),
        formatUtcEnd(row.date, row.endTime, row.zoneId),
        ...row.counters,
      ].map(escapeCsvCell).join(",")),
  ];

  return `${lines.join("\n")}\n`;
};

export const buildDaysOffCsvFromRows = (
  groupRows: DaysOffGroupRow[],
  dayOffRows: DaysOffDayOffRow[],
  periodCode: string,
  scope?: AlgorithmExportScope,
  preferOffConfig?: PbsPreferOffConfig,
) => {
  const rowsByKey = createCounterRows();
  const periodRange = resolveRetiredExportRange(periodCode);

  for (const row of dayOffRows) {
    incrementCounter(rowsByKey, row.crewId, row.bidDate, row.zoneId, row.tier);
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

    const expansion = bid.type === "tag-list"
      ? expandPreferOffBidValues(
        bid.values,
        periodRange.startDate,
        periodRange.endDate,
        preferOffConfig,
      )
      : null;

    if (expansion?.isValid && expansion.mode === "weekends") {
      for (const interval of expandPbsWeekendIntervals(
        periodRange.startDate,
        periodRange.endDate,
        preferOffConfig,
      )) {
        const lastDate = interval.dates.at(-1);
        for (const date of interval.dates) {
          const startTime = date === interval.startDate ? interval.startTime : "00:00";
          const endTime = date === lastDate && interval.endDate === date ? interval.endTime : "24:00";
          incrementCounter(rowsByKey, row.crewId, date, row.zoneId, row.tier, startTime, endTime);
        }
      }
    } else {
      for (const date of extractPreferOffDates(bid, periodCode, preferOffConfig)) {
        incrementCounter(rowsByKey, row.crewId, date, row.zoneId, row.tier);
      }
    }
  }

  return serializeDaysOffRowsToCsv(Array.from(rowsByKey.values()), scope);
};

export const loadDaysOffCsv = async (
  db: Pick<Database, "execute">,
  periodCode: string,
  liveSchema: string,
  scope?: AlgorithmExportScope,
) => {
  const schema = validateLiveSchema(liveSchema);
  const crewScopeSql = buildCrewScopeSql(scope?.crewIds);
  const [groupRows, dayOffRows, preferOffDictionaryRows] = await Promise.all([
    db
      .execute<DaysOffGroupRow>(sql`
        select
          ${pbsBid.crewId}::varchar as "crewId",
          airport.zone_id::varchar as "zoneId",
          pbs_bid_tier.tier::integer as tier,
          pbs_bid_property.property_code::integer as "propertyCode",
          pbs_bid_group.property_id::integer as "legacyPropertyCode",
          pbs_bid_group.operator::varchar as operator,
          pbs_bid_group.param_a::varchar as "paramA",
          pbs_bid_group.param_b::varchar as "paramB",
          pbs_bid_group.param_c::varchar as "paramC"
        from pbs_bid_group
        inner join ${pbsBid}
          on pbs_bid_group.bid_id = ${pbsBid.id}
        inner join pbs_bid_tier
          on pbs_bid_group.tier_id = pbs_bid_tier.id
        left join pbs_bid_property
          on pbs_bid_group.property_definition_id = pbs_bid_property.id
        left join pbs_user
          on pbs_user.crew_id = ${pbsBid.crewId}
        left join ${sql.raw(`${schema}.crew_base`)} crew_base
          on crew_base.crew_id = ${pbsBid.crewId}
         and crew_base.is_prime_base = 1
         and crew_base.eff_dt <= now()
         and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        left join ${sql.raw(`${schema}.airport`)} airport
          on airport.airport = crew_base.base
        where ${pbsBid.periodCode} = ${periodCode}
          and ${pbsBid.bidContext} = 'Current'
          and pbs_bid_group.bid_type = 'DaysOff'
          and ${crewScopeSql}
        order by ${pbsBid.crewId}, pbs_bid_tier.tier, pbs_bid_group.group_seq
      `),
    db
      .execute<DaysOffDayOffRow>(sql`
        select
          ${pbsBid.crewId}::varchar as "crewId",
          airport.zone_id::varchar as "zoneId",
          pbs_bid_day_off.tier::integer as tier,
          pbs_bid_day_off.bid_date::varchar as "bidDate"
        from pbs_bid_day_off
        inner join ${pbsBid}
          on pbs_bid_day_off.bid_id = ${pbsBid.id}
        left join pbs_user
          on pbs_user.crew_id = ${pbsBid.crewId}
        left join ${sql.raw(`${schema}.crew_base`)} crew_base
          on crew_base.crew_id = ${pbsBid.crewId}
         and crew_base.is_prime_base = 1
         and crew_base.eff_dt <= now()
         and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        left join ${sql.raw(`${schema}.airport`)} airport
          on airport.airport = crew_base.base
        where ${pbsBid.periodCode} = ${periodCode}
          and ${pbsBid.bidContext} = 'Current'
          and pbs_bid_day_off.request_type = 'DAY_OFF'
          and ${crewScopeSql}
        order by ${pbsBid.crewId}, pbs_bid_day_off.bid_date, pbs_bid_day_off.tier
      `),
    db
      .execute<PreferOffDictionaryRow>(sql`
        select
          parent_code::varchar as "parentCode",
          code::varchar as code,
          name::varchar as name,
          code_value::varchar as "codeValue",
          idx::integer as idx
        from ${sql.raw(`${schema}.dictionary`)}
        where parent_code in ('DOW', 'PBS_PREFER_OFF')
        order by parent_code, idx, code
      `),
  ]);
  const preferOffConfig = buildPreferOffConfigFromDictionaryRows(preferOffDictionaryRows.rows);

  return buildDaysOffCsvFromRows(groupRows.rows, dayOffRows.rows, periodCode, scope, preferOffConfig);
};
