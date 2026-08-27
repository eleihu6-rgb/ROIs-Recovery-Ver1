// gantt/src/components/release/release-data.ts
//
// Release notes — user-facing UI changes, curated by hand on demand.
//
// Unlike the Help pages (which are kept in sync at commit time), release notes
// are generated ONLY when explicitly requested. Each Release records the commit
// range it was generated from; the `toCommit` of the latest release is the
// cursor — the next generation starts from the first commit after it.
//
// Layout (chosen with the user): each functional area — ordered to match the
// top-nav tabs (Live → Scenario → Rule → Data → System → Regression → Global) —
// renders a table of changes sorted by date (latest on top), followed by a
// captioned screenshot strip for the *notable* changes only. Snapshots reuse the
// Help screenshot files via the shared <HelpScreenshot> component so they stay
// identical to Help.

export type ChangeType = 'enhancement' | 'fix'

/** A functional area. `AREA_ORDER` mirrors the top-nav tab order. */
export type ReleaseArea =
  | 'Live'
  | 'Scenario'
  | 'Rule'
  | 'Data'
  | 'System'
  | 'Regression'
  | 'Global'

export interface ReleaseShot {
  /** Path under public/, e.g. '/help/screenshots/flight-navi.png'. */
  src: string
  alt: string
  caption: string
}

export interface ReleaseItem {
  /** ISO date (YYYY-MM-DD) the change landed — drives sort + the Date column. */
  date: string
  type: ChangeType
  area: ReleaseArea
  title: string
  /** 1–2 sentences in the user's words; may carry light <b> markup. */
  body: string
  /**
   * Optional Help-aligned screenshot. Items with a shot appear in their area's
   * gallery strip (notable changes only); plain rows just sit in the table.
   */
  shot?: ReleaseShot
}

export interface Release {
  /** Sequential release number. Latest = highest. */
  n: number
  /** Human label shown in the tree, on the UI date standard, e.g. 'Jun 12, 2026'. */
  date: string
  /** Repo version string captured at generation time. */
  version: string
  /** One-line summary shown in the hero header. */
  summary: string
  /**
   * Commit range this note was generated from (the cursor).
   * `toCommit` is where the NEXT generation must start. `note` records any
   * uncommitted working-tree work that was also folded in.
   */
  fromCommit: string
  toCommit: string
  rangeLabel: string
  note?: string
  items: ReleaseItem[]
}

const SHOT = (name: string, alt: string, caption: string): ReleaseShot => ({
  src: `/help/screenshots/${name}`,
  alt,
  caption,
})

// Release-specific captures live under public/release/screenshots (kept separate
// from the Help/Rel 1 set so neither overwrites the other). Captured by
// e2e/scripts/capture-release2-screenshots.ts; each depicts a real Rel 2 change.
const RSHOT = (name: string, alt: string, caption: string): ReleaseShot => ({
  src: `/release/screenshots/${name}`,
  alt,
  caption,
})

// ── Release 1 — generated 12 Jun 2026, covering 2026-05-29 .. 2026-06-12 ───────
// Cursor: next generation starts from b434a374 (this release's toCommit).
const REL_1: Release = {
  n: 1,
  date: 'Jun 12, 2026',
  version: 'B81 / F180',
  summary:
    'First release notes, covering the past 14 days: the rebuilt three-tab Filter dialog, pairing coverage states and the Pairing Info dialog, the Flight Navi table, Scenario Gantt with Live parity, the Rule Instances catalog, the new Data and System tabs, the Regression Playground, and a unified date format across the app.',
  fromCommit: '1a8f9b45',
  toCommit: 'b434a374',
  rangeLabel: 'May 29, 2026 – Jun 12, 2026',
  items: [
    // ── Live (roster, pairing & flight panes, toolbar, filters) ────────────────
    {
      date: '2026-06-12', type: 'enhancement', area: 'Live',
      title: 'Pairing Info dialog — PCK / RPT and time-zone modes',
      body:
        'Double-clicking a pairing opens a Pairing Info popup with the pairing header, a segment table and the rostered crew. <b>PCK</b> (pick-up) and <b>RPT</b> (report) sit at duty level, duty-level columns (DRP / MRT / Duty) show only on a duty’s last sector, and a <b>Local / Airport / UTC / By DEP</b> selector re-renders every time cell.',
    },
    {
      date: '2026-06-12', type: 'enhancement', area: 'Live',
      title: 'Pairing coverage filter — Open · Partial · Full · Over',
      body:
        'The Coverage filter replaces “Fully Crewed” with <b>Open</b> · <b>Partial</b> · <b>Full</b> · <b>Over</b>, brings matching pairings to the top with a matched/total badge, and over-staffed pairings now get a distinct <b>Over</b> chip.',
      shot: SHOT('live-filter-dialog-pairing.png', 'Pairing filter dialog', 'Coverage filter now offers Open · Partial · Full · Over.'),
    },
    {
      date: '2026-06-12', type: 'enhancement', area: 'Live',
      title: 'Roster pane default columns',
      body:
        'The roster pane now defaults to <b>CrewId · Rank · Base · Sen · MCred · MDO</b> so the most-used fields fit without scrolling; the rest stay available in the column picker.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Live',
      title: 'Flight Navi table',
      body:
        'A new table lists every flight in the date range with filters and one-click navigation from a flight to its <b>pairings</b>, its <b>crew</b>, or its <b>detail</b> card. Loading is cached, row-windowed and parallelised, and the range defaults to the open gantt period.',
      shot: SHOT('flight-navi.png', 'Flight Navi table', 'Flight Navi — filter, then jump to pairing · crew · detail.'),
    },
    {
      date: '2026-06-11', type: 'fix', area: 'Live',
      title: 'Locate / Find Pairing reaches off-screen pairings',
      body:
        'Locating a pairing brings it to the top row with its composition, and “Find Pairing by Flight” now scrolls the timeline to bring on-screen a pairing whose dates sit outside the current view.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Live',
      title: 'Pairing Cred column',
      body:
        'The pairing pane’s BLH column was replaced by a <b>Cred</b> column showing the pairing’s total credited duty minutes as hh:mm.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Live',
      title: 'Richer flight & segment hovers',
      body:
        'Hovering a flight or pairing segment shows a single rich status line — airport, compact date stamps that repeat only across midnight, times, and resolved flight details (carrier, number, fleet).',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Live',
      title: 'Timeline overscroll clamped',
      body:
        'The gantt timeline no longer scrolls past the right edge of the loaded date range — horizontal scroll is clamped to the content width.',
    },
    {
      date: '2026-06-09', type: 'enhancement', area: 'Live',
      title: 'Crew header MCred column + man-day stats',
      body:
        'The crew header gained an <b>MCred</b> column and man-day statistics pulled from the database (YBH / MBH / MCred and day-off counts), refreshed as the selected crew or viewport month changes.',
    },
    {
      date: '2026-06-08', type: 'enhancement', area: 'Live',
      title: 'Crew ID & Pairing Label filters bring matches to the top',
      body:
        'New <b>Crew ID</b> (comma-separated chips) and pairing <b>Label</b> search fields bring matching crew or pairings to the top of their panes while preserving the rest of the sort order.',
      shot: SHOT('live-filter-dialog-crew.png', 'Crew filter dialog', 'Crew ID and Pairing Label filters bring matches to the top.'),
    },
    {
      date: '2026-06-08', type: 'enhancement', area: 'Live',
      title: 'Pairing Type filter',
      body:
        'A server-side pairing <b>Type</b> filter with multi-value OR matching and chips lets you narrow the pairing pane to specific pairing types.',
    },
    {
      date: '2026-06-08', type: 'enhancement', area: 'Live',
      title: 'Find Crew by Pairing / Flight',
      body:
        'Right-clicking a pairing or flight offers <b>Find Crew</b>, which brings its assigned crew to the top of the roster — and those crew are hydrated so Base / SEN / Fleet are no longer blank.',
    },
    {
      date: '2026-06-07', type: 'fix', area: 'Live',
      title: 'Violation badge centred in the roster puck',
      body:
        'The violation count badge is now centred inside the roster puck so it no longer overlaps the flight text.',
    },
    {
      date: '2026-06-05', type: 'enhancement', area: 'Live',
      title: 'Display-timezone date range + “Go to Month”',
      body:
        'The date range reads in the display time zone and editing a date auto-reloads the panes. A right-click <b>Go to Month</b> quick-nav was added to the timeline; months outside the loaded range expand it before jumping.',
      shot: SHOT('live-date-range-open.png', 'Date range picker open', 'Date range in the display time zone, with “Go to Month” quick-nav.'),
    },
    {
      date: '2026-06-05', type: 'fix', area: 'Live',
      title: 'Date range showed the wrong month in non-UTC time zones',
      body:
        'The planning period is now computed on the display-timezone calendar instead of UTC, so the picker no longer shows e.g. <b>May 31</b> for a <b>June 1</b> range — the full range displays correctly.',
    },
    {
      date: '2026-05-29', type: 'enhancement', area: 'Live',
      title: 'Filter dialog rebuilt as a three-tab multi-select',
      body:
        'The Filter dialog was rewritten into three tabs — <b>Crew</b>, <b>Pairing</b>, <b>Flight</b> — each with multi-select fields, so a single dialog drives every pane’s filters.',
    },

    // ── Scenario ───────────────────────────────────────────────────────────────
    {
      date: '2026-06-12', type: 'enhancement', area: 'Scenario',
      title: 'Scenario status colours & prominent #id',
      body:
        'Scenario list rows carry a status-coloured dot (Draft · Running · Done · Failed · Published) with a stable data attribute, the detail panel shows a matching status badge, and the <b>#id</b> badge is now larger and easier to scan.',
      shot: SHOT('scenario-list.png', 'Scenario list', 'Status-coloured dots and a clearer #id badge on each row.'),
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Scenario',
      title: 'Two-column scenario detail panel',
      body:
        'The detail panel was reorganised into two columns (Basic Info + Scope Filters) that collapse to one when narrow, and Crew Bases now pick from the airline’s configured base list instead of free text.',
      shot: SHOT('scenario-detail-done.png', 'Scenario detail panel', 'Scenario detail panel — two-column layout with system Base dropdowns.'),
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Scenario',
      title: 'Type-specific tab styling',
      body:
        'Scenario Gantt tabs show a type-specific icon and colour — <b>PO</b> (blue), <b>RO</b> (emerald), <b>TO</b> (violet) — set immediately on open with no default-PO flicker.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Scenario',
      title: 'Live-style filters inside scenario panes',
      body:
        'The Roster, Pairing and Flight panes inside a scenario adopted the same filter UI used on Live — a condition strip with search + sort and active-condition chips.',
    },
    {
      date: '2026-06-10', type: 'enhancement', area: 'Scenario',
      title: 'Pane layout & draggable splitter',
      body:
        'The last pane fills the remaining height, the pane splitter is draggable without a first-drag jump, and the left-panel width is shared across panes so it stays in sync when you switch.',
    },
    {
      date: '2026-06-09', type: 'enhancement', area: 'Scenario',
      title: 'Scenario left panel — resize, sort, freeze, select',
      body:
        'The scenario left panel gained column resize, click-to-sort with ↑/↓ indicators, frozen-row pinning, and shift/ctrl multi-select — matching the Live roster panel.',
    },
    {
      date: '2026-06-09', type: 'enhancement', area: 'Scenario',
      title: 'Per-scenario time zone',
      body:
        'Each Scenario Gantt remembers its own time-zone selection and restores it when you switch back to that tab.',
    },
    {
      date: '2026-06-09', type: 'fix', area: 'Scenario',
      title: 'Scenario zoom defaults & stability',
      body:
        'Zoom keeps the view centre stable and disables its buttons at the limits, and the initial zoom uses time-zone-aware midnight boundaries for the official scenario dates so it no longer drifts.',
    },
    {
      date: '2026-06-08', type: 'enhancement', area: 'Scenario',
      title: 'Per-scenario composition slot colours',
      body:
        'The pairing pane’s composition row renders per-slot colour segments, with under-staffed slots shown in red, using each scenario’s own slot colours.',
    },
    {
      date: '2026-06-07', type: 'enhancement', area: 'Scenario',
      title: 'Duplicate a scenario',
      body:
        'A <b>Duplicate</b> action creates a Draft copy of a scenario with all its configuration and focuses the name field, so you don’t re-enter filters from scratch.',
      shot: SHOT('scenario-create-dialog.png', 'Scenario create dialog', 'Duplicating produces a ready-to-edit Draft copy.'),
    },

    // ── Rule ───────────────────────────────────────────────────────────────────
    {
      date: '2026-06-11', type: 'enhancement', area: 'Rule',
      title: 'Rule Instances catalog',
      body:
        'A new <b>Rule Instances</b> catalog manages rule templates and customer instances with New / Copy / Edit / Delete, and the catalog moved into the left sidebar alongside <b>Rule Manager</b>.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Rule',
      title: 'Division badge + inline severity',
      body:
        'The Rule Manager list shows a Division chip and an inline severity select, so you set <b>Hard / Overridable / Soft</b> without opening a dialog.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Rule',
      title: '“Refresh Live Violations” action',
      body:
        'A <b>Refresh Violations</b> action (for Gantt/All rules) re-runs the violation pass with a progress indicator.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Rule',
      title: 'Business severity vocabulary',
      body:
        'Severity is shown in enforcement terms — <b>Hard / Overridable / Soft</b> — instead of Error / Warning / Info, consistently across dropdowns, badges and tooltips.',
    },
    {
      date: '2026-06-11', type: 'enhancement', area: 'Rule',
      title: 'Default rule group auto-selected',
      body:
        'The rule-group selector now auto-selects the airline’s default group (<b>Flair Gantt Rule</b>) on load and keeps it across refreshes.',
      shot: SHOT('live-ruleset-open.png', 'Rule set selector open', 'Rule sets are chosen and managed from the sidebar; the default loads automatically.'),
    },
    {
      date: '2026-06-10', type: 'enhancement', area: 'Rule',
      title: 'Array-parameter editor',
      body:
        'The override editor gained an array-parameter editor — an inline table with typed cells and add/remove rows — for list-valued rule parameters.',
    },

    // ── Data ───────────────────────────────────────────────────────────────────
    {
      date: '2026-06-07', type: 'enhancement', area: 'Data',
      title: 'New Data tab',
      body:
        'Browse and edit <b>Crew · Base · Rank · Fleet</b> and reference master data from a collapsible tree in the left sidebar (Basic · Crew groups) with full-width editable grids.',
    },
    {
      date: '2026-06-07', type: 'enhancement', area: 'Data',
      title: 'Crew Master with sub-records',
      body:
        'Crew Master supports search by code / name / rank / base, and clicking a crew row loads its related records (bases, ranks, fleets, qualifications, licences, …) in parallel.',
    },
    {
      date: '2026-06-06', type: 'enhancement', area: 'Data',
      title: 'Draft editing with undo / redo & validation',
      body:
        'Edits are staged as a draft with client-side validation (required fields, duplicate keys, effective-date ranges) and an <b>Undo / Redo / Validate / Save / Discard</b> toolbar.',
    },

    // ── System ─────────────────────────────────────────────────────────────────
    {
      date: '2026-06-10', type: 'enhancement', area: 'System',
      title: 'System monitoring links',
      body:
        'A new <b>System</b> tab gathers monitoring tools — <b>Queue Tasks · Grafana · Prometheus · Windmill</b> — each opening in an embedded view with refresh and open-in-new-tab controls.',
    },

    // ── Regression ─────────────────────────────────────────────────────────────
    {
      date: '2026-06-06', type: 'enhancement', area: 'Regression',
      title: 'Regression Playground',
      body:
        'Describe a test in plain English; the AI generates runnable Playwright code, runs it asynchronously, and tracks stability with instability badges, quarantine and version history. A stats dashboard and creator / modifier / tester tracking were added, and <b>Run All</b> respects the active filters (showing “Run N”).',
    },

    // ── Global / app-wide ──────────────────────────────────────────────────────
    {
      date: '2026-06-07', type: 'enhancement', area: 'Global',
      title: 'Unified date display — “Jun 7, 2026”',
      body:
        'Every user-visible date across the app now follows one standard format, including the timeline header, flight details, and the scenario and dashboard panels.',
    },
    {
      date: '2026-06-04', type: 'fix', area: 'Global',
      title: 'Dashboard date format',
      body:
        'A stray Chinese date format in the Dashboard header was replaced with the standard date format.',
    },
  ],
}

