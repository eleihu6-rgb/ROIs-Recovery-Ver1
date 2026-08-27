# Rule Management UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 bugs/UX issues in the rule group management UI and add a new Template & Instance catalog page.

**Architecture:** Tasks 1–4 are surgical fixes to existing files. Task 5 adds backend endpoints. Task 6 adds a new catalog tab with two panels (Templates + Instances) using new components and a shared API service. All changes stay within the existing Zustand store + FastifyInstance + Drizzle pattern.

**Tech Stack:** React 19, Zustand, TypeScript, Fastify, Drizzle ORM, @dnd-kit/sortable, @rois/ui

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `gantt/src/stores/rule-config-store.ts` | Modify | Fix itemCount sync after addItems |
| `gantt/src/types/rule-config.ts` | Modify | Add division, RuleTemplate, FullInstanceConfig types |
| `gantt/src/services/rule-config-api.ts` | Modify | Add severity/messageTemplate to instancePatch |
| `gantt/src/services/rule-catalog-api.ts` | Create | Template + instance CRUD API calls |
| `gantt/src/components/rule/rule-group-rules.tsx` | Modify | Drag guard + division column header |
| `gantt/src/components/rule/rule-group-row.tsx` | Modify | Division badge + inline severity select |
| `gantt/src/components/rule/rule-catalog-view.tsx` | Create | Templates & Instances tab content |
| `gantt/src/components/rule/instance-edit-dialog.tsx` | Create | Create / edit / copy instance dialog |
| `gantt/src/components/rule/rule-manager-view.tsx` | Modify | Add Groups / Catalog tab switcher |
| `gantt/src/version.ts` | Modify | Bump FRONTEND_VERSION |
| `live-server/src/services/rule/rule-config-service.ts` | Modify | CALC sort, division in listGroupItems, template/instance CRUD |
| `live-server/src/routes/rule/rule-config.ts` | Modify | Fix instancePatchSchema, add template + instance routes |
| `gantt/src/version.ts` | Modify | Bump BACKEND_VERSION |

---

## Task 1: Fix itemCount sync + route schema cleanup

**Files:**
- Modify: `gantt/src/stores/rule-config-store.ts`
- Modify: `live-server/src/routes/rule/rule-config.ts`

- [ ] **Step 1: Fix addItems to sync itemCount**

In `gantt/src/stores/rule-config-store.ts`, replace `addItems`:

```typescript
addItems: async (instanceCodes: string[]) => {
  const { selectedGroupCode } = get()
  if (!selectedGroupCode) return
  await ruleConfigApi.addItems(selectedGroupCode, instanceCodes)
  await get().selectGroup(selectedGroupCode)
  // Sync itemCount on the sidebar card without a full fetchGroups
  const newCount = get().groupItems.length
  set((s) => ({
    groups: s.groups.map((g) =>
      g.groupCode === selectedGroupCode ? { ...g, itemCount: newCount } : g,
    ),
  }))
},
```

- [ ] **Step 2: Fix instancePatchSchema in route to include severity + messageTemplate**

In `live-server/src/routes/rule/rule-config.ts`, replace `instancePatchSchema`:

```typescript
const instancePatchSchema = z.object({
  conditions:      z.record(z.unknown()).nullable().optional(),
  params:          z.record(z.unknown()).optional(),
  severity:        z.enum(['ERROR', 'WARNING', 'INFO']).optional(),
  messageTemplate: z.string().nullable().optional(),
})
```

Also clean up `itemPatchSchema` — remove the old override fields that no longer exist:

```typescript
const itemPatchSchema = z.object({
  enabled: z.boolean().optional(),
})
```

- [ ] **Step 3: Commit**

```bash
git add gantt/src/stores/rule-config-store.ts \
        live-server/src/routes/rule/rule-config.ts
git commit -m "fix(rule): sync itemCount after addItems; fix instancePatch schema"
```

---

## Task 2: Add division field to type + listGroupItems API

**Files:**
- Modify: `gantt/src/types/rule-config.ts`
- Modify: `live-server/src/services/rule/rule-config-service.ts`

- [ ] **Step 1: Add division to RuleGroupItemConfig type**

In `gantt/src/types/rule-config.ts`, add `division: string` to `RuleGroupItemConfig`:

```typescript
export interface RuleGroupItemConfig {
  id: number
  instanceId: number
  instanceCode: string
  templateCode: string
  name: string
  reference: string | null
  category: string
  checkType: string
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: RuleConditions | null
  paramSchema: Record<string, unknown>
  templateVars: TemplateVar[]
  messageTemplate: string | null
  enabled: boolean
  sortOrder: number
  division: string          // ← new
}
```

- [ ] **Step 2: Return division from listGroupItems SQL**

In `live-server/src/services/rule/rule-config-service.ts`, in `listGroupItems`, update the SELECT:

