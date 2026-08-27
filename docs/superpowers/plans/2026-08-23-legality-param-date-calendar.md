# Legality Param Date Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calendar icon beside Eff/Exp Date (and matching date) cells in legality param editors so admins can type or pick `YYYY-MM-DD`.

**Architecture:** Extend `CellFormat` with `'date'`, detect `Eff Date` / `Exp Date` headers in `param-format.ts`, and enhance `ParamCellInput` with a Popover calendar that reuses `@rois/ui` calendar helpers. All editors already route through `ParamCellInput`, so Rule Templates / Rule Sets / dialogs pick up the change with no rule-code special case.

**Tech Stack:** React 19, Vitest, Playwright, `@rois/ui` (`Popover`, `Button`, `buildCalendarCells`, `parseIsoDate`, …), lucide-react `CalendarDays`.

## Global Constraints

- Stored cell values remain `YYYY-MM-DD` only (no display-format change in `param_json`).
- Detect date columns by header `/^(eff|exp)\s*date$/i` only (v1).
- Keep existing text input; calendar is additive beside it.
- UI copy in English; icon button uses token spacing (`h-7 w-7`, `gap-1` / `gap-1.5`).
- Do **not** `git commit` unless the user explicitly asks (§No-Auto-Commit).
- UI changes require Playwright that drives the real Gantt UI (§Simulate-User / §No-Illusion).

## File map

| File | Responsibility |
|------|----------------|
| `gantt/src/utils/param-format.ts` | `'date'` format, detection, validation, tooltip |
| `gantt/src/utils/__tests__/param-format.test.ts` | Unit tests for detection + validation |
| `gantt/src/components/legality/param-cell-input.tsx` | Text + calendar popover for `'date'` |
| `e2e/tests/gantt/legality-param-date-calendar.spec.ts` | Playwright: pick Eff/Exp on 7509 |

No changes to `legality-param-table-editor.tsx` / `param-row-dialog.tsx` beyond what flows through `ParamCellInput` + `detectColumnFormat`.

---

### Task 1: Date format detection and validation

**Files:**
- Modify: `gantt/src/utils/param-format.ts`
- Create: `gantt/src/utils/__tests__/param-format.test.ts`

**Interfaces:**
- Consumes: existing `CellFormat`, `detectColumnFormat`, `validateCell`, `getColumnTooltip`, `isDraftValid`
- Produces: `CellFormat` includes `'date'`; `detectColumnFormat` returns `'date'` for Eff/Exp Date headers; `validateCell(..., 'date')` accepts real ISO calendar days

- [x] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  detectColumnFormat,
  getColumnTooltip,
  isDraftValid,
  validateCell,
} from '../param-format'

describe('param-format date columns', () => {
  it('detects Eff Date and Exp Date as date', () => {
    expect(detectColumnFormat('Eff Date', [])).toBe('date')
    expect(detectColumnFormat('Exp Date', [])).toBe('date')
    expect(detectColumnFormat('eff date', [])).toBe('date')
    expect(detectColumnFormat('EXP DATE', [])).toBe('date')
  })

  it('does not treat unrelated headers as date', () => {
    expect(detectColumnFormat('Crew A', ['2026-08-01'])).toBe('text')
    expect(detectColumnFormat('Start Date', [])).toBe('text')
    expect(detectColumnFormat('Period', ['28'])).toBe('integer')
  })

  it('validates YYYY-MM-DD calendar days', () => {
    expect(validateCell('2026-08-01', 'date')).toBeNull()
    expect(validateCell('', 'date')).toBe('Required')
    expect(validateCell('08/01/2026', 'date')).toBe('Use YYYY-MM-DD (e.g. 2026-08-01)')
    expect(validateCell('2026-02-31', 'date')).toBe('Use YYYY-MM-DD (e.g. 2026-08-01)')
  })

  it('tooltip and draft validity use date rules', () => {
    expect(getColumnTooltip('Eff Date', 'date')).toContain('YYYY-MM-DD')
    expect(isDraftValid(['A', 'B', '2026-08-01', '2026-08-31'], ['text', 'text', 'date', 'date'])).toBe(true)
    expect(isDraftValid(['A', 'B', 'bad', '2026-08-31'], ['text', 'text', 'date', 'date'])).toBe(false)
  })
})
```

- [x] **Step 2: Run tests — expect FAIL**

Run:

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run src/utils/__tests__/param-format.test.ts
```