// ── Release 2 — generated 15 Jun 2026, covering 2026-06-12 .. 2026-06-15 ───────
// Cursor: next generation starts from 2a20546e (this release's toCommit).
const REL_2: Release = {
  n: 2,
  date: 'Jun 15, 2026',
  version: 'B118 / F226 / R33',
  summary:
    'A performance-led release: a windowed first paint that puts the first 40 crew and pairings on screen in 1–2 seconds while the full set loads in the background, instant local-first detail dialogs, and a steadier roster that no longer shrinks or reorders mid-load. Scenarios gained roster editing, pairing/flight detail dialogs, cross-pane navigation, live violations with a status bar, and panes that follow the scenario type. Plus a multi-ruleset Legality tab, an editable Assignment master, a Regression category tree with clearer test IDs, and the monitoring tools wired into the System tab.',
  fromCommit: 'b434a374',
  toCommit: '2a20546e',
  rangeLabel: 'Jun 12, 2026 – Jun 15, 2026',
  note:
    'Galleries show the new visual surfaces (Alert Center, Legality, the Assignment master and the Regression tree); the performance and in-canvas editing changes have no still-image to capture.',
  items: [
    // ── Live (first-paint, loading, detail dialogs, alerts) ────────────────────
    {
      date: '2026-06-13', type: 'enhancement', area: 'Live',
      title: 'Windowed first paint — first 40 crew & pairings in ~1–2s',
      body:
        'Applying filters now paints the first <b>40 crew</b> and the first <b>40 pairings</b> almost immediately, then streams the rest in the background, so you can start working before the whole month finishes loading.',
    },
    {
      date: '2026-06-13', type: 'enhancement', area: 'Live',
      title: 'Apply Filters loads the full dataset for instant sorting',
      body:
        'After the first paint, crew, pairings and flights load in full and in parallel, and sorting / filtering then happens <b>client-side</b> — so re-sorting a column or narrowing a filter is instant with no extra round-trip.',
    },
    {
      date: '2026-06-13', type: 'fix', area: 'Live',
      title: 'Roster no longer shrinks or reorders while loading',
      body:
        'The first 40 crew are now ordered exactly as the pane sorts them (rank, then crew id), and the background load <b>appends</b> the rest instead of replacing them — so the top crew stay put and the roster grows smoothly instead of flickering.',
    },
    {
      date: '2026-06-13', type: 'fix', area: 'Live',
      title: 'Roster defaults to the visible month',
      body:
        'The old fixed 14-day roster window was removed; the roster now loads the <b>visible calendar month</b> by default, matching the timeline you are looking at.',
    },
    {
      date: '2026-06-13', type: 'enhancement', area: 'Live',
      title: 'Instant detail dialogs — local-first lookup',
      body:
        'Opening a pairing or flight detail card, Flight Navi, and the Find-by-flight / Find-by-pairing actions now reuse data already loaded in the app and only call the server when something is missing, so they open without waiting.',
    },
    {
      date: '2026-06-12', type: 'enhancement', area: 'Live',
      title: 'Faster on high-latency connections',
      body:
        'First-screen data is now cached and revalidated (returning unchanged screens instantly), and revisiting a month you have already opened skips the crew-stats fetch — noticeably quicker over long-distance links.',
    },
    {
      date: '2026-06-15', type: 'enhancement', area: 'Live',
      title: 'Alert Center lists live rule violations',
      body:
        'The violation bell opens an <b>Alert Center</b> that lists the loaded violations for the toolbar’s active rule group, grouped by Rule · Base · Rank, with rule-instance codes (e.g. <b>8002/006</b>) and separate counts for overridable and hard breaches.',
      shot: RSHOT('rel2-alert-center.png', 'Legality Alert Center listing live rule violations', 'Alert Center — violations grouped by severity, with rule-instance codes and hard / overridable counts.'),
    },
    {
      date: '2026-06-15', type: 'fix', area: 'Live',
      title: 'Violation bell now follows the toolbar rule group',
      body:
        'The bell and Alert Center read the toolbar’s active ruleset instead of the Rule page’s selection, so they no longer come up empty when the two differ; fetch errors are now surfaced to the console instead of being swallowed.',
    },
    {
      date: '2026-06-14', type: 'enhancement', area: 'Live',
      title: 'Flight detail composition from live master data',
      body:
        'The flight detail card builds its rank and fleet lists from the database rather than a fixed list, and <b>IFD</b> crew are now included in the composition instead of being dropped.',
    },

    // ── Scenario ───────────────────────────────────────────────────────────────
    {
      date: '2026-06-14', type: 'enhancement', area: 'Scenario',
      title: 'Edit a scenario roster — assign, reassign, remove',
      body:
        'RO scenarios are now editable: drag a pairing onto a crew to assign or reassign it, and right-click to remove one. Edits are pre-checked for violations and validated before you save, and are gated by the scenario type and edit-lock ownership.',
    },
    {
      date: '2026-06-14', type: 'enhancement', area: 'Scenario',
      title: 'Pairing & flight detail dialogs inside a scenario',
      body:
        'Double-click a pairing to open its detail dialog, or right-click any pairing or flight to view its details. The dialogs are built from the <b>scenario’s own data</b> rather than querying the live system.',
    },
    {
      date: '2026-06-14', type: 'enhancement', area: 'Scenario',
      title: 'Cross-pane navigation in scenarios',
      body:
        'A scenario right-click menu adds <b>Locate Pairing</b>, <b>Find Crew by Pairing</b>, <b>Find Crew by Flight</b> and <b>Find Pairing by Flight</b>, each floating the match to the top of its pane; entries are shown only when the target pane is open.',
    },
    {
      date: '2026-06-14', type: 'enhancement', area: 'Scenario',
      title: 'Live violations and a status bar per scenario',
      body:
        'Each scenario now runs its own rule check (reusing the rule engine) and shows a bottom <b>Status Bar</b> with hover details and the scenario’s violation counts, mirroring the Live view.',
    },
    {
      date: '2026-06-14', type: 'enhancement', area: 'Scenario',
      title: 'Panes follow the scenario type',
      body:
        'Roster, Pairing and Flight panes are shown or hidden based on the scenario’s capabilities (a PO scenario hides the Roster), the Add-pane menu is filtered to what the scenario allows, and Reset no longer brings back a forbidden pane.',
    },
    {
      date: '2026-06-12', type: 'enhancement', area: 'Scenario',
      title: 'Scenario roster shows MCred & MDO',
      body:
        'The scenario roster pane gained compact <b>MCred</b> and <b>MDO</b> columns and a wider default left panel (260px) so the key crew figures fit alongside the existing columns.',
    },
    {
      date: '2026-06-12', type: 'enhancement', area: 'Scenario',
      title: 'Standby crew shown with correct composition fill',
      body:
        'Standby (SBY) assignments — including the <b>PRAM</b> / <b>PRPM</b> subtypes — now feed credit and composition, so pairing fill is recomputed from the actual optimiser result instead of showing zero.',
    },
    {
      date: '2026-06-12', type: 'enhancement', area: 'Scenario',
      title: 'Richer KPI stats for every scenario',
      body:
        'Scenario KPI statistics are now computed for all scenarios from the optimiser output files, so the detail panel reports the full set of figures rather than a partial summary.',
    },
    {
      date: '2026-06-14', type: 'fix', area: 'Scenario',
      title: 'Selection outline restored on scenario pucks',
      body:
        'Clicking a pairing or flight in a scenario highlights it with the dashed selection border again (click to select, Ctrl-click to toggle, click again to clear).',
    },
    {
      date: '2026-06-12', type: 'fix', area: 'Scenario',
      title: 'Scenario close button moved to the condition strip',
      body:
        'The close (×) control moved from the toolbar title row to the right of the condition strip, aligning the scenario layout with the Live view.',
    },

    // ── Rule ───────────────────────────────────────────────────────────────────
    {
      date: '2026-06-15', type: 'enhancement', area: 'Rule',
      title: 'Legality tab browses multiple rulesets',
      body:
        'The Legality tab now lists the available legacy rulesets and lets you pick one to inspect its rules — so you can review more than one rule set without leaving the page.',
      shot: RSHOT('rel2-legality.png', 'Legality tab with the ruleset list and a selected ruleset’s rules', 'Legality — pick a ruleset on the left to view its rules, with category, division and severity.'),
    },

    // ── Data ───────────────────────────────────────────────────────────────────
    {
      date: '2026-06-14', type: 'enhancement', area: 'Data',
      title: 'Assignment master data is now editable',
      body:
        'The Data tab’s <b>Assignment</b> page is populated and editable, with click-to-sort columns and a Save flow, matching the editing experience already on the other Data pages.',
      shot: RSHOT('rel2-data-assignment.png', 'Editable Assignment grid in the Data tab', 'Assignment master — a per-row Edit action and click-to-sort columns.'),
    },
    {
      date: '2026-06-14', type: 'enhancement', area: 'Data',
      title: 'Assignment Group & Group Map readable codes',
      body:
        'The Assignment Group and Group Map grids now resolve their foreign keys to human-readable <b>codes</b> instead of raw numeric ids, so the mappings are legible at a glance.',
    },

    // ── Regression ─────────────────────────────────────────────────────────────
    {
      date: '2026-06-14', type: 'enhancement', area: 'Regression',
      title: 'Category tree in the Regression sidebar',
      body:
        'The Regression sidebar now shows <b>All Tests</b> followed by one entry per category with its test count; clicking a category filters the list to those tests.',
      shot: RSHOT('rel2-regression-tree.png', 'Regression tab with the category tree and naming-id rows', 'Regression — a category tree with counts, and rows keyed by their naming id (e.g. Live-1001).'),
    },
    {
      date: '2026-06-14', type: 'enhancement', area: 'Regression',
      title: 'Clearer test IDs',
      body:
        'Test rows now display the naming id parsed from the title (e.g. <b>Live-1001</b>) instead of the raw database <b>#id</b>, so each test is identified by its convention code.',
    },

    // ── System ─────────────────────────────────────────────────────────────────
    {
      date: '2026-06-13', type: 'fix', area: 'System',
      title: 'Queue Tasks page loads in the System tab',
      body:
        'The queue dashboard’s base path was corrected for the external gateway, fixing the blank / stuck-loading <b>Queue Tasks</b> page so it renders the queues and jobs again.',
    },
    {
      date: '2026-06-13', type: 'enhancement', area: 'System',
      title: 'Monitoring tools wired into the System tab',
      body:
        'The monitoring stack was brought online and <b>Grafana · Prometheus · Windmill</b> now open correctly from the System tab alongside Queue Tasks.',
    },
  ],
}

