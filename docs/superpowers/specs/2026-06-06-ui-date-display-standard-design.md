# UI Date Display Standard — Design

- **Date**: 2026-06-06
- **Status**: Approved (user-confirmed in brainstorming session)
- **Scope**: gantt / pbs-portal / pbs-app / packages/ui (+ CLAUDE.md project rule)

## Problem

User-visible dates are formatted inconsistently across the frontends:

- `YYYY-MM-DD` via `.slice(0, 10)` (~30+ sites: scenario list, composition view, scenario basic info…)
- `toLocaleDateString()` with no locale → browser-dependent output (summary-bar popup)
- `en-GB` "7 Jun 2026" (crew-bids view)
- `MM/dd HH:mm` (task-detail dialog)
- Canvas timeline high-zoom label `2026-06-07 Sat`
- Month-span labels centered over the *visible* span of a month, which is confusing when several months are on screen

There is no project rule defining the display format, so each new component invents one.

## Goals

1. One universal user-facing date format: **`Jun 7, 2026`**.
2. Gantt timeline (Live **and** Scenario) day labels omit the year: **`Jun 7`**; DOW adapts to column width (`Mon` ↔ `M`).
3. Timeline month labels anchor at the **first day of the month** (left-aligned), not centered over the visible span.
4. Migrate every user-visible date site to the standard.
5. Codify the standard as a mandatory project rule in `CLAUDE.md`.

## The Standard

| Kind | Format | Example |
|---|---|---|
| Date | en-US short month, no leading zero day, full year | `Jun 7, 2026` |
| Date + time | date, space, 24-hour `HH:mm` | `Jun 7, 2026 14:30` |
| Range (same year) | year once at the end, en dash with spaces | `Jun 1 – Jun 30, 2026` |
| Range (cross-month) | same rule | `Jun 28 – Jul 5, 2026` |
| Range (cross-year) | full date both sides | `Dec 30, 2025 – Jan 2, 2026` |
| Gantt timeline day label | omit year | `Jun 7` |
| Gantt timeline month label | month + year (the only place year appears on the axis) | `Jun 2026` |
| Gantt timeline DOW | width-adaptive | `Mon` → `M` |

### Exemptions (unchanged)

- Pure time labels: `HH:mm` (Canvas flight/task/segment times, STD/STA etc.)
- ISO `YYYY-MM-DD` where machine-readable: API payloads, `<input type="date">` values, calendar cell keys, test data
- Relative times: "2 hours ago" (`formatDistanceToNow`)
- Calendar grid month headers already styled as `JUN` (uppercase short month)

## Architecture

### Shared formatter — `packages/ui/src/lib/format-date.ts` (new)

Single source of truth, exported from `@rois/ui`. No new dependency — built on `Intl.DateTimeFormat('en-US', …)` with cached formatter instances (same pattern as `gantt/src/stores/timezone-store.ts`).

```ts
formatUiDate(d: Date | string, opts?: { timeZone?: string }): string      // "Jun 7, 2026"
formatUiDateTime(d: Date | string, opts?: { timeZone?: string }): string  // "Jun 7, 2026 14:30"
formatUiDateRange(start: Date | string, end: Date | string, opts?: { timeZone?: string }): string
```

- Accepts `Date` or ISO string; date-only strings (`YYYY-MM-DD`) are parsed as calendar dates (no TZ shift).
- Invalid input returns `''` (never throws in render paths).
- `formatUiDateRange` implements the smart-year rules above.

Rationale (vs per-module utils or inline fixes): CLAUDE.md mandates code reuse; `@rois/ui` is already the shared layer; two implementations (date-fns in gantt, dayjs in pbs-portal) of the same spec would drift.

### Canvas timeline — `gantt/src/components/gantt/renderers/base-renderer.ts`

`drawTimelineHeader()` is shared by Live (`time-axis`) and Scenario (`scenario-time-axis.tsx`), so both views update together. The hot path keeps its inline `MON_SHORT` / `DOW_SHORT` arrays — no per-frame `Intl` calls — but labels conform to the standard:

1. **High zoom (dayWidth ≥ 120)**: day label becomes `Jun 7` (was `2026-06-07 Sat`). No DOW in this label — DOW lives in its own row.
2. **DOW row (medium zoom)**: width-adaptive — render `Mon` when it fits at the current `dayWidth`, else `M`. Decide once per zoom level (measure on zoom change), not per frame.
3. **Month labels**: drawn **left-aligned at the x of the month's first day** (was: centered over the visible month span).
   - **Sticky clamp**: when a month's first day is scrolled off-screen left, its label clamps to the viewport's left edge and is pushed out by the next month's label as it approaches (standard sticky-header behavior).
   - **Collision guard**: at low zoom with narrow months, skip a label that would overlap the previous one — keep the **later** month's label (its boundary is the informative one).
4. Month label format stays `Jun 2026`; this is the only place the year appears on the axis.

## Migration sites

### gantt

| Site | File | Change |
|---|---|---|
| Scenario list date range | `components/scenario/scenario-list-item.tsx` | `2026-06-01 ~ 2026-06-30` → `formatUiDateRange` |
| Summary bar day popup | `components/layout/summary-bar.tsx` | `toLocaleDateString()` → `formatUiDate` |
| Crew bids dates | `components/scenario/crew-bids/crew-bids-view.tsx` | `en-GB` "7 Jun 2026" → `formatUiDate` |
| Flight detail dialog | `components/flight/flight-detail-dialog.tsx` | date + "updated at" → `formatUiDate` / `formatUiDateTime` |
| Task detail dialog | `components/roster/task-detail-dialog.tsx` | `MM/dd HH:mm` → `formatUiDateTime` |
| Composition load view | `components/composition/composition-load-view.tsx` | table eff/exp dates → `formatUiDate` |
| Scenario basic info | `components/scenario/scenario-basic-info.tsx` | display text → `formatUiDate` (inputs stay ISO) |
| Dashboard view | `components/shell/dashboard-view.tsx` | today's date display → `formatUiDate` |
| `utils/date.ts` | `formatDayLabel` (`MM/dd EEE`) / `formatDateTime` (`MM/dd HH:mm`) | re-point to standard or delete if unused |

### pbs-portal

| Site | File | Change |
|---|---|---|
| Pairing occurrence bid dialog | `features/pairing/components/pairing-occurrence-bid-dialog.tsx` | raw `2026-06-01 - 2026-06-30` string → `formatUiDateRange` |
| Pairing property config dialog | `features/pairing/components/pairing-property-config-dialog.tsx` | `formatDateRange` helper → `formatUiDateRange` |

Calendar grids (month-grid-calendar `JUN` headers, ISO cell keys) are exempt. `<input type="date">` values and the date-range-picker's internal ISO handling are untouched (browser-controlled); only display text migrates.

### pbs-app

No date display sites found in the current codebase; the rule applies to future code.

## Testing (§Playwright-Required / §No-Illusion)

- Extend existing specs to assert exact new strings (`toContainText`), e.g. scenario list shows `Jun 1 – Jun 30, 2026`; crew-bids shows `Jun 7, 2026`.
- Timeline: assert via Canvas test hook (`window.__ganttTest`) / label probe that high-zoom day label is `Jun 7` (no year), and month label x ≈ month's first-day x.
- Range edge cases (same-year, cross-month, cross-year, invalid input) asserted via page-context evaluation of the `@rois/ui` formatters.
- Run: `npx playwright test --config=config/playwright.config.ts` for the touched gantt/pbs-portal specs; paste PASS/FAIL receipts.

## CLAUDE.md rule (new section)

Add "## UI 日期显示标准（UI Date Display Standard，强制执行）" stating: the universal format, date-time, range rules, timeline exceptions, the exemption list, and that new code MUST use `@rois/ui` `formatUiDate*` — raw `.slice(0, 10)` or `toLocaleDateString()` for user-visible display is a style bug to be fixed on touch.

## Version & help

- `FRONTEND_VERSION +1` (gantt + pbs-portal + packages/ui all touched).
- §Help-Sync at commit time: timeline label behavior is user-visible — check `gantt/src/components/help/topics/` for timeline/axis descriptions and screenshots showing old date formats.

## Out of scope

- Backend message formats (no user-visible backend date strings identified).
- Locale switching / i18n of dates (default language is English per §English-UI).
- Refactoring date *parsing* or storage — transport stays ISO 8601 UTC.
