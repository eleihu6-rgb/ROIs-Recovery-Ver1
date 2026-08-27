import type { Pool } from "pg";
import type {
  PbsFlightNumberOption,
  PbsFlightNumberSearchResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import type { FlightNumberCategoryRange } from "./flight-number-category-range-config.js";

type FlightNumberSearchRow = {
  flt_num: string;
};

type SearchFlightNumberOptionsInput = {
  pgPool: Pool;
  schema: string;
  actorBase: string;
  query?: string;
  limit?: number;
  typeRanges?: FlightNumberCategoryRange[];
};

const DEFAULT_FLIGHT_NUMBER_SEARCH_LIMIT = 20;
const MAX_FLIGHT_NUMBER_SEARCH_LIMIT = 50;

const normalizeSearchQuery = (query?: string) => (query ?? "").trim().toUpperCase();

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

const FLIGHT_NUMBER_NUMERIC_EXPRESSION =
  "nullif(regexp_replace(upper(btrim(s.flt_num)), '[^0-9]', '', 'g'), '')::integer";

export const clampFlightNumberSearchLimit = (limit?: number) => {
  if (!Number.isFinite(limit)) {
    return DEFAULT_FLIGHT_NUMBER_SEARCH_LIMIT;
  }

  return Math.min(MAX_FLIGHT_NUMBER_SEARCH_LIMIT, Math.max(1, Math.trunc(limit as number)));
};

const mapFlightNumberOption = (row: FlightNumberSearchRow): PbsFlightNumberOption => {
  const value = row.flt_num.trim().toUpperCase();

  return {
    value,
    label: value,
  };
};

export const searchFlightNumberOptions = async ({
  pgPool,
  schema,
  actorBase,
  query,
  limit,
  typeRanges,
}: SearchFlightNumberOptionsInput): Promise<PbsFlightNumberSearchResponse> => {
  const normalizedQuery = normalizeSearchQuery(query);
  const safeLimit = clampFlightNumberSearchLimit(limit);

  if (normalizedQuery.length === 0) {
    return {
      query: normalizedQuery,
      limit: safeLimit,
      options: [],
    };
  }

  const escapedQuery = escapeLikePattern(normalizedQuery);
  const containsPattern = `%${escapedQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const params: Array<string | number> = [containsPattern, normalizedQuery, prefixPattern];
  const typeFilterSql = typeRanges && typeRanges.length > 0
    ? `and (${typeRanges.map(({ from, to }) => {
        const fromParam = params.push(from);
        const toParam = params.push(to);

        return `${FLIGHT_NUMBER_NUMERIC_EXPRESSION} between $${fromParam}::integer and $${toParam}::integer`;
      }).join(" or ")})`
    : "";
  const actorBaseParam = params.push(actorBase);
  const limitParam = params.push(safeLimit);
  const result = await pgPool.query<FlightNumberSearchRow>(
    `
      with matched_flight_numbers as (
        select upper(btrim(s.flt_num)) as flt_num
        from ${schema}.pairing_segment s
        join ${schema}.pairing p
          on p.id = s.pairing_id
         and p.is_deleted = 0
         and p.base = $${actorBaseParam}::varchar
        where s.is_deleted = 0
          and upper(btrim(coalesce(s.seg_assignment, ''))) in ('FLT', 'FLY')
          and nullif(btrim(s.flt_num), '') is not null
          and upper(s.flt_num) like $1 escape '\\'
          ${typeFilterSql}
        group by upper(btrim(s.flt_num))
      )
      select flt_num
      from matched_flight_numbers
      order by
        case
          when flt_num = $2 then 0
          when flt_num like $3 escape '\\' then 1
          else 2
        end asc,
        flt_num asc
      limit $${limitParam}
    `,
    params,
  );

  return {
    query: normalizedQuery,
    limit: safeLimit,
    options: result.rows.map(mapFlightNumberOption),
  };
};