// ── Release 3 — rebuilt 24 Jun 2026, covering 2026-06-15 .. 2026-06-22 ─────────
// Cursor: next generation starts from 83cdac9b (this release's toCommit).
// Text-only release: the changes are spread across many panes and dialogs with
// no single new headline screen to capture, so there are no gallery strips.
// Rebuild adds 2 missed Scenario items: Alert Center bell (Jun 16) + Refresh
// button on stuck RUNNING scenarios (Jun 15).
// ── Release 5 — generated 07 Aug 2026, covering 2026-08-06 .. 2026-08-07 ─────
// Cursor: next generation starts from aa66e4fc (this release's toCommit).
// Text-only release: the changes live across the scenario toolbar, result tabs
// and dialogs rather than in one new screen, so there are no gallery strips.
const REL_5: Release = {
  n: 5,
  date: 'Aug 7, 2026',
  version: 'B231 / F445 / R40',
  summary:
    'A collaboration and safety release for scenarios: a Notes tab for Q&A on any scenario, Save & Run so the engine always starts from your latest edits, a cross-rank confirmation when assigning over rank, pairing fill that updates as you edit, roster changes that sync live to other planners, and a roster header that follows the viewport date. Live gains a DP column in Manday Info and a Pairing Info timezone that follows the toolbar; the Legality Rule Templates table shows who last updated a rule; and PBS Period times display in crew base local wall time.',
  fromCommit: 'a5d8b9ff',
  toCommit: 'aa66e4fc',
  rangeLabel: 'Aug 6, 2026 – Aug 7, 2026',
  note:
    'Text-only — this week’s changes live across the scenario toolbar, result tabs and dialogs rather than in one new screen, so there are no screenshot galleries; open the relevant pane to see each one.',
  items: [
    // ── Live (roster dialogs, pairing info) ───────────────────────────────────
    {
      date: '2026-08-06', type: 'enhancement', area: 'Live',
      title: 'DP column in Manday Info',
      body:
        'The <b>Manday Info</b> table now shows a <b>DP</b> (duty period) column alongside <b>Date</b>, <b>Credit</b> and <b>BH</b>, so you can see each day’s duty period as hh:mm. (Live and Scenario)',
    },
    {
      date: '2026-08-06', type: 'enhancement', area: 'Live',
      title: 'Pairing Info timezone follows the toolbar',
      body:
        'The <b>Pairing Info</b> dialog now opens in the same timezone as the toolbar — <b>Airport</b> mode when the toolbar is on a base airport, <b>UTC</b> when it is UTC. The <b>Local / Airport / UTC / By DEP</b> selector still lets you switch for that session.',
    },

    // ── Scenario ───────────────────────────────────────────────────────────────
    {
      date: '2026-08-07', type: 'enhancement', area: 'Scenario',
      title: 'Notes tab with threaded Q&A',
      body:
        'A new <b>Notes</b> tab in the scenario results panel lets planners post questions and replies. Each message shows a <b>Q</b> or <b>A</b> badge with author and date; <b>Reply</b>, <b>Edit</b> and <b>Delete</b> act on each card, <b>Clear messages</b> removes them all, and an <b>{N} open</b> badge counts unanswered questions. The tab is available even while the scenario is still a <b>Draft</b>.',
    },
    {
      date: '2026-08-06', type: 'enhancement', area: 'Scenario',
      title: 'Save & Run before optimisation',
      body:
        'Clicking <b>Kick off run</b> with unsaved edits now opens an <b>Unsaved changes</b> dialog — <b>Save & Run</b> saves the scenario and starts the engine, or <b>Cancel</b> keeps you editing, so the optimisation always runs on your latest configuration.',
    },
    {
      date: '2026-08-06', type: 'enhancement', area: 'Scenario',
      title: 'Cross-rank assignment confirmation',
      body:
        'Dragging a crew onto a pairing slot of a different rank now asks for confirmation — <b>Cross-rank assignment</b> — before assigning the crew acting in that rank, instead of doing it silently.',
    },
    {
      date: '2026-08-06', type: 'enhancement', area: 'Scenario',
      title: 'Pairing fill updates as you edit',
      body:
        'The pairing pane’s composition fill now recalculates locally as you assign or remove crew, so the fill count and coverage status update immediately — no save needed.',
    },
    {
      date: '2026-08-06', type: 'enhancement', area: 'Scenario',
      title: 'Roster edits sync to other planners live',
      body:
        'When you save an edited scenario roster, other planners with that scenario open receive the changes in real time — no reload — and their KPI, manday credits and legality status refresh as the server recomputes.',
    },
    {
      date: '2026-08-06', type: 'enhancement', area: 'Scenario',
      title: 'Roster header follows the viewport date',
      body:
        'The scenario roster header now resolves each crew’s <b>Rank</b> and <b>Base</b> from their crew history at the leftmost visible date — matching Live — so scrolling the timeline shows the values valid for that day.',
    },
    {
      date: '2026-08-06', type: 'fix', area: 'Scenario',
      title: 'Removing a result keeps your unsaved edits',
      body:
        'Clicking <b>Remove Result</b> to revert a scenario to <b>Draft</b> no longer discards pending edits to the scenario fields — they stay so you can continue after the result is removed.',
    },
    {
      date: '2026-08-06', type: 'fix', area: 'Scenario',
      title: 'Duplicated RO scenario opens clean',
      body:
        'Duplicating an RO scenario now opens the copy clean instead of immediately marking it modified and demanding a save.',
    },

    // ── Rule (legality) ────────────────────────────────────────────────────────
    {
      date: '2026-08-06', type: 'enhancement', area: 'Rule',
      title: 'Update By column in Rule Templates',
      body:
        'The <b>Rule Templates</b> table in the Legality tab now shows an <b>Update By</b> column so you can see who last edited each template rule.',
    },

    // ── System ─────────────────────────────────────────────────────────────────
    {
      date: '2026-08-06', type: 'enhancement', area: 'System',
      title: 'PBS Period times in crew base local time',
      body:
        'The <b>PBS Period</b> table now shows its date/time columns (<b>Roster Range</b>, <b>Bid Open</b>, <b>Bid Close</b>, <b>Award Publish</b>, <b>Published</b>) in the crew base’s local wall time instead of UTC.',
    },
  ],
}

