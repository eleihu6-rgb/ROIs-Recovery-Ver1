import type { Pool } from "pg";
import type { PbsPairingNumberFilterOptionsResponse } from "../../../../packages/contracts/pbs-search-pairings.js";
import { stableHash } from "../../utils/stable-hash.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import { buildPairingExternalLabelExpression } from "./pairing-display-label.js";
import { buildPairingLocalOriginDateExpression } from "./pairing-local-date-sql.js";

type PairingNumberFilterOptionsRow = {
  pairing_number: string | null;
  total_count: number;
};

type PairingNumberFilterCursor = {
  version: 1;
  lastPairingNumber: string;
  query: string;
  rosterPeriodId: number;
  scopeFingerprint: string;
};

type PairingNumberFilterOptionsInput = {
  pgPool: Pick<Pool, "query">;
  schema: string;
  actorBase: string;
  actorRank: string | null;
  rosterPeriodId: number;
  periodCode: string;
  periodStartDate: string;
  periodEndDate: string;
  query?: string;
  cursor?: string;
  limit?: number;
};

const DEFAULT_FILTER_OPTION_LIMIT = 30;
const MAX_FILTER_OPTION_LIMIT = 50;
const CURSOR_VERSION = 1 as const;
const INVALID_CURSOR_MESSAGE = "The Pairing Number list changed. Reopen the list and try again.";

const normalizePairingNumber = (value?: string | null): string => value?.trim().toUpperCase() ?? "";

const clampFilterOptionLimit = (limit?: number): number => {
  if (!Number.isFinite(limit)) {
    return DEFAULT_FILTER_OPTION_LIMIT;
  }

  return Math.min(MAX_FILTER_OPTION_LIMIT, Math.max(1, Math.trunc(limit as number)));
};

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`);

const buildScopeFingerprint = (actorBase: string, actorRank: string | null): string => stableHash({
  version: CURSOR_VERSION,
  actorBase,
  actorRank,
});

const encodeCursor = (cursor: PairingNumberFilterCursor): string => Buffer
  .from(JSON.stringify(cursor), "utf8")
  .toString("base64url");

const decodeCursor = (
  cursor: string | undefined,
  expected: Pick<PairingNumberFilterCursor, "query" | "rosterPeriodId" | "scopeFingerprint">,
): PairingNumberFilterCursor | null => {
  if (!cursor?.trim()) {
    return null;
  }

  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<PairingNumberFilterCursor>;
    const isValid = value.version === CURSOR_VERSION
      && typeof value.lastPairingNumber === "string"
      && normalizePairingNumber(value.lastPairingNumber) === value.lastPairingNumber
      && value.lastPairingNumber.length > 0
      && value.query === expected.query
      && value.rosterPeriodId === expected.rosterPeriodId
      && value.scopeFingerprint === expected.scopeFingerprint;

    if (!isValid) {
      throw new Error("Cursor scope mismatch");
    }

    return value as PairingNumberFilterCursor;
  } catch {
    throw new LineholderBidServiceError(400, INVALID_CURSOR_MESSAGE);
  }
};

export const queryPairingNumberFilterOptions = async ({
  pgPool,
  schema,
  actorBase,
  actorRank,
  rosterPeriodId,
  periodCode,
  periodStartDate,
  periodEndDate,
  query,
  cursor,
  limit,
}: PairingNumberFilterOptionsInput): Promise<PbsPairingNumberFilterOptionsResponse> => {
  const normalizedQuery = normalizePairingNumber(query);
  const safeLimit = clampFilterOptionLimit(limit);
  const scopeFingerprint = buildScopeFingerprint(actorBase, actorRank);
  const decodedCursor = decodeCursor(cursor, {
    query: normalizedQuery,
    rosterPeriodId,
    scopeFingerprint,
  });
  const values: unknown[] = [actorBase, periodStartDate, periodEndDate];
  const actorRankFilter = actorRank
    ? `and exists (
        select 1
        from ${schema}.pairing_composition pc
        where pc.pairing_id = p.id
          and pc.acting_rank = $${values.push(actorRank)}::varchar
          and pc.is_deleted = 0
      )`
    : "";
  const queryFilter = normalizedQuery
    ? `and upper(btrim(${buildPairingExternalLabelExpression("p")})) like $${values.push(`%${escapeLikePattern(normalizedQuery)}%`)} escape '\\'`
    : "";
  const cursorFilter = decodedCursor
    ? `where pairing_number > $${values.push(decodedCursor.lastPairingNumber)}::varchar`
    : "";
  const limitPlaceholder = `$${values.push(safeLimit + 1)}`;
  const baseZoneExpression = "base_tz.name";
  const normalizedLabelExpression = `upper(btrim(${buildPairingExternalLabelExpression("p")}))`;
  const localOriginDateExpression = buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: baseZoneExpression,
  });
  const result = await pgPool.query<PairingNumberFilterOptionsRow>(
    `
      with scoped_labels as (
        select distinct ${normalizedLabelExpression} as pairing_number
        from ${schema}.pairing p
        left join ${schema}.airport base_airport
          on base_airport.airport = p.base
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        where p.is_deleted = 0
          and base_tz.name is not null
          and p.base = $1::varchar
          and ${buildPairingExternalLabelExpression("p")} is not null
          and ${localOriginDateExpression} between $2::date and $3::date
          ${actorRankFilter}
          ${queryFilter}
      ),
      totals as (
        select count(*)::int as total_count
        from scoped_labels
      ),
      paged_labels as (
        select pairing_number
        from scoped_labels
        ${cursorFilter}
        order by pairing_number asc
        limit ${limitPlaceholder}
      )
      select paged_labels.pairing_number, totals.total_count
      from totals
      left join paged_labels on true
      order by paged_labels.pairing_number asc nulls last
    `,
    values,
  );
  const labels = result.rows
    .map((row) => row.pairing_number)
    .filter((value): value is string => typeof value === "string")
    .slice(0, safeLimit);
  const hasMore = result.rows.filter((row) => row.pairing_number !== null).length > safeLimit;
  const lastPairingNumber = labels.at(-1);

  return {
    query: normalizedQuery,
    rosterPeriodId,
    periodCode,
    limit: safeLimit,
    options: labels.map((pairingNumber) => ({ value: pairingNumber, label: pairingNumber })),
    nextCursor: hasMore && lastPairingNumber
      ? encodeCursor({
        version: CURSOR_VERSION,
        lastPairingNumber,
        query: normalizedQuery,
        rosterPeriodId,
        scopeFingerprint,
      })
      : null,
    totalCount: result.rows[0]?.total_count ?? 0,
  };
};
