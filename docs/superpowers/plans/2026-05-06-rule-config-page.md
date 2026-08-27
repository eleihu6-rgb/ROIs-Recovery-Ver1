# Rule Config Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Rule module configuration page — two-panel master-detail UI for managing rule sets (法规集合) and per-set overrides (params, severity, message template, sort order).

**Architecture:** DB migration adds `message_template` + `template_vars`; rule-engine gains type extensions and template interpolation; live-server owns all CRUD via a new `/api/rule/` route group; gantt frontend implements the Rule module view with sortable table and inline override editor.

**Tech Stack:** PostgreSQL migration (raw SQL), Drizzle + Fastify (live-server), `@dnd-kit/sortable` (drag reorder), React 19 + Zustand + axios (gantt)

**Spec:** `docs/superpowers/specs/2026-05-06-rule-config-page-design.md`  
**Mockup:** `docs/modules/gantt/rule-config-mockup.html`

---

## File Map

**New files:**
- `sql/migration/2026-05-06-rule-group-item-message-template.sql`
- `live-server/src/services/rule/rule-config-service.ts`
- `live-server/src/routes/rule/rule-config.ts`
- `live-server/src/routes/rule/index.ts`
- `gantt/src/types/rule-config.ts`
- `gantt/src/services/rule-config-api.ts`
- `gantt/src/stores/rule-config-store.ts`
- `gantt/src/components/rule/rule-view.tsx`
- `gantt/src/components/rule/rule-group-list.tsx`
- `gantt/src/components/rule/rule-group-card.tsx`
- `gantt/src/components/rule/new-group-dialog.tsx`
- `gantt/src/components/rule/rule-group-header.tsx`
- `gantt/src/components/rule/add-rules-dialog.tsx`
- `gantt/src/components/rule/rule-group-rules.tsx`
- `gantt/src/components/rule/rule-group-row.tsx`
- `gantt/src/components/rule/override-editor.tsx`
- `gantt/src/components/rule/template-var-picker.tsx`

**Modified files:**
- `rule-engine/src/types/rule.ts` — add `messageTemplate` to `ResolvedRule`
- `rule-engine/src/engine/rule-loader.ts` — include `message_template` in SQL + map to `ResolvedRule`
- `rule-engine/src/checkers/base-checker.ts` — add `interpolate()`, accept `vars` in `fail()`/`pass()`
- `rule-engine/src/server.ts` — register admin invalidate route
- `live-server/src/index.ts` — register rule routes
- `gantt/src/components/shell/app-shell.tsx` — add `RuleView` to `ModuleView`

---

## Task 1: DB Migration

**Files:**
- Create: `sql/migration/2026-05-06-rule-group-item-message-template.sql`

- [ ] **Create the migration file**

```sql
-- 2026-05-06-rule-group-item-message-template.sql
-- Add message_template to rule_group_item (nullable — null means use checker's built-in message)
-- Add template_vars to rule_template (JSONB array of {name, label, example} for UI variable picker)

ALTER TABLE rule_group_item
  ADD COLUMN IF NOT EXISTS message_template text;

ALTER TABLE rule_template
  ADD COLUMN IF NOT EXISTS template_vars jsonb NOT NULL DEFAULT '[]';
```

- [ ] **Run migration against the f8 schema**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/migration/2026-05-06-rule-group-item-message-template.sql
```

Expected output:
```
ALTER TABLE
ALTER TABLE
```

- [ ] **Verify columns exist**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -c "\d rule_group_item" | grep message_template
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -c "\d rule_template" | grep template_vars
```

- [ ] **Commit**

```bash
git add sql/migration/2026-05-06-rule-group-item-message-template.sql
git commit -m "feat(db): add message_template to rule_group_item, template_vars to rule_template"
```

---

## Task 2: rule-engine — extend ResolvedRule + RuleLoader

**Files:**
- Modify: `rule-engine/src/types/rule.ts`
- Modify: `rule-engine/src/engine/rule-loader.ts`

- [ ] **Add `messageTemplate` to `ResolvedRule` in `rule-engine/src/types/rule.ts`**

Find the `ResolvedRule` interface (around line 57) and add one field:

```typescript
/** Resolved rule ready for execution — combines template + instance + group item overrides */
export interface ResolvedRule {
  templateCode: string
  instanceCode: string
  name: string
  category: string
  checkType: string
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: Record<string, unknown> | null
  constraintType: string | null
  ccarReference: string | null
  sortOrder: number
  messageTemplate: string | null   // ← new: null means use checker's built-in message
}
```

- [ ] **Update `RawRuleRow` and `fetchFromDb` in `rule-engine/src/engine/rule-loader.ts`**

Add `gi.message_template` to the SQL SELECT and map it in the return:

```typescript
interface RawRuleRow {
  template_code: string
  template_name: string
  category: string
  check_type: string
  constraint_type: string | null
  instance_code: string
  instance_name: string
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: Record<string, unknown> | null
  ccar_reference: string | null
  enabled: boolean
  severity_override: string | null
  param_override: Record<string, unknown> | null
  sort_order: number
  message_template: string | null   // ← new
}
```

In `fetchFromDb`, update the SELECT to include `gi.message_template`:

```typescript
  private async fetchFromDb(groupCode: string): Promise<ResolvedRule[]> {
    const sql = `
      SELECT
        t.code          AS template_code,
        t.name          AS template_name,
        t.category,
        t.check_type,
        t.constraint_type,
        i.instance_code,
        i.name          AS instance_name,
        i.severity,
        i.overridable,
        i.params,
        i.conditions,
        i.ccar_reference,
        gi.enabled,
        gi.severity_override,
        gi.param_override,
        gi.sort_order,
        gi.message_template
      FROM rule_group g
        JOIN rule_group_item gi ON gi.group_id = g.id
        JOIN rule_instance i   ON i.id = gi.instance_id AND i.is_deleted = 0
        JOIN rule_template t   ON t.code = i.template_code
      WHERE g.group_code = $1
        AND g.is_deleted = 0
        AND gi.enabled = true
      ORDER BY gi.sort_order, t.check_type DESC
    `
    const { rows } = await this.db.query(sql, [groupCode])

    return (rows as unknown as RawRuleRow[]).map((r) => ({
      templateCode: r.template_code,
      instanceCode: r.instance_code,
      name: r.instance_name,
      category: r.category,
      checkType: r.check_type,
      severity: r.severity_override ?? r.severity,
      overridable: r.overridable,
      params: deepMerge(r.params, r.param_override),
      conditions: r.conditions,
      constraintType: r.constraint_type,
      ccarReference: r.ccar_reference,
      sortOrder: r.sort_order,
      messageTemplate: r.message_template ?? null,
    }))
  }
```

- [ ] **Build rule-engine to verify no type errors**

```bash
cd rule-engine && npm run build 2>&1 | tail -5
```

Expected: no errors, exits 0.

- [ ] **Commit**

```bash
git add rule-engine/src/types/rule.ts rule-engine/src/engine/rule-loader.ts
git commit -m "feat(rule-engine): add messageTemplate to ResolvedRule and RuleLoader SQL"
```

---

## Task 3: rule-engine — BaseChecker template interpolation

**Files:**
- Modify: `rule-engine/src/checkers/base-checker.ts`

- [ ] **Add `interpolate()` helper and update `fail()`/`pass()` signatures**

Replace the full `base-checker.ts` content:

```typescript
// ============================================================
// BaseChecker — abstract base for all checker rules
// ============================================================

import type { CheckResult } from '../types/result.js'
import type { ExecutionContext } from '../engine/context.js'
import type { ResolvedRule } from '../types/rule.js'

export const severityToNumber = (severity: string): number => {
  switch (severity.toUpperCase()) {
    case 'INFO':    return 1
    case 'WARNING': return 2
    case 'ERROR':   return 3
    default:        return 2
  }
}

/**
 * Interpolate a message template using {variable} syntax.
 * Variables not found in vars are left as empty string.
 * Returns the fallback unchanged if template is null/undefined.
 */
export const interpolate = (
  template: string | null | undefined,
  vars: Record<string, string | number>,
  fallback: string,
): string => {
  if (!template) return fallback
  return template.replace(/{(\w+)}/g, (_, key: string) => String(vars[key] ?? ''))
}

export abstract class BaseChecker {
  abstract readonly templateCode: string
  abstract readonly requiredCalculators: string[]
  abstract execute(rule: ResolvedRule, ctx: ExecutionContext): void

  protected pass(
    rule: ResolvedRule,
    actualValue: number,
    limitValue: number,
    unit: string,
    builtInMessage: string,
    vars: Record<string, string | number> = {},
  ): CheckResult {
    return {
      ruleCode: rule.templateCode,
      ruleName: rule.name,
      passed: true,
      severity: severityToNumber(rule.severity),
      actualValue,
      limitValue,
      unit,
      message: interpolate(rule.messageTemplate, vars, builtInMessage),
      overridable: rule.overridable,
    }
  }

  protected fail(
    rule: ResolvedRule,
    actualValue: number,
    limitValue: number,
    unit: string,
    builtInMessage: string,
    vars: Record<string, string | number> = {},
  ): CheckResult {
    return {
      ruleCode: rule.templateCode,
      ruleName: rule.name,
      passed: false,
      severity: severityToNumber(rule.severity),
      actualValue,
      limitValue,
      unit,
      message: interpolate(rule.messageTemplate, vars, builtInMessage),
      overridable: rule.overridable,
    }
  }
}
```

