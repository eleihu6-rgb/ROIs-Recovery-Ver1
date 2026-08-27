// Dev tab — Code Enhancement Playbook data (static, git-tracked).
//
// This file is the single source of truth for the Dev tab. Devs append an
// EnhancementEntry (and commit it) every time they complete a Phase-6 record of the
// playbook. The git history of THIS file is the audit trail proving the team actually
// enhances code from time to time.
//
// Full playbook: docs/architecture/code-enhancement-playbook.md

/** Soft access gate for the Dev tab. NOT a login credential and unrelated to the auth
 *  token — it only keeps the tab out of casual view. Frontend-only, not a security
 *  boundary. */
export const DEV_ACCESS_CODE = '5566'

/** sessionStorage key holding the per-session unlock flag. */
export const DEV_UNLOCK_KEY = 'rois.dev.unlocked'

export interface PlaybookStep {
  n: number
  title: string
  detail: string
}

/** The six-phase enhancement loop, run periodically per dev/area. */
export const PLAYBOOK_STEPS: PlaybookStep[] = [
  { n: 1, title: 'Scope', detail: 'Pick ONE module + ONE focus area. Do not boil the ocean.' },
  { n: 2, title: 'Map', detail: 'Explore for hotspots — large files, render loops, await-in-loop, SELECT *, missing memoization. Use search/subagents to surface candidates.' },
  { n: 3, title: 'Verify against live code', detail: 'Read the actual code for EVERY candidate. Reject findings that do not hold up — a finding is not real until the code proves it. (In the source exercise 4 of the flagged findings were false.)' },
  { n: 4, title: 'Fix safely', detail: 'Smallest behavior-preserving change. Prefer collapsing work (N getComputedStyle → 1; N queries → 1 batch) over rewrites. No premature optimization the code already mitigates.' },
  { n: 5, title: 'Prove with tests', detail: '§No-Illusion: write/update a test that FAILS on the old code, run it, paste the PASS receipt. §Stale-Test: update stale tests, never weaken them. Confirm pre-existing failures are unrelated.' },
  { n: 6, title: 'Record & bump', detail: 'Append an entry below, commit it, and bump the relevant version counter (FRONTEND/BACKEND/RULE).' },
]

export type FocusKey = 'gantt-perf' | 'system-efficiency' | 'code-quality'

export interface FocusArea {
  key: FocusKey
  label: string
  priority: number
  detail: string
}

/** The three focus areas, in priority order. */
export const FOCUS_AREAS: FocusArea[] = [
  { key: 'gantt-perf', label: 'User-side Gantt performance', priority: 1, detail: 'First-paint speed (§First-Paint), canvas render loop, re-render storms, virtualization, AND client-side memory — hidden keep-alive tabs holding canvas DOM + full store data (esp. Scenario Gantt). The top product priority.' },
  { key: 'system-efficiency', label: 'System overall efficiency', priority: 2, detail: 'N+1 queries, batch inserts, caching, query shape, async hot paths across the backend services.' },
  { key: 'code-quality', label: 'Code quality', priority: 3, detail: 'Dead code, duplication, design tokens, type safety, god-components.' },
]

export const FOCUS_LABEL: Record<FocusKey, string> = {
  'gantt-perf': 'Gantt Perf',
  'system-efficiency': 'System Efficiency',
  'code-quality': 'Code Quality',
}

/** Every module in the repo, in display order. The enhancement log lists ALL of them so
 *  untouched modules are visible (as "No job done yet") — that absence is the signal. */
export const ALL_MODULES: string[] = [
  'gantt',
  'pbs-portal',
  'pbs-app',
  'packages/ui',
  'live-server',
  'pbs-server',
  'engine-server',
  'connector-server',
  'rule-engine',
  'rois-rule-engine',
  'po-engine',
  'ro-engine',
]

export interface EnhancementEntry {
  /** ISO date 'YYYY-MM-DD' the enhancement was recorded. */
  date: string
  focus: FocusKey
  /** Module touched, e.g. 'gantt' | 'live-server'. */
  module: string
  /** What changed — one line. */
  summary: string
  /** Proof: test file / version bump / receipt. */
  proof: string
  author?: string
}

/** Append your newest enhancement at the TOP. The timeline also sorts by date desc, so a
 *  bottom-appended newer entry still floats up — but top-append keeps same-day order right. */
