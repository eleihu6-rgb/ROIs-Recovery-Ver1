import { sql, type SQL } from "drizzle-orm";

export type AlgorithmExportCrewFilters = {
  division?: "P" | "C" | "A" | "ALL";
  status?: "ACTIVE" | "ALL";
  bases?: readonly string[];
  fleetQuals?: readonly string[];
};

export type AlgorithmExportScope = {
  crewIds?: readonly string[];
  bidIds?: readonly string[];
  crewSortRank?: ReadonlyMap<string, number>;
  filters?: AlgorithmExportCrewFilters;
};

export type CrewSortableRow = {
  crewId: string;
};

export const buildCrewScopeSql = (
  crewIds: readonly string[] | undefined,
  crewIdExpr: SQL = sql`pbs_bid.crew_id`,
): SQL => {
  if (!crewIds) {
    return sql`true`;
  }

  if (crewIds.length === 0) {
    return sql`false`;
  }

  return sql`${crewIdExpr} in (${sql.join(crewIds.map((crewId) => sql`${crewId}`), sql`, `)})`;
};

export const buildBidSourceSql = (
  bidIds: readonly string[] | undefined,
  periodCode: string,
  bidIdExpr: SQL,
  periodCodeExpr: SQL,
  bidContextExpr: SQL,
): SQL => {
  if (bidIds === undefined) {
    return sql`${periodCodeExpr} = ${periodCode} and ${bidContextExpr} = 'Current'`;
  }

  if (bidIds.length === 0) {
    return sql`false`;
  }

  return sql`${bidIdExpr} in (${sql.join(bidIds.map((bidId) => sql`${bidId}`), sql`, `)})`;
};

export const compareCrewScopedRows = <TRow extends CrewSortableRow>(
  left: TRow,
  right: TRow,
  scope?: AlgorithmExportScope,
) => {
  if (scope?.crewSortRank) {
    const leftRank = scope.crewSortRank.get(left.crewId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = scope.crewSortRank.get(right.crewId) ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
  }

  return left.crewId.localeCompare(right.crewId);
};
