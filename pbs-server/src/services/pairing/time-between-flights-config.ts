import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  parsePbsMinimumTimeBetweenFlightsDefinition,
  pbsBidDefinitionCodes,
  type PbsMinimumTimeBetweenFlightsDefinition,
} from "../../../../packages/contracts/pbs-bid-definitions.js";
import { liveDictionary } from "../../models/index.js";

type Database = ReturnType<typeof drizzle>;

export const TIME_BETWEEN_FLIGHTS_PROPERTY_CODE = 129;

type DictionaryRow = {
  parentCode: string | null;
  code: string | null;
  codeValue: string | null;
};

type TimeBetweenFlightsCandidate = {
  propertyCode: number;
  bid: {
    type: string;
    value?: unknown;
  };
};

export const parseTimeBetweenFlightsDurationMinutes = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return null;

  const minutes = Number.parseInt(match[1] ?? "", 10) * 60
    + Number.parseInt(match[2] ?? "", 10);
  return Number.isSafeInteger(minutes) ? minutes : null;
};

export const buildTimeBetweenFlightsMinimumConfigFromDictionaryRows = (
  rows: DictionaryRow[],
): PbsMinimumTimeBetweenFlightsDefinition => {
  const matchingRows = rows.filter((row) =>
    row.parentCode === pbsBidDefinitionCodes.minimumTimeBetweenFlightsParent
    && row.code === pbsBidDefinitionCodes.minimumTimeBetweenFlightsMinutes);

  return parsePbsMinimumTimeBetweenFlightsDefinition(
    matchingRows.length === 1
      ? { minimumMinutes: matchingRows[0]?.codeValue }
      : undefined,
  );
};

export const loadTimeBetweenFlightsMinimumConfig = async (
  db: Pick<Database, "select">,
): Promise<PbsMinimumTimeBetweenFlightsDefinition> => {
  const rows = await db
    .select({
      parentCode: liveDictionary.parentCode,
      code: liveDictionary.code,
      codeValue: liveDictionary.codeValue,
    })
    .from(liveDictionary)
    .where(and(
      eq(liveDictionary.parentCode, pbsBidDefinitionCodes.minimumTimeBetweenFlightsParent),
      eq(liveDictionary.code, pbsBidDefinitionCodes.minimumTimeBetweenFlightsMinutes),
    ));

  return buildTimeBetweenFlightsMinimumConfigFromDictionaryRows(rows);
};

export const validateTimeBetweenFlightsMinimum = (
  property: TimeBetweenFlightsCandidate,
  config: PbsMinimumTimeBetweenFlightsDefinition | null | undefined,
  isGrandfathered = false,
): string | null => {
  if (property.propertyCode !== TIME_BETWEEN_FLIGHTS_PROPERTY_CODE) return null;

  const durationMinutes = property.bid.type === "duration"
    ? parseTimeBetweenFlightsDurationMinutes(property.bid.value)
    : null;
  if (durationMinutes === null) {
    return "Time Between Flights requires a valid duration.";
  }

  if (isGrandfathered) return null;
  if (!config?.available) {
    return "Time Between Flights configuration is unavailable.";
  }
  if (durationMinutes < config.minimumMinutes) {
    const hours = Math.floor(config.minimumMinutes / 60);
    const minutes = config.minimumMinutes % 60;
    const minimum = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    return `Time Between Flights must be at least ${minimum}.`;
  }

  return null;
};
