import type { Pool } from "pg";
import type {
  PbsCrewIdOption,
  PbsCrewIdSearchResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  buildCrewSearchScopeSql,
  normalizeCrewSearchDimensionExpression,
  type CrewSearchActor,
} from "../crew-search-scope.js";

type CrewIdSearchRow = {
  crew_id: string;
  first_name: string | null;
  last_name: string | null;
};

type SearchCrewIdOptionsInput = {
  pgPool: Pool;
  schema: string;
  pbsSchema: string;
  actor: CrewSearchActor;
  query?: string;
  limit?: number;
};

const DEFAULT_CREW_ID_SEARCH_LIMIT = 20;
const MAX_CREW_ID_SEARCH_LIMIT = 50;

const normalizeSearchQuery = (query?: string) => (query ?? "").trim().toUpperCase();

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

export const clampCrewIdSearchLimit = (limit?: number) => {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CREW_ID_SEARCH_LIMIT;
  }

  return Math.min(MAX_CREW_ID_SEARCH_LIMIT, Math.max(1, Math.trunc(limit as number)));
};

const buildCrewIdOptionLabel = (row: CrewIdSearchRow) => {
  const name = [row.first_name, row.last_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return name ? `${row.crew_id} - ${name}` : row.crew_id;
};

const mapCrewIdOption = (row: CrewIdSearchRow): PbsCrewIdOption => {
  const crewId = row.crew_id.trim();

  return {
    value: crewId,
    label: buildCrewIdOptionLabel({ ...row, crew_id: crewId }),
    crewId,
    firstName: row.first_name?.trim() || null,
    lastName: row.last_name?.trim() || null,
  };
};

export const searchCrewIdOptions = async ({
  pgPool,
  schema,
  pbsSchema,
  actor,
  query,
  limit,
}: SearchCrewIdOptionsInput): Promise<PbsCrewIdSearchResponse> => {
  const normalizedQuery = normalizeSearchQuery(query);
  const safeLimit = clampCrewIdSearchLimit(limit);

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
  const scopeSql = buildCrewSearchScopeSql({
    pbsSchema,
    actor,
    firstParamIndex: 5,
    targetCrewIdExpression: "c.crew_id",
    targetBaseExpression: normalizeCrewSearchDimensionExpression("cb.base"),
    targetDivisionExpression: normalizeCrewSearchDimensionExpression("c.division"),
  });
  const result = await pgPool.query<CrewIdSearchRow>(
    `
      with ${scopeSql.actorScopeCte}
      select
        c.crew_id,
        c.first_name,
        c.last_name
      from ${schema}.crew c
      left join lateral (
        select crew_base.base
        from ${schema}.crew_base crew_base
        where crew_base.crew_id = c.crew_id
          and crew_base.exp_dt is null
          and crew_base.is_prime_base = 1
        order by crew_base.eff_dt desc, crew_base.id desc
        limit 1
      ) cb on true
      where nullif(trim(c.crew_id), '') is not null
        and (
          upper(c.crew_id) like $1 escape '\\'
          or upper(coalesce(c.first_name, '')) like $1 escape '\\'
          or upper(coalesce(c.last_name, '')) like $1 escape '\\'
          or upper(concat_ws(' ', c.first_name, c.last_name)) like $1 escape '\\'
        )
        and ${scopeSql.whereClause}
      order by
        case
          when upper(c.crew_id) = $2 then 0
          when upper(c.crew_id) like $3 escape '\\' then 1
          else 2
        end asc,
        c.crew_id asc
      limit $4
    `,
    [containsPattern, normalizedQuery, prefixPattern, safeLimit, ...scopeSql.values],
  );

  return {
    query: normalizedQuery,
    limit: safeLimit,
    options: result.rows.map(mapCrewIdOption),
  };
};
