import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { createTgzArchive } from "./tar-gzip.js";
import { loadDaysOffCsv } from "./days-off-export.js";
import {
  loadPairingScoreCsv,
  type CrewPairingEligibilityFacet,
  type PairingScopeFilter,
  type PairingScoreSkippedProperty,
} from "./pairing-score-export.js";
import { loadReserveScoreCsv, type ReserveScoreSkippedProperty } from "./reserve-score-export.js";
import {
  buildLineRulesReadme,
  loadLineRulesCsv,
  type LineRuleSkippedProperty,
} from "./line-rules-export.js";
import { loadEffectiveBidSources } from "./effective-bid-source.js";
import type { AlgorithmExportCrewFilters, AlgorithmExportScope } from "./export-scope.js";
import type { AlgorithmExportPeriodContext, PbsAlgorithmExportService } from "./types.js";

type Database = ReturnType<typeof drizzle>;

type CreatePbsAlgorithmExportServiceOptions = {
  db: Database;
  pgPool: Pool;
  liveSchema: string;
  pbsSchema: string;
  onSkippedPairingScoreProperty?: (event: PairingScoreSkippedProperty) => void;
  onSkippedReserveScoreProperty?: (event: ReserveScoreSkippedProperty) => void;
  onSkippedLineRuleProperty?: (event: LineRuleSkippedProperty) => void;
};

const normalizePeriodCodeForFilename = (periodCode: string) =>
  periodCode.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "period";

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

type FilteredCrewRow = {
  crewId: string;
};

type CrewBaseEligibilityRow = {
  id: string;
  crewId: string;
  base: string;
  effectiveAt: Date | string;
  expiresAt: Date | string | null;
};

type CrewRankEligibilityRow = {
  crewId: string;
  rank: string;
  effectiveAt: Date | string;
  expiresAt: Date | string | null;
};

const createAlgorithmExportServiceError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

const normalizeFilterList = (values: readonly string[] | undefined) =>
  Array.from(new Set((values ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean)));

const normalizeCrewFilters = (
  filters: AlgorithmExportCrewFilters | undefined,
): AlgorithmExportCrewFilters => ({
  division: filters?.division ?? "ALL",
  status: filters?.status ?? "ALL",
  bases: normalizeFilterList(filters?.bases),
  fleetQuals: normalizeFilterList(filters?.fleetQuals),
});

const hasActiveCrewFilter = (filters: AlgorithmExportCrewFilters) =>
  (filters.division !== undefined && filters.division !== "ALL")
  || (filters.status !== undefined && filters.status !== "ALL")
  || (filters.bases?.length ?? 0) > 0
  || (filters.fleetQuals?.length ?? 0) > 0;

const intersectCrewIds = (
  requestedCrewIds: readonly string[],
  allowedCrewIds: readonly string[],
): string[] => {
  const allowed = new Set(allowedCrewIds);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const crewId of requestedCrewIds) {
    if (allowed.has(crewId) && !seen.has(crewId)) {
      result.push(crewId);
      seen.add(crewId);
    }
  }

  return result;
};

