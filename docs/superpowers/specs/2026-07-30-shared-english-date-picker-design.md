# Shared English Date Picker for Gantt

Date: 2026-07-30
Scope: `packages/ui`, `gantt`

## Goal

Replace Gantt's browser-native date inputs with one shared English date-picker component from `@rois/ui`.
All Gantt date entry points should display English date labels and use the same custom calendar behavior,
independent of browser or operating-system locale.

The value contract remains `YYYY-MM-DD`. Existing Gantt business logic for timezone anchoring, date-range
limits, auto apply, and data reload stays in Gantt wrappers.

## Non-Goals

- Do not change `pbs-portal` in this phase.
- Do not migrate PBS Portal's existing `PortalDatePicker`.
- Do not introduce a third-party date-picker dependency.
- Do not change stored date formats, API payloads, or scenario/filter data contracts.
- Do not change Gantt timeline labels beyond replacing input controls.

## Existing Context

Gantt currently uses native date inputs in several places. The main toolbar picker formats values as
`YYYY-MM-DD`, but `<input type="date">` lets the browser render the picker popup, so month and weekday text
can vary by browser locale. Other Gantt dialogs and filters also use native date inputs directly.

PBS Portal already has a non-native date picker, but it depends on PBS-local paths, Heroicons, white Portal
styling, and Portal-specific positioning. It should not be imported into Gantt. The reusable portion should
instead be implemented in `packages/ui` using shared dependencies and design tokens.

## Approved Approach

Add shared date components to `packages/ui`, then migrate Gantt to consume them.

### `EnglishDatePicker`

Location: `packages/ui/src/components/english-date-picker.tsx`

Contract:

- `value: string` in `YYYY-MM-DD` format.
- `onValueChange(value: string): void`.
- `min?: string` and `max?: string`, also `YYYY-MM-DD`.
- `disabled?: boolean`.
- `ariaLabel: string`.
- Optional `className`, `buttonClassName`, `popoverClassName`, and compact sizing props if needed.

Behavior:

- The closed control displays an English label such as `Jul 30, 2026`.
- Empty or invalid values show a neutral placeholder, while preserving controlled value behavior.
- The popup calendar is custom React UI, not native `input type="date"`.
- Month and weekday labels are fixed English text, e.g. `July 2026`, `Sun Mon Tue Wed Thu Fri Sat`.
- Calendar cells outside `min`/`max` are disabled.
- Selecting a valid day calls `onValueChange(isoDate)` and closes the popup.
- Escape closes the popup.
- Clicking outside closes the popup.
- Keyboard text entry remains available through a controlled `YYYY-MM-DD` input inside the popover or an
  equivalent accessible editing affordance.

Implementation constraints:

- Use `@rois/ui` primitives and utilities: `Button`, `Input`, `Popover`, `cn`.
- Use lucide icons, not Heroicons.
- Use design tokens from `packages/ui/src/styles/globals.css`, not hard-coded product colors.
- Do not use `input type="date"` anywhere in the shared component.
- Keep all date arithmetic timezone-invariant for plain calendar dates by using UTC construction or string
  parsing; do not let local timezone shift `YYYY-MM-DD`.

### `EnglishDateRangePicker`

Location: `packages/ui/src/components/english-date-range-picker.tsx`

Contract:

- `startValue: string`.
- `endValue: string`.
- `onStartValueChange(value: string): void`.
- `onEndValueChange(value: string): void`.
- Optional `min`, `max`, `disabled`, `ariaLabel`, `className`, and separator props.

Behavior:

- Render two `EnglishDatePicker` controls with a compact range separator.
- Enforce basic range constraints by passing `max={endValue}` to the start picker and `min={startValue}` to
  the end picker.
- Leave business-specific window sizing, timezone conversion, and reload behavior to callers.

## Gantt Migration

Replace native Gantt date inputs with the shared `@rois/ui` components.

Primary migration:

- `gantt/src/components/common/date-range-picker.tsx`
  - Keep Gantt's timezone conversion:
    - `formatDateInTz(dateRange.start, timezone)`
    - `calendarDateToUtcMidnight(value, timezone)`
    - `endOfCalendarDayUtc(value, timezone)`
  - Keep the three-month planning window.
  - Keep `scheduleAutoApply()`.
  - Render `EnglishDateRangePicker` instead of two native inputs.

Other Gantt native date input sites to migrate:

- `gantt/src/components/composition/composition-load-dialog.tsx`
- `gantt/src/components/scenario/scenario-parameter-editors.tsx`
- `gantt/src/components/flight-navi/flight-navi-filter-bar.tsx`
- `gantt/src/components/res-pairing/manage-existing.tsx`
- `gantt/src/components/scenario/s3-pairing-import-dialog.tsx`
- `gantt/src/components/scenario/import-pbs-dialog.tsx`
- `gantt/src/components/scenario/filter/ro-crew-filter.tsx`
- `gantt/src/components/pairing/duty-node-edit-block.tsx`
- `gantt/src/components/roster/ground-task-dialog.tsx`
- `gantt/src/components/data/data-filter-bar.tsx`

If implementation finds additional production `type="date"` sites in Gantt, migrate them too. Test files may
contain the string only when they are explicitly asserting the guard behavior.

## Source Boundaries

- Shared generic date UI belongs in `packages/ui`.
- Gantt-specific date range behavior remains in `gantt`.
- Do not import `pbs-portal/src` from Gantt or `packages/ui`.
- Do not put Gantt timezone store logic into `packages/ui`.
- Do not put PBS Portal-specific visual styling into `packages/ui`.

## Testing Plan

Shared UI tests:

- `EnglishDatePicker` renders English closed labels.
- Invalid/empty value handling does not throw.
- Selecting a calendar cell emits `YYYY-MM-DD`.
- `min` and `max` disable out-of-range cells.
- No native `type="date"` is rendered.

Gantt tests:

- Add or update a guard test to fail on production Gantt source using `type="date"`.
- Update touched component tests that queried native inputs.
- Add coverage for toolbar date range:
  - labels are English, e.g. `Jul 1, 2026`.
  - selecting a new start or end date updates the store.
  - the existing auto-apply/reload path still runs after date changes.
- For UI delivery, run a real Gantt Playwright flow against the toolbar date range.

Verification commands expected during implementation:

- `npm run check:ui`
- `cd packages/ui && npx tsc --noEmit` or the package's existing equivalent
- `cd gantt && npx tsc --noEmit`
- Focused Gantt component tests for migrated controls
- Focused Playwright test for the Gantt toolbar date range

## Risks

- The shared picker touches many Gantt forms; the implementation should migrate incrementally and keep value
  contracts unchanged.
- Native date inputs handle some keyboard and accessibility behavior automatically. The custom picker must
  provide clear labels, focus states, Escape close, and an ISO text-entry path.
- Toolbar width is tight. The Gantt toolbar wrapper may need compact sizing while preserving readable labels.
- Date-only parsing must avoid timezone drift. Shared UI should operate on `YYYY-MM-DD` strings; Gantt remains
  responsible for converting those strings into UTC instants using the selected display timezone.

## Acceptance Criteria

- `packages/ui` exports the shared English date picker components.
- Gantt production source contains no native `type="date"` inputs.
- Gantt date controls display English labels and custom English calendar popups.
- Existing Gantt date behavior remains intact: timezone anchoring, three-month window, auto apply, and disabled
  states still work.
- Required typecheck, UI checks, focused tests, and Playwright verification are run and reported.
