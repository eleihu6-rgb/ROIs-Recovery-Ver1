# UI Date Display Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One universal user-facing date format (`Jun 7, 2026`) across all frontends, with year-less adaptive gantt timeline labels and month labels anchored at month start — codified as a CLAUDE.md rule.

**Architecture:** Shared `Intl`-based formatters in `@rois/ui` (`formatUiDate` / `formatUiDateTime` / `formatUiDateRange`) consumed by gantt + pbs-portal. Gantt Canvas timeline label rules extracted into a pure, unit-testable module (`timeline-labels.ts`) wired into `drawTimelineHeader` (shared by Live and Scenario views). ~12 display sites migrated.

**Tech Stack:** TypeScript, React 19, Canvas 2D, Playwright (pure-import tests + UI tests), Intl.DateTimeFormat (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-06-06-ui-date-display-standard-design.md`

---

## ⚠️ Worktree caution

This worktree (`feat/ai/regression-playground-v2`) has **unrelated uncommitted changes** (regression-playground e2e work). Every commit step below MUST `git add` only the exact files listed — never `git add -A` / `git add .`.

All commands run from the worktree root:
`/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/.claude/worktrees/regression-v2`

Playwright runs from `e2e/`: `cd e2e && npx playwright test --config=config/playwright.config.ts <spec> --reporter=list`. The new `ui-date-format.spec.ts` is pure Node (no page fixture); if the dev servers aren't running, add `--no-deps --project=gantt` to skip the auth setup project (webServer entries have `reuseExistingServer: true` and will boot vite automatically otherwise).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/ui/src/lib/format-date.ts` (new) | The ONLY implementation of the user-facing date format |
| `packages/ui/src/index.ts` | Export the three formatters |
| `gantt/src/components/gantt/renderers/timeline-labels.ts` (new) | Pure timeline label rules: high-zoom day label, adaptive DOW, month-label layout (anchor/sticky/collision) |
| `gantt/src/components/gantt/renderers/base-renderer.ts` | `drawTimelineHeader` consumes timeline-labels (drawing only, no label logic) |
| `e2e/tests/gantt/ui-date-format.spec.ts` (new) | Pure-import tests for both modules |
| 7 gantt components + `gantt/src/utils/date.ts` | Migrate display sites |
| 2 pbs-portal pairing dialogs | Migrate occurrence range display |
| `e2e/tests/gantt/scenario-create.spec.ts` | Update old-format assertion |
| `CLAUDE.md`, `gantt/src/version.ts` | Project rule + `FRONTEND_VERSION` 86 → 87 |

---

### Task 1: Shared formatters in `@rois/ui`

**Files:**
- Create: `packages/ui/src/lib/format-date.ts`
- Modify: `packages/ui/src/index.ts` (after the `export { cn }` line)
- Test: `e2e/tests/gantt/ui-date-format.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `e2e/tests/gantt/ui-date-format.spec.ts`:

```ts
/**
 * Pure-import tests for the project-wide UI date display standard
 * (CLAUDE.md「UI 日期显示标准」/ spec 2026-06-06-ui-date-display-standard).
 * Runs in Node — no browser, no server needed.
 */
import { test, expect } from '@playwright/test'
import {
  formatUiDate,
  formatUiDateTime,
  formatUiDateRange,
} from '../../../packages/ui/src/lib/format-date'

test.describe('formatUiDate — universal "Jun 7, 2026" standard', () => {
  test('date-only ISO string formats as calendar date (no TZ shift)', () => {
    expect(formatUiDate('2026-06-07')).toBe('Jun 7, 2026')
    expect(formatUiDate('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatUiDate('2026-12-31')).toBe('Dec 31, 2026')
  })

  test('no leading zero on day', () => {
    expect(formatUiDate('2026-06-07')).not.toContain('07')
  })

  test('Date instance formats in the given IANA timezone', () => {
    // 2026-06-07T23:30Z is already Jun 8 in Tokyo, still Jun 7 in Toronto
    const d = new Date('2026-06-07T23:30:00Z')
    expect(formatUiDate(d, { timeZone: 'Asia/Tokyo' })).toBe('Jun 8, 2026')
    expect(formatUiDate(d, { timeZone: 'America/Toronto' })).toBe('Jun 7, 2026')
    expect(formatUiDate(d, { timeZone: 'UTC' })).toBe('Jun 7, 2026')
  })

  test('invalid input returns empty string, never throws', () => {
    expect(formatUiDate(null)).toBe('')
    expect(formatUiDate(undefined)).toBe('')
    expect(formatUiDate('')).toBe('')
    expect(formatUiDate('not-a-date')).toBe('')
    expect(formatUiDate(new Date('invalid'))).toBe('')
  })
})

test.describe('formatUiDateTime — "Jun 7, 2026 14:30" (24-hour)', () => {
  test('full ISO datetime in UTC', () => {
    expect(formatUiDateTime('2026-06-07T14:30:00Z', { timeZone: 'UTC' })).toBe('Jun 7, 2026 14:30')
  })

  test('midnight renders 00:00 (h23, not 24:00)', () => {
    expect(formatUiDateTime('2026-06-07T00:00:00Z', { timeZone: 'UTC' })).toBe('Jun 7, 2026 00:00')
  })

  test('date-only string gets 00:00', () => {
    expect(formatUiDateTime('2026-06-07')).toBe('Jun 7, 2026 00:00')
  })
})

test.describe('formatUiDateRange — smart year', () => {
  test('same year: year once at the end', () => {
    expect(formatUiDateRange('2026-06-01', '2026-06-30')).toBe('Jun 1 – Jun 30, 2026')
  })

  test('cross month, same year', () => {
    expect(formatUiDateRange('2026-06-28', '2026-07-05')).toBe('Jun 28 – Jul 5, 2026')
  })

  test('cross year: full date both sides', () => {
    expect(formatUiDateRange('2025-12-30', '2026-01-02')).toBe('Dec 30, 2025 – Jan 2, 2026')
  })

  test('same calendar day collapses to a single date', () => {
    expect(formatUiDateRange('2026-06-07', '2026-06-07')).toBe('Jun 7, 2026')
  })

  test('one side missing falls back to the other; both missing → empty', () => {
    expect(formatUiDateRange('2026-06-07', null)).toBe('Jun 7, 2026')
    expect(formatUiDateRange(null, '2026-06-07')).toBe('Jun 7, 2026')
    expect(formatUiDateRange(null, null)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --no-deps --project=gantt tests/gantt/ui-date-format.spec.ts --reporter=list
```
Expected: FAIL — `Cannot find module '../../../packages/ui/src/lib/format-date'`

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/lib/format-date.ts`:

```ts
/**
 * Unified UI date display formatters — project-wide standard
 * (root CLAUDE.md「UI 日期显示标准」). All user-visible dates render as
 * "Jun 7, 2026"; date-times as "Jun 7, 2026 14:30" (24-hour); ranges as
 * "Jun 1 – Jun 30, 2026" (year once when shared).
 *
 * Accepts Date or ISO string. Date-only strings ("2026-06-07") are treated
 * as calendar dates — no timezone shift. Invalid input returns '' so render
 * paths never throw.
 */

const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface UiDateOptions {
  /** IANA zone id (e.g. "America/Toronto"); defaults to the runtime's local timezone */
  timeZone?: string
}

interface DateParts {
  year: number
  month: number // 0-11
  day: number
  hour: string // '00'-'23'
  minute: string // '00'-'59'
}

// Intl.DateTimeFormat construction is expensive — cache one per timezone
// (same pattern as gantt's timezone-store).
const partsFmtCache = new Map<string, Intl.DateTimeFormat>()

const getPartsFormatter = (timeZone?: string): Intl.DateTimeFormat => {
  const key = timeZone ?? '__local__'
  let fmt = partsFmtCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    partsFmtCache.set(key, fmt)
  }
  return fmt
}

const resolveParts = (input: Date | string | null | undefined, timeZone?: string): DateParts | null => {
  if (input == null || input === '') return null
  if (typeof input === 'string') {
    const m = DATE_ONLY_RE.exec(input)
    if (m) {
      const month = Number(m[2]) - 1
      const day = Number(m[3])
      if (month < 0 || month > 11 || day < 1 || day > 31) return null
      return { year: Number(m[1]), month, day, hour: '00', minute: '00' }
    }
  }
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return null
  const parts: Record<string, string> = {}
  for (const p of getPartsFormatter(timeZone).formatToParts(d)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    hour: parts.hour ?? '00',
    minute: parts.minute ?? '00',
  }
}

const dateStr = (p: DateParts): string => `${MON_SHORT[p.month]} ${p.day}, ${p.year}`
const monthDayStr = (p: DateParts): string => `${MON_SHORT[p.month]} ${p.day}`

/** "Jun 7, 2026" */
export const formatUiDate = (input: Date | string | null | undefined, opts?: UiDateOptions): string => {
  const p = resolveParts(input, opts?.timeZone)
  return p ? dateStr(p) : ''
}

/** "Jun 7, 2026 14:30" (24-hour) */
export const formatUiDateTime = (input: Date | string | null | undefined, opts?: UiDateOptions): string => {
  const p = resolveParts(input, opts?.timeZone)
  return p ? `${dateStr(p)} ${p.hour}:${p.minute}` : ''
}

/**
 * "Jun 1 – Jun 30, 2026" (same year: year once) ·
 * "Dec 30, 2025 – Jan 2, 2026" (cross-year: full both sides) ·
 * same calendar day collapses to a single date.
 */
export const formatUiDateRange = (
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  opts?: UiDateOptions,
): string => {
  const a = resolveParts(start, opts?.timeZone)
  const b = resolveParts(end, opts?.timeZone)
  if (!a && !b) return ''
  if (!a) return dateStr(b as DateParts)
  if (!b) return dateStr(a)
  if (a.year === b.year && a.month === b.month && a.day === b.day) return dateStr(a)
  if (a.year === b.year) return `${monthDayStr(a)} – ${monthDayStr(b)}, ${a.year}`
  return `${dateStr(a)} – ${dateStr(b)}`
}
```

In `packages/ui/src/index.ts`, directly below `export { cn } from "./lib/utils";` add:

```ts
export {
  formatUiDate,
  formatUiDateTime,
  formatUiDateRange,
  type UiDateOptions,
} from "./lib/format-date";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --no-deps --project=gantt tests/gantt/ui-date-format.spec.ts --reporter=list
```
Expected: all `formatUi*` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/format-date.ts packages/ui/src/index.ts e2e/tests/gantt/ui-date-format.spec.ts
git commit -m "feat(ui): shared formatUiDate/DateTime/DateRange — 'Jun 7, 2026' UI date standard"
```

---

### Task 2: Pure timeline label helpers

**Files:**
- Create: `gantt/src/components/gantt/renderers/timeline-labels.ts`
- Test: `e2e/tests/gantt/ui-date-format.spec.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `e2e/tests/gantt/ui-date-format.spec.ts`:

```ts
import {
  highZoomDayLabel,
  pickDowMode,
  dayCellLabel,
  layoutMonthLabels,
  monthLabel,
  type MonthSpan,
} from '../../../gantt/src/components/gantt/renderers/timeline-labels'

test.describe('timeline labels — year-less day labels, adaptive DOW', () => {
  test('high-zoom day label omits the year: "Jun 7"', () => {
    expect(highZoomDayLabel(5, 7)).toBe('Jun 7')
    expect(highZoomDayLabel(0, 1)).toBe('Jan 1')
  })

  test('DOW mode adapts to column width (Mon → M → none)', () => {
    // sample widths: "30 Wed" ≈ 38px, "30 W" ≈ 26px at header font
    expect(pickDowMode(60, 38, 26)).toBe('full')
    expect(pickDowMode(40, 38, 26)).toBe('letter')
    expect(pickDowMode(20, 38, 26)).toBe('none')
  })

  test('day cell label per mode', () => {
    expect(dayCellLabel(7, 1, 'full')).toBe('7 Mon')
    expect(dayCellLabel(7, 1, 'letter')).toBe('7 M')
    expect(dayCellLabel(7, 1, 'none')).toBe('7')
  })

  test('month label keeps the year: "Jun 2026"', () => {
    expect(monthLabel(2026, 5)).toBe('Jun 2026')
  })
})

test.describe('timeline month labels — anchored at month start', () => {
  const measure = (s: string): number => s.length * 7 // deterministic stub

  test('label anchors at the first day of the month (left-aligned), not centered', () => {
    const spans: MonthSpan[] = [
      { startX: 100, endX: 700, year: 2026, month: 5 },
      { startX: 700, endX: 1320, year: 2026, month: 6 },
    ]
    const out = layoutMonthLabels(spans, 1440, measure)
    expect(out).toHaveLength(2)
    expect(out[0].x).toBe(104) // startX + 4
    expect(out[1].x).toBe(704)
    expect(out[0].label).toBe('Jun 2026')
    expect(out[1].label).toBe('Jul 2026')
  })

  test('sticky clamp: month scrolled off-screen left pins its label at x=4', () => {
    const spans: MonthSpan[] = [{ startX: -500, endX: 600, year: 2026, month: 5 }]
    const out = layoutMonthLabels(spans, 1440, measure)
    expect(out[0].x).toBe(4)
  })

  test('push-out: approaching next-month boundary pushes the pinned label left', () => {
    // "Jun 2026" → width 56 with stub; endX 40 → x = 40 - 56 - 4 = -20
    const spans: MonthSpan[] = [
      { startX: -500, endX: 40, year: 2026, month: 5 },
      { startX: 40, endX: 900, year: 2026, month: 6 },
    ]
    const out = layoutMonthLabels(spans, 1440, measure)
    const jun = out.find((l) => l.month === 5)
    const jul = out.find((l) => l.month === 6)
    expect(jul?.x).toBe(44)
    if (jun) expect(jun.x + jun.width).toBeLessThanOrEqual(44 - 8 + 56) // pushed left of Jul
  })

  test('collision guard keeps the LATER month when labels overlap', () => {
    // months only 30px wide; labels ~56px → overlap; later month wins
    const spans: MonthSpan[] = [
      { startX: 0, endX: 30, year: 2026, month: 0 },
      { startX: 30, endX: 60, year: 2026, month: 1 },
      { startX: 60, endX: 600, year: 2026, month: 2 },
    ]
    const out = layoutMonthLabels(spans, 1440, measure)
    expect(out.some((l) => l.month === 2)).toBe(true) // later month kept
    // any kept pair must not overlap
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].x + out[i - 1].width + 8).toBeLessThanOrEqual(out[i].x)
    }
  })

  test('fully off-screen months produce no label', () => {
    const spans: MonthSpan[] = [
      { startX: -900, endX: -300, year: 2026, month: 4 },
      { startX: 1500, endX: 2000, year: 2026, month: 7 },
    ]
    expect(layoutMonthLabels(spans, 1440, measure)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --no-deps --project=gantt tests/gantt/ui-date-format.spec.ts --reporter=list
```
Expected: FAIL — `Cannot find module '.../timeline-labels'` (Task 1 tests still PASS).

- [ ] **Step 3: Write the implementation**

Create `gantt/src/components/gantt/renderers/timeline-labels.ts`:

```ts
/**
 * Pure label/layout rules for the gantt timeline header (Live + Scenario).
 * Extracted from base-renderer so the date-display standard is unit-testable
 * (root CLAUDE.md「UI 日期显示标准」): day labels omit the year ("Jun 7"),
 * DOW adapts to column width ("Mon" → "M" → hidden), and month labels anchor
 * at the first day of the month with sticky clamping at the viewport edge.
 *
 * No Canvas/DOM access here — drawTimelineHeader passes a measure() callback.
 */

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
export const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** High-zoom per-day label: "Jun 7" — the year lives in the month row only. */
export const highZoomDayLabel = (month: number, date: number): string =>
  `${MON_SHORT[month]} ${date}`

export type DowMode = 'full' | 'letter' | 'none'

/**
 * How much day-of-week fits beside the day number at the current column
 * width. fullW / letterW are measured widths of the widest samples
 * ("30 Wed" / "30 W") at the bottom-row font.
 */
export const pickDowMode = (dayWidth: number, fullW: number, letterW: number): DowMode =>
  dayWidth >= fullW + 8 ? 'full' : dayWidth >= letterW + 6 ? 'letter' : 'none'

/** Bottom-row day cell: "7 Mon" / "7 M" / "7" per available width. */
export const dayCellLabel = (date: number, dow: number, mode: DowMode): string =>
  mode === 'full' ? `${date} ${DOW_SHORT[dow]}`
    : mode === 'letter' ? `${date} ${DOW_LETTER[dow]}`
    : String(date)

/** Month row label: "Jun 2026" — the only place the year appears on the axis. */
export const monthLabel = (year: number, month: number): string =>
  `${MON_SHORT[month]} ${year}`

export interface MonthSpan {
  /** x of the month's first rendered day (may be negative when scrolled off) */
  startX: number
  /** x of the next month's first day (or range end for the last span) */
  endX: number
  year: number
  month: number // 0-11
}

export interface MonthLabelPos {
  x: number
  width: number
  year: number
  month: number
  label: string
}

/**
 * Anchor each month label left-aligned at the month's first day, with:
 * - sticky clamp: a month scrolled past the left edge pins its label at x=4,
 *   pushed back out leftward by the approaching next-month boundary
 * - collision guard: overlapping labels are resolved right-to-left keeping
 *   the LATER month (its start boundary is the informative one)
 */
export const layoutMonthLabels = (
  spans: MonthSpan[],
  viewportWidth: number,
  measure: (label: string) => number,
): MonthLabelPos[] => {
  const placed: MonthLabelPos[] = []
  for (const s of spans) {
    if (s.endX <= 0 || s.startX >= viewportWidth) continue
    const label = monthLabel(s.year, s.month)
    const width = measure(label)
    let x = s.startX + 4
    if (x < 4) x = Math.min(4, s.endX - width - 4) // sticky clamp + push-out
    placed.push({ x, width, year: s.year, month: s.month, label })
  }
  // Collision guard — keep the later month's label on overlap
  const out: MonthLabelPos[] = []
  let minRightX = Infinity
  for (let i = placed.length - 1; i >= 0; i--) {
    const l = placed[i]
    if (l.x + l.width + 8 > minRightX) continue
    out.unshift(l)
    minRightX = l.x
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --no-deps --project=gantt tests/gantt/ui-date-format.spec.ts --reporter=list
```
Expected: ALL tests in the file PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/renderers/timeline-labels.ts e2e/tests/gantt/ui-date-format.spec.ts
git commit -m "feat(gantt): pure timeline label rules — year-less day labels, adaptive DOW, anchored month labels"
```

---

### Task 3: Wire timeline-labels into `drawTimelineHeader`

**Files:**
- Modify: `gantt/src/components/gantt/renderers/base-renderer.ts:355-455`

`drawTimelineHeader` serves BOTH Live (`TimeAxis`) and Scenario (`scenario-time-axis.tsx`) — one change updates both. Keep the hot path allocation-free: no `Intl` calls, one extra O(days) pre-pass per frame.

- [ ] **Step 1: Replace local label constants with imports**

At `base-renderer.ts:355-356`, delete:

```ts
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
```

and add to the import block at the top of the file:

```ts
import {
  highZoomDayLabel,
  pickDowMode,
  dayCellLabel,
  layoutMonthLabels,
  type MonthSpan,
} from './timeline-labels'
```

(If anything else in the file references `DOW_SHORT`/`MON_SHORT`, import those too from `./timeline-labels` — check with `grep -n "DOW_SHORT\|MON_SHORT" gantt/src/components/gantt/renderers/base-renderer.ts`.)

- [ ] **Step 2: High-zoom day label → "Jun 7"**

At `base-renderer.ts:410-417`, replace:

```ts
    if (dayWidth >= 120) {
      // ── High zoom: top row = full local date per day ──
      const label = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')} ${DOW_SHORT[dow]}`
```

with:

```ts
    if (dayWidth >= 120) {
      // ── High zoom: top row = "Jun 7" per day (UI date standard: no year on day labels) ──
      const label = highZoomDayLabel(month, date)
```

(the `ctx.font` / `fillStyle` / `fillText` / `monthLabelHits.push` lines after it stay unchanged).

- [ ] **Step 3: Bottom row → day number + adaptive DOW**

Before the `for (let di = 0; ...)` day loop (just above `base-renderer.ts:390 let lastMonthLabel = ''`), add the once-per-frame DOW mode decision and delete the `lastMonthLabel` line:

```ts
  // UI date standard: bottom-row day cells show "7 Mon" / "7 M" / "7" per column width
  ctx.font = `${FONT_SIZE_HEADER - 1}px ${FONT_FAMILY}`
  const dowMode = dayWidth >= 120
    ? 'none' as const
    : pickDowMode(dayWidth, ctx.measureText('30 Wed').width, ctx.measureText('30 W').width)
```

Inside the loop, replace the whole `else { ... }` branch's month-label block AND bottom-row block (`base-renderer.ts:418-454`, from `// ── Normal/zoomed out: top row = month label centered in span ──` through the end of the `else`) with:

```ts
    } else if (dayWidth >= 12) {
      // ── Bottom row: day number + adaptive DOW ("7 Mon" / "7 M" / "7") ──
      const cell = dayCellLabel(date, dow, dowMode)
      ctx.font = `${dayWidth >= 40 ? FONT_SIZE_HEADER - 1 : 9}px ${FONT_FAMILY}`
      ctx.fillStyle = isWeekend ? colors.textColorWeekend : colors.textColorSecondary
      if (dowMode === 'none') {
        // narrow columns: centered day number (existing behavior)
        const textW = ctx.measureText(cell).width
        const centerX = x + Math.min(dayWidth, 30) / 2 - textW / 2
        ctx.fillText(cell, Math.max(centerX, x + 2), bottomRowY + 2)
      } else {
        ctx.fillText(cell, x + 4, bottomRowY + 2)
      }
    }
```

- [ ] **Step 4: Month labels → anchored at month start (after the day loop)**

Directly after the day loop's closing brace (was `base-renderer.ts:455`), add:

```ts
  // ── Month row: labels anchored at each month's first day (sticky-clamped) ──
  if (dayWidth < 120) {
    const monthSpans: MonthSpan[] = []
    for (let di = 0; di < days.length; di++) {
      const d = days[di]
      if (di === 0 || d.date === 1) {
        const startX = msToX(d.midnightUtcMs, rangeStartMs, pxPerHour) - scrollX
        if (monthSpans.length > 0) monthSpans[monthSpans.length - 1].endX = startX
        monthSpans.push({ startX, endX: 0, year: d.year, month: d.month })
      }
    }
    if (monthSpans.length > 0) {
      monthSpans[monthSpans.length - 1].endX = msToX(rangeEndMs, rangeStartMs, pxPerHour) - scrollX
    }
    ctx.font = `${FONT_SIZE_HEADER}px ${FONT_FAMILY}`
    ctx.fillStyle = colors.textColor
    for (const l of layoutMonthLabels(monthSpans, canvasWidth, (s) => ctx.measureText(s).width)) {
      ctx.fillText(l.label, l.x, 3)
      monthLabelHits.push({ x: l.x, width: l.width, year: l.year, month: l.month })
    }
  }
```

Note: the old month-label code lived INSIDE the day loop and skipped off-screen days (`continue` at line 395), which is why a partially-scrolled month's label drifted. The pre-pass walks ALL days, so the true month start (even off-screen) anchors the label; `layoutMonthLabels` culls invisible spans.

- [ ] **Step 5: Typecheck + full pure-test run**

```bash
cd gantt && npx tsc --noEmit -p tsconfig.json
cd ../e2e && npx playwright test --config=config/playwright.config.ts --no-deps --project=gantt tests/gantt/ui-date-format.spec.ts --reporter=list
```
Expected: tsc clean for the touched files (note: 2 PRE-EXISTING gantt tsc errors are known — only new errors block); all pure tests PASS.

- [ ] **Step 6: Visual smoke in the running app**

With the dev stack running (vite auto-starts via Playwright webServer), run an existing timeline-touching spec to prove the header still renders and month clicks still work:

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts tests/gantt/pane-chrome-timeline-toolbar.spec.ts --reporter=list
```
Expected: PASS (or identical pre-existing failures — compare against `git stash` baseline if unsure; do NOT accept new failures).

- [ ] **Step 7: Commit**

```bash
git add gantt/src/components/gantt/renderers/base-renderer.ts
git commit -m "feat(gantt): timeline header on UI date standard — 'Jun 7' day labels, adaptive DOW, month labels at month start"
```

---

### Task 4: Migrate gantt display sites

**Files:**
- Modify: `gantt/src/components/scenario/scenario-list-item.tsx:88`
- Modify: `gantt/src/components/layout/summary-bar.tsx:119`
- Modify: `gantt/src/components/scenario/crew-bids/crew-bids-view.tsx:15-19`
- Modify: `gantt/src/components/flight/flight-detail-dialog.tsx:61,110`
- Modify: `gantt/src/utils/date.ts:20-24` (drives task-detail-dialog)
- Modify: `gantt/src/components/composition/composition-load-view.tsx:170-171`
- Modify: `gantt/src/components/shell/dashboard-view.tsx:115`
- Modify: `e2e/tests/gantt/scenario-create.spec.ts:32`

- [ ] **Step 1: Update the e2e assertion FIRST (the regression test)**

In `e2e/tests/gantt/scenario-create.spec.ts`, add to the imports:

```ts
import { formatUiDateRange } from '../../../packages/ui/src/lib/format-date'
```

and replace line 32:

```ts
  const dateRangeText = `${input.startDate} ~ ${input.endDate}`
```

with:

```ts
  // UI date standard: "May 1 – May 31, 2026"
  const dateRangeText = formatUiDateRange(input.startDate, input.endDate)
```

- [ ] **Step 2: Run it to verify it fails against current UI**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts tests/gantt/scenario-create.spec.ts --reporter=list
```
Expected: FAIL — list item still shows `2026-05-01 ~ 2026-05-31`. (Requires live-server + gantt running; webServer config auto-starts vite, live-server must already be up per the dev environment.)

- [ ] **Step 3: Migrate the sites**

`scenario-list-item.tsx` — add `formatUiDateRange` to the existing `@rois/ui` import (line 4-12), then replace line 88:

```tsx
          {formatUiDateRange(item.strDtLoc.slice(0, 10), item.endDtLoc.slice(0, 10))} · {optimizationLabel}
```

(`.slice(0, 10)` here extracts the calendar date from a local datetime string for the formatter — that's parsing, not display, and stays.)

`summary-bar.tsx` — add `import { formatUiDate } from '@rois/ui'` (or extend an existing `@rois/ui` import), replace line 119:

```tsx
            {formatUiDate(popup.summary.date)}
```

`crew-bids-view.tsx` — add `import { formatUiDate } from '@rois/ui'`, replace `fmtDate` (lines 15-19):

```ts
function fmtDate(raw: string): string {
  return formatUiDate(raw) || raw
}
```

`flight-detail-dialog.tsx` — add `formatUiDate, formatUiDateTime` to imports from `@rois/ui`; replace line 61:

```ts
  const flightDateFull = flight.fltDt ? formatUiDate(flight.fltDt.slice(0, 10)) : '—'
```

and line 110:

```ts
  const updatedAt = formatUiDateTime(new Date())
```

(`flightDateShort` `'MMM d'` at line 62 already conforms to the year-less style and stays.)

`gantt/src/utils/date.ts` — delete `formatDayLabel` (line 20-21, zero usages) and re-point `formatDateTime` (line 23-24) to the standard:

```ts
/** Format a date-time per the UI date standard: "Jun 7, 2026 14:30" */
export const formatDateTime = (d: Date): string => format(d, 'MMM d, yyyy HH:mm')
```

(task-detail-dialog's Start/End (UTC) rows pick this up automatically.)

`composition-load-view.tsx` — add `formatUiDate` to the existing `@rois/ui` import; replace lines 170-171:

```tsx
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.effDt ? formatUiDate(row.effDt.slice(0, 10)) : '-'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.expDt ? formatUiDate(row.expDt.slice(0, 10)) : '-'}</td>
```

`dashboard-view.tsx` — add `formatUiDate` import from `@rois/ui`; replace line 115:

```ts
  const today = formatUiDate(new Date())
```

Leave untouched (machine-readable, exempt): all `.slice(0, 10)` in stores (`roster-store`, `pairing-store`, `draft-store`, `summary-store`, `gantt-view-store`, `crew-store`, `flight-store`, `filter-store`), `composition-load-dialog.tsx` (`<input type="date">` values), `scenario-basic-info.tsx` `toDateInputValue` (input value), `scenario-list-panel.tsx` (API params), `import-pbs-dialog.tsx` (input default), `gantt-utils.ts` / `timezone-switcher.tsx` (internal keys).

- [ ] **Step 4: Typecheck + run the regression spec**

```bash
cd gantt && npx tsc --noEmit -p tsconfig.json
cd ../e2e && npx playwright test --config=config/playwright.config.ts tests/gantt/scenario-create.spec.ts --reporter=list
```
Expected: tsc clean (modulo the 2 known pre-existing errors); scenario-create PASS with the new `May 1 – May 31, 2026` assertion.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/scenario/scenario-list-item.tsx gantt/src/components/layout/summary-bar.tsx gantt/src/components/scenario/crew-bids/crew-bids-view.tsx gantt/src/components/flight/flight-detail-dialog.tsx gantt/src/utils/date.ts gantt/src/components/composition/composition-load-view.tsx gantt/src/components/shell/dashboard-view.tsx e2e/tests/gantt/scenario-create.spec.ts
git commit -m "feat(gantt): migrate user-visible dates to 'Jun 7, 2026' standard"
```

---

### Task 5: Migrate pbs-portal display sites

**Files:**
- Modify: `pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx:32-35`
- Modify: `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx:341` (same duplicated helper)

- [ ] **Step 1: Replace both `formatDateRange` helpers**

In BOTH files, add the import:

```ts
import { formatUiDateRange } from "@rois/ui";
```

and replace the local helper (occurrence-bid-dialog lines 32-35; property-config-dialog line 341, same shape):

```ts
const formatDateRange = (occurrence: PbsPairingOccurrence) =>
  formatUiDateRange(occurrence.startDate, occurrence.endDate);
```

(`formatUiDateRange` already collapses equal start/end to a single date, matching the old ternary's behavior; both files keep their local one-liner since it adapts the occurrence shape.)

- [ ] **Step 2: Typecheck + portal smoke**

```bash
cd pbs-portal && npx tsc --noEmit -p tsconfig.json
cd ../e2e && npx playwright test --config=config/playwright.config.ts tests/pbs-portal/portal-smoke.spec.ts --reporter=list
```
Expected: tsc clean; portal-smoke PASS (occurrence dialogs are data-dependent — the format itself is proven by the Task 1 pure tests; smoke proves the portal still builds and renders).

- [ ] **Step 3: Commit**

```bash
git add pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
git commit -m "feat(pbs-portal): pairing occurrence ranges on 'Jun 1 – Jun 30, 2026' standard"
```

---

### Task 6: CLAUDE.md rule, version bump, full sweep, help-sync

**Files:**
- Modify: `CLAUDE.md` (insert new section after「样式与排版标准」, before「开发注意事项」)
- Modify: `gantt/src/version.ts:18`
- Check: `gantt/src/components/help/topics/`

- [ ] **Step 1: Add the project rule to CLAUDE.md**

Insert this section after the「样式与排版标准」section (immediately before `## 开发注意事项`):

```markdown
## UI 日期显示标准（UI Date Display Standard，强制执行）

> 所有展示给用户（planner / crew / 管理员）的日期，全平台（gantt / pbs-portal / pbs-app / packages/ui 及后端用户可见消息）统一以下格式。机器可读场景不受影响。

| 场景 | 格式 | 示例 |
|------|------|------|
| 日期 | 英文短月名 + 日（无前导零）+ 年 | `Jun 7, 2026` |
| 日期 + 时间 | 日期 + 24 小时 `HH:mm` | `Jun 7, 2026 14:30` |
| 日期范围（同年） | 年份只写一次，en dash 两侧空格 | `Jun 1 – Jun 30, 2026` |
| 日期范围（跨年） | 两侧完整日期 | `Dec 30, 2025 – Jan 2, 2026` |
| Gantt 时间轴日标签（Live + Scenario 共用） | 省略年份；DOW 随列宽自适应 `Mon` → `M` → 隐藏 | `Jun 7` · `7 Mon` |
| Gantt 时间轴月标签 | 月 + 年（时间轴上唯一出现年份处），左对齐锚定在每月 1 日，滚出视口时 sticky 钳制在左缘 | `Jun 2026` |

- **唯一实现**：`@rois/ui` 导出的 `formatUiDate` / `formatUiDateTime` / `formatUiDateRange`（`packages/ui/src/lib/format-date.ts`）；Gantt Canvas 时间轴规则在 `gantt/src/components/gantt/renderers/timeline-labels.ts`（热路径不调 Intl）。新代码一律调用上述函数，**禁止**用 `.slice(0, 10)`、`toLocaleDateString()` 等自行拼接用户可见日期——发现即视同样式 bug，改到的文件必须顺手修正。
- **豁免（保持原样）**：纯时间标签 `HH:mm`；机器可读 ISO `YYYY-MM-DD`（API 载荷、`<input type="date">` value、日历单元格 key、测试数据）；相对时间（"2 hours ago"）；日历网格大写月标（`JUN`）。
```

- [ ] **Step 2: Bump FRONTEND_VERSION**

In `gantt/src/version.ts` line 18: `export const FRONTEND_VERSION = 86` → `87`. (gantt + pbs-portal + packages/ui are all frontend → single +1.)

- [ ] **Step 3: Help-sync check (§Help-Sync — commit-time, once)**

```bash
grep -rln "2026-\|YYYY-MM-DD\|date label\|timeline" gantt/src/components/help/topics/ | head
```

Update any help article describing timeline date labels / date formats to the new behavior (`Jun 7` day labels, adaptive DOW, month label at month start). If a help screenshot shows the timeline header, re-capture per the 2× DPR convention (`e2e/scripts/capture-help-screenshots.ts`) and update the count table in `e2e/tests/gantt/help/help-screenshots.spec.ts` if counts change. Then run:

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/help --reporter=list
```
Expected: PASS, except the KNOWN pre-existing failure (`scenario-run.png` missing — 'Running an optimisation' is known-red since main 4ec4977; that one failure is acceptable, any other is not).

- [ ] **Step 4: Full affected-suite sweep**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts tests/gantt/ui-date-format.spec.ts tests/gantt/scenario-create.spec.ts tests/gantt/pane-chrome-timeline-toolbar.spec.ts tests/pbs-portal/portal-smoke.spec.ts --reporter=list
```
Expected: ALL PASS. Paste the summary into the completion message (§No-Illusion).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md gantt/src/version.ts
# plus any help topic/screenshot files actually changed in Step 3
git commit -m "docs: UI date display standard as mandatory project rule; bump FRONTEND_VERSION to 87"
```

---

## Acceptance checklist (maps to spec)

- [ ] `formatUiDate('2026-06-07')` → `Jun 7, 2026` (pure test receipt)
- [ ] Timeline high zoom shows `Jun 7`, no year, both Live & Scenario (shared renderer + smoke spec)
- [ ] DOW adapts `Mon` → `M` → hidden by column width (pure test receipt)
- [ ] Month label anchored at month's 1st day, sticky-clamped, later-month-wins on collision (pure test receipt)
- [ ] Scenario list shows `May 1 – May 31, 2026` (scenario-create spec receipt)
- [ ] No remaining display-path `toLocaleDateString()` / old formats in migrated files
- [ ] CLAUDE.md rule added; `FRONTEND_VERSION` = 87; help topics checked