export const createPbsAlgorithmExportService = ({
  db,
  pgPool,
  liveSchema,
  pbsSchema,
  onSkippedPairingScoreProperty,
  onSkippedReserveScoreProperty,
  onSkippedLineRuleProperty,
}: CreatePbsAlgorithmExportServiceOptions): PbsAlgorithmExportService => {
  const normalizedPbsSchema = validateLiveSchema(pbsSchema);
  const schema = validateLiveSchema(liveSchema);
  const loadPeriodContext = async (
    rosterPeriodId: number,
    requestedPeriodCode: string,
  ): Promise<AlgorithmExportPeriodContext> => {
    if (!Number.isSafeInteger(rosterPeriodId) || rosterPeriodId <= 0) {
      throw createAlgorithmExportServiceError(400, "A valid rosterPeriodId is required.");
    }

    const result = await pgPool.query<{
      rosterPeriodId: number;
      rosterPeriodKey: string | null;
      periodCode: string | null;
      rpStartLocal: string | null;
      rpEndLocal: string | null;
    }>(`
      select
        id::integer as "rosterPeriodId",
        roster_period::varchar as "rosterPeriodKey",
        pbs_period_code::varchar as "periodCode",
        rp_start::date::text as "rpStartLocal",
        rp_end::date::text as "rpEndLocal"
      from ${schema}.roster_period
      where id = $1::bigint
      limit 1
    `, [rosterPeriodId]);
    const row = result.rows[0];

    if (!row) {
      throw createAlgorithmExportServiceError(404, "The selected roster period was not found.");
    }

    const rosterPeriodKey = row.rosterPeriodKey?.trim();
    const periodCode = row.periodCode?.trim();
    const rpStartLocal = row.rpStartLocal?.trim();
    const rpEndLocal = row.rpEndLocal?.trim();

    if (!rosterPeriodKey || !periodCode || !rpStartLocal || !rpEndLocal || rpStartLocal > rpEndLocal) {
      throw createAlgorithmExportServiceError(409, "The selected roster period configuration is incomplete or invalid.");
    }

    if (requestedPeriodCode.trim() !== periodCode) {
      throw createAlgorithmExportServiceError(409, "The requested period label does not match the selected roster period.");
    }

    return { rosterPeriodId, rosterPeriodKey, periodCode, rpStartLocal, rpEndLocal };
  };

  const exportPackage = async (
    period: AlgorithmExportPeriodContext,
    options: {
      scope?: AlgorithmExportScope;
      pairingFilter?: PairingScopeFilter;
      filenamePrefix: string;
    },
  ) => {
    const normalizedPeriodCode = period.periodCode;
    const effectiveBidSources = await loadEffectiveBidSources(
      pgPool,
      liveSchema,
      normalizedPbsSchema,
      period.rosterPeriodId,
      options.scope?.crewIds,
    );
    const crewIds = effectiveBidSources.map((source) => source.crewId);
    const effectiveScope: AlgorithmExportScope = {
      ...options.scope,
      crewIds,
      bidIds: effectiveBidSources.flatMap((source) => source.bidIds),
    };
    const [baseRows, rankRows] = crewIds.length > 0
      ? await Promise.all([
        pgPool.query<CrewBaseEligibilityRow>(
          `
            select
              cb.id::text as id,
              cb.crew_id::varchar as "crewId",
              cb.base::varchar as base,
              cb.eff_dt as "effectiveAt",
              cb.exp_dt as "expiresAt"
            from ${liveSchema}.crew_base cb
            where cb.crew_id = any($1::varchar[])
              and cb.is_prime_base = 1
            order by cb.crew_id, cb.eff_dt, cb.id
          `,
          [crewIds],
        ),
        pgPool.query<CrewRankEligibilityRow>(
          `
            select
              cr.crew_id::varchar as "crewId",
              cr.rank::varchar as rank,
              cr.eff_dt as "effectiveAt",
              cr.exp_dt as "expiresAt"
            from ${liveSchema}.crew_rank cr
            where cr.crew_id = any($1::varchar[])
            order by cr.crew_id, cr.eff_dt, cr.id
          `,
          [crewIds],
        ),
      ])
      : [{ rows: [] as CrewBaseEligibilityRow[] }, { rows: [] as CrewRankEligibilityRow[] }];
    const crewEligibility = new Map<string, {
      bases: Array<CrewPairingEligibilityFacet["bases"][number]>;
      ranks: Array<CrewPairingEligibilityFacet["ranks"][number]>;
    }>();

    for (const crewId of crewIds) {
      crewEligibility.set(crewId, { bases: [], ranks: [] });
    }
    for (const row of baseRows.rows) {
      crewEligibility.get(row.crewId)?.bases.push({
        id: row.id,
        base: row.base,
        effectiveAt: row.effectiveAt,
        expiresAt: row.expiresAt,
      });
    }
    for (const row of rankRows.rows) {
      crewEligibility.get(row.crewId)?.ranks.push({
        rank: row.rank,
        effectiveAt: row.effectiveAt,
        expiresAt: row.expiresAt,
      });
    }
    const [daysOffCsv, pairingScoreCsv, reserveScoreCsv, lineRulesCsv] = await Promise.all([
      loadDaysOffCsv(db, normalizedPeriodCode, liveSchema, normalizedPbsSchema, effectiveScope, period),
      loadPairingScoreCsv({
        db,
        pgPool,
        periodCode: normalizedPeriodCode,
        period,
        liveSchema,
        pbsSchema: normalizedPbsSchema,
        scope: effectiveScope,
        pairingFilter: options.pairingFilter,
        crewEligibility,
        onSkippedProperty: onSkippedPairingScoreProperty,
      }),
      loadReserveScoreCsv({
        db,
        pgPool,
        periodCode: normalizedPeriodCode,
        period,
        liveSchema,
        pbsSchema: normalizedPbsSchema,
        scope: effectiveScope,
        onSkippedProperty: onSkippedReserveScoreProperty,
      }),
      loadLineRulesCsv({
        db,
        periodCode: normalizedPeriodCode,
        period,
        liveSchema,
        pbsSchema: normalizedPbsSchema,
        scope: effectiveScope,
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

  const loadFilteredScope = async (
    filters: AlgorithmExportCrewFilters | undefined,
  ): Promise<AlgorithmExportScope | undefined> => {
    const normalizedFilters = normalizeCrewFilters(filters);

    if (!hasActiveCrewFilter(normalizedFilters)) {
      return undefined;
    }

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (normalizedFilters.division && normalizedFilters.division !== "ALL") {
      params.push(normalizedFilters.division);
      conditions.push(`upper(coalesce(u.division, c.division, '')) = $${params.length}::varchar`);
    }

    if (normalizedFilters.status === "ACTIVE") {
      conditions.push("u.status = 0");
      conditions.push("u.eff_dt <= now()");
      conditions.push("(u.exp_dt is null or u.exp_dt > now())");
    }

    if (normalizedFilters.bases && normalizedFilters.bases.length > 0) {
      params.push(normalizedFilters.bases);
      conditions.push(`upper(coalesce(u.base, '')) = any($${params.length}::varchar[])`);
    }

    if (normalizedFilters.fleetQuals && normalizedFilters.fleetQuals.length > 0) {
      params.push(normalizedFilters.fleetQuals);
      conditions.push(`
        exists (
          select 1
          from ${schema}.crew_fleet cf
          where cf.crew_id = b.crew_id
            and upper(cf.fleet_specific) = any($${params.length}::varchar[])
            and cf.eff_dt <= now()
            and (cf.exp_dt is null or cf.exp_dt > now())
        )
      `);
    }

    const result = await pgPool.query<FilteredCrewRow>(
      `
        select distinct u.crew_id::varchar as "crewId"
        from ${normalizedPbsSchema}.pbs_user u
        inner join ${schema}.crew c
          on c.crew_id = u.crew_id
        where ${conditions.join("\n          and ")}
        order by "crewId"
      `,
      params,
    );

    return {
      crewIds: result.rows.map((row) => row.crewId),
      filters: normalizedFilters,
    };
  };

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
    const result = await pgPool.query<LiveCrewSeniorityRow>(
      `
        select
          c.crew_id::varchar as "crewId",
          c.seniority_num::integer as "seniorityNum"
        from ${schema}.crew c
        inner join ${normalizedPbsSchema}.pbs_user u
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

  const loadScenarioPairingFilter = async (
    schema: string,
    crewIds: readonly string[],
    scenarioStart?: string,
    scenarioEnd?: string,
  ): Promise<{ pairingFilter: PairingScopeFilter }> => {
    const hasWindow = Boolean(scenarioStart && scenarioEnd);
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

    for (const row of result.rows) {
      (row.bases ?? []).forEach((base) => allBases.add(base));
      if (row.division) {
        allDivisions.add(row.division);
      }
      (row.ranks ?? []).forEach((rank) => allRanks.add(rank));
    }

    return {
      pairingFilter: {
        dateStart: scenarioStart,
        dateEnd: scenarioEnd,
        bases: allBases.size > 0 ? [...allBases] : undefined,
        divisions: allDivisions.size > 0 ? [...allDivisions] : undefined,
        ranks: allRanks.size > 0 ? [...allRanks] : undefined,
      },
    };
  };

  const loadScenarioScope = async (
    crewIds: readonly string[],
    scenarioStart?: string,
    scenarioEnd?: string,
  ): Promise<{
    scope: AlgorithmExportScope;
    pairingFilter?: PairingScopeFilter;
  }> => {
    if (crewIds.length === 0) {
      return { scope: { crewIds: [], crewSortRank: new Map() } };
    }
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
    };
  };

  return {
    async exportCurrentPackage(rosterPeriodId, periodCode, filters) {
      const period = await loadPeriodContext(rosterPeriodId, periodCode);
      const scope = await loadFilteredScope(filters);

      return exportPackage(period, {
        scope,
        pairingFilter: { dateStart: period.rpStartLocal, dateEnd: period.rpEndLocal, datePadDays: 0 },
        filenamePrefix: "pbs-algorithm-export",
      });
    },
    async exportYeg14TestPackage(rosterPeriodId, periodCode) {
      const period = await loadPeriodContext(rosterPeriodId, periodCode);
      const scope = await loadYeg14Scope();

      return exportPackage(period, {
        scope,
        pairingFilter: { dateStart: period.rpStartLocal, dateEnd: period.rpEndLocal, datePadDays: 0 },
        filenamePrefix: "pbs-algorithm-export-yeg-14",
      });
    },
    async exportScenarioPackage(rosterPeriodId, periodCode, crewIds, scenarioStart, scenarioEnd, filters) {
      const period = await loadPeriodContext(rosterPeriodId, periodCode);
      const windowStart = scenarioStart ?? period.rpStartLocal;
      const windowEnd = scenarioEnd ?? period.rpEndLocal;
      const filteredScope = await loadFilteredScope(filters);
      const finalCrewIds = filteredScope
        ? intersectCrewIds(crewIds, filteredScope.crewIds ?? [])
        : crewIds;

      if (filteredScope && finalCrewIds.length === 0) {
        throw createAlgorithmExportServiceError(400, "No crews match the scenario package export filters.");
      }

      const { scope, pairingFilter } = await loadScenarioScope(
        finalCrewIds,
        windowStart,
        windowEnd,
      );

      return exportPackage(period, {
        scope,
        pairingFilter,
        filenamePrefix: "pbs-algorithm-export-scenario",
      });
    },
  };
};
