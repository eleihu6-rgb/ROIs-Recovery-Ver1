import { and, asc, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PbsBiddingCalendarEvent } from "../../../../packages/contracts/pbs-bidding-calendar.js";
import {
  expandPbsWeekendIntervals,
  expandPreferOffBidValues,
  type PbsPreferOffConfig,
  type PbsWeekendInterval,
} from "../../../../packages/contracts/pbs-prefer-off.js";
import { pbsBidGroup, pbsBidProperty, pbsBidTier } from "../../models/index.js";
import { listIsoDatesInRange, normalizePgDate } from "./bidding-calendar-date-utils.js";
import type { DayOffDatesByTier } from "./bidding-calendar-pairing-events.js";

type Database = ReturnType<typeof drizzle>;

const DAYS_OFF_BID_TYPE = "DaysOff";
const PREFER_OFF_PROPERTY_CODE = 201;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INLINE_DATE_RANGE_PATTERN = /^Between (\d{4}-\d{2}-\d{2}) - (\d{4}-\d{2}-\d{2})$/;

export type PreferOffCalendarRow = {
  propertyGroupKey: string;
  groupSeq: number;
  tier: number;
  legacyPropertyCode: number;
  propertyCode: number | null;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};

const parseIsoDate = (value: string | null | undefined) => {
  const normalizedDate = normalizePgDate(value ?? null);

  return normalizedDate && ISO_DATE_PATTERN.test(normalizedDate) ? normalizedDate : null;
};

const appendDateRange = (dates: Set<string>, from: string, to: string) => {
  for (const date of listIsoDatesInRange(from, to)) {
    dates.add(date);
  }
};

export const extractPreferOffCalendarDates = (
  row: Pick<PreferOffCalendarRow, "operator" | "paramA" | "paramB">,
  rpStartLocal: string,
  rpEndLocal: string,
  preferOffConfig: PbsPreferOffConfig,
) => {
  const operator = row.operator?.trim();
  const paramA = row.paramA?.trim() ?? "";
  const paramB = row.paramB?.trim() ?? "";
  const values = operator === "Between"
    ? [`Between ${paramA} - ${paramB}`]
    : paramA.split(",").map((value) => value.trim()).filter(Boolean);

  if (values.includes("Weekends")) {
    const expansion = expandPreferOffBidValues(values, rpStartLocal, rpEndLocal, preferOffConfig);
    return expansion.isValid ? expansion.dates : [];
  }

  const dates = new Set<string>();

  if (operator === "Between") {
    const from = parseIsoDate(paramA);
    const to = parseIsoDate(paramB);

    if (from && to) {
      appendDateRange(dates, from, to);
    }

    return Array.from(dates).sort();
  }

  for (const value of values) {
    const isoDate = parseIsoDate(value);

    if (isoDate) {
      dates.add(isoDate);
      continue;
    }

    const rangeMatch = value.match(INLINE_DATE_RANGE_PATTERN);

    if (rangeMatch) {
      appendDateRange(dates, rangeMatch[1]!, rangeMatch[2]!);
    }
  }

  return Array.from(dates).sort();
};

export const loadPreferOffCalendarRows = async (
  db: Pick<Database, "select">,
  bidId: number,
): Promise<PreferOffCalendarRow[]> =>
  db
    .select({
      propertyGroupKey: pbsBidGroup.propertyGroupKey,
      groupSeq: pbsBidGroup.groupSeq,
      tier: pbsBidTier.tier,
      legacyPropertyCode: pbsBidGroup.legacyPropertyCode,
      propertyCode: pbsBidProperty.propertyCode,
      operator: pbsBidGroup.operator,
      paramA: pbsBidGroup.paramA,
      paramB: pbsBidGroup.paramB,
      paramC: pbsBidGroup.paramC,
    })
    .from(pbsBidGroup)
    .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
    .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
    .where(and(
      eq(pbsBidGroup.bidId, bidId),
      eq(pbsBidGroup.bidType, DAYS_OFF_BID_TYPE),
      or(
        eq(pbsBidGroup.legacyPropertyCode, PREFER_OFF_PROPERTY_CODE),
        eq(pbsBidProperty.propertyCode, PREFER_OFF_PROPERTY_CODE),
      ),
    ))
    .orderBy(asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier));