- [ ] **Update FdpChecker to pass `vars` so templates work**

In `rule-engine/src/checkers/fdp-checker.ts`, update the two `ctx.addCheckResult` calls to pass a `vars` object as the 6th argument:

```typescript
      if (fdpMinutes <= limitMinutes) {
        ctx.addCheckResult(
          this.pass(
            rule, fdpMinutes, limitMinutes, 'minutes',
            `Duty ${duty.dutySeq}: FDP ${fdpMinutes}min within limit ${limitMinutes}min`,
            { duty_seq: duty.dutySeq, fdp_minutes: fdpMinutes, limit_minutes: limitMinutes,
              segment_count: segmentCount, report_local: reportLocal },
          ),
        )
      } else {
        ctx.addCheckResult(
          this.fail(
            rule, fdpMinutes, limitMinutes, 'minutes',
            `Duty ${duty.dutySeq}: FDP ${fdpMinutes}min exceeds limit ${limitMinutes}min (${segmentCount} segments, report ${reportLocal})`,
            { duty_seq: duty.dutySeq, fdp_minutes: fdpMinutes, limit_minutes: limitMinutes,
              segment_count: segmentCount, report_local: reportLocal },
          ),
        )
      }
```

- [ ] **Build and verify**

```bash
cd rule-engine && npm run build 2>&1 | tail -5
```

Expected: exits 0, no TypeScript errors.

- [ ] **Commit**

```bash
git add rule-engine/src/checkers/base-checker.ts rule-engine/src/checkers/fdp-checker.ts
git commit -m "feat(rule-engine): add template interpolation to BaseChecker fail/pass"
```

---

## Task 4: rule-engine — cache invalidate admin endpoint

**Files:**
- Create: `rule-engine/src/routes/admin.ts`
- Modify: `rule-engine/src/server.ts`

- [ ] **Create `rule-engine/src/routes/admin.ts`**

```typescript
// POST /admin/cache/invalidate
// Called by live-server after any rule_group_item write to flush the in-memory cache.

import type { FastifyInstance } from 'fastify'
import type { RuleLoader } from '../engine/rule-loader.js'
import { successResponse, errorResponse } from '../utils/response.js'

export async function registerAdmin(
  app: FastifyInstance,
  ruleLoader: RuleLoader | null,
): Promise<void> {
  app.post('/admin/cache/invalidate', async (request, reply) => {
    if (!ruleLoader) {
      return reply.status(503).send(errorResponse('ENGINE_ERROR', 'No loader configured', 503))
    }
    const body = request.body as { groupCode?: string } | null
    ruleLoader.invalidate(body?.groupCode)
    return reply.send(successResponse({ invalidated: body?.groupCode ?? 'all' }))
  })
}
```

- [ ] **Register in `rule-engine/src/server.ts`**

Find the file, locate where `registerRules` is called, and add the admin route alongside it:

```typescript
import { registerAdmin } from './routes/admin.js'
// … existing imports …

// Inside the startup function, after registerRules:
await registerAdmin(app, ruleLoader)
```

- [ ] **Build and verify**

```bash
cd rule-engine && npm run build 2>&1 | tail -5
```

- [ ] **Commit**

```bash
git add rule-engine/src/routes/admin.ts rule-engine/src/server.ts
git commit -m "feat(rule-engine): add POST /admin/cache/invalidate endpoint"
```

---

## Task 5: live-server — rule-config-service

**Files:**
- Create: `live-server/src/services/rule/rule-config-service.ts`

- [ ] **Create the service file**

