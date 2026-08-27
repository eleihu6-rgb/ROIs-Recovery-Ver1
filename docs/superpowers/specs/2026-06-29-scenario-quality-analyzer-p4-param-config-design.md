# Scenario Roster Quality Analyzer — P4 Max Working Days + Parameter Configuration

**Date:** 2026-06-29  
**Status:** Approved for implementation  
**Scope:** `gantt/` frontend only — no backend changes  
**Builds on:** `docs/superpowers/specs/` (Quality Analyzer shipped 2026-06-21)

---

## 1. Goals

1. Add **Qlty-1004 Max Working Days in Period** — a new quality check that flags flight-crew members who exceed the maximum allowed working days within the scenario period.
2. Add a **Parameter Configuration sub-tab** inside the Quality Analyzer dialog so users can adjust all check thresholds without touching code.
3. Refactor data flow so **params live in dialog state** (session-memory) and drive a single `useMemo` recompute — no source-side pre-computation.

---

## 2. Working Day Definition (P4)

A calendar day is a **working day** if the crew has at least one duty on that day whose `assignment` code is NOT in the non-working set.

| Assignment | Working? |
|------------|---------|
| FLY        | ✓ Yes   |
| DHD        | ✓ Yes   |
| GRD        | ✓ Yes   |
| RES        | ✓ Yes   |
| SFT        | ✓ Yes   |
| SIM        | ✓ Yes   |
| DO         | ✗ No    |
| ILL        | ✗ No    |
| VAC        | ✗ No    |

Non-working set is a **parameter** (default `['ILL', 'VAC', 'DO']`). Only the `assignment` field is checked — `assignmentGroup` is ignored for this predicate.

**Overlap rule:** if multiple duties span the same calendar day, it counts as **one** working day (Set-based dedup).

**Period boundary:** duties are clipped to `[data.scenarioStrDt, data.scenarioEndDt]` (inclusive). Multi-day pairings that start before or end after the scenario period contribute only in-period days.

**Division scope:** P4 only flags crews whose `crew.division` is in `params.maxWorkingDaysApplicableDivisions` (default `['P']` = flight crew). Cabin crew (`division = 'C'`) are exempt — finding rendered as OK with count 0.

---

## 3. Data Model

### 3.1 QualityParams (new, exported from `quality-analysis.ts`)

```typescript
export interface QualityParams {
  minConsecutiveResDays: number           // P1 — Qlty-1001
  maxConsecutiveWorkingDays: number       // P2 — Qlty-1002
  // P3 (day-off-only) has no configurable params
  maxWorkingDaysInPeriod: number          // P4 — Qlty-1004
  nonWorkingAssignments: string[]         // P4 — assignment codes that are NOT working days
  maxWorkingDaysApplicableDivisions: string[] // P4 — divisions this rule applies to
}

export const DEFAULT_QUALITY_PARAMS: QualityParams = {
  minConsecutiveResDays: 2,
  maxConsecutiveWorkingDays: 6,
  maxWorkingDaysInPeriod: 18,
  nonWorkingAssignments: ['ILL', 'VAC', 'DO'],
  maxWorkingDaysApplicableDivisions: ['P'],
}
```

Existing exported constants become aliases derived from defaults so existing imports don't break:
```typescript
export const MAX_CONSECUTIVE_WORKING_DAYS = DEFAULT_QUALITY_PARAMS.maxConsecutiveWorkingDays
export const MIN_CONSECUTIVE_RESERVE_DAYS = DEFAULT_QUALITY_PARAMS.minConsecutiveResDays
```

### 3.2 QualityRuleKey (extended)

```typescript
export type QualityRuleKey =
  | 'standalone-res'
  | 'consecutive-working'
  | 'day-off-only'
  | 'max-working-days'   // NEW

export const QUALITY_RULE_IDS: Record<QualityRuleKey, string> = {
  'standalone-res':     'Qlty-1001',
  'consecutive-working':'Qlty-1002',
  'day-off-only':       'Qlty-1003',
  'max-working-days':   'Qlty-1004',   // NEW
}
```

---

## 4. Architecture — Data Flow Change

### Current
```
makeScenarioRosterPaneSource
  → useMemo: computeRosterQuality(data)
  → useQualityAnalysis() returns { rows: CrewQualityRow[] }
SharedRosterPane
  → <QualityAnalysisDialog rows={rows} />
```

### New (Option A)
```
makeScenarioRosterPaneSource
  → useQualityAnalysis() returns { data: ScenarioGanttData }   ← thin pass-through
SharedRosterPane
  → <QualityAnalysisDialog data={data} onQualityIssueCount={setIssueCount} />

QualityAnalysisDialog
  → useState<QualityParams>(DEFAULT_QUALITY_PARAMS)    → params
  → useMemo(() => computeRosterQuality(data, params), [data, params])  → rows
```

