import { sql, type SQL } from "drizzle-orm";

export type AlgorithmExportScope = {
  crewIds?: readonly string[];
  crewSortRank?: ReadonlyMap<string, number>;
};

export type CrewSortableRow = {
  crewId: string;
};

export const buildCrewScopeSql = (crewIds: readonly string[] | undefined): SQL => {
  if (!crewIds) {
    return sql`true`;
  }

  if (crewIds.length === 0) {
    return sql`false`;
  }

  return sql`pbs_bid.crew_id in (${sql.join(crewIds.map((crewId) => sql`${crewId}`), sql`, `)})`;
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
