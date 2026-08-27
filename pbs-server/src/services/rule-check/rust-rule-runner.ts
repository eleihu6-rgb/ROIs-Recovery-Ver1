import path from "node:path";
import { Pool } from "pg";
import { env } from "../../config/index.js";

// ── Rust rule runner — direct process invocation, reusing live-server's core ──
// Reuses `live-server/scripts/legality-recheck-core.mjs` + `live-legality.mjs`
// (SINGLE SOURCE OF TRUTH): live changes to any rule function / TSV format / runBin
// propagate to PBS on the next restart automatically. The RUST binaries
// (rule-engine-rs/target/release/check-*) are the SAME deployed artifacts live-server
// uses. `RUST_RULE_CORE` overrides the core path (e.g. when pbs-server is deployed on a
// separate host with the core shipped alongside); default resolves from this module's
// repo root to `live-server/scripts/legality-recheck-core.mjs`.
// The core loads the crew roster from DB (source), so the candidate pairing is injected
// as a temporary roster_flight row (preview pattern) before computing.

export interface RustViolation {
  rule_code: string;
  rule_instance: string | null;
  crew_id: string;
  pairing_id: number | null;
  start_dt: string;
  end_dt: string;
  severity: number;
  message: string;
}

/** computeViolations / resolveRulesetRules — exported from legality-recheck-core.mjs. */
interface CoreModule {
  computeViolations: (
    source: unknown,
    ctx: Record<string, unknown>,
    onlyCodes?: string[] | null,
  ) => Promise<unknown>;
  resolveRulesetRules: (
    db: unknown,
    rulesetId: number,
  ) => Promise<Array<{ function: number; instance: string; severity: number }>>;
}

/** liveSource — exported from live-legality.mjs (sibling of the core). */
interface LegalityModule {
  liveSource: (db: unknown, fromIso: string, toExclusiveIso: string) => unknown;
}

// Repo root = 4 levels up from this module (services/rule-check/rust-rule-runner).
const REPO_ROOT = path.resolve(__dirname, "../../../..");

const resolveCorePath = (): string => {
  if (env.RUST_RULE_CORE) return path.resolve(env.RUST_RULE_CORE);
  return path.join(REPO_ROOT, "live-server/scripts/legality-recheck-core.mjs");
};

let coreCache: Promise<CoreModule> | null = null;
let legalityCache: Promise<LegalityModule> | null = null;

const loadCore = (): Promise<CoreModule> => {
  coreCache ??= import(resolveCorePath()).then((m) => m as unknown as CoreModule);
  return coreCache;
};

const loadLegality = (): Promise<LegalityModule> => {
  legalityCache ??= import(path.join(path.dirname(resolveCorePath()), "live-legality.mjs"))
    .then((m) => m as unknown as LegalityModule);
  return legalityCache;
};

/** liveSource hardcodes `f8.`; rewrite to the actual live schema (pbs user may lack f8 access). */
const rewriteSchema = (sql: string, liveSchema: string): string => {
  if (liveSchema === "f8") return sql;
  return sql.replace(/([^.\w])f8\./g, `$1${liveSchema}.`);
};

/** A pool whose connections have search_path = live schema, so the core's bare table
 * names (roster_flight / pairing / crew / …) resolve to the LIVE schema, not the PBS one. */
const liveSchemaPool = (() => {
  let pool: Pool | null = null;
  return (liveSchema: string): Pool => {
    if (pool) return pool;
    const url = new URL(env.DATABASE_URL);
    url.searchParams.set("options", `-c search_path=${liveSchema}`);
    pool = new Pool({ connectionString: url.toString() });
    return pool;
  };
})();

export interface RustPairingCheckArgs {
  liveSchema: string;
  crewId: string;
  pairingId: number;
  rulesetId: number;
  dateFrom: string; // inclusive ISO date
  dateTo: string;   // exclusive ISO date
}

