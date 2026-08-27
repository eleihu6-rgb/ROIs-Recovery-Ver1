import type { Pool } from "pg";
import type { PbsFlightNumberSearchType } from "../../../../packages/contracts/pbs-search-pairings.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";

export type FlightNumberCategoryRange = {
  from: number;
  to: number;
};

type FlightNumberCategoryRangeRow = {
  code: string;
  code_value: string | null;
};

export const FLIGHT_NUMBER_CATEGORY_RANGE_PARENT_CODE = "PBS_FLIGHT_NUMBER_CATEGORY_RANGE";

const SEARCH_TYPE_DICTIONARY_CODE: Record<PbsFlightNumberSearchType, string> = {
  charter: "CHARTER_MAIN",
  "positioning-charter-network": "CHARTER_POSITIONING_NETWORK",
  "recovery-charter-network": "CHARTER_RECOVERY_NETWORK",
};

const CONFIG_ERROR_MESSAGE = "Flight number category range configuration is missing or invalid.";

const parseRangeValue = (rawValue: string | null): FlightNumberCategoryRange | null => {
  const match = rawValue?.trim().match(/^(\d+)-(\d+)$/);

  if (!match) {
    return null;
  }

  const from = Number.parseInt(match[1]!, 10);
  const to = Number.parseInt(match[2]!, 10);

  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) {
    return null;
  }

  return { from, to };
};

export const parseFlightNumberCategoryRangeRows = (
  type: PbsFlightNumberSearchType,
  rows: FlightNumberCategoryRangeRow[],
): FlightNumberCategoryRange[] => {
  const dictionaryCode = SEARCH_TYPE_DICTIONARY_CODE[type];
  const matchingRows = rows.filter((row) => row.code.trim().toUpperCase() === dictionaryCode);
  const ranges = matchingRows.map((row) => parseRangeValue(row.code_value));
  const range = ranges[0];

  if (ranges.length !== 1 || range === null) {
    throw new LineholderBidServiceError(500, CONFIG_ERROR_MESSAGE);
  }

  return [range];
};

export const loadFlightNumberCategoryRanges = async (
  pgPool: Pool,
  schema: string,
  type: PbsFlightNumberSearchType,
): Promise<FlightNumberCategoryRange[]> => {
  const dictionaryCode = SEARCH_TYPE_DICTIONARY_CODE[type];
  const result = await pgPool.query<FlightNumberCategoryRangeRow>(
    `
      select code, code_value
      from ${schema}.dictionary
      where parent_code = $1
        and code = $2
      order by idx asc, code asc
    `,
    [FLIGHT_NUMBER_CATEGORY_RANGE_PARENT_CODE, dictionaryCode],
  );

  return parseFlightNumberCategoryRangeRows(type, result.rows);
};