Params update (on Save) triggers the memo automatically — no explicit re-trigger.

The `issueCount` badge on `PaneConditionStrip` is maintained via an `onQualityIssueCount: (n: number) => void` callback fired in a `useEffect([rows])` inside the dialog. `SharedRosterPane` holds the count in local state and passes it to the strip.

---

## 5. New Helper: `findMaxWorkingDaysInPeriod`

```typescript
export function findMaxWorkingDaysInPeriod(
  crew: ScenarioGanttCrew,
  pairings: ScenarioGanttPairing[],       // pairings assigned to this crew
  groundItems: ScenarioGanttGroundItem[], // ground items for this crew
  periodStart: string,   // 'YYYY-MM-DD' from data.scenarioStrDt
  periodEnd:   string,   // 'YYYY-MM-DD' from data.scenarioEndDt
  params: QualityParams,
): QualityFinding
```

**Logic:**
1. If `!params.maxWorkingDaysApplicableDivisions.includes(crew.division)` → return OK finding (count 0, detail []).
2. Build `workingDays = new Set<string>()`:
   - For each pairing: `daysBetween(schStrDtUtc, schEndDtUtc)` clipped to `[periodStart, periodEnd]` → add all to set. (Pairings are always FLY/DHD — always working.)
   - For each ground item: if `!params.nonWorkingAssignments.includes(g.assignment)` → `daysBetween(g.schStrDtUtc, g.schEndDtUtc || g.schStrDtUtc)` clipped to period → add to set.
3. `count = workingDays.size`
4. `ok = count <= params.maxWorkingDaysInPeriod`
5. `detail = ok ? [] : [\`${count} working days (max ${params.maxWorkingDaysInPeriod}, period ${periodStart}–${periodEnd})\`]`
6. Return `{ key: 'max-working-days', id: 'Qlty-1004', label: 'Max Working Days', count: ok ? 0 : 1, detail, ok }`

Clipping helper (internal):
```typescript
const clipDays = (days: string[], from: string, to: string): string[] =>
  days.filter(d => d >= from && d <= to)
```

`computeRosterQuality(data: ScenarioGanttData, params: QualityParams)` signature change — `params` defaults to `DEFAULT_QUALITY_PARAMS`. P4 finding appended after P3 in each crew's `findings[]`.

---

## 6. UI — Two Sub-Tabs

### Tab layout
`AppDialog` body wrapped in shadcn `<Tabs>` with two `<TabsTrigger>` items:
- `quality-analyzer-tab` → **"Quality Analyzer"** (existing master-detail, no layout change)
- `quality-config-tab` → **"Parameter Configuration"**

Tab triggers sit in the dialog header area below the title bar (above the content body).

### Parameter Configuration tab

Simple table — one row per configurable parameter:

| Column | Content |
|--------|---------|
| Rule ID | `font-mono text-3xs` chip (e.g. `Qlty-1001`) |
| Parameter | Human label |
| Value | `<input type="number">` or `<input type="text">` |
| Description | `text-2xs text-muted-foreground` |

Rows:

| Rule | Parameter | Default | Input type |
|------|-----------|---------|------------|
| Qlty-1001 | Min consecutive RES days | 2 | number |
| Qlty-1002 | Max consecutive working days | 6 | number |
| Qlty-1003 | *(no parameters)* | — | — (read-only) |
| Qlty-1004 | Max working days in period | 18 | number |
| Qlty-1004 | Non-working assignment codes | ILL, VAC, DO | text (comma-separated) |
| Qlty-1004 | Applicable divisions | P | text (comma-separated) |

Footer buttons on Config tab: `[Cancel]` `[Save & Re-analyze]`  
- **Save & Re-analyze**: parse draft → `setParams(draft)` → `setActiveTab('analyzer')`  
- **Cancel**: `setDraft(params)` (reset to committed params), stay on Config tab

### Dialog state

```typescript
// Committed params — drive the useMemo
const [params, setParams] = useState<QualityParams>(DEFAULT_QUALITY_PARAMS)
// Edit buffer — only written to params on Save
const [draft, setDraft] = useState<QualityParams>(DEFAULT_QUALITY_PARAMS)
// Active tab
const [activeTab, setActiveTab] = useState<'analyzer' | 'config'>('analyzer')
```

On dialog `open` transition: reset `draft = params`, reset `activeTab = 'analyzer'` (same lifecycle as existing `crewFilter` reset).

