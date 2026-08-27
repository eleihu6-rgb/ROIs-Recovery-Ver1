import type { Pool } from "pg";

import {
  parsePbsEfficientFlyingPercentileDefinition,
  pbsBidDefinitionCodes,
} from "../../../../packages/contracts/pbs-bid-definitions.js";
import type { PbsEfficientFlyingConfig } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";

export const EFFICIENT_FLYING_CONFIG_PARENT_CODE = pbsBidDefinitionCodes.efficientFlyingParent;
export const EFFICIENT_FLYING_PERCENTILE_CODE = pbsBidDefinitionCodes.efficientFlyingPercentile;
export const EFFICIENT_FLYING_CONFIG_ERROR_MESSAGE =
  "Efficient flying configuration is unavailable.";

type EfficientFlyingDictionaryRow = {
  code_value: string | null;
};

export const parseEfficientFlyingConfigRows = (
  rows: EfficientFlyingDictionaryRow[],
): PbsEfficientFlyingConfig => {
  if (rows.length !== 1) {
    throw new LineholderBidServiceError(503, EFFICIENT_FLYING_CONFIG_ERROR_MESSAGE);
  }

  const definition = parsePbsEfficientFlyingPercentileDefinition({
    percentile: rows[0]?.code_value,
  });
  if (!definition.available) {
    throw new LineholderBidServiceError(503, EFFICIENT_FLYING_CONFIG_ERROR_MESSAGE);
  }

  return { percentile: definition.percentile };
};

export const loadEfficientFlyingConfig = async (
  pgPool: Pick<Pool, "query">,
  schema: string,
): Promise<PbsEfficientFlyingConfig> => {
  const result = await pgPool.query<EfficientFlyingDictionaryRow>(
    `
      select code_value
      from ${schema}.dictionary
      where parent_code = $1
        and code = $2
      order by id
    `,
    [EFFICIENT_FLYING_CONFIG_PARENT_CODE, EFFICIENT_FLYING_PERCENTILE_CODE],
  );

  return parseEfficientFlyingConfigRows(result.rows);
};
