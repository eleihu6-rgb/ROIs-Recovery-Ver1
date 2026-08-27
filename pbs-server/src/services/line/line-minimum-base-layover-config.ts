import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PbsLineMinimumBaseLayoverConfig } from "../../../../packages/contracts/pbs-line-bids.js";
import { liveDictionary } from "../../models/index.js";

type Database = ReturnType<typeof drizzle>;

const SYS_PARAM_PARENT_CODE = "SYS_PARAM";
const MINIMUM_BASE_LAYOVER_CONFIG_CODE = "PBS_LINE_MINIMUM_BASE_LAYOVER";

export type LineMinimumBaseLayoverDictionaryRow = {
  parentCode: string | null;
  code: string | null;
  codeValue: string | null;
};

export const parseLineDurationMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,3}):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1] ?? "", 10) * 60 + Number.parseInt(match[2] ?? "", 10);
};

export const formatLineDurationPadded = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(3, "0")}:${String(remainder).padStart(2, "0")}`;
};

export const formatLineDurationCompact = (duration: string) => {
  const minutes = parseLineDurationMinutes(duration);

  if (minutes === null) {
    return duration.trim();
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
};

export const normalizeLineDurationPadded = (duration: string) => {
  const minutes = parseLineDurationMinutes(duration);
  return minutes === null ? null : formatLineDurationPadded(minutes);
};

export const buildLineMinimumBaseLayoverConfigFromDictionaryRows = (
  rows: LineMinimumBaseLayoverDictionaryRow[],
): PbsLineMinimumBaseLayoverConfig => {
  const row = rows.find((item) =>
    item.parentCode === SYS_PARAM_PARENT_CODE
    && item.code === MINIMUM_BASE_LAYOVER_CONFIG_CODE
    && item.codeValue?.trim());
  const minDuration = normalizeLineDurationPadded(row?.codeValue ?? "");

  if (!minDuration || parseLineDurationMinutes(minDuration) === 0) {
    return { available: false };
  }

  return {
    available: true,
    minDuration,
  };
};

export const loadLineMinimumBaseLayoverConfig = async (
  db: Pick<Database, "select">,
): Promise<PbsLineMinimumBaseLayoverConfig> => {
  const rows = await db
    .select({
      parentCode: liveDictionary.parentCode,
      code: liveDictionary.code,
      codeValue: liveDictionary.codeValue,
    })
    .from(liveDictionary)
    .where(and(
      eq(liveDictionary.parentCode, SYS_PARAM_PARENT_CODE),
      eq(liveDictionary.code, MINIMUM_BASE_LAYOVER_CONFIG_CODE),
    ));

  return buildLineMinimumBaseLayoverConfigFromDictionaryRows(rows);
};