export const buildPreferOffDatesByTier = (
  rows: PreferOffCalendarRow[],
  rpStartLocal: string,
  rpEndLocal: string,
  preferOffConfig: PbsPreferOffConfig,
): DayOffDatesByTier => {
  const datesByTier: DayOffDatesByTier = new Map();

  for (const row of rows) {
    const dates = datesByTier.get(row.tier) ?? new Set<string>();

    for (const date of extractPreferOffCalendarDates(row, rpStartLocal, rpEndLocal, preferOffConfig)) {
      dates.add(date);
    }

    if (dates.size > 0) {
      datesByTier.set(row.tier, dates);
    }
  }

  return datesByTier;
};

export type WeekendIntervalsByTier = Map<number, PbsWeekendInterval[]>;

export const buildWeekendIntervalsByTier = (
  rows: PreferOffCalendarRow[],
  rpStartLocal: string,
  rpEndLocal: string,
  preferOffConfig: PbsPreferOffConfig,
): WeekendIntervalsByTier => {
  const intervalsByTier: WeekendIntervalsByTier = new Map();
  const intervals = expandPbsWeekendIntervals(rpStartLocal, rpEndLocal, preferOffConfig);

  if (intervals.length === 0) {
    return intervalsByTier;
  }

  for (const row of rows) {
    const values = row.paramA?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];

    if (values.includes("Weekends")) {
      intervalsByTier.set(row.tier, intervals);
    }
  }

  return intervalsByTier;
};

export const buildNonWeekendPreferOffDatesByTier = (
  rows: PreferOffCalendarRow[],
  rpStartLocal: string,
  rpEndLocal: string,
  preferOffConfig: PbsPreferOffConfig,
): DayOffDatesByTier => buildPreferOffDatesByTier(
  rows.filter((row) => !(row.paramA?.split(",").map((value) => value.trim()).includes("Weekends"))),
  rpStartLocal,
  rpEndLocal,
  preferOffConfig,
);

const dayOffDatesByTierIsEmpty = (datesByTier: DayOffDatesByTier) =>
  Array.from(datesByTier.values()).every((dates) => dates.size === 0);

export const loadPreferOffDayOffDatesByTier = async (
  db: Pick<Database, "select">,
  bidId: number,
  rpStartLocal: string,
  rpEndLocal: string,
  preferOffConfig: PbsPreferOffConfig,
) => {
  const rows = await loadPreferOffCalendarRows(db, bidId);
  const datesByTier = buildPreferOffDatesByTier(rows, rpStartLocal, rpEndLocal, preferOffConfig);

  return dayOffDatesByTierIsEmpty(datesByTier) ? null : datesByTier;
};

export const buildPreferOffCalendarEvents = (
  rows: PreferOffCalendarRow[],
  rpStartLocal: string,
  rpEndLocal: string,
  preferOffConfig: PbsPreferOffConfig,
): PbsBiddingCalendarEvent[] => {
  const eventsByKey = new Map<string, PbsBiddingCalendarEvent>();

  for (const row of rows) {
    for (const date of extractPreferOffCalendarDates(row, rpStartLocal, rpEndLocal, preferOffConfig)) {
      const eventKey = `${row.tier}:${date}`;

      if (eventsByKey.has(eventKey)) {
        continue;
      }

      eventsByKey.set(eventKey, {
        id: `prefer-off-bid-T${row.tier}-${date}`,
        type: "prefer_off_bid",
        tier: `T${row.tier}`,
        label: "Off",
        startDate: date,
        endDate: date,
        tone: "green",
        source: "pbs_bid_group",
        readonly: false,
        metadata: {
          propertyGroupKey: row.propertyGroupKey,
          groupSeq: row.groupSeq,
          propertyCode: row.propertyCode ?? row.legacyPropertyCode,
        },
      });
    }
  }

  return Array.from(eventsByKey.values());
};