// ── Release 7 — generated 14 Aug 2026, covering 2026-08-12 .. 2026-08-14 ─────
// Cursor: next generation starts from 9c7c59de (this release's toCommit).
// Text-only release: the changes span the System admin pages, login, scenario and
// Regression tabs rather than one new screen, so there are no gallery strips.
const REL_7: Release = {
  n: 7,
  date: 'Aug 14, 2026',
  version: 'B231 / F447 / R40',
  summary:
    'A permissions, login and scenario accuracy release: the System admin pages get sharper — the Roles page pairs a persistent role list with a permission editor, Users and PBS Users tables expose more editing and columns, and menu trees show icons and cascade selection. The login page adds an SSO Login button for single sign-on, scenario draft legality now uses the scenario’s own filter RP, the Reserve Priority dialog shows the engine’s real default, and the Regression tab reports clearly when its AI backend is missing.',
  fromCommit: 'df315d3e',
  toCommit: '9c7c59de',
  rangeLabel: 'Aug 12, 2026 – Aug 14, 2026',
  note:
    'Text-only — this release’s changes span the System admin pages, login, scenario and Regression tabs rather than a single new screen, so there are no screenshot galleries; open the relevant page to see each one.',
  items: [
    // ── Live (roster, assign dialog) ───────────────────────────────────────────
    {
      date: '2026-08-13', type: 'fix', area: 'Live',
      title: 'Rule warnings name only the crews you actually moved',
      body:
        'The legality confirm dialog for the <b>Min # GDOs</b> rules (<b>7505</b> and <b>7507</b>) now flags only the crews you are assigning, removing or reassigning — pairing mates who stay put are no longer listed as violations.',
    },

    // ── Scenario (draft legality, reserve priority) ───────────────────────────
    {
      date: '2026-08-12', type: 'fix', area: 'Scenario',
      title: 'Scenario draft legality uses the scenario filter RP',
      body:
        'Assigning, removing or reassigning in a scenario now checks draft legality against the scenario’s own selected RP instead of the Live roster period, so month-based rules like <b>7505</b> and <b>7507</b> are evaluated against the scenario’s month.',
    },
    {
      date: '2026-08-13', type: 'enhancement', area: 'Scenario',
      title: 'Reserve Priority dialog shows the algorithm’s real default',
      body:
        'The <b>Reserve Priority</b> section in Algorithm Parameters now renders the default from the algorithm’s actual value — <b>Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3</b> — instead of a hard-coded line, so the shown default always matches what the engine will apply.',
    },

    // ── System (permission admin pages) ───────────────────────────────────────
    {
      date: '2026-08-12', type: 'enhancement', area: 'System',
      title: 'Users page edits department, roles and portal access',
      body:
        'The <b>Users</b> admin page now lets you edit each user’s department, roles and portal access from the row, and keeps the table header sticky while you scroll.',
    },
    {
      date: '2026-08-12', type: 'enhancement', area: 'System',
      title: 'PBS Users table adds Base and Rank columns',
      body:
        'The <b>PBS Users</b> admin table now includes <b>Base</b> and <b>Rank</b> columns so you can see each crew member’s base and rank at a glance.',
    },
    {
      date: '2026-08-13', type: 'enhancement', area: 'System',
      title: 'Roles page pairs a persistent role list with a permission editor',
      body:
        'The <b>Roles</b> admin page now keeps the role list on the left and opens the selected role’s permissions on the right, with <b>Menus & Buttons</b> and <b>Data Scope</b> tabs for configuring what each role can see and access.',
    },
    {
      date: '2026-08-13', type: 'enhancement', area: 'System',
      title: 'Menu trees show icons and cascade child selection',
      body:
        'The <b>Menus</b> tree and the role configuration tree now show icons, hide the root node, and cascade child selection level by level, with the editor’s footer buttons pinned to the bottom.',
    },

    // ── Regression (AI backend availability) ───────────────────────────────────
    {
      date: '2026-08-12', type: 'fix', area: 'Regression',
      title: 'Regression tab reports when the AI backend is unavailable',
      body:
        'When the regression AI backend is not deployed, the <b>Regression</b> tab now shows <b>Regression backend not available in this environment.</b> instead of a generic load failure.',
    },

    // ── Global (login) ─────────────────────────────────────────────────────────
    {
      date: '2026-08-12', type: 'enhancement', area: 'Global',
      title: 'SSO Login button signs you in through single sign-on',
      body:
        'The login page now has an <b>SSO Login</b> button that redirects you to the company single sign-on, and a successful sign-in lands you straight on the app. If your account is not linked, you’ll see <b>This account is not linked. Contact your administrator.</b>',
    },
  ],
}