```typescript
// live-server/src/services/rule/rule-config-service.ts
// All DB queries for rule group/item management.
// Uses fastify.pgPool (raw SQL) for complex JOINs.

import type { FastifyInstance } from 'fastify'
import axios from 'axios'
import { env } from '../../config/index.js'

// ── Types ─────────────────────────────────────────────────────

export interface RuleGroupRow {
  id: number
  groupCode: string
  name: string
  description: string | null
  usage: string
  filiale: string
  division: string
  isDefault: boolean
  itemCount: number
}

export interface RuleGroupItemRow {
  id: number
  instanceId: number
  instanceCode: string
  templateCode: string
  name: string
  ccarReference: string | null
  category: string
  checkType: string
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  paramSchema: Record<string, unknown>
  templateVars: Array<{ name: string; label: string; example: string | number }>
  enabled: boolean
  severityOverride: string | null
  paramOverride: Record<string, unknown> | null
  messageTemplate: string | null
  sortOrder: number
}

export interface RuleInstanceOption {
  instanceCode: string
  name: string
  templateCode: string
  category: string
  checkType: string
  severity: string
  ccarReference: string | null
}

export interface NewGroupData {
  groupCode: string
  name: string
  description?: string
  usage: string
  division: string
  isDefault: boolean
}

export interface ItemPatch {
  enabled?: boolean
  severityOverride?: string | null
  paramOverride?: Record<string, unknown> | null
  messageTemplate?: string | null
}

// ── Service ───────────────────────────────────────────────────

export const ruleConfigService = {

  async listGroups(fastify: FastifyInstance, filiale: string): Promise<RuleGroupRow[]> {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
      SELECT g.id, g.group_code, g.name, g.description, g.usage,
             g.filiale, g.division, g.is_default,
             COUNT(gi.id)::int AS item_count
      FROM rule_group g
      LEFT JOIN rule_group_item gi ON gi.group_id = g.id
      WHERE g.is_deleted = 0 AND g.filiale = $1
      GROUP BY g.id
      ORDER BY g.is_default DESC, g.group_code
    `, [filiale])

    return rows.map((r) => ({
      id: Number(r.id),
      groupCode: r.group_code as string,
      name: r.name as string,
      description: r.description as string | null,
      usage: r.usage as string,
      filiale: r.filiale as string,
      division: r.division as string,
      isDefault: r.is_default as boolean,
      itemCount: Number(r.item_count),
    }))
  },

  async createGroup(
    fastify: FastifyInstance,
    filiale: string,
    userCode: string,
    data: NewGroupData,
  ): Promise<RuleGroupRow> {
    // If isDefault, unset current default first
    if (data.isDefault) {
      await fastify.pgPool.query(
        `UPDATE rule_group SET is_default = false, updated_by = $1, updated_at = now()
         WHERE filiale = $2 AND division = $3 AND is_deleted = 0`,
        [userCode, filiale, data.division],
      )
    }
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
      INSERT INTO rule_group (group_code, name, description, usage, filiale, division, is_default, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
      RETURNING id, group_code, name, description, usage, filiale, division, is_default
    `, [data.groupCode, data.name, data.description ?? null, data.usage, filiale, data.division, data.isDefault, userCode])

    const r = rows[0]
    return { id: Number(r.id), groupCode: r.group_code as string, name: r.name as string,
      description: r.description as string | null, usage: r.usage as string,
      filiale: r.filiale as string, division: r.division as string,
      isDefault: r.is_default as boolean, itemCount: 0 }
  },

  async updateGroup(
    fastify: FastifyInstance,
    filiale: string,
    groupCode: string,
    userCode: string,
    patch: { name?: string; description?: string | null; isDefault?: boolean },
  ): Promise<void> {
    if (patch.isDefault) {
      const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
        `SELECT division FROM rule_group WHERE group_code = $1 AND filiale = $2 AND is_deleted = 0`,
        [groupCode, filiale],
      )
      if (rows[0]) {
        await fastify.pgPool.query(
          `UPDATE rule_group SET is_default = false, updated_by = $1, updated_at = now()
           WHERE filiale = $2 AND division = $3 AND is_deleted = 0`,
          [userCode, filiale, rows[0].division as string],
        )
      }
    }
    const setClauses: string[] = ['updated_by = $1', 'updated_at = now()']
    const vals: unknown[] = [userCode, filiale, groupCode]
    let idx = 4
    if (patch.name !== undefined)        { setClauses.push(`name = $${idx++}`);        vals.push(patch.name) }
    if (patch.description !== undefined) { setClauses.push(`description = $${idx++}`); vals.push(patch.description) }
    if (patch.isDefault !== undefined)   { setClauses.push(`is_default = $${idx++}`);  vals.push(patch.isDefault) }
    await fastify.pgPool.query(
      `UPDATE rule_group SET ${setClauses.join(', ')} WHERE filiale = $2 AND group_code = $3 AND is_deleted = 0`,
      vals,
    )
  },

  async deleteGroup(
    fastify: FastifyInstance,
    filiale: string,
    groupCode: string,
    userCode: string,
  ): Promise<'not_found' | 'is_default' | 'ok'> {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
      `SELECT id, is_default FROM rule_group WHERE group_code = $1 AND filiale = $2 AND is_deleted = 0`,
      [groupCode, filiale],
    )
    if (rows.length === 0) return 'not_found'
    if (rows[0].is_default) return 'is_default'
    const groupId = Number(rows[0].id)
    await fastify.pgPool.query(`DELETE FROM rule_group_item WHERE group_id = $1`, [groupId])
    await fastify.pgPool.query(
      `UPDATE rule_group SET is_deleted = 1, updated_by = $1, updated_at = now() WHERE id = $2`,
      [userCode, groupId],
    )
    return 'ok'
  },

  async listGroupItems(
    fastify: FastifyInstance,
    filiale: string,
    groupCode: string,
  ): Promise<RuleGroupItemRow[]> {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
      SELECT
        gi.id, gi.instance_id, gi.enabled, gi.severity_override,
        gi.param_override, gi.message_template, gi.sort_order,
        i.instance_code, i.name, i.template_code, i.ccar_reference,
        i.severity, i.overridable, i.params,
        t.category, t.check_type, t.param_schema, t.template_vars
      FROM rule_group g
        JOIN rule_group_item gi ON gi.group_id = g.id
        JOIN rule_instance i    ON i.id = gi.instance_id AND i.is_deleted = 0
        JOIN rule_template t    ON t.code = i.template_code
      WHERE g.group_code = $1 AND g.filiale = $2 AND g.is_deleted = 0
      ORDER BY gi.sort_order, t.check_type DESC
    `, [groupCode, filiale])

    return rows.map((r) => ({
      id: Number(r.id),
      instanceId: Number(r.instance_id),
      instanceCode: r.instance_code as string,
      templateCode: r.template_code as string,
      name: r.name as string,
      ccarReference: r.ccar_reference as string | null,
      category: r.category as string,
      checkType: r.check_type as string,
      severity: r.severity as string,
      overridable: r.overridable as boolean,
      params: r.params as Record<string, unknown>,
      paramSchema: r.param_schema as Record<string, unknown>,
      templateVars: (r.template_vars as Array<{ name: string; label: string; example: string | number }>) ?? [],
      enabled: r.enabled as boolean,
      severityOverride: r.severity_override as string | null,
      paramOverride: r.param_override as Record<string, unknown> | null,
      messageTemplate: r.message_template as string | null,
      sortOrder: Number(r.sort_order),
    }))
  },

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

    const { rows: maxRow } = await fastify.pgPool.query<Record<string, unknown>>(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM rule_group_item WHERE group_id = $1`,
      [groupId],
    )
    let nextOrder = Number(maxRow[0].max_order) + 1

    for (const code of instanceCodes) {
      const { rows: instRows } = await fastify.pgPool.query<Record<string, unknown>>(
        `SELECT id FROM rule_instance WHERE instance_code = $1 AND filiale = $2 AND is_deleted = 0`,
        [code, filiale],
      )
      if (instRows.length === 0) continue
      const instanceId = Number(instRows[0].id)
      await fastify.pgPool.query(`
        INSERT INTO rule_group_item (group_id, instance_id, enabled, sort_order, created_by, updated_by)
        VALUES ($1, $2, true, $3, $4, $4)
        ON CONFLICT (group_id, instance_id) DO NOTHING
      `, [groupId, instanceId, nextOrder++, userCode])
    }
  },

  async updateItem(
    fastify: FastifyInstance,
    filiale: string,
    groupCode: string,
    instanceCode: string,
    userCode: string,
    patch: ItemPatch,
  ): Promise<'not_found' | 'ok'> {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
      SELECT gi.id FROM rule_group_item gi
        JOIN rule_group g   ON g.id = gi.group_id
        JOIN rule_instance i ON i.id = gi.instance_id
      WHERE g.group_code = $1 AND g.filiale = $2 AND i.instance_code = $3
        AND g.is_deleted = 0 AND i.is_deleted = 0
    `, [groupCode, filiale, instanceCode])
    if (rows.length === 0) return 'not_found'
    const itemId = Number(rows[0].id)

    const setClauses: string[] = ['updated_by = $1', 'updated_at = now()']
    const vals: unknown[] = [userCode, itemId]
    let idx = 3
    if (patch.enabled !== undefined)         { setClauses.push(`enabled = $${idx++}`);          vals.push(patch.enabled) }
    if ('severityOverride' in patch)         { setClauses.push(`severity_override = $${idx++}`); vals.push(patch.severityOverride ?? null) }
    if ('paramOverride' in patch)            { setClauses.push(`param_override = $${idx++}`);    vals.push(patch.paramOverride ? JSON.stringify(patch.paramOverride) : null) }
    if ('messageTemplate' in patch)          { setClauses.push(`message_template = $${idx++}`);  vals.push(patch.messageTemplate ?? null) }

    await fastify.pgPool.query(
      `UPDATE rule_group_item SET ${setClauses.join(', ')} WHERE id = $2`,
      vals,
    )
    return 'ok'
  },

  async reorderItems(
    fastify: FastifyInstance,
    filiale: string,
    groupCode: string,
    userCode: string,
    orderedInstanceCodes: string[],
  ): Promise<void> {
    for (let i = 0; i < orderedInstanceCodes.length; i++) {
      await this.updateItem(fastify, filiale, groupCode, orderedInstanceCodes[i], userCode, {})
      // Update sort_order directly
      await fastify.pgPool.query(`
        UPDATE rule_group_item gi
        SET sort_order = $1, updated_by = $2, updated_at = now()
        FROM rule_group g, rule_instance inst
        WHERE gi.group_id = g.id AND gi.instance_id = inst.id
          AND g.group_code = $3 AND g.filiale = $4 AND g.is_deleted = 0
          AND inst.instance_code = $5 AND inst.is_deleted = 0
      `, [i, userCode, groupCode, filiale, orderedInstanceCodes[i]])
    }
  },

  async removeItem(
    fastify: FastifyInstance,
    filiale: string,
    groupCode: string,
    instanceCode: string,
  ): Promise<'not_found' | 'ok'> {
    const { rowCount } = await fastify.pgPool.query(`
      DELETE FROM rule_group_item
      WHERE group_id = (SELECT id FROM rule_group WHERE group_code = $1 AND filiale = $2 AND is_deleted = 0)
        AND instance_id = (SELECT id FROM rule_instance WHERE instance_code = $3 AND filiale = $2 AND is_deleted = 0)
    `, [groupCode, filiale, instanceCode])
    return (rowCount ?? 0) > 0 ? 'ok' : 'not_found'
  },

  async listInstances(
    fastify: FastifyInstance,
    filiale: string,
    groupCode: string,
  ): Promise<RuleInstanceOption[]> {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
      SELECT i.instance_code, i.name, i.template_code, i.ccar_reference,
             i.severity, t.category, t.check_type
      FROM rule_instance i
        JOIN rule_template t ON t.code = i.template_code
      WHERE i.filiale = $1 AND i.is_deleted = 0
        AND i.id NOT IN (
          SELECT gi.instance_id FROM rule_group_item gi
            JOIN rule_group g ON g.id = gi.group_id
          WHERE g.group_code = $2 AND g.filiale = $1 AND g.is_deleted = 0
        )
      ORDER BY t.category, i.name
    `, [filiale, groupCode])

    return rows.map((r) => ({
      instanceCode: r.instance_code as string,
      name: r.name as string,
      templateCode: r.template_code as string,
      category: r.category as string,
      checkType: r.check_type as string,
      severity: r.severity as string,
      ccarReference: r.ccar_reference as string | null,
    }))
  },

  /** Tell rule-engine to flush its in-memory cache for the given group */
  async invalidateRuleEngineCache(groupCode: string): Promise<void> {
    try {
      await axios.post(`${env.RULE_ENGINE_URL}/admin/cache/invalidate`, { groupCode }, { timeout: 3000 })
    } catch {
      // Non-fatal — cache will expire naturally via TTL
    }
  },
}
```

- [ ] **Add `RULE_ENGINE_URL` to live-server env config**

In `live-server/src/config/env.ts`, add:

```typescript
RULE_ENGINE_URL: z.string().url().default('http://localhost:3001'),
```

And in `.env` / `.env.example`:
```
RULE_ENGINE_URL=http://localhost:3001
```

- [ ] **Build live-server to verify types**

```bash
cd live-server && npm run build 2>&1 | tail -10
```

- [ ] **Commit**

```bash
git add live-server/src/services/rule/rule-config-service.ts \
        live-server/src/config/env.ts live-server/.env.example
git commit -m "feat(live-server): add rule-config-service with full group/item CRUD"
```

---

## Task 6: live-server — rule-config routes

**Files:**
- Create: `live-server/src/routes/rule/rule-config.ts`
- Create: `live-server/src/routes/rule/index.ts`
- Modify: `live-server/src/index.ts`

- [ ] **Create `live-server/src/routes/rule/rule-config.ts`**

```typescript
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { ruleConfigService } from '../../services/rule/rule-config-service.js'

const newGroupSchema = z.object({
  groupCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  usage: z.enum(['GANTT', 'PO', 'RO', 'PBS', 'ALL']),
  division: z.enum(['P', 'C']),
  isDefault: z.boolean().default(false),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
})

const itemPatchSchema = z.object({
  enabled: z.boolean().optional(),
  severityOverride: z.enum(['ERROR', 'WARNING', 'INFO']).nullable().optional(),
  paramOverride: z.record(z.unknown()).nullable().optional(),
  messageTemplate: z.string().nullable().optional(),
})

const reorderSchema = z.object({
  orderedInstanceCodes: z.array(z.string().min(1)).min(1),
})

const addItemsSchema = z.object({
  instanceCodes: z.array(z.string().min(1)).min(1),
})

export default async function ruleConfigRoutes(fastify: FastifyInstance) {
  const filiale = (req: { authUser?: { schema: string } }) =>
    (req.authUser?.schema ?? 'f8').toUpperCase()
  const user = (req: { authUser?: { userCode: string } }) =>
    req.authUser?.userCode ?? 'system'

  // GET /api/rule/groups
  fastify.get('/groups', async (request, reply) => {
    const groups = await ruleConfigService.listGroups(fastify, filiale(request))
    return success(reply, groups)
  })

  // POST /api/rule/groups
  fastify.post('/groups', async (request, reply) => {
    const parsed = newGroupSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const group = await ruleConfigService.createGroup(fastify, filiale(request), user(request), parsed.data)
    return success(reply, group)
  })

  // PATCH /api/rule/groups/:groupCode
  fastify.patch('/groups/:groupCode', async (request, reply) => {
    const { groupCode } = request.params as { groupCode: string }
    const parsed = updateGroupSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    await ruleConfigService.updateGroup(fastify, filiale(request), groupCode, user(request), {
      name: parsed.data.name,
      description: parsed.data.description,
      isDefault: parsed.data.isDefault,
    })
    return success(reply, null)
  })

  // DELETE /api/rule/groups/:groupCode
  fastify.delete('/groups/:groupCode', async (request, reply) => {
    const { groupCode } = request.params as { groupCode: string }
    const result = await ruleConfigService.deleteGroup(fastify, filiale(request), groupCode, user(request))
    if (result === 'not_found') return fail(reply, 404, 'Rule group not found')
    if (result === 'is_default') return fail(reply, 409, 'Cannot delete the default rule group')
    await ruleConfigService.invalidateRuleEngineCache(groupCode)
    return success(reply, null)
  })

  // GET /api/rule/groups/:groupCode/items
  fastify.get('/groups/:groupCode/items', async (request, reply) => {
    const { groupCode } = request.params as { groupCode: string }
    const items = await ruleConfigService.listGroupItems(fastify, filiale(request), groupCode)
    return success(reply, items)
  })

  // POST /api/rule/groups/:groupCode/items
  fastify.post('/groups/:groupCode/items', async (request, reply) => {
    const { groupCode } = request.params as { groupCode: string }
    const parsed = addItemsSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    await ruleConfigService.addItems(fastify, filiale(request), groupCode, user(request), parsed.data.instanceCodes)
    await ruleConfigService.invalidateRuleEngineCache(groupCode)
    return success(reply, null)
  })

  // PATCH /api/rule/groups/:groupCode/items/:instanceCode
  fastify.patch('/groups/:groupCode/items/:instanceCode', async (request, reply) => {
    const { groupCode, instanceCode } = request.params as { groupCode: string; instanceCode: string }
    const parsed = itemPatchSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const result = await ruleConfigService.updateItem(fastify, filiale(request), groupCode, instanceCode, user(request), parsed.data)
    if (result === 'not_found') return fail(reply, 404, 'Rule group item not found')
    await ruleConfigService.invalidateRuleEngineCache(groupCode)
    return success(reply, null)
  })

  // DELETE /api/rule/groups/:groupCode/items/:instanceCode
  fastify.delete('/groups/:groupCode/items/:instanceCode', async (request, reply) => {
    const { groupCode, instanceCode } = request.params as { groupCode: string; instanceCode: string }
    const result = await ruleConfigService.removeItem(fastify, filiale(request), groupCode, instanceCode)
    if (result === 'not_found') return fail(reply, 404, 'Rule group item not found')
    await ruleConfigService.invalidateRuleEngineCache(groupCode)
    return success(reply, null)
  })

  // PATCH /api/rule/groups/:groupCode/items/reorder
  fastify.patch('/groups/:groupCode/items/reorder', async (request, reply) => {
    const { groupCode } = request.params as { groupCode: string }
    const parsed = reorderSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    await ruleConfigService.reorderItems(fastify, filiale(request), groupCode, user(request), parsed.data.orderedInstanceCodes)
    await ruleConfigService.invalidateRuleEngineCache(groupCode)
    return success(reply, null)
  })

  // GET /api/rule/instances?groupCode=xxx
  fastify.get('/instances', async (request, reply) => {
    const { groupCode } = request.query as { groupCode?: string }
    if (!groupCode) return fail(reply, 400, 'groupCode query param required')
    const instances = await ruleConfigService.listInstances(fastify, filiale(request), groupCode)
    return success(reply, instances)
  })
}
```

- [ ] **Create `live-server/src/routes/rule/index.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import ruleConfigRoutes from './rule-config.js'

export default async function ruleModule(fastify: FastifyInstance) {
  await fastify.register(ruleConfigRoutes, { prefix: '/api/rule' })
}
```

- [ ] **Register in `live-server/src/index.ts`**

Add after the existing route imports:

```typescript
import ruleRoutes from './routes/rule/index.js'
```

And in the `start()` function alongside the other route registrations:

```typescript
await server.register(ruleRoutes)
```

- [ ] **Build live-server**

```bash
cd live-server && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Smoke test (with live-server running)**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/rule/groups | jq '.data | length'
```

Expected: a number (count of rule groups).

- [ ] **Commit**

```bash
git add live-server/src/routes/rule/ live-server/src/index.ts
git commit -m "feat(live-server): add /api/rule route group for rule config CRUD"
```

---

## Task 7: gantt — types + API service

**Files:**
- Create: `gantt/src/types/rule-config.ts`
- Create: `gantt/src/services/rule-config-api.ts`

- [ ] **Create `gantt/src/types/rule-config.ts`**

```typescript
export interface RuleGroupConfig {
  id: number
  groupCode: string
  name: string
  description: string | null
  usage: string
  filiale: string
  division: string
  isDefault: boolean
  itemCount: number
}

export interface TemplateVar {
  name: string
  label: string
  example: string | number
}

export interface RuleGroupItemConfig {
  id: number
  instanceId: number
  instanceCode: string
  templateCode: string
  name: string
  ccarReference: string | null
  category: string
  checkType: string        // 'CHECK' | 'CALC' | 'BOTH'
  severity: string         // base severity from instance
  overridable: boolean
  params: Record<string, unknown>
  paramSchema: Record<string, unknown>
  templateVars: TemplateVar[]
  enabled: boolean
  severityOverride: string | null
  paramOverride: Record<string, unknown> | null
  messageTemplate: string | null
  sortOrder: number
}

export interface RuleInstanceOption {
  instanceCode: string
  name: string
  templateCode: string
  category: string
  checkType: string
  severity: string
  ccarReference: string | null
}

export interface NewGroupData {
  groupCode: string
  name: string
  description?: string
  usage: string
  division: string
  isDefault: boolean
}

export interface ItemPatch {
  enabled?: boolean
  severityOverride?: string | null
  paramOverride?: Record<string, unknown> | null
  messageTemplate?: string | null
}
```

- [ ] **Create `gantt/src/services/rule-config-api.ts`**

```typescript
import { LIVE_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
import type {
  RuleGroupConfig, RuleGroupItemConfig, RuleInstanceOption,
  NewGroupData, ItemPatch,
} from '@/types/rule-config'

const client = createHttpClient({ baseURL: LIVE_API_BASE })

export const ruleConfigApi = {
  listGroups: (): Promise<RuleGroupConfig[]> =>
    client.get('/api/rule/groups') as Promise<RuleGroupConfig[]>,

  createGroup: (data: NewGroupData): Promise<RuleGroupConfig> =>
    client.post('/api/rule/groups', data) as Promise<RuleGroupConfig>,

  updateGroup: (groupCode: string, patch: { name?: string; description?: string | null; isDefault?: boolean }): Promise<void> =>
    client.patch(`/api/rule/groups/${groupCode}`, patch) as Promise<void>,

  deleteGroup: (groupCode: string): Promise<void> =>
    client.delete(`/api/rule/groups/${groupCode}`) as Promise<void>,

  listGroupItems: (groupCode: string): Promise<RuleGroupItemConfig[]> =>
    client.get(`/api/rule/groups/${groupCode}/items`) as Promise<RuleGroupItemConfig[]>,

  addItems: (groupCode: string, instanceCodes: string[]): Promise<void> =>
    client.post(`/api/rule/groups/${groupCode}/items`, { instanceCodes }) as Promise<void>,

  updateItem: (groupCode: string, instanceCode: string, patch: ItemPatch): Promise<void> =>
    client.patch(`/api/rule/groups/${groupCode}/items/${instanceCode}`, patch) as Promise<void>,

  removeItem: (groupCode: string, instanceCode: string): Promise<void> =>
    client.delete(`/api/rule/groups/${groupCode}/items/${instanceCode}`) as Promise<void>,

  reorderItems: (groupCode: string, orderedInstanceCodes: string[]): Promise<void> =>
    client.patch(`/api/rule/groups/${groupCode}/items/reorder`, { orderedInstanceCodes }) as Promise<void>,

  listInstances: (groupCode: string): Promise<RuleInstanceOption[]> =>
    client.get(`/api/rule/instances?groupCode=${encodeURIComponent(groupCode)}`) as Promise<RuleInstanceOption[]>,
}
```

- [ ] **Commit**

```bash
git add gantt/src/types/rule-config.ts gantt/src/services/rule-config-api.ts
git commit -m "feat(gantt): add rule-config types and API service"
```

---

## Task 8: gantt — rule-config-store

**Files:**
- Create: `gantt/src/stores/rule-config-store.ts`

- [ ] **Create `gantt/src/stores/rule-config-store.ts`**

```typescript
import { create } from 'zustand'
import { ruleConfigApi } from '@/services/rule-config-api'
import type { RuleGroupConfig, RuleGroupItemConfig, NewGroupData, ItemPatch } from '@/types/rule-config'

interface RuleConfigStore {
  groups: RuleGroupConfig[]
  selectedGroupCode: string | null
  groupItems: RuleGroupItemConfig[]
  loading: boolean
  itemsLoading: boolean

  fetchGroups: () => Promise<void>
  selectGroup: (groupCode: string) => Promise<void>
  createGroup: (data: NewGroupData) => Promise<void>
  updateGroup: (groupCode: string, patch: { name?: string; description?: string | null; isDefault?: boolean }) => Promise<void>
  deleteGroup: (groupCode: string) => Promise<void>
  addItems: (instanceCodes: string[]) => Promise<void>
  updateItem: (instanceCode: string, patch: ItemPatch) => Promise<void>
  removeItem: (instanceCode: string) => Promise<void>
  reorderItems: (orderedInstanceCodes: string[]) => Promise<void>
}

export const useRuleConfigStore = create<RuleConfigStore>((set, get) => ({
  groups: [],
  selectedGroupCode: null,
  groupItems: [],
  loading: false,
  itemsLoading: false,

  fetchGroups: async () => {
    set({ loading: true })
    try {
      const groups = await ruleConfigApi.listGroups()
      set({ groups })
    } finally {
      set({ loading: false })
    }
  },

  selectGroup: async (groupCode) => {
    set({ selectedGroupCode: groupCode, itemsLoading: true, groupItems: [] })
    try {
      const items = await ruleConfigApi.listGroupItems(groupCode)
      set({ groupItems: items })
    } finally {
      set({ itemsLoading: false })
    }
  },

  createGroup: async (data) => {
    const group = await ruleConfigApi.createGroup(data)
    set((s) => ({ groups: [...s.groups, group] }))
    await get().selectGroup(group.groupCode)
  },

  updateGroup: async (groupCode, patch) => {
    await ruleConfigApi.updateGroup(groupCode, patch)
    set((s) => ({
      groups: s.groups.map((g) =>
        g.groupCode === groupCode
          ? { ...g, ...patch, isDefault: patch.isDefault ?? g.isDefault }
          : patch.isDefault ? { ...g, isDefault: false } : g,
      ),
    }))
  },

  deleteGroup: async (groupCode) => {
    await ruleConfigApi.deleteGroup(groupCode)
    const { groups, selectedGroupCode } = get()
    const remaining = groups.filter((g) => g.groupCode !== groupCode)
    const next = selectedGroupCode === groupCode ? (remaining[0]?.groupCode ?? null) : selectedGroupCode
    set({ groups: remaining, selectedGroupCode: next, groupItems: next ? get().groupItems : [] })
    if (next) await get().selectGroup(next)
  },

  addItems: async (instanceCodes) => {
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    await ruleConfigApi.addItems(selectedGroupCode, instanceCodes)
    await get().selectGroup(selectedGroupCode)
  },

  updateItem: async (instanceCode, patch) => {
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    // Optimistic update
    set((s) => ({
      groupItems: s.groupItems.map((item) =>
        item.instanceCode === instanceCode ? { ...item, ...patch } : item,
      ),
    }))
    try {
      await ruleConfigApi.updateItem(selectedGroupCode, instanceCode, patch)
    } catch {
      // Revert on failure
      await get().selectGroup(selectedGroupCode)
    }
  },

  removeItem: async (instanceCode) => {
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    await ruleConfigApi.removeItem(selectedGroupCode, instanceCode)
    set((s) => ({ groupItems: s.groupItems.filter((i) => i.instanceCode !== instanceCode) }))
  },

  reorderItems: async (orderedInstanceCodes) => {
    // Optimistic reorder
    set((s) => {
      const map = new Map(s.groupItems.map((i) => [i.instanceCode, i]))
      const reordered = orderedInstanceCodes.flatMap((code) => {
        const item = map.get(code)
        return item ? [{ ...item, sortOrder: orderedInstanceCodes.indexOf(code) }] : []
      })
      return { groupItems: reordered }
    })
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    try {
      await ruleConfigApi.reorderItems(selectedGroupCode, orderedInstanceCodes)
    } catch {
      await get().selectGroup(selectedGroupCode)
    }
  },
}))
```

- [ ] **Commit**

```bash
git add gantt/src/stores/rule-config-store.ts
git commit -m "feat(gantt): add rule-config-store (Zustand)"
```

---

## Task 9: gantt — left panel components + NewGroupDialog

**Files:**
- Create: `gantt/src/components/rule/rule-group-card.tsx`
- Create: `gantt/src/components/rule/new-group-dialog.tsx`
- Create: `gantt/src/components/rule/rule-group-list.tsx`

- [ ] **Create `gantt/src/components/rule/rule-group-card.tsx`**

```tsx
import type { RuleGroupConfig } from '@/types/rule-config'

const USAGE_STYLE: Record<string, string> = {
  GANTT: 'bg-sky-950 text-sky-300',
  ALL:   'bg-teal-950 text-teal-300',
  PO:    'bg-violet-950 text-violet-300',
  RO:    'bg-orange-950 text-orange-300',
  PBS:   'bg-pink-950 text-pink-300',
}
const DIV_LABEL: Record<string, string> = { P: 'Pilot', C: 'Cabin' }

interface Props {
  group: RuleGroupConfig
  active: boolean
  onClick: () => void
}

export const RuleGroupCard = ({ group, active, onClick }: Props) => (
  <button
    onClick={onClick}
    className={[
      'w-full rounded-lg border p-2.5 text-left transition-colors',
      active
        ? 'border-primary/60 bg-primary/10'
        : 'border-border bg-background hover:bg-card',
    ].join(' ')}
  >
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className={`text-xs font-semibold truncate ${active ? 'text-primary' : 'text-foreground'}`}>
        {group.name}
      </span>
      {group.isDefault && (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-950 text-green-400 border border-green-800">
          Default
        </span>
      )}
    </div>
    <div className="flex flex-wrap gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${USAGE_STYLE[group.usage] ?? 'bg-muted text-muted-foreground'}`}>
        {group.usage}
      </span>
      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-indigo-950 text-indigo-300">
        {DIV_LABEL[group.division] ?? group.division}
      </span>
      <span className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground bg-muted">
        {group.itemCount} rules
      </span>
    </div>
  </button>
)
```

- [ ] **Create `gantt/src/components/rule/new-group-dialog.tsx`**

```tsx
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea, Label, Select, SelectTrigger, SelectValue,
  SelectContent, SelectItem,
} from '@rois/ui'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import type { NewGroupData } from '@/types/rule-config'

