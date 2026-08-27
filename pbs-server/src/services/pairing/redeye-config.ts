import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  parsePbsRedeyeDefinition,
  pbsBidDefinitionCodes,
  type PbsRedeyeDefinition,
} from "../../../../packages/contracts/pbs-bid-definitions.js";
import { liveDictionary } from "../../models/index.js";

type Database = ReturnType<typeof drizzle>;

export type RedeyeDictionaryRow = {
  parentCode: string | null;
  code: string | null;
  codeValue: string | null;
};

export const buildRedeyeConfigFromDictionaryRows = (
  rows: RedeyeDictionaryRow[],
): PbsRedeyeDefinition => {
  const value = (code: string) => rows.find((row) =>
    row.parentCode === pbsBidDefinitionCodes.redeyeParent && row.code === code)?.codeValue;

  return parsePbsRedeyeDefinition({
    startTime: value(pbsBidDefinitionCodes.redeyeStartTime),
    endTime: value(pbsBidDefinitionCodes.redeyeEndTime),
  });
};

export const loadRedeyeConfig = async (
  db: Pick<Database, "select">,
): Promise<PbsRedeyeDefinition> => {
  const rows = await db
    .select({
      parentCode: liveDictionary.parentCode,
      code: liveDictionary.code,
      codeValue: liveDictionary.codeValue,
    })
    .from(liveDictionary)
    .where(eq(liveDictionary.parentCode, pbsBidDefinitionCodes.redeyeParent));

  return buildRedeyeConfigFromDictionaryRows(rows);
};