// ── Release 6 — generated 12 Aug 2026, covering 2026-08-07 .. 2026-08-11 ─────
// Cursor: next generation starts from df315d3e (this release's toCommit).
// Text-only release: the changes span the roster, scenario results, legality and
// System tabs rather than one new screen, so there are no gallery strips.
const REL_6: Release = {
  n: 6,
  date: 'Aug 12, 2026',
  version: 'B231 / F446 / R40',
  summary:
    'A loading and permissions release: the roster and pairing panes load their first batch in a single round trip with a real progress bar, Crew Info opens in one request with qualifications and certificates inline, and the Live RP picker loads older periods, caps the span at six and no longer queries on its own. A role-based permission system now drives the top navigation, toolbar buttons and data-scope dropdowns, with new System admin pages for Users, Roles, Menus, PBS Users and Departments. Scenario results come closer to the legacy report — the Uncovered and Distribution tabs now match the Report output — and running or published scenarios open Algorithm Parameters read-only. The Legality tab gains resizable Rule Sets columns and multi-type rule sets, Schedule Details groups each pairing into one row, and crew lanes show a red dashed line where rank or base coverage ends.',
  fromCommit: 'aa66e4fc',
  toCommit: 'df315d3e',
  rangeLabel: 'Aug 7, 2026 – Aug 11, 2026',
  note:
    'Text-only — this release’s changes span the roster, scenario results, legality and System tabs rather than a single new screen, so there are no screenshot galleries; open the relevant pane to see each one.',
  items: [
    // ── Live (loading, roster, pairing & publish dialogs) ──────────────────────
    {
      date: '2026-08-11', type: 'enhancement', area: 'Live',
      title: 'Pairing filter Origin Arpt renamed to Arpt',
      body:
        'The Pairing filter option labelled <b>Origin Arpt</b> is now simply <b>Arpt</b>, matching the field name.',
    },
    {
      date: '2026-08-10', type: 'enhancement', area: 'Live',
      title: 'Crew Info opens in one request with certifications inline',
      body:
        'Opening a crew now reads ranks, bases and fleets from the shared store in a single request (down from seven), and the crew list shows each member’s <b>qualifications</b>, <b>certificates</b> and <b>team</b> inline.',
    },
    {
      date: '2026-08-10', type: 'enhancement', area: 'Live',
      title: 'Roster and pairing panes load with a live progress bar',
      body:
        'The roster and pairing panes now load their first batch in a single round trip with a <b>progress bar</b> that appears immediately and advances as each pane finishes; oversized loads split in half automatically, and applying a date range keeps the zoom stable.',
    },
    {
      date: '2026-08-10', type: 'enhancement', area: 'Live',
      title: 'RP picker loads older periods, caps the span, and no longer auto-queries',
      body:
        'The Live toolbar <b>RP</b> picker now loads older roster periods incrementally as you scroll, fills its trigger with a compact <b>merged date range</b> when several periods are selected, and caps the selection at <b>6 contiguous periods</b>. Choosing an RP no longer pulls data by itself — the toolbar shows <b>No data loaded</b> or <b>RP Date changed</b> until you apply the filters.',
    },
    {
      date: '2026-08-10', type: 'enhancement', area: 'Live',
      title: 'Schedule Details groups each pairing into one row with a Type column',
      body:
        'The <b>Schedule Details</b> dialog now shows one row per pairing instead of one per flight segment, and a <b>Type</b> column displays each task’s assignment group.',
    },
    {
      date: '2026-08-10', type: 'fix', area: 'Live',
      title: 'TAFB shows as calendar days and BLH no longer falls back to TAFB',
      body:
        '<b>TAFB</b> now displays as whole calendar days, and <b>BLH</b> no longer silently falls back to TAFB when block hours are missing.',
    },
    {
      date: '2026-08-10', type: 'fix', area: 'Live',
      title: 'Schedule dialog deduplicates tasks and opens in crew-base time',
      body:
        'The schedule dialog no longer lists the same task twice, and it now opens in the crew base timezone by default.',
    },
    {
      date: '2026-08-10', type: 'fix', area: 'Live',
      title: 'Timeline scrollbar drags continuously and stays on top',
      body:
        'Dragging the gantt scrollbar now tracks the pointer continuously instead of stalling, and the thumb stays visible above the schedule.',
    },
    {
      date: '2026-08-08', type: 'enhancement', area: 'Live',
      title: 'Publish Roster shows Source and NOC columns',
      body:
        'The <b>Publish Roster</b> table now includes <b>Source</b> and <b>NOC</b> columns so you can see where each task came from and its aircraft code.',
    },
    {
      date: '2026-08-08', type: 'fix', area: 'Live',
      title: 'Roster order stays stable when you scroll sideways',
      body:
        'Scrolling a crew lane horizontally no longer re-sorts the roster at the rank-expiry boundary — the sort stays put.',
    },
    {
      date: '2026-08-08', type: 'fix', area: 'Live',
      title: 'Daily Gantt Statistics closes on overlay click or Esc',
      body:
        'You can now dismiss <b>Daily Gantt Statistics</b> by clicking outside the dialog or pressing <b>Esc</b>.',
    },
    {
      date: '2026-08-07', type: 'enhancement', area: 'Live',
      title: 'Crew lanes show a red dashed line where rank or base coverage ends',
      body:
        'Each crew lane draws a <b>red dashed line</b> at the point the crew’s current rank or base stops covering the window, so you can see at a glance when a qualification lapses. (Live and Scenario)',
    },

    // ── Scenario (results, params, notes) ──────────────────────────────────────
    {
      date: '2026-08-11', type: 'enhancement', area: 'Scenario',
      title: 'Algorithm Parameters open read-only for running or published scenarios',
      body:
        'For scenarios that are <b>RUNNING</b> or already <b>published</b>, the <b>Algorithm Parameters</b> dialog opens read-only with a Close-only footer, so the engine’s inputs can’t be changed mid-flight.',
    },
    {
      date: '2026-08-11', type: 'fix', area: 'Scenario',
      title: 'Run start failures appear immediately',
      body:
        'If starting a scenario run fails — for example a missing or invalid parameter — the error now shows right away instead of leaving the button spinning.',
    },
    {
      date: '2026-08-10', type: 'fix', area: 'Scenario',
      title: 'Scenario gantt reloads after you save',
      body:
        'Saving edits to a scenario now reloads the gantt so the schedule on screen matches what was saved.',
    },
    {
      date: '2026-08-10', type: 'fix', area: 'Scenario',
      title: 'Acc Ref timezone refreshes after assign and recheck',
      body:
        'The <b>Acc Ref</b> value in Pairing Info now updates to the correct timezone after you assign a crew and recheck legality.',
    },
    {
      date: '2026-08-08', type: 'fix', area: 'Scenario',
      title: 'Deleting a manually assigned task removes it cleanly',
      body:
        'Deleting a manually assigned task in a scenario or Live no longer leaves a leftover row on the lane.',
    },
    {
      date: '2026-08-07', type: 'enhancement', area: 'Scenario',
      title: 'Drag-assign gives instant feedback while legality rechecks in the background',
      body:
        'Assigning a crew to a slot in a scenario now shows the placement immediately; if the background legality check rejects it, the change rolls back automatically.',
    },
    {
      date: '2026-08-07', type: 'enhancement', area: 'Scenario',
      title: 'Uncovered tab shows the full Uncovered Pairings & Reserves table',
      body:
        'The scenario results <b>Uncovered</b> tab now shows the same <b>Uncovered Pairings & Reserves</b> table as the Report Results.',
    },
    {
      date: '2026-08-07', type: 'enhancement', area: 'Scenario',
      title: 'Distribution tab matches the legacy report',
      body:
        'The <b>Distribution</b> tab now mirrors the legacy report day by day, so per-day and per-crew distribution line up with the printed Report.',
    },
    {
      date: '2026-08-07', type: 'enhancement', area: 'Scenario',
      title: 'Notes tab shows an open-count badge and full timestamps',
      body:
        'The scenario <b>Notes</b> tab now shows a red <b>{N} open</b> badge for unanswered questions, and each message displays its full date and time.',
    },
    {
      date: '2026-08-07', type: 'enhancement', area: 'Scenario',
      title: 'Rule Set and Algorithm Parameters text truncates with tooltips',
      body:
        'Long <b>Rule Set</b> and <b>Algorithm Parameters</b> values in the scenario header now truncate and show a tooltip instead of stretching the header.',
    },

    // ── Rule (legality) ────────────────────────────────────────────────────────
    {
      date: '2026-08-11', type: 'enhancement', area: 'Rule',
      title: 'Legality Rule Sets columns are horizontally resizable',
      body:
        'The <b>Rule Sets</b> table in the Legality tab now lets you drag column widths so long rule names and metadata stay readable.',
    },
    {
      date: '2026-08-11', type: 'fix', area: 'Rule',
      title: 'Legality parameter table matches the dialog description and keeps its border',
      body:
        'The legality parameter table now aligns with the dialog description and keeps its card border even when the table is wider than the panel.',
    },
    {
      date: '2026-08-11', type: 'enhancement', area: 'Rule',
      title: 'Rule Instances panel is narrower by default',
      body:
        'The Rule Instances catalog panel is narrower by default, giving the legality tables more room on wide screens.',
    },
    {
      date: '2026-08-09', type: 'enhancement', area: 'Rule',
      title: 'Rule Sets accept multiple LIVE / PBS / RO types',
      body:
        'A rule set’s <b>Rule Type</b> is now a multi-select that can carry several types at once, and the LIVE / RO selectors match any rule set whose type list contains the current view.',
    },
    {
      date: '2026-08-09', type: 'enhancement', area: 'Rule',
      title: 'Rule confirm dialog is severity-aware and tidier',
      body:
        'The legality confirm dialog now keeps severity counts only (the separate “new” count badge is gone), labels <b>Soft</b> / <b>Overridable</b> from each rule’s severity, lets you override draft warnings that allow it, and moves the <b>New</b> badge to the front of each row.',
    },

    // ── System (permissions, admin pages) ──────────────────────────────────────
    {
      date: '2026-08-11', type: 'enhancement', area: 'System',
      title: 'Navigation and buttons now follow your permissions',
      body:
        'The top navigation is driven by the menu tree you’re allowed to see, the Live roster toolbar and draft buttons are gated by your controls, and dropdown options for crew, base, rank and fleet are narrowed to your data scope.',
    },
    {
      date: '2026-08-11', type: 'enhancement', area: 'System',
      title: 'System admin pages for Users, Roles, Menus and Departments',
      body:
        'New <b>System</b> admin pages let you manage <b>Users</b>, <b>Roles</b>, <b>Menus</b>, <b>PBS Users</b> and <b>Departments</b>, and the System tools now gate entry by admin role.',
    },

    // ── Global / app-wide ──────────────────────────────────────────────────────
    {
      date: '2026-08-10', type: 'enhancement', area: 'Global',
      title: 'Regression and Dev tabs stay on internal builds',
      body:
        'The <b>Regression</b> and <b>Dev</b> tabs are now hidden on UAT builds, so the top navigation shows only the production planning tabs.',
    },
  ],
}