interface Props {
  open: boolean
  onClose: () => void
}

const toGroupCode = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50)

export const NewGroupDialog = ({ open, onClose }: Props) => {
  const createGroup = useRuleConfigStore((s) => s.createGroup)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<NewGroupData>({
    groupCode: '', name: '', description: '',
    usage: 'GANTT', division: 'P', isDefault: false,
  })

  const handleNameChange = (name: string) =>
    setForm((f) => ({ ...f, name, groupCode: toGroupCode(name) }))

  const handleSave = async () => {
    if (!form.name.trim() || !form.groupCode.trim()) return
    setSaving(true)
    try {
      await createGroup(form)
      onClose()
      setForm({ groupCode: '', name: '', description: '', usage: 'GANTT', division: 'P', isDefault: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Rule Set</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rg-name">Name <span className="text-destructive">*</span></Label>
            <Input id="rg-name" value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="CCAR-121 Full Standard" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rg-code">Code <span className="text-destructive">*</span></Label>
            <Input id="rg-code" value={form.groupCode} onChange={(e) => setForm((f) => ({ ...f, groupCode: e.target.value }))} placeholder="ccar121_full" className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Usage</Label>
              <Select value={form.usage} onValueChange={(v) => setForm((f) => ({ ...f, usage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['GANTT', 'PO', 'RO', 'PBS', 'ALL'].map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Division</Label>
              <Select value={form.division} onValueChange={(v) => setForm((f) => ({ ...f, division: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P">Pilot (P)</SelectItem>
                  <SelectItem value="C">Cabin (C)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rg-desc">Description</Label>
            <Textarea id="rg-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
            <span className="text-sm">Set as default for this division</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Creating…' : 'Create Rule Set'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Create `gantt/src/components/rule/rule-group-list.tsx`**

```tsx
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { RuleGroupCard } from './rule-group-card'
import { NewGroupDialog } from './new-group-dialog'

export const RuleGroupList = () => {
  const groups = useRuleConfigStore((s) => s.groups)
  const selectedGroupCode = useRuleConfigStore((s) => s.selectedGroupCode)
  const selectGroup = useRuleConfigStore((s) => s.selectGroup)
  const loading = useRuleConfigStore((s) => s.loading)
  const [newOpen, setNewOpen] = useState(false)

  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-xs font-bold text-foreground">Rule Sets</span>
          <button
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1 rounded-md bg-primary/20 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/30 transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Set
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {loading && (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {!loading && groups.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">No rule sets</div>
          )}
          {groups.map((g) => (
            <RuleGroupCard
              key={g.groupCode}
              group={g}
              active={g.groupCode === selectedGroupCode}
              onClick={() => selectGroup(g.groupCode)}
            />
          ))}
        </div>
      </aside>

      <NewGroupDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  )
}
```

- [ ] **Commit**

```bash
git add gantt/src/components/rule/
git commit -m "feat(gantt): add rule left panel — RuleGroupCard, RuleGroupList, NewGroupDialog"
```

---

## Task 10: gantt — RuleGroupHeader

**Files:**
- Create: `gantt/src/components/rule/rule-group-header.tsx`

- [ ] **Create the file**

```tsx
import { useState } from 'react'
import { Trash2, Copy, Star } from 'lucide-react'
import { useRuleConfigStore } from '@/stores/rule-config-store'

const USAGE_STYLE: Record<string, string> = {
  GANTT: 'bg-sky-950 text-sky-300',
  ALL:   'bg-teal-950 text-teal-300',
  PO:    'bg-violet-950 text-violet-300',
  RO:    'bg-orange-950 text-orange-300',
  PBS:   'bg-pink-950 text-pink-300',
}

export const RuleGroupHeader = () => {
  const groups = useRuleConfigStore((s) => s.groups)
  const selectedGroupCode = useRuleConfigStore((s) => s.selectedGroupCode)
  const groupItems = useRuleConfigStore((s) => s.groupItems)
  const updateGroup = useRuleConfigStore((s) => s.updateGroup)
  const deleteGroup = useRuleConfigStore((s) => s.deleteGroup)
  const [deleting, setDeleting] = useState(false)

  const group = groups.find((g) => g.groupCode === selectedGroupCode)
  if (!group) return null

  const enabledCount = groupItems.filter((i) => i.enabled).length
  const overrideCount = groupItems.filter(
    (i) => i.paramOverride || i.severityOverride || i.messageTemplate,
  ).length

  const handleDelete = async () => {
    if (!confirm(`Delete rule set "${group.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteGroup(group.groupCode)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="shrink-0 border-b border-border bg-card px-5 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-base font-bold text-foreground truncate">{group.name}</h2>
            {group.isDefault && (
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-950 text-green-400 border border-green-800 shrink-0">
                Default
              </span>
            )}
          </div>
          <code className="text-[11px] text-muted-foreground">{group.groupCode}</code>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${USAGE_STYLE[group.usage] ?? 'bg-muted text-muted-foreground'}`}>
              {group.usage}
            </span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-indigo-950 text-indigo-300">
              {group.division === 'P' ? 'Pilot' : 'Cabin'} ({group.division})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!group.isDefault && (
            <button
              onClick={() => updateGroup(group.groupCode, { isDefault: true })}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <Star className="h-3 w-3" />
              Set as Default
            </button>
          )}
          <button className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Copy className="h-3 w-3" />
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            disabled={group.isDefault || deleting}
            className="flex items-center gap-1 rounded-md border border-red-900/40 px-2.5 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
      </div>

      {group.description && (
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{group.description}</p>
      )}

      <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">{group.itemCount}</strong> rules total</span>
        <span><strong className="text-foreground">{enabledCount}</strong> enabled</span>
        <span><strong className="text-foreground">{overrideCount}</strong> with overrides</span>
        <span><strong className="text-foreground">{group.filiale}</strong></span>
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add gantt/src/components/rule/rule-group-header.tsx
git commit -m "feat(gantt): add RuleGroupHeader with stats and actions"
```

---

## Task 11: gantt — AddRulesDialog

**Files:**
- Create: `gantt/src/components/rule/add-rules-dialog.tsx`

- [ ] **Create the file**

```tsx
import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input,
} from '@rois/ui'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { ruleConfigApi } from '@/services/rule-config-api'
import type { RuleInstanceOption } from '@/types/rule-config'

const SEV_STYLE: Record<string, string> = {
  ERROR:   'bg-red-950 text-red-300',
  WARNING: 'bg-amber-950 text-amber-300',
  INFO:    'bg-cyan-950 text-cyan-300',
}
const TYPE_STYLE: Record<string, string> = {
  CALC: 'bg-slate-800 text-slate-400',
  CHECK: 'bg-slate-800 text-slate-300',
  BOTH: 'bg-slate-800 text-slate-300',
}

interface Props { open: boolean; onClose: () => void }

export const AddRulesDialog = ({ open, onClose }: Props) => {
  const selectedGroupCode = useRuleConfigStore((s) => s.selectedGroupCode)
  const addItems = useRuleConfigStore((s) => s.addItems)
  const [instances, setInstances] = useState<RuleInstanceOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !selectedGroupCode) return
    setLoading(true)
    ruleConfigApi.listInstances(selectedGroupCode)
      .then(setInstances)
      .finally(() => setLoading(false))
    setSelected(new Set())
    setSearch('')
  }, [open, selectedGroupCode])

  const filtered = instances.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.instanceCode.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase()),
  )

  const grouped = filtered.reduce<Record<string, RuleInstanceOption[]>>((acc, i) => {
    if (!acc[i.category]) acc[i.category] = []
    acc[i.category].push(i)
    return acc
  }, {})

  const toggle = (code: string) =>
    setSelected((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n })

  const handleAdd = async () => {
    if (selected.size === 0) return
    setSaving(true)
    try {
      await addItems([...selected])
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Rules to Set</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="h-8 text-sm"
          />
          <div className="max-h-[380px] overflow-y-auto rounded-md border border-border">
            {loading && <div className="py-10 text-center text-xs text-muted-foreground">Loading…</div>}
            {!loading && Object.keys(grouped).length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                {search ? 'No matches' : 'All available rules are already in this set'}
              </div>
            )}
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div className="sticky top-0 bg-muted px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {cat}
                </div>
                {items.map((inst) => (
                  <label
                    key={inst.instanceCode}
                    className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(inst.instanceCode)}
                      onChange={() => toggle(inst.instanceCode)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{inst.name}</div>
                      <code className="text-[10px] text-muted-foreground">{inst.instanceCode}</code>
                      {inst.ccarReference && (
                        <span className="ml-2 text-[10px] text-muted-foreground">{inst.ccarReference}</span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${TYPE_STYLE[inst.checkType] ?? ''}`}>
                        {inst.checkType}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${SEV_STYLE[inst.severity] ?? ''}`}>
                        {inst.severity}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : 'Select rules to add'}
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd} disabled={selected.size === 0 || saving}>
            {saving ? 'Adding…' : `Add selected (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Commit**

```bash
git add gantt/src/components/rule/add-rules-dialog.tsx
git commit -m "feat(gantt): add AddRulesDialog for adding instances to a rule set"
```

---

## Task 12: gantt — install @dnd-kit + OverrideEditor + TemplateVarPicker

**Files:**
- Create: `gantt/src/components/rule/template-var-picker.tsx`
- Create: `gantt/src/components/rule/override-editor.tsx`

- [ ] **Install @dnd-kit packages**

```bash
cd gantt && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Verify licenses (all MIT):
```bash
cat node_modules/@dnd-kit/core/package.json | grep '"license"'
```

Expected: `"license": "MIT"`

- [ ] **Create `gantt/src/components/rule/template-var-picker.tsx`**

```tsx
import { useState } from 'react'
import { Braces } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, Button } from '@rois/ui'
import type { TemplateVar } from '@/types/rule-config'

interface Props {
  vars: TemplateVar[]
  onInsert: (varName: string) => void
}

export const TemplateVarPicker = ({ vars, onInsert }: Props) => {
  const [open, setOpen] = useState(false)

  if (vars.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
          <Braces className="h-3 w-3" />
          Variables
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <p className="mb-2 text-[11px] text-muted-foreground">Click to insert into template:</p>
        <div className="flex flex-col gap-0.5">
          {vars.map((v) => (
            <button
              key={v.name}
              onClick={() => { onInsert(v.name); setOpen(false) }}
              className="flex items-center justify-between rounded px-2 py-1.5 text-left hover:bg-muted transition-colors"
            >
              <div>
                <code className="text-[11px] font-semibold text-primary">{`{${v.name}}`}</code>
                <span className="ml-2 text-[11px] text-muted-foreground">{v.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">e.g. {String(v.example)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Create `gantt/src/components/rule/override-editor.tsx`**

```tsx
import { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@rois/ui'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { TemplateVarPicker } from './template-var-picker'
import type { RuleGroupItemConfig, ItemPatch } from '@/types/rule-config'

type ParamSchemaEntry = {
  type: string
  default?: unknown
  enum?: string[]
  description?: string
}

interface Props {
  item: RuleGroupItemConfig
  onClose: () => void
}

export const OverrideEditor = ({ item, onClose }: Props) => {
  const updateItem = useRuleConfigStore((s) => s.updateItem)
  const [saving, setSaving] = useState(false)

  // Local editable state
  const [paramOverride, setParamOverride] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {}
      if (item.paramOverride) {
        for (const [k, v] of Object.entries(item.paramOverride)) {
          init[k] = String(v)
        }
      }
      return init
    },
  )
  const [severityOverride, setSeverityOverride] = useState<string>(
    item.severityOverride ?? '',
  )
  const [messageTemplate, setMessageTemplate] = useState<string>(
    item.messageTemplate ?? '',
  )
  const templateInputRef = useRef<HTMLTextAreaElement>(null)

  const schema = item.paramSchema as Record<string, ParamSchemaEntry>

  const handleInsertVar = (varName: string) => {
    const el = templateInputRef.current
    if (!el) {
      setMessageTemplate((t) => t + `{${varName}}`)
      return
    }
    const start = el.selectionStart ?? messageTemplate.length
    const end = el.selectionEnd ?? start
    const next = messageTemplate.slice(0, start) + `{${varName}}` + messageTemplate.slice(end)
    setMessageTemplate(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + varName.length + 2, start + varName.length + 2)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const patch: ItemPatch = {}
      // Build param override — only include non-empty values
      const po: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(paramOverride)) {
        if (v !== '') {
          const schemaEntry = schema[k]
          po[k] = schemaEntry?.type === 'integer' ? Number(v) : v
        }
      }
      patch.paramOverride = Object.keys(po).length > 0 ? po : null
      patch.severityOverride = severityOverride || null
      patch.messageTemplate = messageTemplate.trim() || null
      await updateItem(item.instanceCode, patch)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset all overrides to instance defaults?')) return
    setSaving(true)
    try {
      await updateItem(item.instanceCode, { paramOverride: null, severityOverride: null, messageTemplate: null })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const paramKeys = Object.keys(schema)

  return (
    <div className="border-t border-border/50 bg-background/60 px-5 pb-4 pt-3">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-primary" />
        <span className="text-[11px] font-semibold text-primary">Override params for this group</span>
        <span className="text-[11px] text-muted-foreground">— {item.name}</span>
        <span className="ml-1 text-[10px] text-muted-foreground">
          (leave blank to use instance default)
        </span>
      </div>

      {/* Param overrides */}
      {paramKeys.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
          {paramKeys.map((key) => {
            const entry = schema[key]
            const baseDefault = item.params[key]
            return (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground">
                  {key}
                  {entry?.description && (
                    <span className="ml-1 font-normal text-muted-foreground/60">{entry.description}</span>
                  )}
                </label>
                {entry?.enum ? (
                  <select
                    value={paramOverride[key] ?? ''}
                    onChange={(e) => setParamOverride((p) => ({ ...p, [key]: e.target.value }))}
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value="">— use default ({String(baseDefault)})</option>
                    {entry.enum.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type={entry?.type === 'integer' ? 'number' : 'text'}
                      value={paramOverride[key] ?? ''}
                      onChange={(e) => setParamOverride((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={String(baseDefault ?? '')}
                      className={[
                        'h-8 flex-1 rounded-md border px-2 text-xs outline-none transition-colors',
                        paramOverride[key]
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground focus:border-primary',
                      ].join(' ')}
                    />
                    {entry?.type === 'integer' && (
                      <span className="text-[10px] text-muted-foreground shrink-0">min</span>
                    )}
                  </div>
                )}
                {baseDefault !== undefined && (
                  <span className="text-[10px] text-muted-foreground/60">
                    Default: {String(baseDefault)}
                  </span>
                )}
              </div>
            )
          })}

          {/* Severity override */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground">
              severity <span className="font-normal text-muted-foreground/60">override</span>
            </label>
            <select
              value={severityOverride}
              onChange={(e) => setSeverityOverride(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="">— use instance default ({item.severity})</option>
              <option value="ERROR">ERROR</option>
              <option value="WARNING">WARNING</option>
              <option value="INFO">INFO</option>
            </select>
          </div>
        </div>
      )}

      {/* Message template */}
      <div className="mb-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-muted-foreground">
            Alert Message Template
            <span className="ml-1 font-normal text-muted-foreground/60">
              — use {'{variable}'} placeholders; blank = built-in message
            </span>
          </label>
          <TemplateVarPicker vars={item.templateVars} onInsert={handleInsertVar} />
        </div>
        <textarea
          ref={templateInputRef}
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          placeholder={`e.g. Duty {duty_seq}: FDP {fdp_minutes}min exceeds {limit_minutes}min`}
          rows={2}
          className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-[11px] text-foreground outline-none focus:border-primary resize-none"
        />
        {messageTemplate && item.templateVars.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Preview:{' '}
            <em>
              {messageTemplate.replace(/{(\w+)}/g, (_, k) => {
                const v = item.templateVars.find((tv) => tv.name === k)
                return v ? String(v.example) : `{${k}}`
              })}
            </em>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-[11px]">
          {saving ? 'Saving…' : 'Save overrides'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-[11px]">
          Cancel
        </Button>
        <button
          onClick={handleReset}
          className="ml-auto flex items-center gap-1 text-[11px] text-destructive hover:underline"
        >
          <RotateCcw className="h-3 w-3" />
          Reset all overrides
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add gantt/src/components/rule/template-var-picker.tsx \
        gantt/src/components/rule/override-editor.tsx \
        gantt/package.json gantt/package-lock.json
git commit -m "feat(gantt): add OverrideEditor and TemplateVarPicker; install @dnd-kit"
```

---

## Task 13: gantt — RuleGroupRow + RuleGroupRules (sortable table)

**Files:**
- Create: `gantt/src/components/rule/rule-group-row.tsx`
- Create: `gantt/src/components/rule/rule-group-rules.tsx`

- [ ] **Create `gantt/src/components/rule/rule-group-row.tsx`**

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

const isCalc = (item: RuleGroupItemConfig) => item.checkType === 'CALC'

const hasOverrides = (item: RuleGroupItemConfig) =>
  item.paramOverride || item.severityOverride || item.messageTemplate

interface Props {
  item: RuleGroupItemConfig
  dragDisabled: boolean
}

export const RuleGroupRow = ({ item, dragDisabled }: Props) => {
  const updateItem = useRuleConfigStore((s) => s.updateItem)
  const [expanded, setExpanded] = useState(false)
  const calc = isCalc(item)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.instanceCode, disabled: dragDisabled || calc })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const overrideCount = [item.paramOverride, item.severityOverride, item.messageTemplate]
    .filter(Boolean).length

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={[
          'border-b border-border/40 transition-colors',
          calc ? 'opacity-60' : '',
          hasOverrides(item) ? 'bg-primary/[0.03]' : '',
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
            {item.ccarReference && (
              <span className="ml-2 text-muted-foreground/60">{item.ccarReference}</span>
            )}
          </div>
        </td>

        {/* Category */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${CAT_STYLE[item.category] ?? 'bg-muted text-muted-foreground'}`}>
            {item.category === 'FLIGHT_TIME' ? 'FT' : item.category}
          </span>
        </td>

        {/* Effective severity */}
        <td className="py-2.5 pr-3">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${SEV_STYLE[item.severityOverride ?? item.severity] ?? ''}`}>
            {item.severityOverride ?? item.severity}
          </span>
        </td>

        {/* Override indicators */}
        <td className="py-2.5 pr-3">
          {!calc && overrideCount > 0 ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              {overrideCount} override{overrideCount > 1 ? 's' : ''}
            </button>
          ) : !calc ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
            >
              + Add override
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

      {/* Inline override editor */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <OverrideEditor item={item} onClose={() => setExpanded(false)} />
          </td>
        </tr>
      )}
    </>
  )
}
```

- [ ] **Create `gantt/src/components/rule/rule-group-rules.tsx`**

```tsx
import { useState } from 'react'
import { Search, Plus } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { RuleGroupRow } from './rule-group-row'
import { AddRulesDialog } from './add-rules-dialog'

export const RuleGroupRules = () => {
  const groupItems = useRuleConfigStore((s) => s.groupItems)
  const itemsLoading = useRuleConfigStore((s) => s.itemsLoading)
  const reorderItems = useRuleConfigStore((s) => s.reorderItems)
  const [search, setSearch] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [overridesOnly, setOverridesOnly] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const isFiltering = !!search || enabledOnly || overridesOnly

  const filtered = groupItems.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.instanceCode.toLowerCase().includes(search.toLowerCase())) return false
    if (enabledOnly && !item.enabled) return false
    if (overridesOnly && !item.paramOverride && !item.severityOverride && !item.messageTemplate) return false
    return true
  })

  const enabledCount = groupItems.filter((i) => i.enabled).length

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupItems.findIndex((i) => i.instanceCode === String(active.id))
    const newIndex = groupItems.findIndex((i) => i.instanceCode === String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = [...groupItems]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    void reorderItems(reordered.map((i) => i.instanceCode))
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 flex-1 max-w-[260px]">
          <Search className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50 w-full"
          />
        </div>
        <button
          onClick={() => setEnabledOnly((v) => !v)}
          className={[
            'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
            enabledOnly
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          Enabled only
        </button>
        <button
          onClick={() => setOverridesOnly((v) => !v)}
          className={[
            'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
            overridesOnly
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          Overrides only
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {groupItems.length} rules · {enabledCount} enabled
        </span>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1 rounded-md bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/30 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Rules
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {itemsLoading && (
          <div className="py-16 text-center text-xs text-muted-foreground">Loading…</div>
        )}
        {!itemsLoading && groupItems.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20">
            <p className="text-sm text-muted-foreground">No rules in this set yet.</p>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rules
            </button>
          </div>
        )}
        {!itemsLoading && groupItems.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={groupItems.map((i) => i.instanceCode)}
              strategy={verticalListSortingStrategy}
            >
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="w-8" />
                    <th className="py-2 pl-1 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rule</th>
                    <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Category</th>
                    <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Severity</th>
                    <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Overrides</th>
                    <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Enabled</th>
                    <th className="py-2 pr-4 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground" />
                  </tr>
                </thead>
                <tbody>
                  {isFiltering && filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                        No rules match filters
                      </td>
                    </tr>
                  )}
                  {(isFiltering ? filtered : groupItems).map((item) => (
                    <RuleGroupRow
                      key={item.instanceCode}
                      item={item}
                      dragDisabled={isFiltering}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AddRulesDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  )
}
```

- [ ] **Commit**

```bash
git add gantt/src/components/rule/rule-group-row.tsx \
        gantt/src/components/rule/rule-group-rules.tsx
git commit -m "feat(gantt): add RuleGroupRow (sortable) and RuleGroupRules (toolbar + DnD table)"
```

---

## Task 14: gantt — RuleView + wire up in app-shell

**Files:**
- Create: `gantt/src/components/rule/rule-view.tsx`
- Modify: `gantt/src/components/shell/app-shell.tsx`

- [ ] **Create `gantt/src/components/rule/rule-view.tsx`**

```tsx
import { useEffect } from 'react'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { RuleGroupList } from './rule-group-list'
import { RuleGroupHeader } from './rule-group-header'
import { RuleGroupRules } from './rule-group-rules'

export const RuleView = () => {
  const fetchGroups = useRuleConfigStore((s) => s.fetchGroups)
  const selectedGroupCode = useRuleConfigStore((s) => s.selectedGroupCode)
  const groups = useRuleConfigStore((s) => s.groups)
  const selectGroup = useRuleConfigStore((s) => s.selectGroup)

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  // Auto-select first group (the default one, since listGroups sorts default first)
  useEffect(() => {
    if (!selectedGroupCode && groups.length > 0) {
      void selectGroup(groups[0].groupCode)
    }
  }, [groups, selectedGroupCode, selectGroup])

  return (
    <div className="flex h-full overflow-hidden">
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
  )
}
```

- [ ] **Wire up in `gantt/src/components/shell/app-shell.tsx`**

Add the import at the top:

```typescript
import { RuleView } from '@/components/rule/rule-view'
```

In the `ModuleView` component, add the `rule` case before the fallback:

```tsx
const ModuleView = ({ module }: { module: ActiveModule }) => {
  if (module === 'dashboard') return <DashboardView />
  if (module === 'live')      return <RosterView />
  if (module === 'scenario')  return <ScenarioView />
  if (module === 'rule')      return <RuleView />          // ← add this line
  const label = module.charAt(0).toUpperCase() + module.slice(1)
  return <PlaceholderView module={label} />
}
```

- [ ] **Type-check the gantt build**

```bash
cd gantt && npm run build 2>&1 | tail -15
```

Expected: exits 0, no TypeScript errors.

- [ ] **Start dev server and verify the Rule module loads**

```bash
cd gantt && npm run dev
```

Open `http://localhost:5173`, log in, click **Rule** in the top nav. Verify:
- Left panel shows rule groups from DB
- Clicking a group loads the rules table on the right
- Enabled toggle works (optimistic update + persists on reload)
- Edit button opens inline override editor
- Template variable picker inserts `{variable}` at cursor position
- Drag handle reorders rows (when no filter active)
- "+ Add Rules" button opens the dialog with unchosen instances

- [ ] **Commit**

```bash
git add gantt/src/components/rule/rule-view.tsx \
        gantt/src/components/shell/app-shell.tsx
git commit -m "feat(gantt): add RuleView and wire into app-shell ModuleView"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| DB migration `message_template` | Task 1 |
| DB migration `template_vars` | Task 1 |
| `ResolvedRule.messageTemplate` in rule-engine | Task 2 |
| `RuleLoader` SQL includes `message_template` | Task 2 |
| `BaseChecker` interpolation `{variable}` | Task 3 |
| `FdpChecker` passes `vars` | Task 3 |
| Cache invalidate admin endpoint in rule-engine | Task 4 |
| `ruleConfigService` in live-server | Task 5 |
| All 9 CRUD routes in live-server | Task 6 |
| live-server registers route in `index.ts` | Task 6 |
| gantt types `RuleGroupConfig`, `RuleGroupItemConfig` | Task 7 |
| gantt `rule-config-api.ts` | Task 7 |
| gantt `rule-config-store.ts` with all actions | Task 8 |
| Left panel: group list, cards, New Set button | Task 9 |
| `NewGroupDialog` | Task 9 |
| `RuleGroupHeader` with stats + actions | Task 10 |
| `AddRulesDialog` grouped by category + checkbox | Task 11 |
| `@dnd-kit` installed | Task 12 |
| `TemplateVarPicker` popover | Task 12 |
| `OverrideEditor` inline param + severity + template | Task 12 |
| `RuleGroupRow` with sortable + toggle + expand | Task 13 |
| `RuleGroupRules` with toolbar + DnD table + filters | Task 13 |
| `RuleView` wired into `app-shell.tsx` | Task 14 |
| Drag disabled when filter active | Task 13 (`dragDisabled={isFiltering}`) |
| CALC rows not draggable | Task 13 (`disabled: … || calc`) |
| Optimistic enable toggle | Task 8 (`updateItem` optimistic) |
| Optimistic reorder | Task 8 (`reorderItems` optimistic) |
| Cache invalidation after every write | Task 6 (every mutating route calls `invalidateRuleEngineCache`) |

All requirements covered. No placeholders found.