Expected: FAIL (`'date'` not in `CellFormat` / detection returns `'text'`).

- [x] **Step 3: Implement minimal `param-format.ts` changes**

Replace / extend as follows (keep existing applicability / hhmm / numeric logic):

```ts
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE_HEADER_RE = /^(eff|exp)\s*date$/i

export type CellFormat = 'hhmm' | 'integer' | 'numeric' | 'applicability' | 'text' | 'date'

const isRealIsoDate = (value: string): boolean => {
  if (!ISO_DATE_RE.test(value)) return false
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(5, 7))
  const d = Number(value.slice(8, 10))
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export const detectColumnFormat = (header: string, existingValues: string[]): CellFormat => {
  if (APPLICABILITY_RE.test(header)) return 'applicability'
  if (DATE_HEADER_RE.test(header)) return 'date'
  if (/HH:MM/i.test(header)) return 'hhmm'
  // ... existing nonEmpty heuristics unchanged ...
}

export const validateCell = (value: string, format: CellFormat): string | null => {
  if (format === 'applicability') {
    return value.trim() === '' ? 'Required' : null
  }
  if (value.trim() === '') return 'Required'
  if (format === 'date' && !isRealIsoDate(value.trim())) {
    return 'Use YYYY-MM-DD (e.g. 2026-08-01)'
  }
  // ... existing hhmm / integer / numeric checks ...
}

export const getColumnTooltip = (header: string, format: CellFormat): string => {
  // ... existing applicability / hhmm / numeric ...
  if (format === 'date') return `${header} — Format: YYYY-MM-DD (e.g. 2026-08-01)`
  return header
}
```

