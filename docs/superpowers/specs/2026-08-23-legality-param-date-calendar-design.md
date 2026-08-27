# Legality Param Date Calendar Design

Date: 2026-08-23  
Status: Draft for review

## Goal

In Gantt legality parameter tables, every date column (notably `Eff Date` / `Exp Date`) must support:

1. Typing `YYYY-MM-DD` in the existing text cell.
2. Clicking a calendar icon beside the cell to pick a date that fills the same cell.

Stored values remain ISO calendar dates (`YYYY-MM-DD`). No backend / engine contract change.

## Scope

**In scope**

- All legality param editors that already use `ParamCellInput` + `detectColumnFormat`:
  - Rule Templates (`RuleInstancesView`)
  - Rule Sets detail editor
  - Param pop-out dialog
  - Row edit dialog (`ParamRowDialog`)
- Column detection by header name (not by rule function code).
- Validation messaging for invalid date strings.
- Focused unit tests + one Playwright path covering 7509 Eff/Exp pickers.

**Out of scope**

- Read-only param table display (still plain text).
- Changing 7509 engine parsing or migration data.
- Date-time columns, durations, or `HH:MM` fields.
- Replacing the dense text cell with a full `EnglishDatePicker` button.

## Column detection

Extend `gantt/src/utils/param-format.ts`:

- Add `CellFormat` value `'date'`.
- `detectColumnFormat(header, existingValues)`:
  - If header matches `/^(eff|exp)\s*date$/i` → `'date'`.
  - Keep existing applicability / `HH:MM` / numeric heuristics unchanged and higher-priority where they already apply.
- Do **not** treat every header containing the substring `Date` as a date column in v1 (avoids false positives). If a future rule introduces another date header (e.g. `Start Date`), extend the matcher explicitly.

## Validation

`validateCell(value, 'date')`:

- Empty → same required behavior as other non-applicability formats (`Required`).
- Non-empty must match `YYYY-MM-DD` and be a real calendar day (reject `2026-02-31`).
- Error copy: `Use YYYY-MM-DD (e.g. 2026-08-01)`.

`getColumnTooltip` for `'date'`:  
`{header} — Format: YYYY-MM-DD (e.g. 2026-08-01)`.

`isDraftValid` continues to use `validateCell`; no special-case.

## UI behavior

Update `gantt/src/components/legality/param-cell-input.tsx`:

When `format === 'date'`:

- Layout: `flex items-center gap-1` (or `gap-1.5` for the dialog’s slightly larger text).
- Keep the existing mono `input` (narrow `w-16` inline; `w-full` when `fullWidth`).
- Add a square icon button beside the input:
  - `CalendarDays` from lucide-react
  - `h-7 w-7 p-0`, `inline-flex items-center justify-center`
  - `aria-label` includes the column purpose via optional prop or generic `Pick date`
  - `data-testid` derived from the cell test id with a `-calendar` suffix when a base test id is provided
- Clicking the button opens a Popover calendar (reuse `@rois/ui` helpers: `buildCalendarCells`, `getInitialCalendarMonth`, `shiftCalendarMonth`, `parseIsoDate`).
- Selecting a day:
  - Calls `onChange(isoDate)` with `YYYY-MM-DD`
  - Closes the popover
- Typing remains independent of the popover; opening the popover seeds the visible month from the current valid value when possible.

When `format !== 'date'`, behavior is unchanged.

## Data flow

No change to save path:

`ParamCellInput` → editor reducer draft → `legalityApi.updateRuleParams({ tables })` → `param_json`.

Calendar selection is only another way to produce the same string cell value.

## Testing

1. **Unit** (`param-format` tests):
   - `Eff Date` / `Exp Date` → `'date'`
   - unrelated headers stay non-date
   - valid / invalid / empty date validation messages

2. **Playwright** (Gantt legality admin path):
   - Open Rule Templates (or equivalent) for `7509/001`
   - Enter edit mode on a row’s Eff Date / Exp Date
   - Click calendar, pick a day
   - Assert the cell value is the chosen `YYYY-MM-DD`
   - Drive real UI only (`§Simulate-User`)

## Risks / notes

- Dense table width: icon adds ~28px per date column; acceptable for 7509’s four-column table.
- Invalid typed dates still block Save via existing draft validation; calendar always emits valid ISO dates.
- Live vs Scenario: shared legality UI path; one change covers both.

## Acceptance

- Admin can type or pick Eff/Exp dates for 7509 and any other rule using those headers.
- Saved `param_json` cells remain `YYYY-MM-DD`.
- Non-date columns unchanged.
- Unit + Playwright coverage as above; report PASS receipts before calling done.