export const ENHANCEMENT_LOG: EnhancementEntry[] = [
  {
    date: '2026-06-16',
    focus: 'code-quality',
    module: 'gantt',
    summary: 'Data tab UX readability pass: (1) boolean smallint columns (is_adhoc, is_recency, is_qualifier, tm_credit_flag, allow_overlap, optimizer_indicator) now show "Yes"/"No" instead of "0"/"1"; (2) Assignment sub-tab gains Type filter (FLY/GRD/LVE/OTH/SBY/TRN); (3) Config Dictionary gains Category (parentCode) filter across 26 groups.',
    proof: 'DataGrid col.type===boolean branch renders Yes/No; backend assignment case applies type filter; dictionary case applies parentCode filter; F266→267 B129→130',
  },
  {
    date: '2026-06-15',
    focus: 'gantt-perf',
    module: 'gantt',
    summary: 'Scenario Gantt: hidden keep-alive tabs now SUSPEND their canvas/grid tree (−6 canvas, −154 DOM nodes/tab) + pause lock polling; restores from store data, no refetch. Frees native canvas backing-store + RAF/CPU. (Measured: JS heap ~unchanged — per-tab heap is module/cache-bound, not canvas/data; idle data-release measured at ~1.3 MB and dropped as not worth a reload.)',
    proof: 'scenario-memory-baseline.spec.ts Phase 2 (prod build, real data); tsc/build clean; F235→236',
  },
  {
    date: '2026-06-15',
    focus: 'gantt-perf',
    module: 'gantt',
    summary: 'getGanttColors: 22 getComputedStyle() calls → 1 per call (canvas render-loop hot path); resolves the computed style once and reads 22 CSS vars off it.',
    proof: 'gantt-colors-perf.test.ts 4/4 (asserts getComputedStyle called once); F229→230',
  },
  {
    date: '2026-06-15',
    focus: 'code-quality',
    module: 'gantt',
    summary: 'Deleted 12 committed dead duplicate " 2" files (~5,500 LOC); moved 2 hardcoded hex colors to named token-fallback constants; extracted magic debounce timings to named constants.',
    proof: 'tsc clean; full vitest 184/184; F229→230',
  },
  {
    date: '2026-06-15',
    focus: 'system-efficiency',
    module: 'live-server',
    summary: 'roster-service.createGroundTask: N per-crew crew_base lookups inside the transaction → 1 batched query (order by crew_id, eff_dt DESC; take first per crew).',
    proof: 'roster-service.test.ts (asserts 2 selects not 1+N); B118→119',
  },
  {
    date: '2026-06-15',
    focus: 'system-efficiency',
    module: 'live-server',
    summary: 'roster-service.assignPairing: N per-segment inserts → 1 batched multi-row insert; duty fields merged by RETURNING order.',
    proof: 'roster-service.test.ts assignPairing test (asserts 1 insert call); B118→119',
  },
  {
    date: '2026-06-16',
    focus: 'code-quality',
    module: 'gantt',
    summary: 'DataGrid date/datetime cells: String(raw) on a Date emitted raw ISO "2026-04-03T00:00:00.000Z" which is noise for end users. date columns now show YYYY-MM-DD; datetime shows "YYYY-MM-DD HH:mm UTC". UTC slice used (not toLocaleDateString) so stored calendar dates are shown exactly as entered, timezone-invariant.',
    proof: 'Holiday Calendar Data tab: strDt column shows "2026-04-03" not "2026-04-03T00:00:00.000Z"; F265→266',
  },
]

export interface ModuleStat {
  module: string
  /** Total enhancements recorded for this module. */
  count: number
  /** Most recent enhancement date, or null if none yet. */
  lastDate: string | null
}

/** Per-module brief info for the Dev sidebar (count + last timestamp), all modules. */
export const moduleStats = (): ModuleStat[] =>
  ALL_MODULES.map((module) => {
    const entries = ENHANCEMENT_LOG.filter((e) => e.module === module)
    const lastDate = entries.reduce<string | null>((m, e) => (!m || e.date > m ? e.date : m), null)
    return { module, count: entries.length, lastDate }
  })

export interface OverviewStat {
  doneModules: number
  totalModules: number
  totalEntries: number
  lastDate: string | null
}

/** Repo-wide enhancement coverage for the Dev sidebar header. */
export const overviewStats = (): OverviewStat => {
  const stats = moduleStats()
  const lastDate = stats.reduce<string | null>(
    (m, s) => (s.lastDate && (!m || s.lastDate > m) ? s.lastDate : m),
    null,
  )
  return {
    doneModules: stats.filter((s) => s.count > 0).length,
    totalModules: ALL_MODULES.length,
    totalEntries: ENHANCEMENT_LOG.length,
    lastDate,
  }
}