- [x] **Step 4: Run tests — expect PASS**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run src/utils/__tests__/param-format.test.ts
```

Expected: PASS (all tests in file).

- [x] **Step 5: Stage only (no commit unless user asks)**

```bash
git add gantt/src/utils/param-format.ts gantt/src/utils/__tests__/param-format.test.ts
```

---

### Task 2: Calendar popover in `ParamCellInput`

**Files:**
- Modify: `gantt/src/components/legality/param-cell-input.tsx`

**Interfaces:**
- Consumes: `CellFormat` including `'date'`; `@rois/ui` `Popover`, `PopoverContent`, `PopoverTrigger`, `Button`, `buildCalendarCells`, `formatEnglishMonth`, `getInitialCalendarMonth`, `shiftCalendarMonth`, `parseIsoDate`; lucide `CalendarDays`, `ChevronLeft`, `ChevronRight`
- Produces: when `format === 'date'`, text input + calendar icon; picking a day calls `onChange(isoDate)`

- [x] **Step 1: Replace `param-cell-input.tsx` with date-aware UI**

Full target implementation:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  buildCalendarCells,
  formatEnglishMonth,
  getInitialCalendarMonth,
  parseIsoDate,
  shiftCalendarMonth,
} from '@rois/ui'
import { validateCell } from '@/utils/param-format'
import type { CellFormat } from '@/utils/param-format'

interface Props {
  value: string
  format: CellFormat
  onChange: (value: string) => void
  fullWidth?: boolean
  'data-testid'?: string
}

export const ParamCellInput = ({
  value,
  format,
  onChange,
  fullWidth = false,
  'data-testid': testId,
}: Props) => {
  const error = validateCell(value, format)
  const isEmpty = value.trim() === ''
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialCalendarMonth(value))

  useEffect(() => {
    if (open) setVisibleMonth(getInitialCalendarMonth(value))
  }, [open, value])

  const cells = useMemo(() => buildCalendarCells(visibleMonth), [visibleMonth])

  const borderClass = isEmpty
    ? 'border-2 border-destructive focus:border-destructive'
    : error
      ? 'border-2 border-orange-400 focus:border-orange-400'
      : 'border border-border focus:border-primary'

  const input = (
    <input
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        fullWidth ? 'w-full' : 'w-16',
        'rounded px-1.5 py-0.5 font-mono text-2xs tabular-nums outline-none',
        'bg-background text-foreground',
        borderClass,
        isEmpty ? 'bg-destructive/5' : error ? 'bg-orange-50' : '',
      ].join(' ')}
    />
  )

  if (format !== 'date') {
    return (
      <div className="flex flex-col gap-0.5">
        {input}
        {error && (
          <span className={`text-3xs font-medium ${isEmpty ? 'text-destructive' : 'text-orange-600'}`}>
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 ${fullWidth ? 'w-full' : ''}`}>
      <div className={`flex items-center ${fullWidth ? 'gap-1.5' : 'gap-1'}`}>
        <div className={fullWidth ? 'min-w-0 flex-1' : undefined}>{input}</div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Pick date"
              data-testid={testId ? `${testId}-calendar` : undefined}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="mb-3 flex items-center justify-between">
              <Button
                aria-label="Previous month"
                className="h-7 w-7"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setVisibleMonth((m) => shiftCalendarMonth(m, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-semibold text-foreground">
                {formatEnglishMonth(visibleMonth)}
              </div>
              <Button
                aria-label="Next month"
                className="h-7 w-7"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setVisibleMonth((m) => shiftCalendarMonth(m, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Pick date calendar">
              {cells.map((cell) => {
                const selected = value === cell.isoDate
                const parsed = parseIsoDate(cell.isoDate)
                const label = parsed
                  ? `Select ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parsed.monthIndex]} ${parsed.day}, ${parsed.year}`
                  : `Select ${cell.isoDate}`
                return (
                  <Button
                    key={cell.key}
                    aria-label={label}
                    aria-pressed={selected}
                    className={[
                      'h-8 rounded-md px-0 text-xs tabular-nums',
                      !cell.inCurrentMonth ? 'text-muted-foreground/45' : '',
                      selected ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : '',
                    ].join(' ')}
                    disabled={cell.disabled}
                    role="gridcell"
                    type="button"
                    variant={selected ? 'default' : 'ghost'}
                    onClick={() => {
                      onChange(cell.isoDate)
                      setOpen(false)
                    }}
                  >
                    {String(cell.day).padStart(2, '0')}
                  </Button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {error && (
        <span className={`text-3xs font-medium ${isEmpty ? 'text-destructive' : 'text-orange-600'}`}>
          {error}
        </span>
      )}
    </div>
  )
}
```

Prefer importing `formatEnglishDate` from `@rois/ui` for day `aria-label` if already exported (it is); use that instead of the inline month array when implementing.

- [x] **Step 2: Typecheck / unit smoke**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run src/utils/__tests__/param-format.test.ts
cd /home/qianggong/Documents/Crew/rois-ai && npm run check:ui
```

Expected: Vitest PASS; `check:ui` hard violations = 0 (or none introduced in this file).

- [x] **Step 3: Stage only**

```bash
git add gantt/src/components/legality/param-cell-input.tsx
```

---

### Task 3: Playwright — 7509 Eff/Exp calendar pick

**Files:**
- Create: `e2e/tests/gantt/legality-param-date-calendar.spec.ts`

**Interfaces:**
- Consumes: `seedGanttAuth`, `ganttApiLogin`, `ganttApiUrl` from `e2e/utils/gantt-hook.ts`; live Rule Templates UI; `legality-param-cell-input-7509-001-…-calendar` test ids from Task 2
- Produces: E2E proof that picking a calendar day fills Eff Date and Exp Date with `YYYY-MM-DD`

- [x] **Step 1: Write the Playwright spec**

```ts
/**
 * Legal-6040 — param date columns: calendar icon fills YYYY-MM-DD (7509 Eff/Exp).
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl, seedGanttAuth } from '../../utils/gantt-hook'

const snapshot7509 = async (request: APIRequestContext) => {
  const token = await ganttApiLogin(request)
  const res = await request.get(`${ganttApiUrl}/api/legality/catalog`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as {
    data: { rules: Array<{ id: number; function: number; instance: string; paramJson: unknown }> }
  }
  const rule = body.data.rules.find((r) => r.function === 7509 && r.instance === '001')
  expect(rule, '7509/001 must exist in catalog').toBeTruthy()
  return { token, ruleId: rule!.id, paramJson: rule!.paramJson }
}

const restoreParams = async (
  request: APIRequestContext,
  token: string,
  ruleId: number,
  paramJson: unknown,
) => {
  await request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
  })
}

const open7509Editor = async (page: Page, request: APIRequestContext) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-nav-rule-instances').click()
  await page.getByTestId('rule-instances-view').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByTestId('rule-instances-search').fill('7509/001')
  const row = page.getByTestId('rule-instance-row-7509-001')
  await expect(row).toBeVisible({ timeout: 10_000 })
  await row.click()
  await page.getByTestId('rule-instance-params-7509-001').waitFor({ state: 'visible', timeout: 10_000 })
  await expect(page.getByTestId('legality-params-editor-7509-001')).toBeVisible()
}

test('Legal-6040 — calendar fills Eff Date and Exp Date as YYYY-MM-DD', async ({ page, request }) => {
  const snap = await snapshot7509(request)
  try {
    await open7509Editor(page, request)

    // Ensure at least one row exists
    const rows = page.locator('[data-testid^="legality-param-row-7509-001-0-"]')
    if ((await rows.count()) === 0) {
      await page.getByTestId('legality-param-add-row-7509-001-0').click()
    }

    const ri = 0
    await page.getByTestId(`legality-param-edit-7509-001-0-${ri}`).click()

    // Crew A / B required for confirm — fill if empty
    const crewA = page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-0`)
    const crewB = page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-1`)
    if (!(await crewA.inputValue()).trim()) await crewA.fill('1001')
    if (!(await crewB.inputValue()).trim()) await crewB.fill('2002')

    // Eff Date = col 2
    await page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-2-calendar`).click()
    await page.getByRole('button', { name: /Select Aug 15, 2026/i }).click()
    await expect(page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-2`)).toHaveValue('2026-08-15')

    // Exp Date = col 3 — navigate months if needed so Aug 2026 is visible, or pick same month day
    await page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-3-calendar`).click()
    await page.getByRole('button', { name: /Select Aug 20, 2026/i }).click()
    await expect(page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-3`)).toHaveValue('2026-08-20')

    await page.getByTestId(`legality-param-cancel-edit-7509-001-0-${ri}`).click()
  } finally {
    await restoreParams(request, snap.token, snap.ruleId, snap.paramJson)
  }
})
```

If the catalog endpoint path differs, mirror the pattern already used by `alert-center-rule-id-nav.spec.ts` / `rule-7509-avoid-co-pairing.spec.ts` for loading 7509 (same auth + ruleset/catalog GET). Adjust month navigation: if the popover opens on “today”, click Previous/Next month until August 2026 is shown before selecting the day.

- [x] **Step 2: Run Playwright**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/e2e && GANTT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/gantt/legality-param-date-calendar.spec.ts --config=config/playwright.config.ts --project=gantt --reporter=list
```

Expected: PASS `Legal-6040`.

Prerequisites: live-server `:3000` and gantt `:5173` running; `7509/001` present in the connected live schema (SIT/DEV).

- [x] **Step 3: Stage only**

```bash
git add e2e/tests/gantt/legality-param-date-calendar.spec.ts
```

---

### Task 4: Spec/plan checkbox sync + delivery note

**Files:**
- Modify: `docs/superpowers/plans/2026-08-23-legality-param-date-calendar.md` (this file) — check off completed boxes during execution
- Optional note in completion message only (no extra docs unless asked)

- [x] **Step 1: Re-run the smallest verification set and paste receipts**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/gantt && npx vitest run src/utils/__tests__/param-format.test.ts
cd /home/qianggong/Documents/Crew/rois-ai/e2e && GANTT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/gantt/legality-param-date-calendar.spec.ts --config=config/playwright.config.ts --project=gantt --reporter=list
cd /home/qianggong/Documents/Crew/rois-ai && npm run check:ui
```

- [x] **Step 2: Summarize for the user** — files changed, PASS/FAIL receipts, remind that commit waits for explicit user command.

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| `CellFormat: 'date'` + Eff/Exp detection | Task 1 |
| `YYYY-MM-DD` validation + tooltip | Task 1 |
| Text + calendar icon + popover pick | Task 2 |
| Shared via `ParamCellInput` (all editors) | Task 2 |
| Unit tests | Task 1 |
| Playwright 7509 Eff/Exp | Task 3 |
| No engine/migration change | (none — intentional) |
| No auto-commit | Global + Task steps stage-only |