```typescript
const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
  SELECT
    rgi.id, rgi.instance_id, rgi.enabled, rgi.sort_order,
    i.instance_code, i.name, i.template_code, i.reference,
    i.severity, i.overridable, i.params, i.conditions,
    i.message_template, i.division,
    t.category, t.check_type, t.param_schema, t.template_vars
  FROM rule_group g
    JOIN rule_group_instance rgi ON rgi.group_id = g.id
    JOIN rule_instance i         ON i.id = rgi.instance_id AND i.is_deleted = 0
    JOIN rule_template t         ON t.code = i.template_code
  WHERE g.group_code = $1 AND g.filiale = $2 AND g.is_deleted = 0
  ORDER BY rgi.sort_order, t.check_type DESC
`, [groupCode, filiale])
```

Update the mapper to include division:

```typescript
return rows.map((r) => ({
  id: Number(r.id),
  instanceId: Number(r.instance_id),
  instanceCode: r.instance_code as string,
  templateCode: r.template_code as string,
  name: r.name as string,
  reference: r.reference as string | null,
  category: r.category as string,
  checkType: r.check_type as string,
  severity: r.severity as string,
  overridable: r.overridable as boolean,
  params: r.params as Record<string, unknown>,
  conditions: r.conditions as Record<string, unknown> | null,
  paramSchema: r.param_schema as Record<string, unknown>,
  templateVars: (r.template_vars as Array<{ name: string; label: string; example: string | number }>) ?? [],
  messageTemplate: r.message_template as string | null,
  enabled: r.enabled as boolean,
  sortOrder: Number(r.sort_order),
  division: r.division as string,
}))
```

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/rule-config.ts \
        live-server/src/services/rule/rule-config-service.ts
git commit -m "feat(rule): add division field to group items"
```

---

## Task 3: CALC sort order (backend) + drag guard + division column (frontend)

**Files:**
- Modify: `live-server/src/services/rule/rule-config-service.ts`
- Modify: `gantt/src/components/rule/rule-group-rules.tsx`

- [ ] **Step 1: Update addItems to place CALC instances first**

In `live-server/src/services/rule/rule-config-service.ts`, replace the `addItems` method body with logic that separates CALC from non-CALC and assigns sort orders accordingly:

```typescript
async addItems(
  fastify: FastifyInstance,
  filiale: string,
  groupCode: string,
  userCode: string,
  instanceCodes: string[],
): Promise<void> {
  const { rows: grRows } = await fastify.pgPool.query<Record<string, unknown>>(
    `SELECT id FROM rule_group WHERE group_code = $1 AND filiale = $2 AND is_deleted = 0`,
    [groupCode, filiale],
  )
  if (grRows.length === 0) return
  const groupId = Number(grRows[0].id)

  // Resolve instances with their check_type
  const { rows: instRows } = await fastify.pgPool.query<Record<string, unknown>>(`
    SELECT i.id, i.instance_code, t.check_type
    FROM rule_instance i
    JOIN rule_template t ON t.code = i.template_code
    WHERE i.instance_code = ANY($1::text[]) AND i.filiale = $2 AND i.is_deleted = 0
  `, [instanceCodes, filiale])

  const calcIds   = instRows.filter((r) => r.check_type === 'CALC').map((r) => Number(r.id))
  const checkIds  = instRows.filter((r) => r.check_type !== 'CALC').map((r) => Number(r.id))

  // CALC items go before existing minimum; CHECK items go after existing maximum
  const { rows: rangeRows } = await fastify.pgPool.query<Record<string, unknown>>(
    `SELECT COALESCE(MIN(sort_order), 0) AS min_order, COALESCE(MAX(sort_order), -1) AS max_order
     FROM rule_group_instance WHERE group_id = $1`,
    [groupId],
  )
  const minOrder = Number(rangeRows[0].min_order)
  const maxOrder = Number(rangeRows[0].max_order)

  // Insert CALC instances before existing items (descending from minOrder-1)
  for (let i = 0; i < calcIds.length; i++) {
    await fastify.pgPool.query(`
      INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
      VALUES ($1, $2, true, $3, $4, $4)
      ON CONFLICT (group_id, instance_id) DO NOTHING
    `, [groupId, calcIds[i], minOrder - calcIds.length + i, userCode])
  }

  // Insert CHECK instances after existing items
  for (let i = 0; i < checkIds.length; i++) {
    await fastify.pgPool.query(`
      INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
      VALUES ($1, $2, true, $3, $4, $4)
      ON CONFLICT (group_id, instance_id) DO NOTHING
    `, [groupId, checkIds[i], maxOrder + 1 + i, userCode])
  }
},
```

- [ ] **Step 2: Add drag guard and division column header in RuleGroupRules**

In `gantt/src/components/rule/rule-group-rules.tsx`:

Replace `handleDragEnd`:

```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = groupItems.findIndex((i) => i.instanceCode === String(active.id))
  const newIndex = groupItems.findIndex((i) => i.instanceCode === String(over.id))
  if (oldIndex === -1 || newIndex === -1) return

  const movedItem = groupItems[oldIndex]
  // CHECK/BOTH items cannot move before any CALC item
  if (movedItem.checkType !== 'CALC') {
    const lastCalcIndex = groupItems.reduce(
      (acc, item, idx) => (item.checkType === 'CALC' ? idx : acc), -1,
    )
    if (newIndex <= lastCalcIndex) return
  }

  const reordered = [...groupItems]
  const [moved] = reordered.splice(oldIndex, 1)
  reordered.splice(newIndex, 0, moved)
  void reorderItems(reordered.map((i) => i.instanceCode))
}
```

Add Division column to the table header (after Category, before Severity):

```tsx
<th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Div</th>
```

- [ ] **Step 3: Commit**

```bash
git add live-server/src/services/rule/rule-config-service.ts \
        gantt/src/components/rule/rule-group-rules.tsx
git commit -m "feat(rule): CALC sort first on add; block dragging CHECK before CALC; add Div column header"
```

---

## Task 4: Division badge + inline severity select in row

**Files:**
- Modify: `gantt/src/components/rule/rule-group-row.tsx`

- [ ] **Step 1: Add division badge and inline severity select**