// ── Release 4 — generated 06 Aug 2026, covering 2026-07-20 .. 2026-08-06 ─────
// Cursor: next generation starts from a5d8b9ff (this release's toCommit).
const REL_4: Release = {
  n: 4,
  date: 'Aug 6, 2026',
  version: 'B230 / F440 / R40',
  summary:
    'A planner-focused release: right-click menus now reach Crew Info, Manday Info, Schedule Details, Daily Task Calendar and View pairing detail; the timeline is shaded by roster period with RP-based columns; and Save now waits for legality and manday recomputation. Scenarios gained drag-to-assign with an edit toolbar, a five-tab result area (KPI, Credit Hours, Uncovered, Distribution, Versions), Algorithm Parameters with seven editors, Team Rules editing, run progress and a Pre-run Check. The Legality tab adds rule 7507, inline-editable rule metadata, division-scoped rule sets, and 7501 pucks across all in-window FLY pairings. Admin gains PBS Business Time, Bid Definitions and a Scheduler page; the Data tab gets a proper Copy dialog and inline-edit hints; and browser credential autofill is back.',
  fromCommit: 'd71fc250',
  toCommit: 'a5d8b9ff',
  rangeLabel: 'Jul 20, 2026 – Aug 6, 2026',
  note:
    'Covers the last two and a half weeks (Jul 20 – Aug 6); the earlier Jun 24 – Jul 20 window since Rel 3 is not yet written up. Text-only — the changes span many panes and dialogs rather than one new screen, so there are no screenshot galleries; open the relevant pane to see each one.',
  items: [
    // ── Live (roster, pairing & flight panes, toolbar, legality) ───────────────
    {
      date: '2026-08-05', type: 'enhancement', area: 'Live',
      title: 'Save waits for legality recheck',
      body:
        'After roster edits, the <b>Save</b> button now waits for legality recheck and manday recomputation to finish before reporting success, so violation counts are immediately accurate.',
    },
    {
      date: '2026-08-05', type: 'fix', area: 'Live',
      title: 'Roster dialogs dismiss on overlay or Escape',
      body:
        'The <b>Manday Info</b>, <b>Schedule Details</b> and <b>Daily Task Calendar</b> dialogs now close when clicking the dimming overlay or pressing <b>Escape</b>, and the Manday Info panel is fully opaque for readability.',
    },
    {
      date: '2026-08-04', type: 'enhancement', area: 'Live',
      title: 'Rule Set selector shows the division',
      body:
        'The toolbar <b>Rule Set</b> selector now shows a division prefix (<b>P</b> or <b>C</b>) beside the rule set name, and choosing a division also narrows the crew and pairing filters to match.',
    },
    {
      date: '2026-08-04', type: 'enhancement', area: 'Live',
      title: 'View pairing detail in the context menu',
      body:
        'Right-clicking a roster or pairing task now includes <b>View pairing detail</b>, opening the <b>Pairing Info</b> dialog with its segment and crew tables — previously only available in Scenario.',
    },
    {
      date: '2026-08-03', type: 'enhancement', area: 'Live',
      title: 'Timeline shaded by roster period',
      body:
        'The gantt timeline now renders alternating background bands for each roster period, so you can see where one RP ends and the next begins. (Live and Scenario)',
    },
    {
      date: '2026-08-03', type: 'enhancement', area: 'Live',
      title: 'Ground task Credit and airport inputs',
      body:
        'The <b>Edit Ground Task</b> dialog now has an editable <b>Credit</b> field (in minutes) and airport pickers with typeahead suggestions that default to the crew’s base airport.',
    },
    {
      date: '2026-08-03', type: 'enhancement', area: 'Live',
      title: 'Crew Info dialog from roster headers',
      body:
        'Right-clicking a roster row header opens a <b>Crew Info</b> dialog showing all of the crew’s records (<b>Crew Base</b>, <b>Rank</b>, <b>Fleet</b>, <b>Qualification</b>, <b>Certification</b>, <b>Team</b>) on one compact page, sorted by effective date.',
    },
    {
      date: '2026-08-01', type: 'enhancement', area: 'Live',
      title: 'Daily Gantt Statistics dialog',
      body:
        'Double-clicking a day on the timeline opens <b>Daily Gantt Statistics</b> with on-duty crew counts, layover statistics and pairing details for that date. (Live and Scenario)',
    },
    {
      date: '2026-07-31', type: 'enhancement', area: 'Live',
      title: 'Crew Credit column in Pairing Info',
      body:
        'The <b>Pairing Info</b> crew table now includes a <b>Credit</b> column showing each crew member’s credited minutes for the pairing.',
    },
    {
      date: '2026-07-31', type: 'enhancement', area: 'Live',
      title: 'Duty Credit merged in Pairing Info segments',
      body:
        'The <b>Duty</b> column in the pairing segment table now merges across same-duty segments and shows <b>Credit</b>, <b>FDP</b>, <b>DP</b> and layover information per duty.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Live',
      title: 'Daily Task Calendar dialog',
      body:
        'Right-clicking a roster task opens a <b>Daily Task Calendar</b> dialog — a week-at-a-glance view of the crew’s assignments with an RP stepper and timezone toggle. (Live and Scenario)',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Live',
      title: 'Schedule Details dialog',
      body:
        'Right-clicking a roster task opens a <b>Schedule Details</b> dialog listing every task for the selected crew and roster period in a sortable table with a timezone toggle. (Live and Scenario)',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Live',
      title: 'Shared English date picker',
      body:
        'All date inputs in the app now use one shared English calendar picker instead of native browser date controls, giving consistent formatting across create, edit, import and filter dialogs.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Live',
      title: 'Undo releases crew locks when clean',
      body:
        'Using <b>Undo</b> now releases crew locks once no draft changes remain, so crews no longer stay locked after all edits are undone.',
    },
    {
      date: '2026-07-29', type: 'enhancement', area: 'Live',
      title: 'Manday Info dialog from the context menu',
      body:
        'Right-clicking a roster row header opens a resizable <b>Manday Info</b> dialog showing daily <b>Credit</b> and <b>BH</b> for the viewport’s calendar month. (Live and Scenario)',
    },
    {
      date: '2026-07-28', type: 'fix', area: 'Live',
      title: 'Pairing pane Base column populated',
      body:
        'The <b>Base</b> column in the Live Pairing pane now shows each pairing’s actual base airport code instead of a blank cell.',
    },
    {
      date: '2026-07-27', type: 'enhancement', area: 'Live',
      title: 'Live roster bulk delete',
      body:
        'A new <b>Bulk Delete Roster Flights</b> dialog deletes flights by crew, division, base and source filters, with a four-stage progress bar (<b>Deleting</b>, <b>Rechecking</b>, <b>Manday</b>, <b>Broadcasting</b>).',
    },
    {
      date: '2026-07-26', type: 'enhancement', area: 'Live',
      title: 'Roster period selector and RP columns',
      body:
        'The Live toolbar now has an <b>RpMultiSelect</b> dropdown for choosing roster periods and a <b>GO TO RPDate</b> menu that zooms to any loaded RP. Crew stat columns were renamed <b>RpCred</b>, <b>RpDO</b>, <b>RpBH</b> to reflect their roster-period basis.',
    },
    {
      date: '2026-07-24', type: 'fix', area: 'Live',
      title: 'IMP-sourced roster rows are read-only',
      body:
        'Roster rows imported from <b>IMP</b> are now immutable in Live: <b>Edit Task</b>, <b>Swap Task</b> and drag-move are disabled, while <b>Delete</b> stays available.',
    },
    {
      date: '2026-07-21', type: 'enhancement', area: 'Live',
      title: 'Ground task Base field and base-timezone times',
      body:
        'The ground task dialog now shows and lets you edit the <b>Dep Arp</b> (departure airport) field, and ground task status times are displayed in the crew’s base timezone.',
    },

    // ── Scenario ───────────────────────────────────────────────────────────────
    {
      date: '2026-08-06', type: 'enhancement', area: 'Scenario',
      title: 'Version tabs show a v0/v1/v2 prefix',
      body:
        'Historical version Gantt tabs now display a version prefix in the nav dropdown (e.g. <b>v1 #123 Alpha</b>) so you can tell at a glance which tab is the archived version and which is the live scenario.',
    },
    {
      date: '2026-08-05', type: 'enhancement', area: 'Scenario',
      title: 'Save applies patches locally; results arrive via push',
      body:
        'Saving scenario edits now applies roster patches locally without reloading the whole Gantt dataset. Manday, KPI and legality recomputation results arrive via push signals, so the save flow feels faster and more responsive. (Live and Scenario)',
    },
    {
      date: '2026-08-05', type: 'enhancement', area: 'Scenario',
      title: 'Team Rules editor with Add Team / Add Rule dialogs',
      body:
        'The <b>Team Rules</b> editor now supports <b>+ Add Team</b> and <b>+ Add Rule</b> dialogs with crew and pairing checkbox-selection columns and virtualized preview tables. Deleting a team that still has rules is blocked with an error listing the blocking rules.',
    },
    {
      date: '2026-08-05', type: 'enhancement', area: 'Scenario',
      title: 'Scenario editing uses a pencil icon and clearer labels',
      body:
        'The <b>Draft</b> status now shows a pencil icon instead of a text label, editing tooltips were clarified, and the editing badge in the toolbar reads <b>Edit</b>. Lock toasts were removed to cut noise.',
    },
    {
      date: '2026-08-05', type: 'enhancement', area: 'Scenario',
      title: 'Version Differences highlights only changes',
      body:
        'The <b>Differences</b> dialog between scenario versions now highlights only changed parameter values in red, with wider value columns. It compares <b>Algorithm Parameters</b> and <b>Regulatory Parameters</b>.',
    },
    {
      date: '2026-08-05', type: 'fix', area: 'Scenario',
      title: 'Scenario team division scoped to the workset',
      body:
        'The division in the Team editor is now scoped to the scenario’s workset and shown as a read-only <b>Team Division</b> input, preventing accidental cross-division team assignments.',
    },
    {
      date: '2026-08-04', type: 'fix', area: 'Scenario',
      title: 'Published scenarios locked from editing',
      body:
        'Scenarios with <b>Published</b> status are now fully read-only in the detail panel — name, date controls, rule set and parameters are disabled, preventing accidental edits.',
    },
    {
      date: '2026-08-04', type: 'fix', area: 'Scenario',
      title: 'Distribution charts fill the panel width',
      body:
        'The <b>Distribution</b> result tab charts now fill the available width and no longer scroll horizontally, so <b>Daily duty load vs available crew</b> and <b>Uncovered demand</b> use the full panel.',
    },
    {
      date: '2026-08-04', type: 'enhancement', area: 'Scenario',
      title: 'Algorithm Parameters scoped by division',
      body:
        'The <b>Algorithm Parameters</b> dialog now scopes credit-range edits by division (e.g. division <b>P</b> shows <b>CA/FO</b>, division <b>C</b> shows <b>IFD/FA</b>) and version diffs filter credit-range parameters to the selected division.',
    },
    {
      date: '2026-08-03', type: 'enhancement', area: 'Scenario',
      title: 'Rule set shown in the scenario toolbar',
      body:
        'The Scenario Gantt toolbar now shows the active rule set as a read-only badge, so you can see which rules are being checked without leaving the Gantt view.',
    },
    {
      date: '2026-08-03', type: 'fix', area: 'Scenario',
      title: 'Scenario legality alerts match Live',
      body:
        'Legality violation alerts in Scenario now use the same format as the Live alert center, and the <b>Rule Violation Detected</b> dialog appears consistently during scenario assignment. (Live and Scenario)',
    },
    {
      date: '2026-08-02', type: 'enhancement', area: 'Scenario',
      title: 'Scenario optimization version history',
      body:
        'A new <b>Versions</b> result tab lists completed optimizer archives with <b>Version</b>, <b>Executed By</b>, <b>Executed At</b>, <b>File Timestamp</b> and <b>Size</b>. Each row has <b>Open Gantt</b> and <b>Differences</b> buttons, and non-current versions can be deleted.',
    },
    {
      date: '2026-08-02', type: 'enhancement', area: 'Scenario',
      title: 'Scenario roster edit toolbar and drag assignment',
      body:
        'Scenario Gantt now supports drag-to-assign for pairings onto crew rows, with an <b>Edit</b>/<b>View</b> toggle and an editing toolbar (<b>Undo</b>, <b>Redo</b>, <b>Save</b>, <b>Delete</b>) matching the Live roster.',
    },
    {
      date: '2026-07-31', type: 'enhancement', area: 'Scenario',
      title: 'Result tabs redesigned with Credit Hours and Distribution',
      body:
        'The scenario result area now has five tabs: <b>KPI</b>, <b>Credit Hours</b>, <b>Uncovered</b>, <b>Distribution</b> and <b>Versions</b>. <b>Credit Hours</b> shows summary tiles and a per-crew table; <b>Uncovered</b> groups lost pairings and reserves into sections.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Scenario',
      title: 'Run progress shown in the detail header',
      body:
        'While a scenario is <b>Running</b>, a compact progress bar in the detail header shows the current solver stage (<b>Start</b>, <b>Input</b>, <b>Solve</b>, <b>Result</b>, <b>Roster</b>), progress percentage and elapsed time.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Scenario',
      title: 'Algorithm Parameters dialog with seven editors',
      body:
        'The <b>Algorithm Parameters</b> dialog exposes seven editors: <b>Credit Range</b>, <b>Floor Rescue</b>, <b>Reserve Priority</b>, <b>Min Reserve Coverage %</b>, <b>Day Pressure Spread</b>, <b>Team Rules</b> and <b>Crew Bid</b>. The dialog was widened and Reserve Priority weekdays now stack vertically.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Scenario',
      title: 'Distribution result tab with chart and table',
      body:
        'The <b>Distribution</b> result tab shows daily slot data with a <b>Chart</b>/<b>Table</b> toggle and a <b>Both</b>/<b>Pairing</b>/<b>Reserve</b> type filter, plus summary tiles for assigned and uncovered slots.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Scenario',
      title: 'Scenario Bulk Delete dialog',
      body:
        'The <b>Scenario Bulk Delete</b> dialog lets you review and selectively delete roster assignments, with <b>Division</b> and <b>Base</b> filter chips and a progress indicator.',
    },
    {
      date: '2026-07-28', type: 'enhancement', area: 'Scenario',
      title: 'Scope Filters for crew, pairing and rank',
      body:
        'The scenario detail panel now has a <b>Scope Filters</b> section next to <b>Basic Info</b>. RO scenarios filter crews by bases, fleets, ranks, seniority and birthday, and pairings by bases, fleets, sources, type and duration; PO scenarios filter flights by number, airports and fleets.',
    },
    {
      date: '2026-07-28', type: 'enhancement', area: 'Scenario',
      title: 'Pre-run Check dialog before optimisation',
      body:
        'Clicking <b>Kick off run</b> now opens a <b>Pre-run Check</b> dialog that lists required fields to fix before running and warns about broad optimisation scope, with a <b>Proceed Anyway</b> button when only warnings exist.',
    },
    {
      date: '2026-07-27', type: 'enhancement', area: 'Scenario',
      title: 'Import Optimized Roster to Live dialog',
      body:
        'Scenario roster publish now opens an <b>Import Optimized Roster to Live</b> dialog with searchable filters (<b>Crew ID</b>, <b>Base</b>, <b>Pairing ID</b>, <b>Pairing Label</b>), a <b>Show Imported</b>/<b>Hide Imported</b> toggle and a <b>Select Unpublished</b> bulk action.',
    },
    {
      date: '2026-07-26', type: 'enhancement', area: 'Scenario',
      title: 'Shared RP date navigation',
      body:
        'Roster Period navigation is now unified between Live and Scenario Gantt. The scenario <b>RP Date</b> field uses the shared <b>RpSelect</b>, and the toolbar <b>GO TO RPDate</b> menu jumps to a specific roster period. (Live and Scenario)',
    },
    {
      date: '2026-07-21', type: 'enhancement', area: 'Scenario',
      title: 'Per-material progress in PBS Import',
      body:
        'The <b>Import PBS Material</b> dialog now tracks each material type (<b>Crew</b>, <b>Roster</b>, <b>RosterGround</b>, <b>Pairing</b>, <b>Flight</b>) through <b>Fetch</b>, <b>Transform</b> and <b>Write</b> stages, with per-stage timing and Add/Update/Delete/OK/Fail/Skip counts.',
    },

    // ── Rule (legality) ────────────────────────────────────────────────────────
    {
      date: '2026-08-05', type: 'enhancement', area: 'Rule',
      title: 'Rule Sets show type and division badges',
      body:
        'The <b>Rule Sets</b> sidebar now shows <b>type</b> (LIVE/PBS/RO) and <b>division</b> (P/C) as colour-coded badges per card, configured from the RULE_SET_TYPE dictionary. An amber alert warns when a division/type has no enabled rule set, and the rules table adds an <b>Update By</b> column. (Live and Scenario)',
    },
    {
      date: '2026-08-03', type: 'enhancement', area: 'Rule',
      title: 'Rule 7500 crew ref timezone persisted',
      body:
        'Rule 7500’s acclimatisation reference timezone is now computed and persisted per crew, pairing and duty before dependent checks run, and the selected crew’s Ref values show in Live and Scenario <b>Pairing Detail</b>.',
    },
    {
      date: '2026-08-03', type: 'fix', area: 'Rule',
      title: 'Legality param dialog scroll stays visible',
      body:
        'The pop-out rule parameter dialog now keeps the horizontal scrollbar on the visible viewport, and the <b>CHANGES</b> panel with <b>Undo</b> and <b>Save All</b> stays pinned while wide parameter tables scroll.',
    },
    {
      date: '2026-08-01', type: 'enhancement', area: 'Rule',
      title: 'Rule 7501 pucks on all in-window FLY pairings',
      body:
        'Rule 7501 violation pucks now paint on all in-window FLY pairings, not just the anchor. Hovering a puck shows the violation in the <b>Rule Violations</b> tooltip; clicking selects the related FLY tasks. (Live and Scenario)',
    },
    {
      date: '2026-07-31', type: 'fix', area: 'Rule',
      title: 'Legality refreshes after draft Save',
      body:
        'After committing a draft, crew bells and the Alert Center now refresh automatically with updated violation text (e.g. 7505 GDO counts) — no hard page reload needed. (Live)',
    },
    {
      date: '2026-07-31', type: 'fix', area: 'Rule',
      title: 'Violation tooltip shows each instance once',
      body:
        'The crew-bell and puck <b>Rule Violations</b> tooltip now shows rule labels like <b>7505/001</b> once instead of repeating the instance (<b>7505/001/001</b>).',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Rule',
      title: 'Rule 7507 — Min # GDOs with fly/reserve filters',
      body:
        'New legality rule <b>7507 — Min # GDOs</b> is available. It runs the same minimum-GDO check as 7505 but adds <b>NUM FLY DAY</b> and <b>NUM RESERVES</b> band-column filters alongside <b>Count Layover</b>.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Rule',
      title: 'Rule metadata editable inline for admins',
      body:
        'Admin users can now click-to-edit <b>Description</b>, <b>Reference</b>, <b>Category</b> and <b>Severity</b> (with <b>Soft</b>, <b>Overridable</b> and <b>Hard</b> options) directly in the rule set table and catalog instance header.',
    },
    {
      date: '2026-07-30', type: 'enhancement', area: 'Rule',
      title: 'Legality param dialog is resizable',
      body:
        'The pop-out rule parameter dialog can now be resized by dragging its corner, making wide rules like 8056 easier to inspect.',
    },
    {
      date: '2026-07-28', type: 'enhancement', area: 'Rule',
      title: 'Rule dialog draggable with clearer title',
      body:
        'The blocking-rule dialog is now draggable by its title bar and has a dim overlay instead of a blur. Its title changed from <b>Operation Blocked</b> to <b>Rule Violation Detected</b>; warnings keep <b>Rule Violations Detected</b> with a <b>Continue Anyway</b> button. (Live and Scenario)',
    },
    {
      date: '2026-07-28', type: 'enhancement', area: 'Rule',
      title: 'Draft legality preview before assign and swap',
      body:
        'Planners now see Rust legality preview warnings before committing live or scenario draft operations. Add, move and swap preview new violations scoped to the affected tasks; delete skips the precheck. (Live and Scenario)',
    },
    {
      date: '2026-07-28', type: 'fix', area: 'Rule',
      title: 'Violation window scoped to roster-period bounds',
      body:
        'Persisted violations are now filtered to the official roster period bounds (dropping the old ±1 month padding), so lead-in findings no longer appear in the current view’s crew bells or Alert Center. (Live)',
    },
    {
      date: '2026-07-20', type: 'fix', area: 'Rule',
      title: 'Rules 7505 and 7507 show on the crew bell only',
      body:
        'Rules 7505 (Min-GDO) and 7507 now light up the roster crew-row bell and Alert Center but no longer paint puck <b>!</b> badges, since these are crew-period checks rather than per-pairing findings. (Live and Scenario)',
    },

    // ── Data ───────────────────────────────────────────────────────────────────
    {
      date: '2026-08-06', type: 'enhancement', area: 'Data',
      title: 'Copy rows with a dedicated dialog',
      body:
        'Copying a row in the Data tab now opens a <b>Copy &lt;Entity&gt;</b> dialog (with a <b>Copied from Row #N</b> subtitle) instead of the generic Add dialog. When the server rejects a save, each invalid field is highlighted in red with the exact error beneath it.',
    },
    {
      date: '2026-08-05', type: 'enhancement', area: 'Data',
      title: 'Data table inline editing affordance',
      body:
        'Editable cells in the Data tab now appear as bordered chips with a <b>Double-click to edit</b> tooltip and a hand cursor, and each section header reads <b>Double-click a cell to edit.</b>',
    },

    // ── System ─────────────────────────────────────────────────────────────────
    {
      date: '2026-08-06', type: 'enhancement', area: 'System',
      title: 'PBS Period lifecycle: Roster Range and Award Publish',
      body:
        'The PBS Period table now shows <b>Roster Range</b>, <b>Award Publish</b> and <b>Published</b> columns, and the Add/Edit dialog adds <b>Roster Start</b>, <b>Roster End</b> and <b>Award Publish</b> fields with full-timestamp validation.',
    },
    {
      date: '2026-08-05', type: 'enhancement', area: 'System',
      title: 'PBS Period dialog simplified',
      body:
        'The <b>Add PBS Period</b> / <b>Edit PBS Period</b> dialog now drops the Roster Period ID, Filiale, Award Run, Max Tiers and Description fields, and <b>Generate PBS Year</b> no longer asks for Filiale or Max Tiers.',
    },
    {
      date: '2026-08-04', type: 'enhancement', area: 'System',
      title: 'PBS Periods made global',
      body:
        'PBS Periods are now global rather than scoped per division — the division selector is gone from period administration.',
    },
    {
      date: '2026-08-04', type: 'enhancement', area: 'System',
      title: 'PBS Business Time admin page',
      body:
        'A new <b>Business Time</b> page under the PBS sidebar (admin only) shows <b>Mode</b>, <b>Real Time</b>, <b>PBS Business Time</b> and <b>Override Set At</b>, and lets administrators set or clear a simulated business time.',
    },
    {
      date: '2026-08-04', type: 'enhancement', area: 'System',
      title: 'PBS Bid Definitions management',
      body:
        'A new <b>Bid Definitions</b> page under the PBS sidebar manages six definition types (Redeye, Weekend, Credit Window, Minimum Base Layover, Efficient Flying Percentile, Minimum Time Between Flights), each with <b>Current Value</b>, <b>Description</b>, <b>Updated By</b> and <b>Updated At</b>.',
    },
    {
      date: '2026-07-22', type: 'enhancement', area: 'System',
      title: 'Scheduler system page',
      body:
        'A new <b>Scheduler</b> page under the System sidebar groups scheduler jobs by service, shows each job’s <b>State</b> and schedule, and provides <b>Job Control</b> to edit schedules, toggle jobs, run them now, and view <b>Run History</b>.',
    },

    // ── Global ─────────────────────────────────────────────────────────────────
    {
      date: '2026-08-06', type: 'fix', area: 'Global',
      title: 'Browser credential autofill restored',
      body:
        'The login form now uses sectioned autocomplete attributes so browser password managers fill the <b>User Name</b> and <b>Password</b> fields without leaking credentials into other apps or forms.',
    },
    {
      date: '2026-08-05', type: 'fix', area: 'Global',
      title: 'Duplicate top-nav toggle removed',
      body:
        'The top navigation no longer shows a duplicate button for hiding the sidebar.',
    },
  ],
}

