# Legality Rule Catalog Tree & Editable RuleTable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rule Catalog Tree panel (reference → category → function → instance) to the left of the Legality Rule Sets page, and add inline-editable Reference/Category/Div/Severity columns plus a read-only Description column to the RuleTable.

**Architecture:** 3-column fixed layout (RuleCatalogTree `w-[280px]` | RuleSets `w-64` | RuleTable `flex-1`). Tree manages its own catalog state (loads from existing `GET /api/legality/rules`). Inline editing saves via a new `PATCH /api/legality/rule/:ruleId/meta` endpoint; on success the Zustand store patches the local rules array for instant feedback; on error the cell rolls back to the original value.

**Tech Stack:** React 19 + Zustand, Fastify (PostgreSQL raw queries — no Drizzle ORM in legality routes), Playwright E2E.

## Global Constraints

- All UI strings must be English (CLAUDE.md §UI-English).
- Admin-only (`isAdmin === 1`) for all write actions; non-admin users see static read-only cells and no tree action buttons.
- New PATCH endpoint: auth pattern mirrors existing `/rule/:ruleId/params` — check `request.authUser?.isAdmin`, return 403 with `{ code: 403, data: null, message: 'Admin access required' }`.
- All confirmation dialogs use `AppDialog` from `@rois/ui` (CLAUDE.md 弹窗标准).
- Font sizes: token classes only (`text-2xs`, `text-xs`, `text-sm`…). No `text-[Npx]`.
- Run `npm run check:ui` (repo root) before every commit touching `gantt/src/` or `packages/ui/src/`; hard violations must be 0.
- Version bumps required: `BACKEND_VERSION` +1 in Task 1; `FRONTEND_VERSION` +1 in Task 3.

---

## File Map

| File | Action | Role |
|---|---|---|
| `live-server/src/routes/rule/legality.ts` | Modify | Add `PATCH /rule/:ruleId/meta` route |
| `gantt/src/types/legality.ts` | Modify | Add `UpdateRuleMetaRequest` type |
| `gantt/src/services/legality-api.ts` | Modify | Add `patchRuleMeta()` function |
| `gantt/src/stores/legality-store.ts` | Modify | Add `updateRuleMeta()` action |
| `gantt/src/version.ts` | Modify | Bump `BACKEND_VERSION` 193→194, `FRONTEND_VERSION` 359→360 |
| `gantt/src/components/legality/rule-inline-cell.tsx` | **Create** | Inline text/select editing cell (admin only) |
| `gantt/src/components/legality/legality-rule-row.tsx` | Modify | Add Description + Reference columns; make Category, Div, Severity inline-editable; fix colSpan 6→8 |
| `gantt/src/components/legality/legality-rule-sets-view.tsx` | Modify | Updated table `<thead>` (8 cols); insert `<RuleCatalogTree>` in 3-col layout |
| `gantt/src/components/legality/rule-catalog-tree.tsx` | **Create** | 4-level collapsible tree with search and per-node actions |
| `e2e/tests/gantt/legality-rule-catalog-tree.spec.ts` | **Create** | Playwright E2E: tree visible, inline edit, copy, add-to-set |

---

## Task 1: Backend — PATCH /rule/:ruleId/meta + types + API function + version bumps

**Files:**
- Modify: `live-server/src/routes/rule/legality.ts` (add route after the existing `PATCH /rule/:ruleId/params` block, around line 158)
- Modify: `gantt/src/types/legality.ts` (add `UpdateRuleMetaRequest`)
- Modify: `gantt/src/services/legality-api.ts` (add `patchRuleMeta`)
- Modify: `gantt/src/version.ts` (bump versions)

**Interfaces:**
- Produces: `PATCH /api/legality/rule/:ruleId/meta` — body `UpdateRuleMetaRequest`, response `LegalityRule`
- Produces: `legalityApi.patchRuleMeta(ruleId, patch): Promise<LegalityRule>`
- Produces: `UpdateRuleMetaRequest` type

- [ ] **Step 1: Add `UpdateRuleMetaRequest` to types**

In `gantt/src/types/legality.ts`, add after the existing `UpdateRuleParamsRequest` interface (line 62):

```typescript
export interface UpdateRuleMetaRequest {
  reference?: string | null
  category?: string | null
  division?: string | null
  severity?: 1 | 2 | 3
  description?: string | null
}
```

- [ ] **Step 2: Add `patchRuleMeta` to the API service**

In `gantt/src/services/legality-api.ts`, add the import for `UpdateRuleMetaRequest` to the existing import at line 2:

```typescript
import type {
  LegalityRuleset,
  LegalityRulesetSummary,
  LegalityParamJson,
  LegalityRecheckStatus,
  UpdateRuleParamsResult,
  UpdateRuleMetaRequest,
  LegalityCatalogRule,
} from '@/types/legality'
```

Then add this function after `deleteRule` (before the `// ── Rule Set` comment):

```typescript
  /** Update rule metadata (reference, category, division, severity, description). Admin only. */
  patchRuleMeta: (ruleId: number, patch: UpdateRuleMetaRequest): Promise<LegalityRule> =>
    api.patch(`/api/legality/rule/${ruleId}/meta`, patch) as Promise<LegalityRule>,
```

