# Live vs Scenario Gantt — Code-Sharing Tracker

> **Goal:** make Live and Scenario gantt run on the *same* code, so a feature built in Live
> automatically shows up in Scenario with no parallel work. This file tracks how close we are
> over time. Re-measure whenever the team touches the gantt view layer and append a row to the log.

## How to re-measure (one command)

```bash
bash scripts/measure-gantt-sharing.sh
```

It prints the date, the three line-count buckets, and the **SHARED %**. Copy that into the
[Measurement log](#measurement-log) below as a new row. The script is the single source of truth —
don't hand-count; keep the metric definition stable so the trend stays comparable.

## What "SHARED %" means (metric definition — keep stable)

We measure the **gantt view layer** only (the code that draws and drives the gantt), split into three buckets:

| Bucket | Folders counted | Meaning |
|---|---|---|
| **SHARED** | `gantt/src/components/gantt/**` | Canvas, renderers, interactions, time axis, overlays, and the **source-abstraction layer** (`gantt/source/`). Used by BOTH views. A feature here lands in Live and Scenario at once. |
| **LIVE-ONLY** | `gantt/src/components/panes/**` + `gantt/src/components/layout/**` | Live pane wrappers and Live layout grid. A feature here does NOT reach Scenario unless copied. |
| **SCENARIO-ONLY** | `gantt/src/components/scenario-gantt/**` | Scenario pane wrappers, scenario layout grid, scenario toolbar. |

```
SHARED % = SHARED / (SHARED + LIVE-ONLY + SCENARIO-ONLY)
```

Counting rules: `.ts` + `.tsx` only; iCloud duplicate files (names containing `" 2."`) excluded.
Stores (`gantt/src/stores/**`) are intentionally **left out of the headline number** — store ownership is
fuzzy (many stores serve both views via the source layer), and including them would make the trend noisy.
Stores are tracked qualitatively in the notes column instead.

**Higher % = closer to the goal.** When this number climbs, it means duplicated pane/layout code is
being pulled up into the shared layer. When it falls, it means new view-specific code was added to only
one side (a divergence — worth a note explaining why).

## Measurement log

Append one row per measurement. Newest at the bottom. Always paste the script output and a one-line note.

| Date | Shared | Live-only | Scenario-only | Total | **Shared %** | Δ vs prev | Notes |
|------|-------:|----------:|--------------:|------:|:-------------:|:---------:|-------|
| 2026-06-15 | 8,586 | 6,390 | 3,967 | 18,943 | **45.3%** | — (baseline) | Baseline. Canvas/renderers/interactions + `gantt/source/` abstraction = 100% shared. Pane wrappers (roster/pairing/flight) and layout grids are duplicated per view. |

## Where the duplication lives (the work to do)

These are the parallel-maintenance hotspots. Pulling logic out of these and into the SHARED bucket is
what moves the % up:

- **Pane wrappers** — `components/panes/{roster,pairing,flight}-pane.tsx` (Live) vs
  `components/scenario-gantt/scenario-{roster,pairing,flight}-pane.tsx` (Scenario). Largest single source of
  duplication. They differ mainly in *which store they read* and *edit/lock behavior*.
- **Layout grid** — `components/layout/` (Live) vs `scenario-layout-grid` / `scenario-panel-splitter` (Scenario).
  Structure is nearly identical; differs only in data flow.
- **Toolbar** — `shell/gantt-sub-toolbar.tsx` (Live) vs `scenario-gantt/scenario-gantt-toolbar.tsx` (Scenario).
- **Stores** — Live uses many singleton stores; Scenario uses per-scenario registry stores
  (`scenario-gantt-store`, `scenario-layout-store`, `scenario-violation-store`). Not in the headline metric, but
  the reason the pane wrappers can't be merged as-is.

## What already works (don't re-do this)

The **source-abstraction layer** (`components/gantt/source/`: `gantt-source-context.tsx`, `gantt-pane-source.ts`,
`live-gantt-source.ts`, `scenario-gantt-source.ts`) is the bridge that already lets one canvas render two data
sources. `PaneCanvas` reads from `useGanttSource()` instead of importing stores directly. **This is the pattern
to extend:** to share more, push pane-wrapper logic (row building, toolbar items, filtering) down so it reads
from the source interface — then both pane families collapse into one.

## Rule of thumb for the team

- Building a feature in the **shared canvas / renderers / interactions** → it reaches both views for free. ✅
- Building a feature in a **pane wrapper, layout grid, or toolbar** → you must mirror it on the other side,
  OR (preferred) extend the source abstraction so the logic becomes shared. Note which you did in the log.
- After any gantt view-layer change, re-run the script and append a row so we can see the trend.
