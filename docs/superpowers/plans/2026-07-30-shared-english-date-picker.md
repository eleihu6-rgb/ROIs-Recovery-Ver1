# Shared English Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared English date picker components to `@rois/ui` and migrate Gantt off browser-native date inputs.

**Architecture:** `packages/ui` owns generic `YYYY-MM-DD` parsing, English labels, and custom calendar UI. Gantt owns timezone conversion, planning-window limits, auto-apply reloads, and per-dialog business behavior. PBS Portal is intentionally untouched in this phase.

**Tech Stack:** React 19, TypeScript, Radix Popover via `@rois/ui`, lucide-react icons, Vitest/Testing Library, Playwright for Gantt UI verification.

---

## File Structure

- Create `packages/ui/src/lib/calendar-date.ts`
  - Pure helpers for ISO calendar-date parsing, formatting, month shifting, calendar grid generation, and min/max checks.
- Create `packages/ui/src/components/english-date-picker.tsx`
  - Shared single-date picker. No native `type="date"`.
- Create `packages/ui/src/components/english-date-range-picker.tsx`
  - Shared range wrapper around two `EnglishDatePicker` controls.
- Modify `packages/ui/src/index.ts`
  - Export the new components and helper types.
- Create `packages/ui/src/components/__tests__/english-date-picker.test.tsx`
  - Shared UI behavior tests.
- Create `gantt/src/components/common/gantt-date-fields.tsx`
  - Thin Gantt-local wrapper components for common sizing and import ergonomics.
- Modify `gantt/src/components/common/date-range-picker.tsx`
  - Replace native inputs with `EnglishDateRangePicker`.
- Modify Gantt native date sites listed in the spec
  - Replace each `type="date"` with the shared component or Gantt wrapper.
- Create `gantt/src/components/common/__tests__/no-native-date-input.guard.test.ts`
  - Guard against future production `type="date"` usage under `gantt/src`.
- Update focused Gantt tests where the DOM shape changes.

---

## Task 1: Shared Calendar-Date Helpers

**Files:**
- Create: `packages/ui/src/lib/calendar-date.ts`
- Test: `packages/ui/src/components/__tests__/english-date-picker.test.tsx` in Task 2

- [ ] **Step 1: Create helper module**

Add this file:

```ts
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_RE = /^(\d{4})-(\d{2})$/;

export const ENGLISH_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const ENGLISH_MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export const ENGLISH_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface CalendarDateParts {
  year: number;
  monthIndex: number;
  day: number;
}

export interface CalendarMonth {
  year: number;
  monthIndex: number;
}

export interface CalendarCell {
  key: string;
  isoDate: string;
  day: number;
  inCurrentMonth: boolean;
  disabled: boolean;
}

export const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export const formatIsoDate = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const parseIsoDate = (value: string | null | undefined): CalendarDateParts | null => {
  if (!value) return null;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > daysInMonth(year, monthIndex)) return null;
  return { year, monthIndex, day };
};

export const parseCalendarMonth = (value: string | null | undefined): CalendarMonth | null => {
  const parsedDate = parseIsoDate(value);
  if (parsedDate) return { year: parsedDate.year, monthIndex: parsedDate.monthIndex };
  if (!value) return null;
  const match = ISO_MONTH_RE.exec(value);
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year: Number(match[1]), monthIndex };
};

export const compareIsoDates = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

export const isIsoDateWithinBounds = (isoDate: string, min?: string, max?: string): boolean => {
  if (min && compareIsoDates(isoDate, min) < 0) return false;
  if (max && compareIsoDates(isoDate, max) > 0) return false;
  return true;
};

export const formatEnglishDate = (value: string | null | undefined): string => {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  return `${ENGLISH_MONTH_SHORT[parsed.monthIndex]} ${parsed.day}, ${parsed.year}`;
};

export const formatEnglishMonth = ({ year, monthIndex }: CalendarMonth): string =>
  `${ENGLISH_MONTH_LONG[monthIndex]} ${year}`;

export const getInitialCalendarMonth = (value?: string, fallbackMonth?: string): CalendarMonth => {
  const parsedValue = parseCalendarMonth(value);
  if (parsedValue) return parsedValue;
  const parsedFallback = parseCalendarMonth(fallbackMonth);
  if (parsedFallback) return parsedFallback;
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
};

export const shiftCalendarMonth = ({ year, monthIndex }: CalendarMonth, offset: number): CalendarMonth => {
  const date = new Date(Date.UTC(year, monthIndex + offset, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
};

export const buildCalendarCells = (month: CalendarMonth, min?: string, max?: string): CalendarCell[] => {
  const firstDayOffset = new Date(Date.UTC(month.year, month.monthIndex, 1)).getUTCDay();
  const startDay = 1 - firstDayOffset;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(month.year, month.monthIndex, startDay + index));
    const year = date.getUTCFullYear();
    const monthIndex = date.getUTCMonth();
    const day = date.getUTCDate();
    const isoDate = formatIsoDate(year, monthIndex, day);
    return {
      key: isoDate,
      isoDate,
      day,
      inCurrentMonth: year === month.year && monthIndex === month.monthIndex,
      disabled: !isIsoDateWithinBounds(isoDate, min, max),
    };
  });
};
```