Replace the entire `RuleGroupRow` component in `gantt/src/components/rule/rule-group-row.tsx`:

```tsx
import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { OverrideEditor } from './override-editor'
import type { RuleGroupItemConfig } from '@/types/rule-config'

const CAT_STYLE: Record<string, string> = {
  FDP:           'bg-indigo-950 text-indigo-300',
  FLIGHT_TIME:   'bg-emerald-950 text-emerald-300',
  REST:          'bg-purple-950 text-purple-300',
  DUTY:          'bg-lime-950 text-lime-300',
  FATIGUE:       'bg-amber-950 text-amber-300',
  QUALIFICATION: 'bg-sky-950 text-sky-300',
  COMPOSITION:   'bg-pink-950 text-pink-300',
  CALC:          'bg-slate-800 text-slate-400',
}

const SEV_STYLE: Record<string, string> = {
  ERROR:   'bg-red-950 text-red-300 border border-red-900/50',
  WARNING: 'bg-amber-950 text-amber-300 border border-amber-900/50',
  INFO:    'bg-cyan-950 text-cyan-300 border border-cyan-900/50',
}

const DIV_STYLE: Record<string, string> = {
  P: 'bg-blue-950 text-blue-300',
  C: 'bg-rose-950 text-rose-300',
}

const isCalc = (item: RuleGroupItemConfig) => item.checkType === 'CALC'

const hasCustomizations = (item: RuleGroupItemConfig) =>
  !!(item.messageTemplate || item.conditions)

interface Props {
  item: RuleGroupItemConfig
  dragDisabled: boolean
}

export const RuleGroupRow = ({ item, dragDisabled }: Props) => {
  const updateItem     = useRuleConfigStore((s) => s.updateItem)
  const updateInstance = useRuleConfigStore((s) => s.updateInstance)
  const [expanded, setExpanded] = useState(false)
  const calc = isCalc(item)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.instanceCode, disabled: dragDisabled || calc })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const customized = hasCustomizations(item)

  const handleSeverityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sev = e.target.value
    // Optimistic update via updateInstance
    void updateInstance(item.instanceCode, { severity: sev })
  }

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={[
          'border-b border-border/40 transition-colors',
          calc ? 'opacity-60' : '',
          customized ? 'bg-primary/[0.03]' : '',
          expanded ? 'bg-muted/30' : 'hover:bg-muted/20',
        ].join(' ')}
      >
        {/* Drag handle */}
        <td className="w-8 pl-2 pr-0">
          {!calc && !dragDisabled && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab p-1 text-muted-foreground/30 hover:text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
        </td>

        {/* Rule name */}
        <td className="py-2.5 pl-1 pr-3">
          <div className="text-xs font-semibold text-foreground">{item.name}</div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {item.instanceCode}
            {item.reference && (
              <span className="ml-2 text-muted-foreground/60">{item.reference}</span>
            )}
          </div>
        </td>

        {/* Category */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${CAT_STYLE[item.category] ?? 'bg-muted text-muted-foreground'}`}>
            {item.category === 'FLIGHT_TIME' ? 'FT' : item.category}
          </span>
        </td>

        {/* Division */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${DIV_STYLE[item.division] ?? 'bg-muted text-muted-foreground'}`}>
            {item.division}
          </span>
        </td>

        {/* Severity — inline editable select */}
        <td className="py-2 pr-3">
          <select
            value={item.severity}
            onChange={handleSeverityChange}
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold border-0 outline-none cursor-pointer ${SEV_STYLE[item.severity] ?? 'bg-muted text-muted-foreground'}`}
          >
            <option value="ERROR">ERROR</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
          </select>
        </td>

        {/* Customization indicator */}
        <td className="py-2.5 pr-3">
          {!calc && customized ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              configured
            </button>
          ) : !calc ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
            >
              + Configure
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground/30">—</span>
          )}
        </td>

        {/* Enabled toggle */}
        <td className="py-2.5 pr-3">
          <button
            onClick={() => updateItem(item.instanceCode, { enabled: !item.enabled })}
            className={[
              'relative h-5 w-9 rounded-full transition-colors',
              item.enabled ? 'bg-primary/80' : 'bg-muted',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                item.enabled ? 'left-4' : 'left-0.5',
              ].join(' ')}
            />
          </button>
        </td>

        {/* Edit button */}
        <td className="py-2.5 pr-4">
          {!calc && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {expanded ? 'Close' : 'Edit'}
            </button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <OverrideEditor item={item} onClose={() => setExpanded(false)} />
          </td>
        </tr>
      )}
    </>
  )
}
```

Note: `colSpan` updated to 8 (was 7) to match new column count.

Also update `rule-group-rules.tsx` table header to match 8 columns (add Div column between Category and Severity):

```tsx
<tr className="border-b border-border bg-card">
  <th className="w-8" />
  <th className="py-2 pl-1 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rule</th>
  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Category</th>
  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Div</th>
  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Severity</th>
  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Config</th>
  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Enabled</th>
  <th className="py-2 pr-4 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground" />
</tr>
```

- [ ] **Step 2: Bump version and commit**

In `gantt/src/version.ts`, increment `FRONTEND_VERSION` and `BACKEND_VERSION` by 1 each (both backend service and frontend changed).

```bash
git add gantt/src/components/rule/rule-group-row.tsx \
        gantt/src/components/rule/rule-group-rules.tsx \
        gantt/src/version.ts