Also add `LegalityRule` to the import (it's already defined in types/legality.ts but not imported in the service):

```typescript
import type {
  LegalityRuleset,
  LegalityRulesetSummary,
  LegalityRule,
  LegalityParamJson,
  LegalityRecheckStatus,
  UpdateRuleParamsResult,
  UpdateRuleMetaRequest,
  LegalityCatalogRule,
} from '@/types/legality'
```

- [ ] **Step 3: Add the backend route**

In `live-server/src/routes/rule/legality.ts`, insert the following block immediately after the closing brace of the `PATCH /rule/:ruleId/params` handler (after line 157, before the `GET /rules` handler):

```typescript
  /**
   * PATCH /rule/:ruleId/meta  (admin-only)
   * Updates rule metadata: reference, category, division, severity, description.
   */
  fastify.patch('/rule/:ruleId/meta', async (request, reply) => {
    if (!request.authUser?.isAdmin) {
      return reply.status(403).send({ code: 403, data: null, message: 'Admin access required' })
    }
    const id = Number.parseInt((request.params as { ruleId: string }).ruleId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid ruleId')

    const existing = await fastify.pgPool.query('SELECT id FROM rule WHERE id = $1', [id])
    if (existing.rows.length === 0) return fail(reply, 404, `rule ${id} not found`)

    const b = request.body as {
      reference?: string | null
      category?: string | null
      division?: string | null
      severity?: number
      description?: string | null
    }

    const sets: string[] = []
    const vals: unknown[] = []

    if (b.reference !== undefined) {
      sets.push(`reference = $${sets.length + 1}`)
      vals.push(typeof b.reference === 'string' ? b.reference.trim() || null : null)
    }
    if (b.category !== undefined) {
      sets.push(`category = $${sets.length + 1}`)
      vals.push(typeof b.category === 'string' ? b.category.trim() || null : null)
    }
    if (b.division !== undefined) {
      sets.push(`division = $${sets.length + 1}`)
      vals.push(typeof b.division === 'string' ? b.division.trim() || null : null)
    }
    if (b.description !== undefined) {
      sets.push(`description = $${sets.length + 1}`)
      vals.push(typeof b.description === 'string' ? b.description.trim() || null : null)
    }
    if (b.severity !== undefined) {
      if (![1, 2, 3].includes(Number(b.severity))) return fail(reply, 400, 'severity must be 1, 2, or 3')
      sets.push(`severity = $${sets.length + 1}`)
      vals.push(Number(b.severity))
    }

    if (sets.length === 0) return fail(reply, 400, 'no fields to update')
    sets.push(`updated_by = $${sets.length + 1}`)
    vals.push(request.authUser.userCode)
    sets.push('updated_at = NOW()')
    vals.push(id)

    try {
      const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
        `UPDATE rule SET ${sets.join(', ')} WHERE id = $${vals.length}
         RETURNING id, function, instance, reference, category, description, detail,
                   severity, overridability, division, owner, locked, param_json`,
        vals,
      )
      const r = rows[0]
      return success(reply, {
        id: r.id, function: r.function, instance: r.instance, reference: r.reference,
        category: r.category, description: r.description, detail: r.detail,
        severity: r.severity, overridability: r.overridability, division: r.division,
        owner: r.owner, locked: r.locked, paramJson: r.param_json,
      })
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })
```

- [ ] **Step 4: Bump version numbers**

In `gantt/src/version.ts`, update:
```typescript
export const BACKEND_VERSION = 194  // legality: add PATCH /rule/:ruleId/meta for metadata editing
export const FRONTEND_VERSION = 360 // legality: rule catalog tree + inline editable columns
```

- [ ] **Step 5: Verify the backend starts**

```bash
cd live-server && npx tsx src/index.ts &
sleep 3
curl -s -X PATCH http://localhost:3000/api/legality/rule/1/meta \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"category":"FTL"}' | jq .
```

Expected: `{ "code": 200, "data": { "id": 1, ... "category": "FTL", ... }, "message": "ok" }`
If unauthenticated: `{ "code": 403, ... }`

- [ ] **Step 6: Commit**

```bash
git add live-server/src/routes/rule/legality.ts \
        gantt/src/types/legality.ts \
        gantt/src/services/legality-api.ts \
        gantt/src/version.ts
git commit -m "feat: add PATCH /rule/:ruleId/meta for legality rule metadata editing"
```

---

## Task 2: Store — add `updateRuleMeta` action

**Files:**
- Modify: `gantt/src/stores/legality-store.ts`

**Interfaces:**
- Consumes: `legalityApi.patchRuleMeta(ruleId, patch)` → `Promise<LegalityRule>` (from Task 1)
- Produces: `useLegalityStore((s) => s.updateRuleMeta)` — async, throws on error so caller can rollback UI

- [ ] **Step 1: Add `updateRuleMeta` to the store interface**

In `gantt/src/stores/legality-store.ts`, add the import for `UpdateRuleMetaRequest` to the existing import:

```typescript
import type {
  LegalityRule,
  LegalityRulesetSummary,
  UpdateRuleParamsResult,
  UpdateRuleMetaRequest,
} from '@/types/legality'
```

Then add to the `LegalityStore` interface (after `removeRule`):

```typescript
  updateRuleMeta: (ruleId: number, patch: UpdateRuleMetaRequest) => Promise<void>
```

- [ ] **Step 2: Implement `updateRuleMeta`**

In the `create<LegalityStore>` body, add after the `removeRule` implementation:

```typescript
  updateRuleMeta: async (ruleId, patch) => {
    const updated = await legalityApi.patchRuleMeta(ruleId, patch)
    set((s) => ({
      rules: s.rules.map((r) => r.id === ruleId ? { ...r, ...updated } : r),
    }))
  },
```

Note: This intentionally lets errors propagate — the calling component (RuleInlineCell) catches them and rolls back the UI.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/stores/legality-store.ts
git commit -m "feat: add updateRuleMeta action to legality store"
```

---

## Task 3: Create `RuleInlineCell` — inline editing cell component

**Files:**
- Create: `gantt/src/components/legality/rule-inline-cell.tsx`

**Interfaces:**
- Produces: `<RuleInlineCell value type onSave? placeholder? />` used in Task 4

- [ ] **Step 1: Create the component**

Create `gantt/src/components/legality/rule-inline-cell.tsx`:

```tsx
import { useRef, useState } from 'react'
import { severityLabelFromNum } from '@/utils/severity-labels'
import { SEVERITY_CHIP } from '@/components/rule/rule-badge-styles'
import { TAXONOMY_CHIP } from '@/components/rule/rule-badge-styles'

const SEV_CODE: Record<number, string> = { 1: 'INFO', 2: 'WARNING', 3: 'ERROR' }

interface Props {
  /** Current stored value. Pass the raw severity number (1/2/3) for type='severity'. */
  value: string | number | null
  type: 'text' | 'severity'
  /** If undefined, renders read-only (no click-to-edit). Called on confirm; throw to signal failure. */
  onSave?: (val: string | null) => Promise<void>
  placeholder?: string
}

export const RuleInlineCell = ({ value, type, onSave, placeholder = '—' }: Props) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const original = useRef<string | null>(null)

  const strVal = value !== null && value !== undefined ? String(value) : null

  const startEdit = () => {
    if (!onSave) return
    original.current = strVal
    setDraft(strVal ?? (type === 'severity' ? '1' : ''))
    setEditing(true)
  }

  const commit = async () => {
    setEditing(false)
    const newVal = type === 'text' ? (draft.trim() || null) : draft
    if (newVal === original.current) return
    try {
      await onSave(newVal)
    } catch {
      // parent re-renders with the old value from the store rollback — no local state needed
    }
  }

  const cancel = () => setEditing(false)

  if (!editing) {
    const displayNode =
      type === 'severity' && strVal ? (
        <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${SEVERITY_CHIP[SEV_CODE[Number(strVal)]] ?? 'bg-muted text-muted-foreground'}`}>
          {severityLabelFromNum(Number(strVal))}
        </span>
      ) : strVal ? (
        <span className={`text-3xs ${TAXONOMY_CHIP}`}>{strVal}</span>
      ) : (
        <span className="text-2xs text-muted-foreground">{placeholder}</span>
      )

    return (
      <span
        className={onSave ? 'cursor-pointer rounded px-0.5 hover:ring-1 hover:ring-border' : ''}
        onClick={startEdit}
        title={onSave ? 'Click to edit' : undefined}
      >
        {displayNode}
      </span>
    )
  }

  if (type === 'severity') {
    return (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') cancel() }}
        className="rounded border border-border bg-card px-1 py-0.5 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="1">Soft</option>
        <option value="2">Overridable</option>
        <option value="3">Hard</option>
      </select>
    )
  }

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') cancel() }}
      placeholder={placeholder}
      className="w-full min-w-[80px] rounded border border-border bg-card px-1.5 py-0.5 text-2xs text-foreground outline-none focus:ring-1 focus:ring-primary"
    />
  )
}
```

- [ ] **Step 2: Run the UI standard check**

```bash
npm run check:ui
```

Expected: `0 hard violations`. Fix any before continuing.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/legality/rule-inline-cell.tsx
git commit -m "feat: add RuleInlineCell inline editing cell for legality"
```

---

## Task 4: Update `LegalityRuleRow` — new columns + inline editing

**Files:**
- Modify: `gantt/src/components/legality/legality-rule-row.tsx`
- Modify: `gantt/src/components/legality/legality-rule-sets-view.tsx` (table `<thead>` columns + colSpan)

**Interfaces:**
- Consumes: `RuleInlineCell` (Task 3), `useLegalityStore((s) => s.updateRuleMeta)` (Task 2)

Changes to `LegalityRuleRow`:
1. Rule `<td>`: show `${rule.function}/${rule.instance ?? ''}` only (remove description from cell; keep `ruleDisplayName` for search in the view)
2. Add Description `<td>` (read-only, truncated text)
3. Add Reference `<td>` (inline editable via `RuleInlineCell`)
4. Category `<td>`: replace static chip with `RuleInlineCell`
5. Div `<td>`: replace static chip with `RuleInlineCell`
6. Severity `<td>`: replace static chip with `RuleInlineCell type="severity"`
7. Change `colSpan={6}` → `colSpan={8}` in the expanded params row

- [ ] **Step 1: Update `legality-rule-row.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { Maximize2, Trash2 } from 'lucide-react'
import { SEVERITY_CHIP } from '@/components/rule/rule-badge-styles'
import { severityLabelFromNum } from '@/utils/severity-labels'
import { LegalityParamTable } from './legality-param-table'
import { LegalityParamDialog } from './legality-param-dialog'
import { LegalityParamTableEditor } from './legality-param-table-editor'
import { RuleInlineCell } from './rule-inline-cell'
import { useAuthStore } from '@/stores/auth-store'
import { useLegalityStore } from '@/stores/legality-store'
import type { LegalityRule } from '@/types/legality'
import type { UpdateRuleMetaRequest } from '@/types/legality'

/** Numeric severity (1/2/3) → the string key SEVERITY_CHIP is built on. */
const SEV_CODE: Record<number, string> = { 1: 'INFO', 2: 'WARNING', 3: 'ERROR' }

/** "8002/006 - Maximum Flight Time" — kept for search filtering in the parent view. */
export const ruleDisplayName = (rule: LegalityRule): string => {
  const code = `${rule.function}/${rule.instance ?? ''}`
  return rule.description ? `${code} - ${rule.description}` : code
}

interface Props {
  rule: LegalityRule
  /** When provided (admin, Rule Sets mgmt), renders a Remove-from-set action. */
  onRemove?: (rule: LegalityRule) => void
}

export const LegalityRuleRow = ({ rule, onRemove }: Props) => {
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const key = `${rule.function}-${rule.instance ?? ''}`
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === 1)
  const recordParamSave = useLegalityStore((s) => s.recordParamSave)
  const updateRuleMeta = useLegalityStore((s) => s.updateRuleMeta)
  const paramCount = rule.paramJson?.tables.reduce((n, t) => n + t.header.length, 0) ?? 0

  const saveMeta = isAdmin
    ? (patch: UpdateRuleMetaRequest) => updateRuleMeta(rule.id, patch)
    : undefined

  return (
    <>
      <tr
        data-testid={`legality-rule-row-${key}`}
        onDoubleClick={() => setExpanded((e) => !e)}
        title="Double-click to show / hide parameters"
        className={[
          'cursor-pointer select-none border-b border-border/40 transition-colors',
          expanded ? 'bg-muted/30' : 'hover:bg-muted/20',
        ].join(' ')}
      >
        {/* Col 1: Rule — function/instance code only */}
        <td className="py-2.5 pl-4 pr-3">
          <div data-testid={`legality-rule-name-${key}`} className="text-xs font-semibold text-foreground">
            {rule.function}/{rule.instance ?? ''}
          </div>
        </td>

        {/* Col 2: Description — read-only */}
        <td className="py-2.5 pr-3 max-w-[180px]">
          {rule.description ? (
            <span className="block truncate text-2xs text-foreground" title={rule.description}>
              {rule.description}
            </span>
          ) : (
            <span className="text-2xs text-muted-foreground">—</span>
          )}
        </td>

        {/* Col 3: Reference — inline editable */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <RuleInlineCell
            value={rule.reference}
            type="text"
            onSave={saveMeta ? (val) => saveMeta({ reference: val }) : undefined}
            placeholder="—"
          />
        </td>

        {/* Col 4: Category — inline editable */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <RuleInlineCell
            value={rule.category}
            type="text"
            onSave={saveMeta ? (val) => saveMeta({ category: val }) : undefined}
            placeholder="—"
          />
        </td>

        {/* Col 5: Division — inline editable */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <RuleInlineCell
            value={rule.division}
            type="text"
            onSave={saveMeta ? (val) => saveMeta({ division: val }) : undefined}
            placeholder="—"
          />
        </td>

        {/* Col 6: Severity — inline editable select */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <RuleInlineCell
            value={rule.severity}
            type="severity"
            onSave={saveMeta ? (val) => saveMeta({ severity: Number(val) as 1 | 2 | 3 }) : undefined}
          />
        </td>

        {/* Col 7: Param count */}
        <td className="whitespace-nowrap py-2.5 pr-3 text-2xs text-muted-foreground">
          {paramCount > 0 ? `${paramCount} param${paramCount === 1 ? '' : 's'}` : '—'}
        </td>

        {/* Col 8: Actions */}
        <td className="py-2.5 pr-4">
          <div className="flex items-center gap-1" onDoubleClick={(e) => e.stopPropagation()}>
            <button
              data-testid={`legality-rule-edit-${key}`}
              onClick={() => setExpanded((e) => !e)}
              className="rounded border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {expanded ? 'Close' : 'Edit'}
            </button>
            <button
              data-testid={`legality-rule-popup-${key}`}
              onClick={() => setDialogOpen(true)}
              title="Open in window"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            {onRemove && (
              <button
                data-testid={`rule-set-remove-${key}`}
                onClick={() => onRemove(rule)}
                title="Remove from this set"
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <LegalityParamDialog rule={rule} open={dialogOpen} onClose={() => setDialogOpen(false)} />
        </td>
      </tr>

      {/* Inline params row — colSpan must match the 8 columns above */}
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-muted/10 p-0">
            {isAdmin && rule.paramJson ? (
              <div data-testid={`legality-params-${key}`}>
                <LegalityParamTableEditor
                  ruleId={rule.id}
                  paramJson={rule.paramJson}
                  fn={rule.function}
                  inst={rule.instance}
                  onSaved={(result) => recordParamSave(rule.id, result)}
                />
              </div>
            ) : (
              <LegalityParamTable paramJson={rule.paramJson} fn={rule.function} inst={rule.instance} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}
```

- [ ] **Step 2: Update the table `<thead>` in `legality-rule-sets-view.tsx`**

Find the existing `<thead>` block (around line 192) and replace it:

```tsx
<thead>
  <tr className="border-b border-border bg-card">
    <th className="py-2 pl-4 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Rule</th>
    <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Description</th>
    <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Reference</th>
    <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Category</th>
    <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Div</th>
    <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Severity</th>
    <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Params</th>
    <th className="py-2 pr-4 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground" />
  </tr>
</thead>
```

Also update the "no rules match" row's colSpan from `6` to `8`:

```tsx
<td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">No rules match the search</td>
```

And the "No rules in this ruleset" row (not inside the table, already a div — leave as-is).

- [ ] **Step 3: Run UI check + verify in browser**

```bash
npm run check:ui
```

Start gantt (`cd gantt && npm run dev`), navigate to Legality → Rule Sets, open the F8 Full Ruleset. Verify:
- Rule column shows `8002/001` style (no description in that cell)
- Description column shows the description text
- Reference column shows the reference code; clicking it (as admin) opens an input
- Category / Div columns are clickable inputs (as admin)
- Severity column shows the colored chip; clicking it (as admin) opens a select

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/legality/legality-rule-row.tsx \
        gantt/src/components/legality/legality-rule-sets-view.tsx
git commit -m "feat: legality RuleTable — Description/Reference columns + inline editable Category/Div/Severity/Reference"
```

---

## Task 5: Create `RuleCatalogTree` component

**Files:**
- Create: `gantt/src/components/legality/rule-catalog-tree.tsx`

**Interfaces:**
- Produces: `<RuleCatalogTree />` — a self-contained panel that reads `selectedId` and `rules` from the legality store; exposes tree navigation and per-instance actions

The tree fetches the catalog itself (via `legalityApi.listRules()`). It refreshes after Copy or Delete. "Add to Set" delegates to `store.addRule(ruleId)`.

- [ ] **Step 1: Create the component**

Create `gantt/src/components/legality/rule-catalog-tree.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Star, Plus, Copy as CopyIcon, Trash2, Search, Trees } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { legalityApi } from '@/services/legality-api'
import { useLegalityStore } from '@/stores/legality-store'
import { useAuthStore } from '@/stores/auth-store'
import { notify } from '@/utils/notify'
import type { LegalityCatalogRule } from '@/types/legality'

// ── Tree data structures ──────────────────────────────────────────────────────

interface FunctionNode {
  functionCode: number
  description: string | null
  instances: LegalityCatalogRule[]
}
interface CategoryNode {
  category: string
  functions: FunctionNode[]
}
interface ReferenceNode {
  reference: string
  categories: CategoryNode[]
}

/** Group catalog rules into 4-level hierarchy. null values displayed as "—". */
const buildTree = (catalog: LegalityCatalogRule[]): ReferenceNode[] => {
  const refMap = new Map<string, Map<string, Map<number, LegalityCatalogRule[]>>>()
  for (const rule of catalog) {
    const ref = rule.reference ?? '(No Reference)'
    const cat = rule.category ?? '(No Category)'
    if (!refMap.has(ref)) refMap.set(ref, new Map())
    const catMap = refMap.get(ref)!
    if (!catMap.has(cat)) catMap.set(cat, new Map())
    const fnMap = catMap.get(cat)!
    if (!fnMap.has(rule.function)) fnMap.set(rule.function, [])
    fnMap.get(rule.function)!.push(rule)
  }
  return Array.from(refMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([ref, catMap]) => ({
    reference: ref,
    categories: Array.from(catMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([cat, fnMap]) => ({
      category: cat,
      functions: Array.from(fnMap.entries()).sort(([a], [b]) => a - b).map(([fn, instances]) => ({
        functionCode: fn,
        description: instances[0]?.description ?? null,
        instances: [...instances].sort((a, b) => (a.instance ?? '').localeCompare(b.instance ?? '')),
      })),
    })),
  }))
}

/** Return true if a rule matches the search query. */
const ruleMatches = (rule: LegalityCatalogRule, q: string): boolean => {
  const lq = q.toLowerCase()
  return (
    String(rule.function).includes(lq) ||
    (rule.reference?.toLowerCase().includes(lq) ?? false) ||
    (rule.category?.toLowerCase().includes(lq) ?? false) ||
    (rule.description?.toLowerCase().includes(lq) ?? false) ||
    (rule.instance?.toLowerCase().includes(lq) ?? false)
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export const RuleCatalogTree = () => {
  const [catalog, setCatalog] = useState<LegalityCatalogRule[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  // Keys = `ref::cat::fn` or `ref::cat`; top-level refs always start open
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<LegalityCatalogRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === 1)
  const selectedId = useLegalityStore((s) => s.selectedId)
  const rulesInSet = useLegalityStore((s) => new Set(s.rules.map((r) => r.id)))
  const addRule = useLegalityStore((s) => s.addRule)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const rules = await legalityApi.listRules()
      setCatalog(rules)
      // Expand all top-level reference nodes by default
      setOpenNodes((prev) => {
        const next = new Set(prev)
        const unique = new Set(rules.map((r) => r.reference ?? '(No Reference)'))
        unique.forEach((ref) => next.add(`ref::${ref}`))
        return next
      })
    } catch {
      notify.error('Failed to load rule catalog')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  const toggle = (key: string) => setOpenNodes((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // Filter catalog by search, then rebuild tree
  const filtered = search ? catalog.filter((r) => ruleMatches(r, search)) : catalog
  const tree = useMemo(() => buildTree(filtered), [filtered])

  const handleAddToSet = async (rule: LegalityCatalogRule) => {
    if (selectedId == null) return
    await addRule(rule.id)
  }

  const handleCopy = async (rule: LegalityCatalogRule) => {
    try {
      const copy = await legalityApi.copyRule(rule.id)
      notify.success(`Copied to instance ${copy.instance ?? ''}`)
      await loadCatalog()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Copy failed')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await legalityApi.deleteRule(confirmDelete.id)
      notify.success(`Deleted rule ${confirmDelete.function}/${confirmDelete.instance ?? ''}`)
      setConfirmDelete(null)
      await loadCatalog()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div data-testid="rule-catalog-tree" className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Trees className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-semibold text-foreground">Rule Instances</span>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-border px-2 py-1.5">
        <div className="flex h-6 items-center gap-1.5 rounded border border-border bg-background px-2">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="w-full bg-transparent text-2xs text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="py-8 text-center text-2xs text-muted-foreground">Loading…</div>
        )}
        {!loading && tree.length === 0 && (
          <div className="py-8 text-center text-2xs text-muted-foreground">No rules found</div>
        )}
        {tree.map((refNode) => {
          const refKey = `ref::${refNode.reference}`
          const refOpen = openNodes.has(refKey)
          return (
            <div key={refNode.reference}>
              {/* Level 1: Reference */}
              <button
                type="button"
                onClick={() => toggle(refKey)}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-accent/40"
              >
                {refOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="truncate text-2xs font-semibold text-foreground">{refNode.reference}</span>
              </button>

              {refOpen && refNode.categories.map((catNode) => {
                const catKey = `ref::${refNode.reference}::cat::${catNode.category}`
                const catOpen = openNodes.has(catKey)
                return (
                  <div key={catNode.category}>
                    {/* Level 2: Category */}
                    <button
                      type="button"
                      onClick={() => toggle(catKey)}
                      className="flex w-full items-center gap-1.5 py-0.5 pl-5 pr-2 text-left hover:bg-accent/40"
                    >
                      {catOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      <span className="truncate text-2xs text-muted-foreground">{catNode.category}</span>
                    </button>

                    {catOpen && catNode.functions.map((fnNode) => {
                      const fnKey = `ref::${refNode.reference}::cat::${catNode.category}::fn::${fnNode.functionCode}`
                      const fnOpen = openNodes.has(fnKey)
                      return (
                        <div key={fnNode.functionCode}>
                          {/* Level 3: Function */}
                          <button
                            type="button"
                            onClick={() => toggle(fnKey)}
                            className="flex w-full items-center gap-1.5 py-0.5 pl-8 pr-2 text-left hover:bg-accent/40"
                          >
                            {fnOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            <span className="truncate text-2xs text-foreground">
                              <span className="font-mono">{fnNode.functionCode}</span>
                              {fnNode.description && <span className="ml-1 text-muted-foreground">{fnNode.description}</span>}
                            </span>
                          </button>

                          {fnOpen && fnNode.instances.map((rule) => {
                            const inSet = rulesInSet.has(rule.id)
                            const noSet = selectedId == null
                            return (
                              <div
                                key={rule.id}
                                data-testid={`catalog-instance-${rule.function}-${rule.instance ?? ''}`}
                                className="group flex items-center gap-1 py-0.5 pl-11 pr-2 hover:bg-accent/40"
                              >
                                {/* Level 4: Instance */}
                                {rule.isTemplate ? (
                                  <Star className="h-3 w-3 shrink-0 text-amber-500" />
                                ) : (
                                  <span className="h-3 w-3 shrink-0" />
                                )}
                                <span className={`flex-1 font-mono text-2xs ${rule.isTemplate ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                                  {rule.instance ?? '?'}
                                </span>
                                {rule.isTemplate && (
                                  <span className="rounded bg-amber-100 px-1 py-0.5 text-3xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    Template
                                  </span>
                                )}
                                {/* Actions (admin, hover-revealed) */}
                                {isAdmin && (
                                  <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      data-testid={`catalog-add-${rule.id}`}
                                      onClick={() => void handleAddToSet(rule)}
                                      disabled={noSet || inSet}
                                      title={noSet ? 'Select a rule set first' : inSet ? 'Already in this set' : 'Add to set'}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                    <button
                                      data-testid={`catalog-copy-${rule.id}`}
                                      onClick={() => void handleCopy(rule)}
                                      title="Copy to new instance"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                    >
                                      <CopyIcon className="h-3 w-3" />
                                    </button>
                                    {!rule.isTemplate && (
                                      <button
                                        data-testid={`catalog-delete-${rule.id}`}
                                        onClick={() => setConfirmDelete(rule)}
                                        title="Delete this instance"
                                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Delete confirmation dialog */}
      <AppDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o && !deleting) setConfirmDelete(null) }}
        data-testid="catalog-delete-dialog"
        className="sm:max-w-[400px]"
        icon={<Trash2 className="h-4 w-4" />}
        title="Delete Rule Instance"
        dismissable={!deleting}
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDeleteConfirm()}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-foreground">
          Delete rule{' '}
          <span className="font-mono font-semibold">
            {confirmDelete?.function}/{confirmDelete?.instance ?? ''}
          </span>
          ? This cannot be undone. The rule must not be a member of any set.
        </p>
      </AppDialog>
    </div>
  )
}
```

- [ ] **Step 2: Run UI check**

```bash
npm run check:ui
```

Expected: `0 hard violations`.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/legality/rule-catalog-tree.tsx
git commit -m "feat: add RuleCatalogTree 4-level catalog panel with search and admin actions"
```

---

## Task 6: Wire `RuleCatalogTree` into `LegalityRuleSetsView` — 3-column layout

**Files:**
- Modify: `gantt/src/components/legality/legality-rule-sets-view.tsx`

- [ ] **Step 1: Add the import and insert the tree**

At the top of `legality-rule-sets-view.tsx`, add the import after the other component imports:

```typescript
import { RuleCatalogTree } from './rule-catalog-tree'
```

Then in the JSX, find the outermost `<div>` that wraps everything (line 88):

```tsx
<div data-testid="legality-rule-sets-view" className="flex h-full overflow-hidden">
```

Insert `<RuleCatalogTree />` as the first child, before the `<aside>` block:

```tsx
<div data-testid="legality-rule-sets-view" className="flex h-full overflow-hidden">
  <RuleCatalogTree />

  {/* Left: every legacy ruleset (workset) ... */}
  <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
    ...
  </aside>
  ...
```

No other changes to the view are needed — the 3-column layout is automatic because the existing `<aside>` is already `w-64 shrink-0` and the right panel is `flex-1 min-w-0`.

- [ ] **Step 2: Run UI check + verify layout in browser**

```bash
npm run check:ui
```

Start gantt (`cd gantt && npm run dev`), navigate to Legality → Rule Sets. Verify:
- Three panels are visible: Rule Catalog Tree | Rule Sets | Rule Table
- Tree is 280px wide with a search bar and collapsible hierarchy
- Template instances show a gold star and "Template" badge
- Clicking "+" on an instance (when a set is selected) adds it to the set and refreshes the table
- Clicking "⧉" copies the instance (new entry appears in tree after refresh)
- Clicking "🗑" on a non-template shows the confirmation dialog

- [ ] **Step 3: Run the existing legality tests to check for regressions**

```bash
npx playwright test e2e/tests/gantt/legality-rule-sets.spec.ts --reporter=list
```

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/legality/legality-rule-sets-view.tsx
git commit -m "feat: wire RuleCatalogTree into LegalityRuleSetsView — 3-column layout"
```

---

## Task 7: Playwright E2E tests

**Files:**
- Create: `e2e/tests/gantt/legality-rule-catalog-tree.spec.ts`

Tests cover: tree visible, inline editing (Category cell), Add to Set action.

- [ ] **Step 1: Write the test**

Create `e2e/tests/gantt/legality-rule-catalog-tree.spec.ts`:

```typescript
/**
 * Legality Rule Catalog Tree — E2E tests.
 *
 * Covers: tree renders with instances, template badge visible, inline cell editing,
 * Add to Set action.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
interface Auth { token: string; userCode: string; userName: string; schema: string; isAdmin: number }

const adminLogin = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })
  expect(res.ok()).toBeTruthy()
  const a = ((await res.json()) as { data: Auth }).data
  expect(a.isAdmin).toBe(1)
  return a
}

const seedAdmin = async (page: Page, a: Auth) => {
  await page.addInitScript((x) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: x.userCode, userName: x.userName, schema: x.schema, isAdmin: x.isAdmin }, token: x.token,
    }))
  }, a)
}

test.describe('Legality — Rule Catalog Tree', () => {
  test('tree panel renders with template badge and instance nodes', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-nav-rule-sets').waitFor({ state: 'visible' }).catch(() => {})

    // Tree panel visible
    await expect(page.getByTestId('rule-catalog-tree')).toBeVisible()

    // At least one instance node exists
    const instances = page.locator('[data-testid^="catalog-instance-"]')
    await expect(instances.first()).toBeVisible()

    // At least one template badge is visible
    await expect(page.getByText('Template').first()).toBeVisible()
  })

  test('inline Category cell editing — admin can update and save', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-nav-rule-sets').waitFor({ state: 'visible' }).catch(() => {})

    // Wait for the rule table to load (at least one row visible)
    const firstRow = page.locator('[data-testid^="legality-rule-row-"]').first()
    await expect(firstRow).toBeVisible()

    // Find the Category cell in the first row (4th td: rule, desc, ref, category)
    const categoryCell = firstRow.locator('td').nth(3).locator('span').first()
    const originalText = await categoryCell.textContent()

    // Click to enter edit mode
    await categoryCell.click()
    const input = firstRow.locator('td').nth(3).locator('input')
    await expect(input).toBeVisible()

    // Type new value and press Enter
    await input.fill('QA-Cat-Test')
    await input.press('Enter')

    // Cell should now show the new value
    await expect(firstRow.locator('td').nth(3)).toContainText('QA-Cat-Test')

    // Restore original value
    await firstRow.locator('td').nth(3).locator('span').first().click()
    const restoreInput = firstRow.locator('td').nth(3).locator('input')
    await restoreInput.fill(originalText ?? '')
    await restoreInput.press('Enter')
  })

  test('Escape key cancels edit and reverts value', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-nav-rule-sets').waitFor({ state: 'visible' }).catch(() => {})

    const firstRow = page.locator('[data-testid^="legality-rule-row-"]').first()
    await expect(firstRow).toBeVisible()

    // Get original category text
    const catCell = firstRow.locator('td').nth(3)
    const orig = await catCell.textContent()

    // Click to edit, type something, press Escape
    await catCell.locator('span').first().click()
    await catCell.locator('input').fill('SHOULD-NOT-SAVE')
    await catCell.locator('input').press('Escape')

    // Cell should still show original text (not the abandoned edit)
    await expect(catCell).toContainText(orig ?? '')
    await expect(catCell).not.toContainText('SHOULD-NOT-SAVE')
  })

  test('Add to Set — adds a catalog rule to the selected rule set', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    const token = auth.token

    // Get current rules in the first set so we can verify the add
    const setsRes = await request.get(`${GANTT_API}/api/legality/rulesets`, { headers: { Authorization: `Bearer ${token}` } })
    const sets = ((await setsRes.json()) as { data: Array<{ id: number; ruleCount: number }> }).data
    expect(sets.length).toBeGreaterThan(0)
    const firstSetId = sets[0].id

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-nav-rule-sets').waitFor({ state: 'visible' }).catch(() => {})

    // Select the first ruleset
    await page.getByTestId(`legality-ruleset-card-${firstSetId}`).click()

    // Wait for rule table to load
    await page.locator('[data-testid^="legality-rule-row-"]').first().waitFor({ state: 'visible' })

    // Find a catalog-add button that is NOT disabled (a rule not yet in the set)
    const addBtn = page.locator('[data-testid^="catalog-add-"]:not([disabled])').first()

    // Hover the parent instance node to reveal the button
    await addBtn.locator('..').hover()
    await expect(addBtn).toBeVisible()

    const ruleCountBefore = await page.locator('[data-testid^="legality-rule-row-"]').count()
    await addBtn.click()

    // Rule table should have one more row (or at least the count increased)
    await expect(page.locator('[data-testid^="legality-rule-row-"]')).toHaveCount(ruleCountBefore + 1)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx playwright test e2e/tests/gantt/legality-rule-catalog-tree.spec.ts --reporter=list
```

Expected: all 4 tests PASS. If the "Add to Set" test is flaky due to rule-already-in-set state, use a fresh QA set (follow the pattern in `legality-rule-sets.spec.ts` — create a temporary set, add to it, then delete).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/legality-rule-catalog-tree.spec.ts
git commit -m "test: E2E — Legality Rule Catalog Tree (tree render, inline edit, add-to-set)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| 3-column layout (Tree 280px / RuleSets 256px / Table flex) | Task 6 |
| Tree: 4-level hierarchy (reference→category→function→instance) | Task 5 |
| Tree: instances sorted ascending | Task 5 (`.sort()` in `buildTree`) |
| Tree: template (001) shows gold star + "Template" badge | Task 5 |
| Tree: search filter | Task 5 |
| Tree: Add to Set action | Task 5 + store.addRule |
| Tree: Copy action | Task 5 + legalityApi.copyRule |
| Tree: Delete action (non-template only) | Task 5 + legalityApi.deleteRule |
| Tree: disabled Add if no set selected or already in set | Task 5 |
| Table: Rule column shows code only (no description) | Task 4 |
| Table: new Description column (read-only) | Task 4 |
| Table: new Reference column (editable) | Task 4 |
| Table: Category editable | Task 4 |
| Table: Div editable | Task 4 |
| Table: Severity editable select | Task 4 |
| PATCH /rule/:ruleId/meta endpoint | Task 1 |
| colSpan updated 6→8 | Task 4 |
| E2E test | Task 7 |