const REL_3: Release = {
  n: 3,
  date: 'Jun 24, 2026',
  version: 'B185 / F329 / R39',
  summary:
    'A planner-experience release: crew memos on the roster, a cleaner one-step way to clear pre-assignments for the solver, a Base column and an Open/Partial-first pairing pane, Esc to clear selections, and legality that shows when it was last checked and rechecks itself. Scenarios gained a three-check Roster Quality Analyzer, a Scenarios dropdown in place of run-off-the-edge tabs, an Alert Center bell, Flight Navi, Live-style Filter and Sort, per-row violation bells, a Refresh button on stuck RUNNING scenarios, and the ability to open a scenario on its seed data before it is optimised. Plus admin rule-parameter editing on the Legality tab, a Metadata browser and a clearer Data tab, and a slimmer top nav.',
  fromCommit: '2a20546e',
  toCommit: 'f9dd74d0',
  rangeLabel: 'Jun 15, 2026 – Jun 24, 2026',
  note:
    'Summarised as text only this release — the changes live across many panes and dialogs rather than in one new screen, so there are no screenshot galleries; open the relevant pane to see each one.',
  items: [
    // ── Live (roster, pairing & flight panes, toolbar, legality) ───────────────
    {
      date: '2026-06-21', type: 'enhancement', area: 'Live',
      title: 'Crew memos on the roster',
      body:
        'Right-click a crew row to add, edit or delete a free-text <b>crew memo</b>. Crew that have a memo show a small note icon on their roster row, and the icons refresh when you change the date range.',
    },
    {
      date: '2026-06-22', type: 'enhancement', area: 'Live',
      title: 'Clear pre-assignments through the normal Delete flow',
      body:
        'Clearing a crew’s pre-assigned duties to make room for the solver now uses the ordinary <b>select → Delete → Save</b> flow on the roster — and R’Bot’s “remove pre-assignment (PA) for solver” can mark them for you — with no separate execute step.',
    },
    {
      date: '2026-06-22', type: 'enhancement', area: 'Live',
      title: 'Base column in the pairing pane',
      body:
        'The pairing pane gained a <b>Base</b> column showing each pairing’s crew base, on by default (in both the Live and Scenario views).',
    },
    {
      date: '2026-06-22', type: 'enhancement', area: 'Live',
      title: 'Pairing pane shows Open & Partial first',
      body:
        'The pairing pane now defaults to showing only <b>Open</b> and <b>Partial</b> pairings, so the trips that still need crewing are front and centre; frozen and label-matched rows always stay visible. (Live and Scenario)',
    },
    {
      date: '2026-06-19', type: 'enhancement', area: 'Live',
      title: 'Legality shows its last-check time and rechecks itself',
      body:
        'The legality header and Alert Center now show <b>when legality was last checked</b> with a <b>Recheck now</b> button, and saving a rule parameter automatically rechecks the affected rule — the old manual <b>Scan</b> is gone. (Live and Scenario)',
    },
    {
      date: '2026-06-19', type: 'enhancement', area: 'Live',
      title: 'Esc clears every pane selection',
      body:
        'Pressing <b>Esc</b> now clears the row selection in the Roster, Pairing and Flight panes at once.',
    },
    {
      date: '2026-06-15', type: 'enhancement', area: 'Live',
      title: 'Delete acts on the whole box-selection',
      body:
        'Right-clicking inside a multi-row selection now deletes every selected duty in one go, and the menu tells you how many tasks will be removed.',
    },
    {
      date: '2026-06-15', type: 'enhancement', area: 'Live',
      title: 'Pairing Info title leads with the label',
      body:
        'The Pairing Info dialog title now shows the pairing label first and the <b>#id</b> after it, so you recognise the pairing at a glance.',
    },
    {
      date: '2026-06-20', type: 'fix', area: 'Live',
      title: 'Violations load on very large rosters',
      body:
        'Rule violations are now fetched in batches, so they no longer time out on rosters of <b>800+ crew</b> over long-distance connections.',
    },

    // ── Scenario ───────────────────────────────────────────────────────────────
    {
      date: '2026-06-22', type: 'enhancement', area: 'Scenario',
      title: 'Roster Quality Analyzer — three checks',
      body:
        'The scenario roster’s <b>Quality Analyzer</b> now flags three things per crew: <b>Standalone RES</b> (isolated reserve days), long runs of consecutive working days, and <b>Day-off only</b> crew whose whole roster is days off with no flying or reserve — a likely data issue.',
    },
    {
      date: '2026-06-22', type: 'enhancement', area: 'Scenario',
      title: 'Scenarios open from a dropdown menu',
      body:
        'Open scenarios now live in a <b>Scenarios</b> dropdown with an <b>Opened Scenarios</b> submenu, instead of tabs that ran off the right edge of the screen.',
    },
    {
      date: '2026-06-22', type: 'enhancement', area: 'Scenario',
      title: 'Recheck sits in the pane toolbar',
      body:
        'The legality <b>Recheck</b> button moved into the pane toolbar next to the alert bell, and shows a small amber dot when a rule parameter has changed since the last check.',
    },
    {
      date: '2026-06-20', type: 'enhancement', area: 'Scenario',
      title: 'Open a scenario before it’s optimised',
      body:
        'A Draft or Failed scenario with no result now shows a <b>seed</b> badge and opens on its seeded data, so you can review the starting roster before running the optimiser.',
    },
    {
      date: '2026-06-18', type: 'enhancement', area: 'Scenario',
      title: 'Removed the internal Model field',
      body:
        'The scenario detail panel no longer shows the internal <b>Model (Workset ID)</b> field, leaving only the settings that matter to planning.',
    },
    {
      date: '2026-06-17', type: 'enhancement', area: 'Scenario',
      title: 'Flight Navi inside a scenario',
      body:
        'The scenario Flight pane gained the <b>Flight Navi</b> table, letting you jump from a flight to its crew or pairings — built from the scenario’s own data.',
    },
    {
      date: '2026-06-16', type: 'enhancement', area: 'Scenario',
      title: 'Live-style Filter and multi-key Sort in scenario panes',
      body:
        'The scenario Roster, Pairing and Flight panes now use the same <b>Filter</b> and multi-key <b>Sort</b> dialogs as the Live view, and remember your choice for each scenario.',
    },
    {
      date: '2026-06-16', type: 'enhancement', area: 'Scenario',
      title: 'Alert Center bell in the scenario pane toolbar',
      body:
        'The scenario roster pane now has an <b>Alert Center</b> bell in the pane toolbar — matching the Live view — so you can see the full list of violations grouped by severity, rule, base and rank without leaving the scenario.',
    },
    {
      date: '2026-06-16', type: 'fix', area: 'Scenario',
      title: 'Violation bells on each scenario crew row',
      body:
        'Legality violations now show as a bell on each affected crew row inside a scenario, matching the Live view.',
    },
    {
      date: '2026-06-15', type: 'fix', area: 'Scenario',
      title: 'Refresh button on a stuck RUNNING scenario',
      body:
        'If a network error leaves a scenario stuck showing <b>Kill run</b> with no active poll, a <b>Refresh status</b> button now appears so you can resync without reloading the whole page.',
    },
    {
      date: '2026-06-15', type: 'fix', area: 'Scenario',
      title: 'Scenario ground-task credit shows correctly',
      body:
        'Ground-task credit for <b>VAC / RES / SIM</b> now shows correctly in the scenario roster and the bottom status bar.',
    },

    // ── Rule ───────────────────────────────────────────────────────────────────
    {
      date: '2026-06-17', type: 'enhancement', area: 'Rule',
      title: 'Edit legality rule parameters in place',
      body:
        'Administrators can now edit a rule’s parameter table right from the <b>Legality</b> tab — inline for narrow rules or an <b>Edit Row</b> dialog for wide ones — with add / copy / delete / move-row actions, a <b>Changes</b> panel, step-by-step undo, format validation, and <b>Save All</b>. (admin only)',
    },

    // ── Data ───────────────────────────────────────────────────────────────────
    {
      date: '2026-06-18', type: 'enhancement', area: 'Data',
      title: 'Browse database tables from the Data tab',
      body:
        'A new <b>Metadata</b> group in the Data sidebar lets you browse the database tables, with separate <b>Live</b> and <b>Scenario</b> sections.',
    },
    {
      date: '2026-06-16', type: 'enhancement', area: 'Data',
      title: 'Clearer Data tab + Canada holiday calendar',
      body:
        'The Data tab reads more clearly — boolean columns now show <b>Yes / No</b> instead of 0 / 1 — and the Canada public-holiday calendar is populated for every base.',
    },

    // ── System ─────────────────────────────────────────────────────────────────
    {
      date: '2026-06-16', type: 'enhancement', area: 'System',
      title: 'Slimmer top navigation',
      body:
        'The <b>System</b> tab (Queue Tasks and the monitoring tools) is no longer shown in the top navigation, keeping the bar focused on planning.',
    },

    // ── Global / app-wide ──────────────────────────────────────────────────────
    {
      date: '2026-06-15', type: 'enhancement', area: 'Global',
      title: 'Save & autofill your login',
      body:
        'The login page now lets your browser — Chrome, Safari, Firefox or Brave — offer to save and autofill your username and password.',
    },
    {
      date: '2026-06-15', type: 'enhancement', area: 'Global',
      title: 'Easier to bring back a hidden top nav',
      body:
        'When the top navigation is hidden, the sidebar’s <b>Show Top Nav</b> toggle gently pulses so you can find it again.',
    },
  ],
}

/** All releases, latest first. */
export const RELEASES: Release[] = [REL_7, REL_6, REL_5, REL_4, REL_3, REL_2, REL_1]

/** Area section order — mirrors the top-nav tab order. */
export const AREA_ORDER: ReleaseArea[] = [
  'Live', 'Scenario', 'Rule', 'Data', 'System', 'Regression', 'Global',
]

/** 'YYYY-MM-DD' → 'Jun 12' (no year), for the Date column. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`
}

/** Items of one area, sorted by date descending (latest first), stable on ties. */
export const itemsForArea = (release: Release, area: ReleaseArea): ReleaseItem[] =>
  release.items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.area === area)
    .sort((a, b) => (a.item.date < b.item.date ? 1 : a.item.date > b.item.date ? -1 : a.i - b.i))
    .map(({ item }) => item)
