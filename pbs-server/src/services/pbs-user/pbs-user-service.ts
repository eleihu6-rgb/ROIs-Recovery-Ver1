import type {
  PbsUserCrewOption,
  PbsUserCrewOptionsResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import type { CreatePbsUserServiceOptions, PbsUserService } from "./types.js";
import {
  buildCrewSearchScopeSql,
  normalizeCrewSearchDimensionExpression,
} from "../crew-search-scope.js";

type PbsUserCrewOptionRow = {
  crew_id: string;
  user_code: string;
  user_name: string;
  base: string | null;
  rank: string | null;
  division: string | null;
};

const DEFAULT_CREW_OPTION_LIMIT = 20;
const MAX_CREW_OPTION_LIMIT = 50;

const normalizeSearchQuery = (query?: string) => (query ?? "").trim().toUpperCase();

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

const validateSchemaName = (schemaName: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid PBS schema name: ${schemaName}`);
  }

  return schemaName;
};

export const clampPbsUserCrewOptionLimit = (limit?: number) => {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CREW_OPTION_LIMIT;
  }

  return Math.min(MAX_CREW_OPTION_LIMIT, Math.max(1, Math.trunc(limit as number)));
};

const mapCrewOption = (row: PbsUserCrewOptionRow): PbsUserCrewOption => {
  const crewId = row.crew_id.trim();
  const userName = row.user_name.trim();

  return {
    value: crewId,
    label: userName,
    crewId,
    userName,
    userCode: row.user_code.trim(),
    base: row.base?.trim() || null,
    rank: row.rank?.trim() || null,
    division: row.division?.trim() || null,
  };
};

export const createPbsUserService = ({
  pgPool,
  pbsSchema,
}: CreatePbsUserServiceOptions): PbsUserService => {
  const pbsSchemaName = validateSchemaName(pbsSchema);

  return {
    async searchCrewOptions(actor, { query, limit }): Promise<PbsUserCrewOptionsResponse> {
      const normalizedQuery = normalizeSearchQuery(query);
      const safeLimit = clampPbsUserCrewOptionLimit(limit);

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
        pbsSchema: pbsSchemaName,
        actor,
        firstParamIndex: 5,
        targetCrewIdExpression: "pu.crew_id",
        targetBaseExpression: normalizeCrewSearchDimensionExpression("pu.base"),
        targetDivisionExpression: normalizeCrewSearchDimensionExpression("pu.division"),
      });
      const result = await pgPool.query<PbsUserCrewOptionRow>(
        `
          with ${scopeSql.actorScopeCte}
          select
            pu.crew_id,
            pu.user_code,
            pu.user_name,
            pu.base,
            pu.rank,
            pu.division
          from ${pbsSchemaName}.pbs_user pu
          where pu.is_admin = 0
            and pu.status = 0
            and nullif(trim(pu.crew_id), '') is not null
            and nullif(trim(pu.user_name), '') is not null
            and (pu.exp_dt is null or pu.exp_dt > now())
            and (
              upper(pu.crew_id) like $1 escape '\\'
              or upper(pu.user_code) like $1 escape '\\'
              or upper(pu.user_name) like $1 escape '\\'
            )
            and ${scopeSql.whereClause}
          order by
            case
              when upper(pu.crew_id) = $2 then 0
              when upper(pu.user_code) = $2 then 1
              when upper(pu.crew_id) like $3 escape '\\' then 2
              when upper(pu.user_code) like $3 escape '\\' then 3
              else 4
            end asc,
            pu.user_name asc,
            pu.crew_id asc
          limit $4
        `,
        [containsPattern, normalizedQuery, prefixPattern, safeLimit, ...scopeSql.values],
      );

      return {
        query: normalizedQuery,
        limit: safeLimit,
        options: result.rows.map(mapCrewOption),
      };
    },
  };
};