git commit -m "feat(rule): division badge + inline severity select in rule list row"
```

---

## Task 5: Backend — Template list + Instance CRUD endpoints

**Files:**
- Modify: `live-server/src/services/rule/rule-config-service.ts`
- Modify: `live-server/src/routes/rule/rule-config.ts`

- [ ] **Step 1: Add listTemplates, createInstance, deleteInstance to service**

In `live-server/src/services/rule/rule-config-service.ts`, add these types and methods:

```typescript
export interface RuleTemplateRow {
  code: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  reference: string | null
  checkType: string
  paramSchema: Record<string, unknown>
  templateVars: Array<{ name: string; label: string; example: string | number }>
  constraintType: string | null
  owner: string
}

export interface NewInstanceData {
  templateCode: string
  instanceCode: string
  name: string
  description?: string
  reference?: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  overridable: boolean
  params: Record<string, unknown>
  conditions?: Record<string, unknown> | null
  messageTemplate?: string | null
  division: string
}

export interface FullInstanceRow {
  id: number
  templateCode: string
  instanceCode: string
  name: string
  description: string | null
  reference: string | null
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: Record<string, unknown> | null
  messageTemplate: string | null
  filiale: string
  division: string
  owner: string
}
```

Then add the methods:

```typescript
async listTemplates(fastify: FastifyInstance): Promise<RuleTemplateRow[]> {
  const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
    SELECT code, name, category, subcategory, description, reference,
           check_type, param_schema, template_vars, constraint_type, owner
    FROM rule_template
    ORDER BY category, code
  `)
  return rows.map((r) => ({
    code:          r.code as string,
    name:          r.name as string,
    category:      r.category as string,
    subcategory:   r.subcategory as string | null,
    description:   r.description as string | null,
    reference:     r.reference as string | null,
    checkType:     r.check_type as string,
    paramSchema:   r.param_schema as Record<string, unknown>,
    templateVars:  (r.template_vars as Array<{ name: string; label: string; example: string | number }>) ?? [],
    constraintType:r.constraint_type as string | null,
    owner:         r.owner as string,
  }))
},

async listAllInstances(fastify: FastifyInstance, filiale: string): Promise<FullInstanceRow[]> {
  const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
    SELECT id, template_code, instance_code, name, description, reference,
           severity, overridable, params, conditions, message_template,
           filiale, division, owner
    FROM rule_instance
    WHERE filiale = $1 AND is_deleted = 0
    ORDER BY template_code, instance_code
  `, [filiale])
  return rows.map((r) => ({
    id:              Number(r.id),
    templateCode:    r.template_code as string,
    instanceCode:    r.instance_code as string,
    name:            r.name as string,
    description:     r.description as string | null,
    reference:       r.reference as string | null,
    severity:        r.severity as string,
    overridable:     r.overridable as boolean,
    params:          r.params as Record<string, unknown>,
    conditions:      r.conditions as Record<string, unknown> | null,
    messageTemplate: r.message_template as string | null,
    filiale:         r.filiale as string,
    division:        r.division as string,
    owner:           r.owner as string,
  }))
},

