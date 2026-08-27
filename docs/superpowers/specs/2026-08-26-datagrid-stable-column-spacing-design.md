# Design: DataGrid stable column spacing (Crew Memo)

**Status:** Approved — implemented  
**Date:** 2026-08-26  
**Surface:** Gantt Data tab → Crew Master → Crew Memo (and other DataGrid tables)

## Problem

On Crew Memo, the horizontal spacing between **ID**, **Crew ID**, and **Memo** changes when the memo text length changes:

- Long values (`DO - 2026-06-21`) → ID / Crew ID stay tight; Memo starts further left.
- Short values (`DO`) → leftover width from `w-full` + auto table layout bleeds into ID / Crew ID; Memo starts further right.

Same entity, same columns, different row content → different column geometry. Looks like the Memo column “jumps.”

## Root cause

`DataGrid` table uses `min-w-max w-full` with default `table-layout: auto`. Extra container width is redistributed across columns based on cell content, so short Memo chips let early columns grow.

## Solution

Lock short key columns; let the long text column absorb remaining width.

### Column width tokens (Tailwind on `th`/`td`)

| Column kind | Keys (examples) | Class |
|-------------|-----------------|-------|
| Narrow id | `id` | `w-20` (5rem) |
| Crew / code key | `crewId` | `w-24` (6rem) |
| Flex text | `memo` and other unconstrained text | no fixed width (takes remainder) |
| Actions | sticky Actions col | replace `w-px` with `w-16` (icons fit; layout width real) |

Apply the same width class on both header and body cells so thead/tbody stay matched.

Heuristic in `DataGrid` (no per-entity registry churn unless needed):

```ts
const colWidthClass = (col: DataColumnConfig): string | undefined => {
  if (col.key === 'id') return 'w-20'
  if (col.key === 'crewId') return 'w-24'
  return undefined
}
```

Actions: `w-16` (or `min-w-16 w-16`) on sticky Actions `th`/`td` instead of `w-px`.

Keep `w-full` so the table still fills the section; Memo (and other unlocked columns) receive leftover space. ID / Crew ID no longer grow when Memo is short.

### Tests

- Unit: Crew Memo grid with short vs long memo rows — assert ID and Crew ID header/cell share `w-20` / `w-24`.
- Playwright (Data / Crew Master): search crew `113`, open Crew Memo, assert Memo header left edge is stable after filtering to short-only vs long memo rows (or two fixtures). Prefer DOM `getBoundingClientRect()` delta ≈ 0 for ID→Crew ID and Crew ID→Memo gaps across the two content sets.

### Non-goals

- No change to editable chip styling.
- No `table-layout: fixed` for all entities in this pass.
- No registry `width` field unless the heuristic proves too blunt for another page in the same PR.

## Verification

```bash
cd gantt && npx vitest run src/components/data/__tests__/data-grid-alignment.test.tsx
# plus Playwright crew-memo / data crew-master spacing case if added
```
