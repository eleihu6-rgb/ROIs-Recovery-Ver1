# Legality Rule Sets — Rule Catalog Tree & Editable RuleTable

**Date:** 2026-06-30
**Module:** `gantt/src/components/legality/`
**Status:** Spec — awaiting implementation plan

---

## Overview

Two additions to the Legality Rule Sets page:

1. **Rule Catalog Tree** — a new fixed-width panel added to the left of the existing Rule Sets panel. Displays the full rule catalog in a 4-level hierarchy. Lets admins copy/add instances to a rule set, or delete non-template instances.
2. **RuleTable column changes** — new editable columns (Reference, Category, Div, Severity) and a new read-only Description column. Inline cell editing saves via a new backend endpoint.

---

## 1. Page Layout

The page becomes a 3-column layout inside `LegalityRuleSetsView`:

```
┌──────────────────────┬────────────────────┬──────────────────────────────────────┐
│  Rule Catalog Tree   │   Rule Sets        │   Rule Table                         │
│  w-[280px] shrink-0  │  w-64 shrink-0     │   flex-1 min-w-0                     │
└──────────────────────┴────────────────────┴──────────────────────────────────────┘
```

- The existing Rule Sets `<aside>` remains `w-64 shrink-0`.
- A new `<RuleCatalogTree>` panel is inserted to its left: `w-[280px] shrink-0 border-r`.
- The Rule Table area becomes `flex-1 min-w-0` (unchanged content, just loses a fixed width).
- All three panels share the same `h-full overflow-hidden` row container.

---

## 2. Rule Catalog Tree

### 2.1 Data Source

Uses the existing `GET /api/legality/rules` endpoint which returns all `LegalityCatalogRule[]` including `isTemplate: boolean` (true when `instance === '001'`).

Load on component mount; refresh after Copy or Delete actions.

### 2.2 Tree Structure

4 levels — collapsed to level 1 by default:

```
▶ CCAR-121                         ← Level 1: rule.reference
  ▶ Flight Time Limits              ← Level 2: rule.category
    ▶ 8002 – Maximum Flight Time    ← Level 3: rule.function + rule.description
      ★ 001  [Template]             ← Level 4: rule.instance
        002                         ←          (sorted ascending)
        003
  ▶ Rest Requirements
▶ CCAR-135
```

- Each level node has a chevron toggle (`ChevronRight` / `ChevronDown`).
- Instance nodes are sorted ascending (`001` < `002` < `003` …).

### 2.3 Template Rule Display

When `isTemplate === true` (i.e. `instance === '001'`):
- `★` gold star icon (`text-amber-500`) before the instance number.
- A small `"Template"` chip badge (`bg-amber-100 text-amber-700 text-2xs font-medium`).
- Slightly bolder text (`font-medium`).

### 2.4 Tree Search

A search input at the top of the tree panel. Filters nodes in real time across all 4 levels (reference, category, function number, description). Non-matching branches collapse; matching subtrees stay expanded.

### 2.5 Instance Node Actions (Hover)

Actions shown right-aligned on hover/focus. Auth: Admin only.

| Instance | Actions |
|---|---|
| 001 (Template) | `[+ Add to Set]`  `[⧉ Copy]` |
| 002+ | `[+ Add to Set]`  `[⧉ Copy]`  `[🗑 Delete]` |

**Add to Set (`+`)**
- Endpoint: existing `POST /api/legality/ruleset/:worksetId/rules/:ruleId`
- Uses the currently selected rule set from the right panel.
- Disabled (greyed, tooltip "Select a rule set first") when no set is selected.
- Disabled (greyed, tooltip "Already in this set") when the rule is already a member of the selected set.
- Shows a brief success toast on completion; updates the right panel's rule list.