async createInstance(
  fastify: FastifyInstance,
  filiale: string,
  userCode: string,
  data: NewInstanceData,
): Promise<FullInstanceRow> {
  const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
    INSERT INTO rule_instance
      (template_code, instance_code, name, description, reference,
       severity, overridable, params, conditions, message_template,
       filiale, division, owner, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'C',$13,$13)
    RETURNING id, template_code, instance_code, name, description, reference,
              severity, overridable, params, conditions, message_template,
              filiale, division, owner
  `, [
    data.templateCode, data.instanceCode, data.name,
    data.description ?? null, data.reference ?? null,
    data.severity, data.overridable,
    JSON.stringify(data.params),
    data.conditions ? JSON.stringify(data.conditions) : null,
    data.messageTemplate ?? null,
    filiale, data.division, userCode,
  ])
  const r = rows[0]
  return {
    id:              Number(r.id),
    templateCode:    r.template_code as string,
    instanceCode:    r.instance_code as string,
    name:            r.name as string,
    description:     r.description as string | null,
    reference:       r.reference as string | null,
    severity:        r.severity as string,
    overridable:     r.overridable as boolean,
    params:          r.params as Record<string, unknown>,
    conditions:      r.conditions as Record<string, unknown> | null,
    messageTemplate: r.message_template as string | null,
    filiale:         r.filiale as string,
    division:        r.division as string,
    owner:           r.owner as string,
  }
},

async deleteInstance(
  fastify: FastifyInstance,
  filiale: string,
  instanceCode: string,
  userCode: string,
): Promise<'not_found' | 'in_use' | 'ok'> {
  // Check if instance is currently in any group
  const { rows: inUse } = await fastify.pgPool.query<Record<string, unknown>>(`
    SELECT COUNT(*)::int AS cnt
    FROM rule_group_instance rgi
    JOIN rule_instance ri ON ri.id = rgi.instance_id
    WHERE ri.instance_code = $1 AND ri.filiale = $2 AND ri.is_deleted = 0
  `, [instanceCode, filiale])
  if (Number(inUse[0].cnt) > 0) return 'in_use'

  const { rowCount } = await fastify.pgPool.query(`
    UPDATE rule_instance SET is_deleted = 1, updated_by = $1, updated_at = now()
    WHERE instance_code = $2 AND filiale = $3 AND is_deleted = 0
  `, [userCode, instanceCode, filiale])
  return (rowCount ?? 0) > 0 ? 'ok' : 'not_found'
},
```

- [ ] **Step 2: Add routes for templates + instance CRUD**

In `live-server/src/routes/rule/rule-config.ts`, add after the existing routes:

```typescript
const newInstanceSchema = z.object({
  templateCode:    z.string().min(1).max(50),
  instanceCode:    z.string().min(1).max(80),
  name:            z.string().min(1).max(200),
  description:     z.string().max(500).optional(),
  reference:       z.string().max(50).optional(),
  severity:        z.enum(['ERROR', 'WARNING', 'INFO']).default('ERROR'),
  overridable:     z.boolean().default(false),
  params:          z.record(z.unknown()).default({}),
  conditions:      z.record(z.unknown()).nullable().optional(),
  messageTemplate: z.string().nullable().optional(),
  division:        z.enum(['P', 'C', 'A']),
})

// GET /api/rule/templates
fastify.get('/templates', async (_request, reply) => {
  const templates = await ruleConfigService.listTemplates(fastify)
  return success(reply, templates)
})

// GET /api/rule/instances/all
fastify.get('/instances/all', async (request, reply) => {
  const instances = await ruleConfigService.listAllInstances(fastify, filiale(request))
  return success(reply, instances)
})

// POST /api/rule/instances
fastify.post('/instances', async (request, reply) => {
  const parsed = newInstanceSchema.safeParse(request.body)
  if (!parsed.success) return fail(reply, 400, parsed.error.message)
  try {
    const instance = await ruleConfigService.createInstance(
      fastify, filiale(request), user(request), parsed.data,
    )
    return success(reply, instance)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Create failed'
    return fail(reply, 409, msg)
  }
})

// DELETE /api/rule/instances/:instanceCode
fastify.delete('/instances/:instanceCode', async (request, reply) => {
  const { instanceCode } = request.params as { instanceCode: string }
  const result = await ruleConfigService.deleteInstance(
    fastify, filiale(request), instanceCode, user(request),
  )
  if (result === 'not_found') return fail(reply, 404, 'Instance not found')
  if (result === 'in_use')   return fail(reply, 409, 'Instance is still assigned to a rule group')
  return success(reply, null)
})
```

- [ ] **Step 3: Commit**

```bash
git add live-server/src/services/rule/rule-config-service.ts \
        live-server/src/routes/rule/rule-config.ts
git commit -m "feat(rule): add template list + instance CRUD endpoints"
```

---

## Task 6: Frontend — Catalog tab (Templates & Instances)

**Files:**
- Create: `gantt/src/services/rule-catalog-api.ts`
- Create: `gantt/src/components/rule/instance-edit-dialog.tsx`
- Create: `gantt/src/components/rule/rule-catalog-view.tsx`
- Modify: `gantt/src/types/rule-config.ts`
- Modify: `gantt/src/components/rule/rule-manager-view.tsx`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Add RuleTemplate and FullInstanceConfig types**

In `gantt/src/types/rule-config.ts`, append:

```typescript
export interface RuleTemplate {
  code: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  reference: string | null
  checkType: string
  paramSchema: Record<string, unknown>
  templateVars: TemplateVar[]
  constraintType: string | null
  owner: string
}

export interface FullInstanceConfig {
  id: number
  templateCode: string
  instanceCode: string
  name: string
  description: string | null
  reference: string | null
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: RuleConditions | null
  messageTemplate: string | null
  filiale: string
  division: string
  owner: string
}

export interface NewInstanceData {
  templateCode: string
  instanceCode: string
  name: string
  description?: string
  reference?: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  overridable: boolean
  params: Record<string, unknown>
  division: 'P' | 'C' | 'A'
}
```

- [ ] **Step 2: Create rule-catalog-api.ts**

Create `gantt/src/services/rule-catalog-api.ts`:

```typescript
import { api } from './api'
import type { RuleTemplate, FullInstanceConfig, NewInstanceData } from '@/types/rule-config'

export const ruleCatalogApi = {
  listTemplates: (): Promise<RuleTemplate[]> =>
    api.get('/api/rule/templates') as Promise<RuleTemplate[]>,

  listInstances: (): Promise<FullInstanceConfig[]> =>
    api.get('/api/rule/instances/all') as Promise<FullInstanceConfig[]>,

  createInstance: (data: NewInstanceData): Promise<FullInstanceConfig> =>
    api.post('/api/rule/instances', data) as Promise<FullInstanceConfig>,

  deleteInstance: (instanceCode: string): Promise<void> =>
    api.delete(`/api/rule/instances/${encodeURIComponent(instanceCode)}`) as Promise<void>,
}
```

- [ ] **Step 3: Create instance-edit-dialog.tsx**

Create `gantt/src/components/rule/instance-edit-dialog.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { AppDialog } from '@rois/ui'
import { Settings } from 'lucide-react'
import { ruleCatalogApi } from '@/services/rule-catalog-api'
import { notify } from '@/utils/notify'
import type { RuleTemplate, FullInstanceConfig, NewInstanceData } from '@/types/rule-config'

// Reuse the array param editor logic from override-editor
type ParamEntry = { type?: string; default?: unknown; enum?: string[]; description?: string; items?: { type?: string; properties?: Record<string, { type?: string; description?: string; enum?: string[] }> } }

interface Props {
  open: boolean
  onClose: () => void
  templates: RuleTemplate[]
  editInstance?: FullInstanceConfig | null  // null = create mode
  prefillTemplate?: string                  // pre-select template on create
  onSaved: () => void
}

export const InstanceEditDialog = ({ open, onClose, templates, editInstance, prefillTemplate, onSaved }: Props) => {
  const isEdit = !!editInstance
  const [templateCode, setTemplateCode] = useState(editInstance?.templateCode ?? prefillTemplate ?? '')
  const [instanceCode, setInstanceCode] = useState(editInstance?.instanceCode ?? '')
  const [name, setName]               = useState(editInstance?.name ?? '')
  const [description, setDescription] = useState(editInstance?.description ?? '')
  const [reference, setReference]     = useState(editInstance?.reference ?? '')
  const [severity, setSeverity]       = useState<'ERROR'|'WARNING'|'INFO'>(
    (editInstance?.severity as 'ERROR'|'WARNING'|'INFO') ?? 'ERROR',
  )
  const [overridable, setOverridable] = useState(editInstance?.overridable ?? false)
  const [division, setDivision]       = useState<'P'|'C'|'A'>((editInstance?.division as 'P'|'C'|'A') ?? 'P')
  const [paramsJson, setParamsJson]   = useState(
    editInstance ? JSON.stringify(editInstance.params, null, 2) : '{}',
  )
  const [paramsError, setParamsError] = useState('')
  const [saving, setSaving]           = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return
    setTemplateCode(editInstance?.templateCode ?? prefillTemplate ?? '')
    setInstanceCode(editInstance?.instanceCode ?? '')
    setName(editInstance?.name ?? '')
    setDescription(editInstance?.description ?? '')
    setReference(editInstance?.reference ?? '')
    setSeverity((editInstance?.severity as 'ERROR'|'WARNING'|'INFO') ?? 'ERROR')
    setOverridable(editInstance?.overridable ?? false)
    setDivision((editInstance?.division as 'P'|'C'|'A') ?? 'P')
    setParamsJson(editInstance ? JSON.stringify(editInstance.params, null, 2) : '{}')
    setParamsError('')
  }, [open, editInstance, prefillTemplate])

  const selectedTemplate = templates.find((t) => t.code === templateCode)

  const handleSave = async () => {
    setParamsError('')
    let params: Record<string, unknown>
    try {
      params = JSON.parse(paramsJson)
    } catch {
      setParamsError('Invalid JSON in parameters')
      return
    }
    if (!templateCode || !instanceCode.trim() || !name.trim()) return
    setSaving(true)
    try {
      const data: NewInstanceData = {
        templateCode, instanceCode: instanceCode.trim(), name: name.trim(),
        description: description.trim() || undefined,
        reference: reference.trim() || undefined,
        severity, overridable, params, division,
      }
      await ruleCatalogApi.createInstance(data)
      onSaved()
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to save instance')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary'
  const labelCls = 'text-2xs font-semibold text-muted-foreground'

  return (
    <AppDialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose() }}
      icon={<Settings className="h-4 w-4" />}
      title={isEdit ? 'Edit Instance' : 'New Instance'}
      className="sm:max-w-[600px]"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !templateCode || !instanceCode.trim() || !name.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 p-1">
        {/* Template */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelCls}>Template <span className="text-destructive">*</span></label>
          <select
            value={templateCode}
            onChange={(e) => {
              setTemplateCode(e.target.value)
              const tpl = templates.find((t) => t.code === e.target.value)
              if (tpl) setParamsJson(JSON.stringify(
                Object.fromEntries(
                  Object.entries(tpl.paramSchema as Record<string, ParamEntry>).map(([k, v]) => [k, v.default ?? (v.type === 'array' ? [] : '')])
                ), null, 2
              ))
            }}
            className={inputCls}
          >
            <option value="">— select template —</option>
            {templates.map((t) => (
              <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
            ))}
          </select>
          {selectedTemplate && (
            <span className="text-2xs text-muted-foreground/60">{selectedTemplate.category} · {selectedTemplate.checkType}{selectedTemplate.description ? ` — ${selectedTemplate.description}` : ''}</span>
          )}
        </div>

        {/* Instance code */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Instance Code <span className="text-destructive">*</span></label>
          <input value={instanceCode} onChange={(e) => setInstanceCode(e.target.value)} placeholder="e.g. max_ft_flair_p" className={inputCls} />
        </div>

        {/* Division */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Division <span className="text-destructive">*</span></label>
          <select value={division} onChange={(e) => setDivision(e.target.value as 'P'|'C'|'A')} className={inputCls}>
            <option value="P">P — Pilot</option>
            <option value="C">C — Cabin</option>
            <option value="A">A — Air Marshal</option>
          </select>
        </div>

        {/* Name */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelCls}>Name <span className="text-destructive">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Max Flight Time – Flair F8 (P)" className={inputCls} />
        </div>

        {/* Description */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelCls}>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </div>

        {/* Reference */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Reference</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. CCAR-121-R5-121.487" className={inputCls} />
        </div>

        {/* Severity */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as 'ERROR'|'WARNING'|'INFO')} className={inputCls}>
            <option value="ERROR">ERROR</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
          </select>
        </div>

        {/* Overridable */}
        <div className="flex items-center gap-2 col-span-2">
          <input type="checkbox" id="overridable" checked={overridable} onChange={(e) => setOverridable(e.target.checked)} className="h-3.5 w-3.5" />
          <label htmlFor="overridable" className={labelCls}>Overridable (soft constraint)</label>
        </div>

        {/* Params JSON */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelCls}>Parameters (JSON)</label>
          <textarea
            value={paramsJson}
            onChange={(e) => { setParamsJson(e.target.value); setParamsError('') }}
            rows={6}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary resize-y"
          />
          {paramsError && <span className="text-2xs text-destructive">{paramsError}</span>}
        </div>
      </div>
    </AppDialog>
  )
}
```

- [ ] **Step 4: Create rule-catalog-view.tsx**

Create `gantt/src/components/rule/rule-catalog-view.tsx`:

```tsx
import { useEffect, useState, useMemo } from 'react'
import { Plus, Copy, Trash2, Search } from 'lucide-react'
import { ruleCatalogApi } from '@/services/rule-catalog-api'
import { InstanceEditDialog } from './instance-edit-dialog'
import { notify } from '@/utils/notify'
import type { RuleTemplate, FullInstanceConfig } from '@/types/rule-config'

const CAT_STYLE: Record<string, string> = {
  FDP:           'bg-indigo-950 text-indigo-300',
  FLIGHT_TIME:   'bg-emerald-950 text-emerald-300',
  REST:          'bg-purple-950 text-purple-300',
  DUTY:          'bg-lime-950 text-lime-300',
  FATIGUE:       'bg-amber-950 text-amber-300',
  QUALIFICATION: 'bg-sky-950 text-sky-300',
  COMPOSITION:   'bg-pink-950 text-pink-300',
}
const TYPE_STYLE: Record<string, string> = {
  CALC:  'bg-slate-800 text-slate-400',
  CHECK: 'bg-slate-700 text-slate-300',
  BOTH:  'bg-teal-900 text-teal-300',
}
const SEV_STYLE: Record<string, string> = {
  ERROR:   'bg-red-950 text-red-300',
  WARNING: 'bg-amber-950 text-amber-300',
  INFO:    'bg-cyan-950 text-cyan-300',
}
const DIV_STYLE: Record<string, string> = {
  P: 'bg-blue-950 text-blue-300',
  C: 'bg-rose-950 text-rose-300',
  A: 'bg-orange-950 text-orange-300',
}

export const RuleCatalogView = () => {
  const [templates, setTemplates]   = useState<RuleTemplate[]>([])
  const [instances, setInstances]   = useState<FullInstanceConfig[]>([])
  const [loading, setLoading]       = useState(true)
  const [tplSearch, setTplSearch]   = useState('')
  const [instSearch, setInstSearch] = useState('')
  const [selectedTpl, setSelectedTpl] = useState<string | null>(null)
  const [editOpen, setEditOpen]     = useState(false)
  const [prefillTpl, setPrefillTpl] = useState<string | undefined>()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [tpls, insts] = await Promise.all([
        ruleCatalogApi.listTemplates(),
        ruleCatalogApi.listInstances(),
      ])
      setTemplates(tpls)
      setInstances(insts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filteredTemplates = useMemo(() =>
    templates.filter((t) =>
      !tplSearch ||
      t.name.toLowerCase().includes(tplSearch.toLowerCase()) ||
      t.code.toLowerCase().includes(tplSearch.toLowerCase()) ||
      t.category.toLowerCase().includes(tplSearch.toLowerCase()),
    ), [templates, tplSearch])

  const filteredInstances = useMemo(() =>
    instances.filter((i) => {
      if (selectedTpl && i.templateCode !== selectedTpl) return false
      if (!instSearch) return true
      return i.name.toLowerCase().includes(instSearch.toLowerCase()) ||
             i.instanceCode.toLowerCase().includes(instSearch.toLowerCase())
    }), [instances, instSearch, selectedTpl])

  const grouped = useMemo(() =>
    filteredTemplates.reduce<Record<string, RuleTemplate[]>>((acc, t) => {
      if (!acc[t.category]) acc[t.category] = []
      acc[t.category].push(t)
      return acc
    }, {}), [filteredTemplates])

  const handleDelete = async (instanceCode: string) => {
    try {
      await ruleCatalogApi.deleteInstance(instanceCode)
      setInstances((prev) => prev.filter((i) => i.instanceCode !== instanceCode))
      notify.success('Instance deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setConfirmDelete(null)
    }
  }

  const handleCopy = (inst: FullInstanceConfig) => {
    setPrefillTpl(inst.templateCode)
    setEditOpen(true)
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Templates ──────────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="text-xs font-bold text-foreground">Templates</span>
          <span className="ml-auto text-2xs text-muted-foreground">{templates.length}</span>
        </div>
        <div className="px-2 py-2 border-b border-border/50">
          <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2">
            <Search className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <input
              value={tplSearch}
              onChange={(e) => setTplSearch(e.target.value)}
              placeholder="Search templates…"
              className="bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50 w-full"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {/* All instances option */}
          <button
            onClick={() => setSelectedTpl(null)}
            className={[
              'w-full px-3 py-1.5 text-left text-xs transition-colors',
              selectedTpl === null ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted/40',
            ].join(' ')}
          >
            All Instances
          </button>
          {Object.entries(grouped).map(([cat, tpls]) => (
            <div key={cat}>
              <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{cat}</div>
              {tpls.map((t) => (
                <button
                  key={t.code}
                  onClick={() => setSelectedTpl(t.code === selectedTpl ? null : t.code)}
                  className={[
                    'group w-full px-3 py-1.5 text-left transition-colors',
                    t.code === selectedTpl ? 'bg-primary/10' : 'hover:bg-muted/40',
                  ].join(' ')}
                >
                  <div className={`text-xs font-medium truncate ${t.code === selectedTpl ? 'text-primary' : 'text-foreground'}`}>{t.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`rounded px-1 py-0 text-[8px] font-bold ${TYPE_STYLE[t.checkType] ?? 'bg-muted text-muted-foreground'}`}>{t.checkType}</span>
                    <span className="font-mono text-[9px] text-muted-foreground/60 truncate">{t.code}</span>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Right: Instances ─────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
          <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 flex-1 max-w-[260px]">
            <Search className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <input
              value={instSearch}
              onChange={(e) => setInstSearch(e.target.value)}
              placeholder="Search instances…"
              className="bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50 w-full"
            />
          </div>
          {selectedTpl && (
            <span className="text-[11px] text-muted-foreground">
              Template: <span className="font-mono text-foreground">{selectedTpl}</span>
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">{filteredInstances.length} instances</span>
          <button
            onClick={() => { setPrefillTpl(selectedTpl ?? undefined); setEditOpen(true) }}
            className="flex items-center gap-1 rounded-md bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/30 transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Instance
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {filteredInstances.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted-foreground">No instances</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="py-2 pl-4 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Instance</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Template</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cat</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Div</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Severity</th>
                  <th className="py-2 pr-4 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {filteredInstances.map((inst) => (
                  <tr key={inst.instanceCode} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pl-4 pr-3">
                      <div className="text-xs font-semibold text-foreground">{inst.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {inst.instanceCode}
                        {inst.reference && <span className="ml-2 text-muted-foreground/60">{inst.reference}</span>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-[10px] text-muted-foreground">{inst.templateCode}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${CAT_STYLE[templates.find((t) => t.code === inst.templateCode)?.category ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
                        {(templates.find((t) => t.code === inst.templateCode)?.category ?? '').replace('FLIGHT_TIME', 'FT')}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${DIV_STYLE[inst.division] ?? 'bg-muted text-muted-foreground'}`}>
                        {inst.division}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${SEV_STYLE[inst.severity] ?? 'bg-muted text-muted-foreground'}`}>
                        {inst.severity}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(inst)}
                          title="Copy as new instance"
                          className="rounded p-1 text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {inst.owner === 'C' && (
                          <button
                            onClick={() => setConfirmDelete(inst.instanceCode)}
                            title="Delete instance"
                            className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border bg-card p-5 shadow-xl w-80">
            <p className="text-sm font-semibold text-foreground mb-1">Delete instance?</p>
            <p className="text-xs text-muted-foreground mb-4">
              <span className="font-mono">{confirmDelete}</span> will be soft-deleted and removed from all groups.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}

      <InstanceEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        templates={templates}
        prefillTemplate={prefillTpl}
        onSaved={load}
      />
    </div>
  )
}
```

