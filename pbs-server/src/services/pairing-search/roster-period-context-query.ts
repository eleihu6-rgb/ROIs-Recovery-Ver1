import type { Pool } from "pg";
import { isValidIsoDate } from "../lineholder/date-utils.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";

export type PairingSearchRosterPeriodContext = {
  rosterPeriodId: number;
  rosterPeriodKey: string;
  periodCode: string;
  rpStartLocal: string;
  rpEndLocal: string;
};

type RosterPeriodContextRow = {
  roster_period_id: string;
  roster_period_key: string | null;
  period_code: string | null;
  rp_start_local: string | null;
  rp_end_local: string | null;
};

const validateSchemaName = (schema: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid live schema name: ${schema}`);
  }

  return schema;
};

export const loadPairingSearchRosterPeriodContext = async ({
  pgPool,
  schema,
  rosterPeriodId,
}: {
  pgPool: Pick<Pool, "query">;
  schema: string;
  rosterPeriodId: number;
}): Promise<PairingSearchRosterPeriodContext> => {
  if (!Number.isSafeInteger(rosterPeriodId) || rosterPeriodId <= 0) {
    throw new LineholderBidServiceError(
      400,
      "A valid roster period is required for Pairing Search.",
      "PERIOD_CONTEXT_REQUIRED",
    );
  }

  const liveSchema = validateSchemaName(schema);
  const result = await pgPool.query<RosterPeriodContextRow>(
    `
      select
        id::text as roster_period_id,
        roster_period::varchar as roster_period_key,
        pbs_period_code::varchar as period_code,
        to_char(rp_start, 'YYYY-MM-DD') as rp_start_local,
        to_char(rp_end, 'YYYY-MM-DD') as rp_end_local
      from ${liveSchema}.roster_period
      where id = $1::bigint
      limit 1
    `,
    [rosterPeriodId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new LineholderBidServiceError(
      404,
      "The selected roster period was not found.",
      "PERIOD_NOT_FOUND",
    );
  }

  const loadedId = Number.parseInt(row.roster_period_id, 10);
  const rosterPeriodKey = row.roster_period_key?.trim() ?? "";
  const periodCode = row.period_code?.trim() ?? "";
  const rpStartLocal = row.rp_start_local?.trim() ?? "";
  const rpEndLocal = row.rp_end_local?.trim() ?? "";

  if (!Number.isSafeInteger(loadedId) || !rosterPeriodKey || !periodCode) {
    throw new LineholderBidServiceError(
      409,
      "The selected roster period is incomplete. Please contact an administrator.",
      "PERIOD_CONTEXT_REQUIRED",
    );
  }

  if (!isValidIsoDate(rpStartLocal) || !isValidIsoDate(rpEndLocal) || rpStartLocal > rpEndLocal) {
    throw new LineholderBidServiceError(
      409,
      "The selected roster period date range is invalid. Please contact an administrator.",
      "PERIOD_RANGE_INVALID",
    );
  }

  return {
    rosterPeriodId: loadedId,
    rosterPeriodKey,
    periodCode,
    rpStartLocal,
    rpEndLocal,
  };
};