export const buildCandidatePairingInjectionStatement = (
  liveSchema: string,
  crewId: string,
  pairingId: number,
): { params: [string, number]; sql: string } => ({
  sql: `insert into ${liveSchema}.roster_flight
       (crew_id, pairing_id, duty_seq, seg_seq, assignment_group, assignment,
        sch_str_dt_utc, sch_end_dt_utc, base, label, source, comments,
        division, flight_acting_rank, roster_acting_rank, is_deleted)
     select $1::varchar, p.id, ps.duty_seq, ps.seg_seq, 'FLY', ps.seg_assignment,
            ps.sch_str_dt_utc, ps.sch_end_dt_utc, p.base, p.pairing_label, 'MA', 'BID_CHECK',
            p.division, coalesce(pc.acting_rank, 'UNK'), coalesce(pc.acting_rank, 'UNK'), 0
       from ${liveSchema}.pairing p
       join ${liveSchema}.pairing_segment ps on ps.pairing_id = p.id and ps.is_deleted = 0
       left join lateral (
         select pc.acting_rank
           from ${liveSchema}.pairing_composition pc
          where pc.pairing_id = p.id
            and pc.is_deleted = 0
          order by pc.id
          limit 1
       ) pc on true
      where p.id = $2 and p.is_deleted = 0
      returning id`,
  params: [crewId, pairingId],
});

/**
 * Run the enabled ruleset's Rust rules against a single crew + candidate pairing.
 * The candidate pairing is injected as a temporary roster_flight row (assignment_group
 * 'FLY', source 'BID_CHECK') so cumulative/spacing rules see it as assigned; the roster
 * window is scoped to the candidate pairing. Returns violations attributed to that pairing.
 */
export const checkPairingViaRust = async ({
  liveSchema,
  crewId,
  pairingId,
  rulesetId,
  dateFrom,
  dateTo,
}: RustPairingCheckArgs): Promise<RustViolation[]> => {
  const [core, legality] = await Promise.all([loadCore(), loadLegality()]);
  const pool = liveSchemaPool(liveSchema);
  const db = {
    async query(sql: string, params?: unknown[]) {
      return pool.query(rewriteSchema(sql, liveSchema), params);
    },
  };

  // Ruleset-driven: run exactly the functions the workset defines.
  const rules = await core.resolveRulesetRules(db, rulesetId);
  const ruleCodes = [...new Set(rules.map((r) => String(Number(r.function))))];
  if (ruleCodes.length === 0) return [];

  const injected = await injectCandidatePairing(db, liveSchema, crewId, pairingId);
  try {
    const source = legality.liveSource(db, dateFrom, dateTo);
    const ctx = {
      ruleGroupCode: String(rulesetId),
      rulesetId,
      dateFrom,
      dateTo,
      focusCrewIds: [crewId],
    };
    const all = (await core.computeViolations(source, ctx, ruleCodes)) as RustViolation[];
    return all.filter((v) => String(v.crew_id) === crewId && Number(v.pairing_id) === pairingId);
  } finally {
    if (injected) {
      await db.query(
        `delete from ${liveSchema}.roster_flight where crew_id = $1 and pairing_id = $2 and comments = 'BID_CHECK'`,
        [crewId, pairingId],
      );
    }
  }
};

/**
 * Copy the candidate pairing's duties into roster_flight as a temporary FLY assignment
 * (source='BID_CHECK') so the RUST core can evaluate it. Uses pairing + pairing_segment.
 * Returns true if rows were injected.
 */
async function injectCandidatePairing(
  db: { query(sql: string, params?: unknown[]): Promise<unknown> },
  liveSchema: string,
  crewId: string,
  pairingId: number,
): Promise<boolean> {
  const statement = buildCandidatePairingInjectionStatement(liveSchema, crewId, pairingId);
  const res = await db.query(statement.sql, statement.params);
  return (res as { rowCount?: number }).rowCount ? true : false;
}