- [ ] **Step 2: Run package typecheck**

Run:

```bash
cd packages/ui && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/calendar-date.ts
git commit -m "feat: add shared calendar date helpers"
```

---

## Task 2: `EnglishDatePicker`

**Files:**
- Create: `packages/ui/src/components/english-date-picker.tsx`
- Create: `packages/ui/src/components/__tests__/english-date-picker.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write tests first**

Create `packages/ui/src/components/__tests__/english-date-picker.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnglishDatePicker } from "../english-date-picker";

describe("EnglishDatePicker", () => {
  it("renders an English closed label instead of a native date input", () => {
    render(<EnglishDatePicker ariaLabel="Start date" value="2026-07-30" onValueChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /start date/i })).toHaveTextContent("Jul 30, 2026");
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it("selects a date from the custom English calendar", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<EnglishDatePicker ariaLabel="Start date" value="2026-07-30" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("button", { name: /start date/i }));

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    const calendar = screen.getByRole("grid", { name: /start date calendar/i });
    await user.click(within(calendar).getByRole("button", { name: "Select Jul 15, 2026" }));

    expect(onValueChange).toHaveBeenCalledWith("2026-07-15");
  });

  it("disables cells outside min and max", async () => {
    const user = userEvent.setup();
    render(
      <EnglishDatePicker
        ariaLabel="Scoped date"
        value="2026-07-15"
        min="2026-07-10"
        max="2026-07-20"
        onValueChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /scoped date/i }));

    expect(screen.getByRole("button", { name: "Select Jul 9, 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select Jul 10, 2026" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Select Jul 21, 2026" })).toBeDisabled();
  });

  it("allows ISO text entry without native date UI", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<EnglishDatePicker ariaLabel="Start date" value="2026-07-30" onValueChange={onValueChange} />);

    await user.click(screen.getByRole("button", { name: /start date/i }));
    const input = screen.getByRole("textbox", { name: /start date iso value/i });
    await user.clear(input);
    await user.type(input, "2026-08-02");

    expect(onValueChange).toHaveBeenLastCalledWith("2026-08-02");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd packages/ui && npx vitest run src/components/__tests__/english-date-picker.test.tsx
```

Expected: FAIL because `english-date-picker.tsx` does not exist yet. If `packages/ui` lacks Vitest config, run the same file through the root/gantt Vitest setup after implementation and document the package test blocker.

- [ ] **Step 3: Implement `EnglishDatePicker`**

Create `packages/ui/src/components/english-date-picker.tsx`:

```tsx
import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "../lib/utils";
import {
  ENGLISH_WEEKDAY_SHORT,
  buildCalendarCells,
  formatEnglishDate,
  formatEnglishMonth,
  getInitialCalendarMonth,
  parseIsoDate,
  shiftCalendarMonth,
} from "../lib/calendar-date";

export interface EnglishDatePickerProps {
  ariaLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  defaultMonth?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  inputClassName?: string;
}

const dateButtonLabel = (isoDate: string): string => {
  const label = formatEnglishDate(isoDate);
  return label ? `Select ${label}` : `Select ${isoDate}`;
};

export const EnglishDatePicker = ({
  ariaLabel,
  value,
  onValueChange,
  min,
  max,
  defaultMonth,
  disabled = false,
  placeholder = "Select date",
  className,
  buttonClassName,
  popoverClassName,
  inputClassName,
}: EnglishDatePickerProps) => {
  const [open, setOpen] = React.useState(false);
  const [visibleMonth, setVisibleMonth] = React.useState(() => getInitialCalendarMonth(value, defaultMonth));

  React.useEffect(() => {
    if (open) setVisibleMonth(getInitialCalendarMonth(value, defaultMonth));
  }, [defaultMonth, open, value]);

  const cells = React.useMemo(
    () => buildCalendarCells(visibleMonth, min, max),
    [max, min, visibleMonth],
  );
  const closedLabel = formatEnglishDate(value);

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <div className={cn("inline-flex min-w-0", className)}>
        <PopoverTrigger asChild>
          <Button
            aria-label={ariaLabel}
            aria-expanded={open}
            className={cn(
              "h-8 justify-between gap-2 px-2.5 text-xs font-normal tabular-nums",
              "min-w-[8.5rem]",
              buttonClassName,
            )}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <span className={cn("truncate", closedLabel ? "text-foreground" : "text-muted-foreground")}>
              {closedLabel || placeholder}
            </span>
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className={cn("w-72 p-3", popoverClassName)}>
        <div className="mb-3 flex items-center justify-between">
          <Button
            aria-label="Previous month"
            className="h-7 w-7"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setVisibleMonth((current) => shiftCalendarMonth(current, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold text-foreground">{formatEnglishMonth(visibleMonth)}</div>
          <Button
            aria-label="Next month"
            className="h-7 w-7"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setVisibleMonth((current) => shiftCalendarMonth(current, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Input
          aria-label={`${ariaLabel} ISO value`}
          autoComplete="off"
          className={cn("mb-3 h-8 text-xs tabular-nums", inputClassName)}
          inputMode="numeric"
          maxLength={10}
          placeholder="YYYY-MM-DD"
          type="text"
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            const parsed = parseIsoDate(event.target.value);
            if (parsed) setVisibleMonth({ year: parsed.year, monthIndex: parsed.monthIndex });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />

        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-2xs font-semibold text-muted-foreground">
          {ENGLISH_WEEKDAY_SHORT.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${ariaLabel} calendar`}>
          {cells.map((cell) => {
            const selected = value === cell.isoDate;
            return (
              <Button
                key={cell.key}
                aria-label={dateButtonLabel(cell.isoDate)}
                aria-pressed={selected}
                className={cn(
                  "h-8 rounded-md px-0 text-xs tabular-nums",
                  !cell.inCurrentMonth && "text-muted-foreground/45",
                  selected && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                disabled={cell.disabled}
                role="gridcell"
                type="button"
                variant={selected ? "default" : "ghost"}
                onClick={() => {
                  onValueChange(cell.isoDate);
                  setOpen(false);
                }}
              >
                {String(cell.day).padStart(2, "0")}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
```

- [ ] **Step 4: Export component**

Modify `packages/ui/src/index.ts` under the Components section:

```ts
// English Date Picker
export {
  EnglishDatePicker,
  type EnglishDatePickerProps,
} from "./components/english-date-picker";
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd packages/ui && npm run typecheck
cd packages/ui && npx vitest run src/components/__tests__/english-date-picker.test.tsx
```

Expected: typecheck PASS. Test PASS if package Vitest can run; otherwise document the test-run blocker and cover through Gantt tests after package linking.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/english-date-picker.tsx packages/ui/src/components/__tests__/english-date-picker.test.tsx packages/ui/src/index.ts
git commit -m "feat: add shared english date picker"
```

---

## Task 3: `EnglishDateRangePicker`

**Files:**
- Create: `packages/ui/src/components/english-date-range-picker.tsx`
- Modify: `packages/ui/src/components/__tests__/english-date-picker.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add range tests**

Append to `packages/ui/src/components/__tests__/english-date-picker.test.tsx`:

```tsx
import { EnglishDateRangePicker } from "../english-date-range-picker";

describe("EnglishDateRangePicker", () => {
  it("renders two English date controls with range bounds", async () => {
    const user = userEvent.setup();
    render(
      <EnglishDateRangePicker
        ariaLabel="Planning range"
        startValue="2026-07-10"
        endValue="2026-07-20"
        onStartValueChange={vi.fn()}
        onEndValueChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /planning range start/i })).toHaveTextContent("Jul 10, 2026");
    expect(screen.getByRole("button", { name: /planning range end/i })).toHaveTextContent("Jul 20, 2026");

    await user.click(screen.getByRole("button", { name: /planning range start/i }));
    expect(screen.getByRole("button", { name: "Select Jul 21, 2026" })).toBeDisabled();
  });
});
```

If TypeScript complains about imports after appending, merge imports at the top instead of duplicating them.

- [ ] **Step 2: Implement range component**

Create `packages/ui/src/components/english-date-range-picker.tsx`:

```tsx
import * as React from "react";
import { cn } from "../lib/utils";
import { EnglishDatePicker } from "./english-date-picker";

export interface EnglishDateRangePickerProps {
  ariaLabel: string;
  startValue: string;
  endValue: string;
  onStartValueChange: (value: string) => void;
  onEndValueChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  pickerClassName?: string;
  pickerButtonClassName?: string;
  separator?: React.ReactNode;
}

export const EnglishDateRangePicker = ({
  ariaLabel,
  startValue,
  endValue,
  onStartValueChange,
  onEndValueChange,
  min,
  max,
  disabled = false,
  className,
  pickerClassName,
  pickerButtonClassName,
  separator = <span className="text-2xs text-muted-foreground/70">~</span>,
}: EnglishDateRangePickerProps) => (
  <div className={cn("inline-flex items-center gap-1", className)}>
    <EnglishDatePicker
      ariaLabel={`${ariaLabel} start`}
      className={pickerClassName}
      buttonClassName={pickerButtonClassName}
      disabled={disabled}
      max={endValue || max}
      min={min}
      value={startValue}
      onValueChange={onStartValueChange}
    />
    {separator}
    <EnglishDatePicker
      ariaLabel={`${ariaLabel} end`}
      className={pickerClassName}
      buttonClassName={pickerButtonClassName}
      disabled={disabled}
      max={max}
      min={startValue || min}
      value={endValue}
      onValueChange={onEndValueChange}
    />
  </div>
);
```

- [ ] **Step 3: Export range component**

Modify `packages/ui/src/index.ts` under the `EnglishDatePicker` export:

```ts
export {
  EnglishDateRangePicker,
  type EnglishDateRangePickerProps,
} from "./components/english-date-range-picker";
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
cd packages/ui && npm run typecheck
cd packages/ui && npx vitest run src/components/__tests__/english-date-picker.test.tsx
```

Expected: PASS, or package Vitest blocker documented as in Task 2.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/english-date-range-picker.tsx packages/ui/src/components/__tests__/english-date-picker.test.tsx packages/ui/src/index.ts
git commit -m "feat: add shared english date range picker"
```

---

## Task 4: Gantt Wrapper and Toolbar Migration

**Files:**
- Create: `gantt/src/components/common/gantt-date-fields.tsx`
- Modify: `gantt/src/components/common/date-range-picker.tsx`
- Test: add/update a focused Gantt component test if existing test harness supports the toolbar component.

- [ ] **Step 1: Create Gantt wrappers**

Create `gantt/src/components/common/gantt-date-fields.tsx`:

```tsx
import { EnglishDatePicker, EnglishDateRangePicker, cn, type EnglishDatePickerProps, type EnglishDateRangePickerProps } from '@rois/ui';

const ganttDateButtonClass = [
  'h-7 min-w-[7.5rem] rounded-md border-border/50 bg-muted/40 px-2',
  'text-xs font-normal tabular-nums text-foreground',
  'hover:border-border hover:bg-muted/60',
].join(' ');

export type GanttEnglishDatePickerProps = EnglishDatePickerProps;

export const GanttEnglishDatePicker = ({ buttonClassName, ...props }: GanttEnglishDatePickerProps) => (
  <EnglishDatePicker
    {...props}
    buttonClassName={cn(ganttDateButtonClass, buttonClassName)}
  />
);

export type GanttEnglishDateRangePickerProps = EnglishDateRangePickerProps;

export const GanttEnglishDateRangePicker = ({ pickerButtonClassName, ...props }: GanttEnglishDateRangePickerProps) => (
  <EnglishDateRangePicker
    {...props}
    pickerButtonClassName={cn(ganttDateButtonClass, pickerButtonClassName)}
  />
);
```

- [ ] **Step 2: Replace toolbar native inputs**

Modify `gantt/src/components/common/date-range-picker.tsx`:

```tsx
import { useCallback } from 'react';
import { useFilterStore } from '@/stores/filter-store';
import { useTimezoneStore } from '@/stores/timezone-store';
import { calendarDateToUtcMidnight, endOfCalendarDayUtc } from '@/components/gantt/gantt-utils';
import { applyGanttFilters } from '@/utils/apply-filters';
import { GanttEnglishDateRangePicker } from '@/components/common/gantt-date-fields';
```

Remove `useThemeStore`, `dateInputClass`, `effectiveDark`, and `colorScheme`. Keep `formatDateInTz`, `shiftYmdMonths`, and the change handlers. Replace the return block with:

```tsx
  return (
    <GanttEnglishDateRangePicker
      ariaLabel="Gantt date range"
      startValue={startDisplay}
      endValue={endDisplay}
      min={startMin}
      max={endMax}
      onStartValueChange={(value) => {
        handleStartChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>);
      }}
      onEndValueChange={(value) => {
        handleEndChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>);
      }}
    />
  );
```

Then immediately clean this up so handlers accept strings directly:

```tsx
  const handleStartValueChange = useCallback((value: string) => {
    const tz = useTimezoneStore.getState().timezone;
    const newStart = calendarDateToUtcMidnight(value, tz);
    if (isNaN(newStart.getTime())) return;
    if (newStart.getTime() > dateRange.end.getTime()) return;
    const endYmd = formatDateInTz(dateRange.end, tz);
    const minStart = calendarDateToUtcMidnight(shiftYmdMonths(endYmd, -MAX_WINDOW_MONTHS), tz);
    if (newStart.getTime() < minStart.getTime()) return;
    setDateRange(newStart, dateRange.end);
    scheduleAutoApply();
  }, [dateRange.end, setDateRange]);

  const handleEndValueChange = useCallback((value: string) => {
    const tz = useTimezoneStore.getState().timezone;
    const newEnd = endOfCalendarDayUtc(value, tz);
    if (isNaN(newEnd.getTime())) return;
    if (newEnd.getTime() < dateRange.start.getTime()) return;
    const startYmd = formatDateInTz(dateRange.start, tz);
    const maxEnd = endOfCalendarDayUtc(shiftYmdMonths(startYmd, MAX_WINDOW_MONTHS), tz);
    if (newEnd.getTime() > maxEnd.getTime()) return;
    setDateRange(dateRange.start, newEnd);
    scheduleAutoApply();
  }, [dateRange.start, setDateRange]);
```

Final return:

```tsx
  return (
    <GanttEnglishDateRangePicker
      ariaLabel="Gantt date range"
      startValue={startDisplay}
      endValue={endDisplay}
      min={startMin}
      max={endMax}
      onStartValueChange={handleStartValueChange}
      onEndValueChange={handleEndValueChange}
    />
  );
```

- [ ] **Step 3: Run focused typecheck**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: PASS or only unrelated pre-existing errors. If errors point to this migration, fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/common/gantt-date-fields.tsx gantt/src/components/common/date-range-picker.tsx
git commit -m "feat: use shared english picker for gantt range"
```

---

## Task 5: Migrate Remaining Gantt Native Date Inputs

**Files:**
- Modify all files returned by:
  - `rg -n "type=\"date\"|type='date'|type=\\{['\\\"]date['\\\"]\\}" gantt/src -S`

- [ ] **Step 1: Replace simple single-date inputs**

For each plain controlled date input, replace:

```tsx
<Input type="date" className="h-8 flex-1 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
```

with:

```tsx
<GanttEnglishDatePicker
  ariaLabel="Start date"
  className="flex-1"
  value={startDate}
  onValueChange={setStartDate}
/>
```

Preserve existing `disabled`, `data-testid`, `min`, `max`, and class props by moving them to supported picker props:

```tsx
<GanttEnglishDatePicker
  ariaLabel="Ground task start date"
  className="flex-1"
  disabled={readOnly}
  value={startDate}
  onValueChange={setStartDate}
/>
```

If a test needs the old `data-testid`, add `data-testid` support to `EnglishDatePickerProps` by extending the trigger button props with `testId?: string` and render it as `data-testid={testId}` on the closed button.

- [ ] **Step 2: Replace simple range pairs**

For adjacent start/end inputs such as Flight Navi or import dialogs, replace two single pickers with `GanttEnglishDateRangePicker` when they update simple string state:

```tsx
<GanttEnglishDateRangePicker
  ariaLabel="Flight Navi date range"
  startValue={filters.startDate}
  endValue={filters.endDate}
  onStartValueChange={(value) => setFilters((current) => ({ ...current, startDate: value }))}
  onEndValueChange={(value) => setFilters((current) => ({ ...current, endDate: value }))}
/>
```

Use two `GanttEnglishDatePicker` controls instead when the surrounding layout requires separate labels or separate validation messages.

- [ ] **Step 3: Re-run native input scan**

Run:

```bash
rg -n "type=\"date\"|type='date'|type=\\{['\\\"]date['\\\"]\\}" gantt/src -S
```

Expected: no production matches. Comments in `gantt/src/stores/scenario-store.ts` may be updated to remove `<input type="date">` wording or left only if the guard excludes comments by file policy.

- [ ] **Step 4: Run Gantt typecheck**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: PASS or only unrelated pre-existing errors. Fix all migration-related errors.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components
git commit -m "feat: replace gantt native date inputs"
```

---

## Task 6: Guard Tests and Touched Tests

**Files:**
- Create: `gantt/src/components/common/__tests__/no-native-date-input.guard.test.ts`
- Modify existing touched tests as needed:
  - `gantt/src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx`
  - `gantt/src/components/scenario/__tests__/import-pbs-dialog.test.tsx`
  - `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`
  - `gantt/src/components/roster/__tests__/ground-task-dialog-assignments.test.ts` if DOM tests are added later

- [ ] **Step 1: Add Gantt guard test**

Create `gantt/src/components/common/__tests__/no-native-date-input.guard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(__dirname, '../../..');
const sourceExtensions = new Set(['.ts', '.tsx']);
const ignoredSuffixes = ['.test.ts', '.test.tsx'];
const nativeDateInputPattern = /type\s*=\s*(?:"date"|'date'|{\s*["']date["']\s*})/;

const collectSourceFiles = (directory: string): string[] => {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) return collectSourceFiles(absolutePath);
    if (!sourceExtensions.has(path.extname(absolutePath))) return [];
    if (ignoredSuffixes.some((suffix) => absolutePath.endsWith(suffix))) return [];
    return [absolutePath];
  });
};

describe('native date input guard', () => {
  it('does not use browser-native date inputs in Gantt production source', () => {
    const offenders = collectSourceFiles(srcRoot).filter((filePath) =>
      nativeDateInputPattern.test(readFileSync(filePath, 'utf8')),
    );

    expect(offenders.map((filePath) => path.relative(srcRoot, filePath))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run guard test**

Run:

```bash
cd gantt && npx vitest run src/components/common/__tests__/no-native-date-input.guard.test.ts
```

Expected: PASS.

- [ ] **Step 3: Update touched tests**

For tests that previously used `input[type="date"]`, query buttons by accessible name instead:

```ts
const startPicker = screen.getByRole('button', { name: /start date/i });
await user.click(startPicker);
await user.click(screen.getByRole('button', { name: 'Select Jul 15, 2026' }));
```

If a test only needs to set a value quickly, open the picker and type the ISO value into the textbox:

```ts
await user.click(screen.getByRole('button', { name: /start date/i }));
const isoInput = screen.getByRole('textbox', { name: /start date iso value/i });
await user.clear(isoInput);
await user.type(isoInput, '2026-07-15');
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd gantt && npx vitest run \
  src/components/common/__tests__/no-native-date-input.guard.test.ts \
  src/components/scenario/__tests__/s3-pairing-import-dialog.test.tsx \
  src/components/scenario/__tests__/import-pbs-dialog.test.tsx \
  src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/common/__tests__/no-native-date-input.guard.test.ts gantt/src/components/**/__tests__
git commit -m "test: guard gantt english date inputs"
```

---

## Task 7: UI Standard and Playwright Verification

**Files:**
- Modify or create a focused Playwright test under `e2e/gantt/` if an existing Gantt toolbar/date-range spec exists.
- Otherwise document the manual Playwright command and screenshot receipt in final delivery.

- [ ] **Step 1: Run UI standard check**

Run:

```bash
npm run check:ui
```

Expected: PASS with zero hard violations. If this command is unavailable, run the repo's documented UI check command and report the blocker.

- [ ] **Step 2: Run package and Gantt typechecks**

Run:

```bash
cd packages/ui && npm run typecheck
cd gantt && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run focused Playwright verification**

Use the existing Gantt Playwright harness. If a date-range spec exists, update and run it. If no spec exists, create a focused test that:

```ts
await page.getByRole('button', { name: /gantt date range start/i }).click();
await expect(page.getByText('July 2026')).toBeVisible();
await page.getByRole('button', { name: 'Select Jul 15, 2026' }).click();
await expect(page.getByRole('button', { name: /gantt date range start/i })).toContainText('Jul 15, 2026');
```

Run the matching command, for example:

```bash
npx playwright test e2e/gantt/<date-range-spec>.spec.ts --project=chromium
```

Expected: PASS.

- [ ] **Step 4: Final native scan**

Run:

```bash
rg -n "type=\"date\"|type='date'|type=\\{['\\\"]date['\\\"]\\}" gantt/src packages/ui/src -S
```

Expected: no production native date inputs. Matches inside test guard patterns are acceptable.

- [ ] **Step 5: Commit final test changes**

```bash
git add e2e/gantt gantt/src packages/ui/src
git commit -m "test: verify gantt shared english date picker"
```

---

## Self-Review Notes

- Spec coverage:
  - Shared picker components: Tasks 1-3.
  - Gantt toolbar migration: Task 4.
  - Remaining Gantt native inputs: Task 5.
  - Guard and focused tests: Task 6.
  - UI/Playwright verification: Task 7.
  - PBS non-goal respected: no task modifies `pbs-portal`.
- Placeholder scan: no unresolved implementation markers or unspecified steps remain.
- Type consistency:
  - Shared API uses `value`, `onValueChange`, `startValue`, `endValue`, `onStartValueChange`, `onEndValueChange`.
  - Gantt wrapper names consistently use `GanttEnglishDatePicker` and `GanttEnglishDateRangePicker`.
