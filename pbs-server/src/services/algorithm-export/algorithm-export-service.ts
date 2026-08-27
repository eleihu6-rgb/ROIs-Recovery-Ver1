import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { createTgzArchive } from "./tar-gzip.js";
import { loadDaysOffCsv } from "./days-off-export.js";
import {
  loadPairingScoreCsv,
  type CrewPairingEligibility,
  type PairingScopeFilter,
  type PairingScoreSkippedProperty,
} from "./pairing-score-export.js";
import { loadReserveScoreCsv, type ReserveScoreSkippedProperty } from "./reserve-score-export.js";
import {
  buildLineRulesReadme,
  loadLineRulesCsv,
  type LineRuleSkippedProperty,
} from "./line-rules-export.js";
import type { AlgorithmExportScope } from "./export-scope.js";
import type { PbsAlgorithmExportService } from "./types.js";

type Database = ReturnType<typeof drizzle>;

type CreatePbsAlgorithmExportServiceOptions = {
  db: Database;
  pgPool: Pool;
  liveSchema: string;
  onSkippedPairingScoreProperty?: (event: PairingScoreSkippedProperty) => void;
  onSkippedReserveScoreProperty?: (event: ReserveScoreSkippedProperty) => void;
  onSkippedLineRuleProperty?: (event: LineRuleSkippedProperty) => void;
};

