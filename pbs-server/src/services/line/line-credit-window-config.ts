import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  parsePbsLineCreditWindowDeltaHours,
  type PbsLineCreditWindowConfig,
} from "../../../../packages/contracts/pbs-line-bids.js";
import { liveDictionary } from "../../models/index.js";

type Database = ReturnType<typeof drizzle>;

const CREDIT_WINDOW_CONFIG_CODE = "PBS_LINE_CREDIT_WINDOW_CONFIG";
const DELTA_HOURS_CODE = "DELTA_HOURS";

export type LineCreditWindowDictionaryRow = {
  parentCode: string | null;
  code: string | null;
  codeValue: string | null;
};

export const buildLineCreditWindowConfigFromDictionaryRows = (
  rows: LineCreditWindowDictionaryRow[],
): PbsLineCreditWindowConfig => {
  const rawDeltaHours = rows.find((item) =>
    item.parentCode === CREDIT_WINDOW_CONFIG_CODE
    && item.code === DELTA_HOURS_CODE)?.codeValue?.trim();
  const deltaHours = parsePbsLineCreditWindowDeltaHours(rawDeltaHours);

  if (deltaHours === null) {
    return { available: false };
  }

  return {
    available: true,
    deltaHours,
  };
};

export const loadLineCreditWindowConfig = async (
  db: Pick<Database, "select">,
): Promise<PbsLineCreditWindowConfig> => {
  const rows = await db
    .select({
      parentCode: liveDictionary.parentCode,
      code: liveDictionary.code,
      codeValue: liveDictionary.codeValue,
    })
    .from(liveDictionary)
    .where(eq(liveDictionary.parentCode, CREDIT_WINDOW_CONFIG_CODE));

  return buildLineCreditWindowConfigFromDictionaryRows(rows);
};
