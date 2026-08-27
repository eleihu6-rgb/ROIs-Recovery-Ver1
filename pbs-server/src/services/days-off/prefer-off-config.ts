import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type {
  PbsPreferOffConfig,
  PbsPreferOffWeekday,
} from "../../../../packages/contracts/pbs-prefer-off.js";
import { getPbsWeekendDurationMinutes } from "../../../../packages/contracts/pbs-bid-definitions.js";
import { liveDictionary } from "../../models/index.js";

type Database = ReturnType<typeof drizzle>;

const DAY_OF_WEEK_PARENT_CODE = "DOW";
const PREFER_OFF_PARENT_CODE = "PBS_PREFER_OFF";
const WEEKEND_START_DOW_CODE = "WEEKEND_START_DOW";
const WEEKEND_START_TIME_CODE = "WEEKEND_START_TIME";
const WEEKEND_END_DOW_CODE = "WEEKEND_END_DOW";
const WEEKEND_END_TIME_CODE = "WEEKEND_END_TIME";

export type PreferOffDictionaryRow = {
  parentCode: string | null;
  code: string | null;
  name: string | null;
  codeValue: string | null;
  idx: number | null;
};

const isClockTime = (value: string, allowEndOfDay = false): boolean => {
  if (allowEndOfDay && value === "24:00") {
    return true;
  }

  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
};

const buildWeekdays = (rows: PreferOffDictionaryRow[]): PbsPreferOffWeekday[] =>
  rows
    .filter((row) =>
      row.parentCode === DAY_OF_WEEK_PARENT_CODE
      && Boolean(row.code?.trim())
      && Boolean(row.name?.trim()),
    )
    .map((row) => ({
      code: row.code!.trim().toUpperCase(),
      name: row.name!.trim(),
      order: row.idx ?? Number(row.codeValue),
      isoDay: Number(row.codeValue),
    }))
    .filter((weekday) =>
      Number.isSafeInteger(weekday.order)
      && Number.isSafeInteger(weekday.isoDay)
      && weekday.isoDay >= 1
      && weekday.isoDay <= 7,
    )
    .sort((left, right) => left.order - right.order);

export const buildPreferOffConfigFromDictionaryRows = (
  rows: PreferOffDictionaryRow[],
): PbsPreferOffConfig => {
  const weekdays = buildWeekdays(rows);
  const valueByCode = new Map(
    rows
      .filter((row) => row.parentCode === PREFER_OFF_PARENT_CODE && row.code)
      .map((row) => [row.code!, row.codeValue?.trim() ?? ""]),
  );
  const startDayCode = valueByCode.get(WEEKEND_START_DOW_CODE)?.toUpperCase() ?? "";
  const endDayCode = valueByCode.get(WEEKEND_END_DOW_CODE)?.toUpperCase() ?? "";
  const startTime = valueByCode.get(WEEKEND_START_TIME_CODE) ?? "";
  const endTime = valueByCode.get(WEEKEND_END_TIME_CODE) ?? "";
  const startDay = weekdays.find((weekday) => weekday.code === startDayCode);
  const endDay = weekdays.find((weekday) => weekday.code === endDayCode);
  const candidateWeekend = startDay && endDay && isClockTime(startTime) && isClockTime(endTime, true)
    ? {
        available: true as const,
        startDayCode,
        startDayName: startDay.name,
        startTime,
        endDayCode,
        endDayName: endDay.name,
        endTime,
      }
    : { available: false as const };
  const available = Boolean(
    startDay
    && endDay
    && isClockTime(startTime)
    && isClockTime(endTime, true)
    && getPbsWeekendDurationMinutes({
      startDayIso: startDay!.isoDay,
      startTime,
      endDayIso: endDay!.isoDay,
      endTime,
    })
  );

  return {
    weekdays: weekdays.map((weekday) => ({ ...weekday })),
    weekend: available
      ? candidateWeekend
      : { available: false },
  };
};

export const clonePreferOffConfig = (config: PbsPreferOffConfig): PbsPreferOffConfig => ({
  weekdays: config.weekdays.map((weekday) => ({ ...weekday })),
  weekend: { ...config.weekend },
});

export const loadPreferOffConfig = async (
  db: Pick<Database, "select">,
): Promise<PbsPreferOffConfig> => {
  const rows = await db
    .select({
      parentCode: liveDictionary.parentCode,
      code: liveDictionary.code,
      name: liveDictionary.name,
      codeValue: liveDictionary.codeValue,
      idx: liveDictionary.idx,
    })
    .from(liveDictionary)
    .where(inArray(liveDictionary.parentCode, [DAY_OF_WEEK_PARENT_CODE, PREFER_OFF_PARENT_CODE]));

  return buildPreferOffConfigFromDictionaryRows(rows);
};