**Copy (`⧉`)**
- Endpoint: existing `POST /api/legality/rules/:ruleId/copy`
- Creates a new duplicate instance (next free instance number for that function).
- Refreshes the tree on success (re-fetches catalog).
- Does NOT automatically add the new copy to any rule set.
- Shows a brief success toast with the new instance number.

**Delete (`🗑`)**
- Only rendered on non-template instances (`isTemplate === false`).
- Endpoint: existing `DELETE /api/legality/rules/:ruleId`
- Backend blocks deletion if the rule is in use (returns 409); show error toast.
- Requires a confirmation dialog (`AppDialog`) before executing:
  > "Delete rule 8002/006? This cannot be undone."
  > `[Cancel]` `[Delete]`
- Refreshes the tree on success.

---

## 3. RuleTable Column Changes

### 3.1 Updated Column Order

| # | Column | Type | Details |
|---|---|---|---|
| 1 | **Rule** | Read-only | `function/instance` only (e.g. `8002/006`). `reference` code removed from here. |
| 2 | **Description** | Read-only | `rule.description` text. Truncated with tooltip on hover. |
| 3 | **Reference** | **Editable** | `rule.reference` code (e.g. `CCAR-121.481`). Inline text input on click. |
| 4 | **Category** | **Editable** | `rule.category`. Inline text input on click. |
| 5 | **Div** | **Editable** | `rule.division`. Inline text input on click. |
| 6 | **Severity** | **Editable** | `rule.severity` (1/2/3). Inline `<select>` with options: `1 – Soft`, `2 – Overridable`, `3 – Hard`. |
| 7 | **Params** | Read-only | Unchanged. |
| 8 | **Actions** | — | Unchanged. |

### 3.2 Inline Editing Mechanics

Applies to Reference, Category, Div (text inputs) and Severity (select):

- Click the cell → cell renders an `<input>` or `<select>` with a subtle focus ring.
- `Enter` or blur → optimistic update in local state, then `PATCH /api/legality/rule/:ruleId/meta`.
- `Escape` → cancel, revert to original value.
- On PATCH error → rollback to original value + error toast.
- Auth: Admin only. Non-admin users see static read-only cells.

---

## 4. New Backend Endpoint

### `PATCH /api/legality/rule/:ruleId/meta`

Updates rule metadata fields. Auth: Admin.

**Request body** (all fields optional, PATCH semantics):

```typescript
{
  reference?: string | null
  description?: string | null
  category?: string | null
  division?: string | null
  severity?: 1 | 2 | 3
}
```

**Response:** Updated `LegalityRule` object.

**Validation:**
- `severity` must be 1, 2, or 3 if provided.
- All string fields trimmed; empty string treated as `null`.
- If rule does not exist → 404.
- Auth check → 403 if not admin.

Implementation: new Drizzle `UPDATE rule SET ... WHERE id = :ruleId`, returns full updated row.

---

## 5. Component Map

| Component | File | Change |
|---|---|---|
| `LegalityRuleSetsView` | `legality-rule-sets-view.tsx` | Wrap existing layout in 3-col flex row; insert `<RuleCatalogTree>` |
| `RuleCatalogTree` | `rule-catalog-tree.tsx` *(new)* | Full tree panel with search, 4-level hierarchy, node actions |
| `LegalityRuleRow` | `legality-rule-row.tsx` | Add inline cell editing for Reference/Category/Div/Severity columns |
| Backend route | `live-server/src/routes/rule/legality.ts` | Add `PATCH /rule/:ruleId/meta` handler |
| Types | `gantt/src/types/legality.ts` | No new types needed (fields already on `LegalityRule`) |
| API service | `gantt/src/services/legality-api.ts` | Add `patchRuleMeta(ruleId, patch)` function |

---

## 6. Out of Scope

- `description` field editing (rare admin op, excluded for now).
- Non-admin users see all new columns as read-only; tree action buttons are hidden.
- Tree panel resize / collapse toggle (fixed `w-[280px]` is sufficient).
- Batch editing multiple rows at once.