const normalizePeriodCodeForFilename = (periodCode: string) =>
  periodCode.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "period";

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Derive a scenario date window from the bid periodCode (e.g. "Jun 2026" → the June
// calendar month). This is the fallback the PAIRING_SCORE narrowing uses when the caller
// did not pass an explicit scenario window: a monthly bid period IS the scenario's date
// range, so bounding pairings to that month (±lead-in/out, applied downstream) keeps the
// bid set scoped without coupling pbs-server to the engine's scenario lookup. Returns
// null when the periodCode isn't a recognizable "MMM YYYY".
const parsePeriodWindow = (periodCode: string): { start: string; end: string } | null => {
  const match = periodCode.trim().toLowerCase().match(/^([a-z]{3,9})\.?\s+(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = MONTH_INDEX[match[1]!.slice(0, 3)!];
  if (!month) {
    return null;
  }
  const year = Number.parseInt(match[2]!, 10);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
};

const YEG_14_TEST_CREW_IDS = [
  "8888",
  "13697",
  "2697",
  "2696",
  "2440",
  "2377",
  "2229",
  "2227",
  "2224",
  "996",
  "572",
  "536",
  "383",
  "247",
] as const;

type LiveCrewSeniorityRow = {
  crewId: string;
  seniorityNum: number | null;
};

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

export const createPbsAlgorithmExportService = ({
  db,
  pgPool,
  liveSchema,
  onSkippedPairingScoreProperty,
  onSkippedReserveScoreProperty,
  onSkippedLineRuleProperty,
}: CreatePbsAlgorithmExportServiceOptions): PbsAlgorithmExportService => {
  const exportPackage = async (
    periodCode: string,
    options: {
      scope?: AlgorithmExportScope;
      pairingFilter?: PairingScopeFilter;
      crewEligibility?: CrewPairingEligibility;
      filenamePrefix: string;
    },
  ) => {
    const normalizedPeriodCode = periodCode.trim();
    const [daysOffCsv, pairingScoreCsv, reserveScoreCsv, lineRulesCsv] = await Promise.all([
      loadDaysOffCsv(db, normalizedPeriodCode, liveSchema, options.scope),
      loadPairingScoreCsv({
        db,
        pgPool,
        periodCode: normalizedPeriodCode,
        liveSchema,
        scope: options.scope,
        pairingFilter: options.pairingFilter,
        crewEligibility: options.crewEligibility,
        onSkippedProperty: onSkippedPairingScoreProperty,
      }),
      loadReserveScoreCsv({
        db,
        pgPool,
        periodCode: normalizedPeriodCode,
        liveSchema,
        scope: options.scope,
        onSkippedProperty: onSkippedReserveScoreProperty,
      }),
      loadLineRulesCsv({
        db,
        periodCode: normalizedPeriodCode,
        scope: options.scope,
        onSkippedProperty: onSkippedLineRuleProperty,
      }),
    ]);
    const buffer = createTgzArchive([
      {
        name: "DAYSOFF.csv",
        content: Buffer.from(daysOffCsv, "utf8"),
      },
      {
        name: "PAIRING_SCORE.csv",
        content: Buffer.from(pairingScoreCsv, "utf8"),
      },
      {
        name: "RESERVE_SCORE.csv",
        content: Buffer.from(reserveScoreCsv, "utf8"),
      },
      {
        name: "LINE_RULES.csv",
        content: Buffer.from(lineRulesCsv, "utf8"),
      },
      {
        name: "LINE_RULES_README.md",
        content: Buffer.from(buildLineRulesReadme(), "utf8"),
      },
    ]);

    return {
      filename: `${options.filenamePrefix}-${normalizePeriodCodeForFilename(normalizedPeriodCode)}.tgz`,
      contentType: "application/gzip",
      buffer,
    };
  };

  // Rank crew by seniority for stable CSV ordering: crew present in `orderedRows`
  // keep their seniority order; any requested crew missing from the live query
  // (e.g. no crew row) are appended deterministically so the scope stays total.
  const buildCrewSortRank = (
    orderedRows: LiveCrewSeniorityRow[],
    requestedCrewIds: readonly string[],
  ): Map<string, number> => {
    const rankByCrewId = new Map<string, number>();
    orderedRows.forEach((row, index) => {
      rankByCrewId.set(row.crewId, index);
    });
    requestedCrewIds.forEach((crewId, index) => {
      if (!rankByCrewId.has(crewId)) {
        rankByCrewId.set(crewId, Number.MAX_SAFE_INTEGER / 2 + index);
      }
    });
    return rankByCrewId;
  };

  const loadYeg14Scope = async (): Promise<AlgorithmExportScope> => {
    const schema = validateLiveSchema(liveSchema);
    const pbsSchema = validateLiveSchema(`${schema}_pbs`);
    const result = await pgPool.query<LiveCrewSeniorityRow>(
      `
        select
          c.crew_id::varchar as "crewId",
          c.seniority_num::integer as "seniorityNum"
        from ${schema}.crew c
        inner join ${pbsSchema}.pbs_user u
          on u.crew_id = c.crew_id::varchar
        where c.crew_id::varchar = any($1::varchar[])
          and u.base = 'YEG'
        order by c.seniority_num asc nulls last, c.crew_id
      `,
      [YEG_14_TEST_CREW_IDS],
    );

    return {
      crewIds: YEG_14_TEST_CREW_IDS,
      crewSortRank: buildCrewSortRank(result.rows, YEG_14_TEST_CREW_IDS),
    };
  };

  // Derive the PAIRING_SCORE narrowing facets from the scope crews themselves — one row
  // per crew carrying its division (crew), bases (crew_base) and ranks (crew_rank), each
  // valid within the scenario window when one is supplied. From these we build BOTH:
  //   - a coarse scope-level filter (union of bases/divisions/ranks) → SQL pre-filter that
  //     drops out-of-window / out-of-base / wrong-division pairings cheaply;
  //   - a per-crew eligibility map → the req-4 refinement so a CA is scored only on
  //     CA-needing pairings (the coarse OR alone keeps every in-scope pilot pairing).
  // "scenario crew base" is literally the crews' own bases.
  const loadScenarioPairingFilter = async (
    schema: string,
    crewIds: readonly string[],
    scenarioStart?: string,
    scenarioEnd?: string,
  ): Promise<{ pairingFilter: PairingScopeFilter; crewEligibility: CrewPairingEligibility }> => {
    const hasWindow = Boolean(scenarioStart && scenarioEnd);
    // $2 = window start, $3 = window end (only bound when a window is given).
    const validity = (alias: string) =>
      hasWindow
        ? `and ${alias}.eff_dt <= $3 and (${alias}.exp_dt is null or ${alias}.exp_dt >= $2)`
        : "";
    const params: unknown[] = hasWindow ? [crewIds, scenarioStart, scenarioEnd] : [crewIds];
    const result = await pgPool.query<{
      crewId: string;
      division: string | null;
      bases: string[] | null;
      ranks: string[] | null;
    }>(
      `
        select
          c.crew_id::varchar as "crewId",
          c.division::varchar as "division",
          array_agg(distinct cb.base) filter (where cb.base is not null) as bases,
          array_agg(distinct cr.rank) filter (where cr.rank is not null) as ranks
        from ${schema}.crew c
        left join ${schema}.crew_base cb
          on cb.crew_id = c.crew_id::varchar ${validity("cb")}
        left join ${schema}.crew_rank cr
          on cr.crew_id = c.crew_id::varchar ${validity("cr")}
        where c.crew_id::varchar = any($1::varchar[])
        group by c.crew_id, c.division
      `,
      params,
    );

    const allBases = new Set<string>();
    const allDivisions = new Set<string>();
    const allRanks = new Set<string>();
    const crewEligibility = new Map<string, { division: string | null; ranks: ReadonlySet<string> }>();

    for (const row of result.rows) {
      const ranks = new Set(row.ranks ?? []);
      (row.bases ?? []).forEach((base) => allBases.add(base));
      if (row.division) {
        allDivisions.add(row.division);
      }
      ranks.forEach((rank) => allRanks.add(rank));
      crewEligibility.set(row.crewId, { division: row.division, ranks });
    }

    return {
      pairingFilter: {
        dateStart: scenarioStart,
        dateEnd: scenarioEnd,
        bases: allBases.size > 0 ? [...allBases] : undefined,
        divisions: allDivisions.size > 0 ? [...allDivisions] : undefined,
        ranks: allRanks.size > 0 ? [...allRanks] : undefined,
      },
      crewEligibility,
    };
  };

  // Scenario-scoped: the caller (engine-server, at run kick-off) supplies the exact
  // crew set the scenario covers (same set ro_input_builder derives), so the bid
  // package matches the optimized roster crew instead of the fixed YEG-14 list. The
  // optional scenario window further bounds the PAIRING_SCORE pairing set by date.
  const loadScenarioScope = async (
    crewIds: readonly string[],
    scenarioStart?: string,
    scenarioEnd?: string,
  ): Promise<{
    scope: AlgorithmExportScope;
    pairingFilter?: PairingScopeFilter;
    crewEligibility?: CrewPairingEligibility;
  }> => {
    if (crewIds.length === 0) {
      return { scope: { crewIds: [], crewSortRank: new Map() } };
    }
    const schema = validateLiveSchema(liveSchema);
    const [seniority, facets] = await Promise.all([
      pgPool.query<LiveCrewSeniorityRow>(
        `
          select
            c.crew_id::varchar as "crewId",
            c.seniority_num::integer as "seniorityNum"
          from ${schema}.crew c
          where c.crew_id::varchar = any($1::varchar[])
          order by c.seniority_num asc nulls last, c.crew_id
        `,
        [crewIds],
      ),
      loadScenarioPairingFilter(schema, crewIds, scenarioStart, scenarioEnd),
    ]);

    return {
      scope: {
        crewIds,
        crewSortRank: buildCrewSortRank(seniority.rows, crewIds),
      },
      pairingFilter: facets.pairingFilter,
      crewEligibility: facets.crewEligibility,
    };
  };

  return {
    async exportCurrentPackage(periodCode) {
      return exportPackage(periodCode, {
        filenamePrefix: "pbs-algorithm-export",
      });
    },
    async exportYeg14TestPackage(periodCode) {
      const scope = await loadYeg14Scope();

      return exportPackage(periodCode, {
        scope,
        filenamePrefix: "pbs-algorithm-export-yeg-14",
      });
    },
    async exportScenarioPackage(periodCode, crewIds, scenarioStart, scenarioEnd) {
      // Prefer the caller's explicit scenario window; otherwise fall back to the bid
      // period's calendar month so date-narrowing works even when the engine doesn't
      // forward the window. This is the dominant reducer (1 month vs all live months).
      let windowStart = scenarioStart;
      let windowEnd = scenarioEnd;
      if (!windowStart || !windowEnd) {
        const periodWindow = parsePeriodWindow(periodCode);
        if (periodWindow) {
          windowStart = periodWindow.start;
          windowEnd = periodWindow.end;
        }
      }
      const { scope, pairingFilter, crewEligibility } = await loadScenarioScope(
        crewIds,
        windowStart,
        windowEnd,
      );

      return exportPackage(periodCode, {
        scope,
        pairingFilter,
        crewEligibility,
        filenamePrefix: "pbs-algorithm-export-scenario",
      });
    },
  };
};