### RULE_ORDER and RULE_DESCRIPTIONS

Extend `RULE_ORDER` to include `'max-working-days'`:

```typescript
const RULE_ORDER: QualityRuleKey[] = [
  'standalone-res', 'consecutive-working', 'day-off-only', 'max-working-days'
]
```

`RULE_DESCRIPTIONS` is currently a static `Record` that interpolates constants at module load — it will NOT reflect changed params. Refactor to a function called with the committed `params`:

```typescript
const getRuleDescription = (key: QualityRuleKey, params: QualityParams): string => ({
  'standalone-res': `... at least ${params.minConsecutiveResDays} consecutive RES/standby days ...`,
  'consecutive-working': `... more than ${params.maxConsecutiveWorkingDays} consecutive working days ...`,
  'day-off-only': `...`,
  'max-working-days': `More than ${params.maxWorkingDaysInPeriod} working days within the scenario period. Applies to divisions: ${params.maxWorkingDaysApplicableDivisions.join(', ')}. Non-working codes: ${params.nonWorkingAssignments.join(', ')}.`,
}[key])
```

Used as `getRuleDescription(selectedStat.key, params)` in the detail header. Pass *committed* `params` (not `draft`) so the description always matches what was actually computed.

---

## 7. Files Changed

| File | Change summary |
|------|---------------|
| `gantt/src/components/scenario-gantt/quality-analysis.ts` | Add `QualityParams`, `DEFAULT_QUALITY_PARAMS`; extend `QualityRuleKey` + `QUALITY_RULE_IDS`; add `findMaxWorkingDaysInPeriod`; update `computeRosterQuality(data, params?)` |
| `gantt/src/components/gantt/source/gantt-pane-source.ts` | Optional hook type: `useQualityAnalysis?: () => { data: ScenarioGanttData }` |
| `gantt/src/components/scenario-gantt/scenario-gantt-source.ts` | `useQualityAnalysis` returns `{ data }` (remove pre-computation) |
| `gantt/src/components/panes/shared/roster-pane.tsx` | Destructure `data` from source hook; add `issueCount` local state + `onQualityIssueCount` callback; pass `data` to dialog |
| `gantt/src/components/panes/quality-analysis-dialog.tsx` | Props: `data` + `onQualityIssueCount`; add `params`/`draft`/`activeTab` state; Tabs wrapper; Config tab table |
| `gantt/src/version.ts` | `FRONTEND_VERSION` +1 |

---

## 8. Test IDs

**Dialog tabs:**
- `quality-analyzer-tab`, `quality-config-tab`

**Config table:**
- `quality-param-table`
- `quality-param-row-min-res`, `quality-param-row-max-work`, `quality-param-row-day-off`, `quality-param-row-max-period`, `quality-param-row-nonworking-codes`, `quality-param-row-divisions`
- `quality-param-save`, `quality-param-cancel`

**Existing testids unchanged** (`quality-analysis-dialog`, `quality-rule-nav`, `quality-analysis-row`, etc.)

---

## 9. Unit Tests (extends `quality-analysis.test.ts`)

New cases for `findMaxWorkingDaysInPeriod` / P4 finding in `computeRosterQuality`:

| # | Scenario | Expected |
|---|----------|---------|
| P4-1 | Division P crew, 19 FLY working days in period | Flagged — count 1, detail contains "19 working days" |
| P4-2 | Division P crew, exactly 18 working days | OK |
| P4-3 | Division C crew | OK (exempt) |
| P4-4 | Multi-day pairing spanning 3 calendar days | Counts as 3 working days |
| P4-5 | Two duties on same day (pairing + RES ground) | Counts as 1 day |
| P4-6 | ILL ground item day, no other duty that day | Day NOT counted |
| P4-7 | Custom `nonWorkingAssignments: ['DO']` (ILL removed) | ILL day counted as working |
| P4-8 | Pairing starts before `periodStart` | Only in-period days counted |
| P4-9 | Pairing ends after `periodEnd` | Only in-period days counted |

---

## 10. E2E Tests (extends `scenario-roster-quality-analyzer.spec.ts`)

| Test ID | Description |
|---------|-------------|
| Scen-2081 | Config tab visible; param table shows rows for Qlty-1001/1002/1003/1004 |
| Scen-2082 | Change max working days → Save → analyzer tab active; Qlty-1004 count updates |
| Scen-2083 | Cancel discards draft; committed params unchanged |

---

## 11. Non-Goals

- No backend changes
- No persistent storage (params reset on dialog close / page reload)
- No export of quality results
- No per-scenario param presets