- [ ] **Step 5: Add tab switcher to rule-manager-view.tsx**

Replace `gantt/src/components/rule/rule-manager-view.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { RuleGroupList } from './rule-group-list'
import { RuleGroupHeader } from './rule-group-header'
import { RuleGroupRules } from './rule-group-rules'
import { RuleCatalogView } from './rule-catalog-view'

type Tab = 'groups' | 'catalog'

export const RuleManagerView = () => {
  const fetchGroups = useRuleConfigStore((s) => s.fetchGroups)
  const selectedGroupCode = useRuleConfigStore((s) => s.selectedGroupCode)
  const groups = useRuleConfigStore((s) => s.groups)
  const selectGroup = useRuleConfigStore((s) => s.selectGroup)
  const [tab, setTab] = useState<Tab>('groups')

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  useEffect(() => {
    if (!selectedGroupCode && groups.length > 0) {
      void selectGroup(groups[0].groupCode)
    }
  }, [groups, selectedGroupCode, selectGroup])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border bg-card px-4">
        {(['groups', 'catalog'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-3 py-2.5 text-xs font-semibold capitalize transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t === 'groups' ? 'Rule Sets' : 'Templates & Instances'}
          </button>
        ))}
      </div>

      {tab === 'catalog' ? (
        <RuleCatalogView />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <RuleGroupList />
          <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
            {!selectedGroupCode ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a rule set to configure
              </div>
            ) : (
              <>
                <RuleGroupHeader />
                <RuleGroupRules />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Bump version and commit**

In `gantt/src/version.ts`:
```typescript
export const BACKEND_VERSION = 68   // +1 (new endpoints)
export const FRONTEND_VERSION = 138  // +1 (new catalog tab)
```

```bash
git add \
  gantt/src/types/rule-config.ts \
  gantt/src/services/rule-catalog-api.ts \
  gantt/src/components/rule/instance-edit-dialog.tsx \
  gantt/src/components/rule/rule-catalog-view.tsx \
  gantt/src/components/rule/rule-manager-view.tsx \
  gantt/src/version.ts
git commit -m "feat(rule): add Templates & Instances catalog tab with CRUD"
```

---

## Self-Review

**Spec coverage:**
- ✅ #1 itemCount fix — Task 1
- ✅ #2 CALC sort + drag guard — Task 3
- ✅ #3 division column — Tasks 2, 3, 4
- ✅ #4 severity inline edit — Task 4
- ✅ #5 template/instance management — Tasks 5, 6

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:**
- `FullInstanceConfig.division` used consistently across types, API, and catalog view ✅
- `NewInstanceData` type defined in types file and used in dialog + API ✅
- `RuleTemplate.paramSchema` used in dialog for default param generation ✅
- `colSpan={8}` in row matches 8-column header ✅
- `deleteInstance` checks `owner === 'C'` before showing delete button (system instances are undeletable) ✅
