# Rule Set Multi-Type (LIVE/PBS/RO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One rule set (workset, category `RULE`) can be claimed for multiple contexts — LIVE/PBS/RO — so F8 maintains just two sets (P + C), each typed `LIVE,PBS,RO`. Rule Set add/edit switches Rule Type from a single dropdown to multi-select toggle buttons (min 1), and the LIVE toolbar selector + RO scenario picker match by containment.

**Architecture:** `workset.type` becomes a comma-separated string (`LIVE,PBS,RO`, canonical order) in a widened `varchar(20)` column. Backend create/edit accept `type: string[]`, normalize to the canonical string, and run the existing per-type enable-exclusivity logic for LIVE/PBS. Frontend dialogs collect an array; selectors use `type.split(',').includes(code)`.

**Tech Stack:** PostgreSQL 16, Fastify + TypeScript (live-server), React 19 + Vite + TypeScript + Zustand (gantt), Vitest, Playwright.

## Global Constraints

- `workset.type` is `varchar(20)`, comma-separated, **canonical order** `LIVE,PBS,RO`, no duplicates.
- API `type` field on `POST /rulesets` / `PATCH /ruleset/:id` accepts `string[]`, each ∈ `{LIVE,RO,PBS}`, **min 1** → else 400. Response `type` stays the comma string.
- Enable exclusivity: **only LIVE/PBS** disable the division's previous enabled set of the same claimed type (`type LIKE '%LIVE%'` etc.). **RO is non-exclusive** — old RO sets stay enabled.
- **Capability-only migration**: no data UPDATEs to existing rows.
- SQL containment matches: `type LIKE '%LIVE%'` in live-server; `position($1 in type) > 0` in the generic workset filter.
- gantt UI text stays English; styles use design tokens (no `text-[Npx]`); run `npm run check:ui` at root after gantt style edits.
- §Playwright-Required + §No-Illusion: every UI change ships with a passing test; paste test output as proof.
- Do not modify unrelated files (§Surgical); reuse the existing `normalizeRuleSetTypes` helper wherever a type is normalized.

---

### Task 1: DB migration — widen `workset.type` + replace index

**Files:**
- Create: `sql/migration/2026-08-09-rule-set-multi-type.sql`
- Modify: `sql/schema/live/01-base.sql:1419` (type def) and `:1425` (column comment)

**Interfaces:**
- Consumes: nothing.
- Produces: `workset.type` = `varchar(20)`; index `uq_workset_enabled_rule_type_division` dropped, `idx_workset_rule_type_division` created. Later tasks rely on the widened column and the app-level exclusivity (no DB unique index).

- [ ] **Step 1: Write the migration file**

`sql/migration/2026-08-09-rule-set-multi-type.sql`:

```sql
-- 2026-08-09: Rule Set 支持多类型（LIVE/PBS/RO 逗号分隔串）。
-- 背景：一套法规集可同时用于 LIVE/PBS/RO，F8 只需维护 P/C 两套。
-- type 由 varchar(4) 扩宽到 varchar(20)；存量单值数据无需改动。
ALTER TABLE workset ALTER COLUMN type TYPE varchar(20);

-- 部分唯一索引对多值语义失效（LIVE 与 LIVE,PBS 都声称 LIVE 却字符串不同，索引拦不住；
-- 仍会误挡“同字符串同 division 两个启用集”造成误导）。互斥改由应用层逐 type 校验（POST/PATCH）。
DROP INDEX IF EXISTS uq_workset_enabled_rule_type_division;
CREATE INDEX IF NOT EXISTS idx_workset_rule_type_division
  ON workset (type, division) WHERE category = 'RULE';
```

- [ ] **Step 2: Sync the canonical schema file**

In `sql/schema/live/01-base.sql`:
- Line 1419: `type varchar(4)      not null,   -- 法规类型：LIVE / RO / PBS` → `type varchar(20)     not null,   -- 法规类型：逗号分隔多值 LIVE / RO / PBS`
- Line 1425 comment: `-- 法规类型：LIVE=实时排班，RO=RO场景，PBS=PBS场景` → `-- 法规类型：逗号分隔多值 LIVE/RO/PBS（如 'LIVE,PBS,RO'），规范序 LIVE,PBS,RO`

- [ ] **Step 3: Apply to remote f8 and verify**

```bash
cd live-server && set -a && . ./.env && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET search_path TO f8;" -f ../sql/migration/2026-08-09-rule-set-multi-type.sql
psql "$DATABASE_URL" -c "SELECT column_type FROM information_schema.columns WHERE table_schema='f8' AND table_name='workset' AND column_name='type';"
```

Expected: `character varying(20)`. Also verify existing rows are untouched:
`psql "$DATABASE_URL" -c "SET search_path TO f8; SELECT id, name, type, enabled FROM workset WHERE category='RULE' ORDER BY id;"` — 10 rows, same `type` values as before (LIVE/RO/PBS singles).

- [ ] **Step 4: Commit**

```bash
git add sql/migration/2026-08-09-rule-set-multi-type.sql sql/schema/live/01-base.sql
git commit -m "feat(db): widen workset.type to varchar(20) for multi-type rule sets
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Backend — multi-type create/edit + containment matches

**Files:**
- Modify: `live-server/src/routes/rule/legality.ts` — add `normalizeRuleSetTypes` helper (near `DIVISIONS`), rewrite `refreshAllLiveRulesets` (L42), `POST /rulesets` (L441-467), `PATCH /ruleset/:id` (L470-511)
- Modify: `live-server/src/services/rule/legality-recheck.ts:231` and `:237`
- Modify: `live-server/src/services/rule-check/rule-check-trigger.ts:16`
- Modify: `live-server/src/routes/rule/workset.ts:14-15`
- Test: `live-server/src/__tests__/unit/legality-ruleset-crud.test.ts`

**Interfaces:**
- Consumes: Task 1 (varchar(20) column).
- Produces:
  - `normalizeRuleSetTypes(input: unknown): string` — throws `Error` on empty/invalid; returns canonical `'LIVE,PBS,RO'` string. Accepts `string[]` or a comma string.
  - `POST /rulesets` body `{ name: string; division?: string; type?: string[]; enabled?: boolean }`; `PATCH /ruleset/:id` body `{ name?; division?; type?: string[]; enabled? }`.
  - Stored `type` values like `LIVE`, `LIVE,RO`, `LIVE,PBS,RO`.
  - Later tasks consume the response `type` (comma string) and the array-valued request contract.

- [ ] **Step 1: Write the failing tests first**

Append to `live-server/src/__tests__/unit/legality-ruleset-crud.test.ts` inside the `describe` block:

```ts
  it('POST /rulesets normalizes a multi-type array to a canonical comma string', async () => {
    let insertParams: unknown[] | null = null
    const app = await build((sql, params) => {
      if (sql.includes('INSERT INTO workset')) {
        insertParams = params
        return { rows: [{ id: 910, name: 'Unified', category: 'RULE', type: 'LIVE,PBS,RO', division: 'P', enabled: false }] }
      }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'Unified', division: 'P', type: ['RO', 'LIVE', 'PBS'] } })
    expect(res.statusCode).toBe(200)
    expect(insertParams).toEqual(['Unified', 'P', 'LIVE,PBS,RO', false, 'F8', 'admin'])
    expect(res.json().data.type).toBe('LIVE,PBS,RO')
  })

  it('POST /rulesets rejects an empty type array (400)', async () => {
    const app = await build(() => ({ rows: [] }))
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'X', type: [] } })
    expect(res.statusCode).toBe(400)
  })

  it('POST /rulesets rejects an invalid type code (400)', async () => {
    const app = await build(() => ({ rows: [] }))
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'X', type: ['LIVE', 'XX'] } })
    expect(res.statusCode).toBe(400)
  })

  it('enabling a LIVE,PBS set deactivates the division’s previous enabled LIVE and PBS sets (per claimed type), RO untouched', async () => {
    const seen: string[] = []
    const app = await build((sql, params) => {
      seen.push(sql)
      if (sql.includes('INSERT INTO workset')) {
        return { rows: [{ id: 910, name: 'U', category: 'RULE', type: 'LIVE,PBS', division: 'P', enabled: true }] }
      }
      if (sql.includes('SELECT id FROM workset')) {
        return { rows: params[0] === 'LIVE' ? [{ id: 752 }] : params[0] === 'PBS' ? [{ id: 754 }] : [] }
      }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'U', division: 'P', type: ['LIVE', 'PBS'], enabled: true } })
    expect(res.statusCode).toBe(200)
    const disables = seen.filter((s) => s.includes('UPDATE workset SET enabled'))
    expect(disables).toHaveLength(2)
    expect(disables.every((s) => s.includes("LIKE '%") && s.includes("%'"))).toBe(true)
    expect(seen.filter((s) => s.includes('DELETE FROM rule_violation'))).toHaveLength(2)
  })

  it('enabling a pure RO set deactivates nothing and does not trigger a live refresh', async () => {
    const seen: string[] = []
    const app = await build((sql) => { seen.push(sql); return sql.includes('INSERT INTO workset')
      ? { rows: [{ id: 911, name: 'R', category: 'RULE', type: 'RO', division: 'P', enabled: true }] } : { rows: [] } })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'R', division: 'P', type: ['RO'], enabled: true } })
    expect(res.statusCode).toBe(200)
    expect(seen.some((s) => s.includes('UPDATE workset SET enabled'))).toBe(false)
    expect(seen.some((s) => s.includes('FROM roster_period'))).toBe(false)
  })

  it('PATCH type array is normalized to a canonical comma string before storage', async () => {
    let updateParams: unknown[] | null = null
    const app = await build((sql, params) => {
      if (sql.includes('UPDATE workset SET')) {
        updateParams = params
        return { rows: [{ id: 752, name: 'Live Ruleset FD', category: null, type: 'LIVE,RO', division: 'P', enabled: false }] }
      }
      if (sql.includes('FROM workset WHERE id')) return { rows: [{ id: 752, type: 'RO', division: 'P', enabled: false, category: 'RULE' }] }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'PATCH', url: '/ruleset/752', payload: { type: ['LIVE', 'RO'] } })
    expect(res.statusCode).toBe(200)
    expect(updateParams).toEqual(['LIVE,RO', 'admin', 752])
    expect(res.json().data.type).toBe('LIVE,RO')
  })

  it('PATCH moving an enabled LIVE set off LIVE deletes its own violations', async () => {
    const seen: string[] = []
    const app = await build((sql) => {
      seen.push(sql)
      if (sql.includes('UPDATE workset SET')) return { rows: [{ id: 752, name: 'Live Ruleset FD', category: null, type: 'RO', division: 'P', enabled: true }] }
      if (sql.includes('FROM workset WHERE id')) return { rows: [{ id: 752, type: 'LIVE', division: 'P', enabled: true, category: 'RULE' }] }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'PATCH', url: '/ruleset/752', payload: { type: ['RO'] } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.type).toBe('RO')
    expect(seen.some((s) => s.includes('DELETE FROM rule_violation WHERE ruleset_id'))).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
cd live-server && node --env-file=.env node_modules/.bin/vitest run src/__tests__/unit/legality-ruleset-crud.test.ts
```

Expected: the 7 new tests FAIL (400s not returned / canonical string not stored); existing tests still PASS.

- [ ] **Step 3: Add the `normalizeRuleSetTypes` helper**

In `live-server/src/routes/rule/legality.ts`, near the `DIVISIONS`/`userOf` helpers (top of file after imports):

```ts
const RULE_SET_TYPE_ORDER = ['LIVE', 'PBS', 'RO'] as const

/**
 * Normalize a claimed-type input (string[] or comma string) to the canonical
 * 'LIVE,PBS,RO' storage string. Throws on empty or any invalid code.
 */
function normalizeRuleSetTypes(input: unknown): string {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(',')
  const codes = [...new Set(raw.map((s) => s.trim()).filter(Boolean))]
  if (codes.length === 0) throw new Error('type must include at least one of LIVE, RO, PBS')
  for (const c of codes) {
    if (!(RULE_SET_TYPE_ORDER as readonly string[]).includes(c)) {
      throw new Error(`type must be one of LIVE, RO, PBS — got ${c}`)
    }
  }
  return RULE_SET_TYPE_ORDER.filter((t) => codes.includes(t)).join(',')
}
```

- [ ] **Step 4: Rewrite `refreshAllLiveRulesets`**

Replace the `type = 'LIVE'` predicate (line ~42):

```ts
const active = await fastify.pgPool.query<{ id: number }>(
  `SELECT id FROM workset WHERE category = 'RULE' AND type LIKE '%LIVE%' AND enabled = true ORDER BY division, id`,
)
```

- [ ] **Step 5: Rewrite `POST /rulesets`**

Replace the body of the create handler (L441-466) with:

```ts
  fastify.post('/rulesets', async (request, reply) => {
    if (!request.authUser?.isAdmin) return error(reply, 403, 'Admin access required')
    const b = request.body as { name?: string; division?: string; type?: unknown; enabled?: boolean }
    if (!b?.name?.trim()) return error(reply, 400, 'name is required')
    let type = 'RO'
    if (b.type !== undefined) {
      try { type = normalizeRuleSetTypes(b.type) } catch (e) { return error(reply, 400, (e as Error).message) }
    }
    const types = type.split(',')
    try {
      const filiale = await resolveFiliale(fastify)
      const division = b.division?.trim() || 'P'
      const enabled = b.enabled === true
      await fastify.pgPool.query('BEGIN')
      if (enabled) {
        for (const t of ['LIVE', 'PBS'] as const) {
          if (!types.includes(t)) continue
          const old = await fastify.pgPool.query<{ id: number }>(`SELECT id FROM workset
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2 AND enabled = true`, [t, division])
          await fastify.pgPool.query(`UPDATE workset SET enabled = false, updated_by = $3, updated_at = now()
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2`, [t, division, userOf(request)])
          for (const row of old.rows) await fastify.pgPool.query(`DELETE FROM rule_violation WHERE ruleset_id = $1`, [row.id])
        }
      }
      const { rows } = await fastify.pgPool.query<{ id: number; name: string; category: string | null; type: string; division: string; enabled: boolean; updated_by: string | null }>(
        `INSERT INTO workset (name, division, category, type, enabled, filiale, created_by, updated_by)
         VALUES ($1, $2, 'RULE', $3, $4, $5, $6, $6) RETURNING id, name, category, type, division, enabled, updated_by`,
        [b.name.trim(), division, type, enabled, filiale, userOf(request)])
      await fastify.pgPool.query('COMMIT')
      if (enabled && types.includes('LIVE')) await refreshLiveRuleset(fastify, Number(rows[0].id))
      return success(reply, { id: Number(rows[0].id), name: rows[0].name, category: rows[0].category, type: rows[0].type, division: rows[0].division, enabled: rows[0].enabled, updatedBy: rows[0].updated_by, ruleCount: 0, isDefault: rows[0].enabled })
    } catch (err) { await fastify.pgPool.query('ROLLBACK'); return error(reply, 500, (err as Error).message) }
  })
```

- [ ] **Step 6: Rewrite `PATCH /ruleset/:id`**

Replace the handler body (L470-511) with:

```ts
  fastify.patch('/ruleset/:worksetId', async (request, reply) => {
    if (!request.authUser?.isAdmin) return error(reply, 403, 'Admin access required')
    const wid = Number.parseInt((request.params as { worksetId: string }).worksetId, 10)
    if (Number.isNaN(wid)) return error(reply, 400, 'invalid worksetId')
    const b = request.body as { name?: string; division?: string; type?: unknown; enabled?: boolean }
    let nextTypeString: string | null = null
    if (b.type !== undefined) {
      try { nextTypeString = normalizeRuleSetTypes(b.type) } catch (e) { return error(reply, 400, (e as Error).message) }
    }
    const sets: string[] = []; const vals: unknown[] = []
    if (b.name !== undefined) { sets.push(`name = $${sets.length + 1}`); vals.push(b.name) }
    if (b.division !== undefined) { sets.push(`division = $${sets.length + 1}`); vals.push(b.division) }
    if (nextTypeString !== null) { sets.push(`type = $${sets.length + 1}`); vals.push(nextTypeString) }
    if (b.enabled !== undefined) { sets.push(`enabled = $${sets.length + 1}`); vals.push(b.enabled === true) }
    if (sets.length === 0) return error(reply, 400, 'no fields to update')
    sets.push(`updated_by = $${sets.length + 1}`); vals.push(userOf(request))
    sets.push('updated_at = now()')
    vals.push(wid)
    try {
      const current = await fastify.pgPool.query<{ type: string; division: string; enabled: boolean; category: string | null }>(
        `SELECT type, division, enabled, category FROM workset WHERE id = $1`, [wid])
      if (current.rows.length === 0) return error(reply, 404, `workset ${wid} not found`)
      const oldTypes = current.rows[0].type.split(',')
      const newTypes = nextTypeString === null ? oldTypes : nextTypeString.split(',')
      const nextDivision = b.division ?? current.rows[0].division
      const nextEnabled = b.enabled ?? current.rows[0].enabled
      if (nextEnabled) {
        for (const t of ['LIVE', 'PBS'] as const) {
          if (!newTypes.includes(t)) continue
          const old = await fastify.pgPool.query<{ id: number }>(`SELECT id FROM workset
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2 AND enabled = true AND id <> $3`, [t, nextDivision, wid])
          await fastify.pgPool.query(`UPDATE workset SET enabled = false, updated_by = $3, updated_at = now()
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2 AND id <> $4`, [t, nextDivision, userOf(request), wid])
          for (const row of old.rows) await fastify.pgPool.query(`DELETE FROM rule_violation WHERE ruleset_id = $1`, [row.id])
        }
      }
      // The set itself was an enabled LIVE set and no longer is → drop its own violations.
      if (current.rows[0].enabled && oldTypes.includes('LIVE') &&
          (!nextEnabled || !newTypes.includes('LIVE') || nextDivision !== current.rows[0].division)) {
        await fastify.pgPool.query(`DELETE FROM rule_violation WHERE ruleset_id = $1`, [wid])
      }
      // Transition into an enabled LIVE set → background live recheck.
      const refreshLive = nextEnabled && newTypes.includes('LIVE') &&
        (!oldTypes.includes('LIVE') || !current.rows[0].enabled ||
          b.enabled !== undefined || b.type !== undefined || b.division !== undefined)
      const { rows } = await fastify.pgPool.query<{ id: number; name: string; category: string | null; type: string; division: string; enabled: boolean }>(
        `UPDATE workset SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, name, category, type, division, enabled`, vals)
      if (rows.length === 0) return error(reply, 404, `workset ${wid} not found`)
      if (refreshLive) await refreshLiveRuleset(fastify, wid)
      return success(reply, { id: Number(rows[0].id), name: rows[0].name, category: rows[0].category, type: rows[0].type, division: rows[0].division, enabled: rows[0].enabled })
    } catch (err) { return error(reply, 500, (err as Error).message) }
  })
```

- [ ] **Step 7: Update the remaining containment match sites**

`live-server/src/services/rule/legality-recheck.ts`:
- Line 231: `... and category = 'RULE' and type = 'LIVE' and enabled = true` → `... and category = 'RULE' and type like '%LIVE%' and enabled = true`
- Line 237: `where category = 'RULE' and type = 'LIVE' and enabled = true` → `where category = 'RULE' and type like '%LIVE%' and enabled = true`

`live-server/src/services/rule-check/rule-check-trigger.ts` line 16:
- `where category = 'RULE' and type = 'LIVE' and enabled = true and division = 'P'` → `where category = 'RULE' and type like '%LIVE%' and enabled = true and division = 'P'`

`live-server/src/routes/rule/workset.ts` (GET `?type=` filter):
- `WHERE type = $1` → `WHERE position($1 in type) > 0`

- [ ] **Step 8: Run the full live-server unit suite and fix stale assertions**

```bash
cd live-server && node --env-file=.env node_modules/.bin/vitest run src/__tests__/unit/legality-ruleset-crud.test.ts src/__tests__/unit/rule-check-trigger.test.ts
```

Expected: all PASS. If `rule-check-trigger.test.ts` asserts the literal `type = 'LIVE'` SQL, update the assertion to the containment form (same intent — §Stale-Test).

- [ ] **Step 9: Typecheck**

```bash
cd live-server && npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 10: Commit**

```bash
git add live-server/src/routes/rule/legality.ts live-server/src/routes/rule/workset.ts live-server/src/services/rule/legality-recheck.ts live-server/src/services/rule-check/rule-check-trigger.ts live-server/src/__tests__/unit/legality-ruleset-crud.test.ts
git commit -m "feat(legality): rule sets support multiple LIVE/PBS/RO types
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Frontend dialogs — Rule Type multi-select (min 1) + store/api types

**Files:**
- Modify: `gantt/src/components/legality/rule-set-dialogs.tsx`
- Modify: `gantt/src/services/legality-api.ts` (`createRuleset` / `updateRuleset` signatures)
- Modify: `gantt/src/stores/legality-store.ts`
- Modify: `gantt/src/types/legality.ts`

**Interfaces:**
- Consumes: Task 2 (create/edit accept `type: string[]`; response `type` is a comma string).
- Produces:
  - `NewRuleSetDialog`/`EditRuleSetDialog` render `data-testid="rule-set-type-live|pbs|ro"` toggle buttons; Create/Save disabled when zero selected.
  - `useLegalityStore.createSet(data: { name; division?; type?: string[]; enabled? })`, `editSet(id, { name?; division?; type?: string[]; enabled? })`.
  - `legalityApi.createRuleset` / `updateRuleset` accept `type?: string[]`.
  - Task 4 consumes the store `sets` whose `type` is the comma string.

- [ ] **Step 1: Update `types/legality.ts`**

Change the `type` field comment on `LegalityRulesetSummary` (L58):

```ts
  /** Comma-separated claimed types, e.g. 'LIVE,PBS,RO' (formerly a single LIVE/RO/PBS code). */
  type: string
```

- [ ] **Step 2: Update `legality-api.ts`**

Change the two signatures:

```ts
  createRuleset: (data: { name: string; division?: string; type?: string[]; enabled?: boolean }): Promise<LegalityRulesetSummary> =>
    api.post('/api/legality/rulesets', data) as Promise<LegalityRulesetSummary>,

  updateRuleset: (worksetId: number, patch: { name?: string; division?: string; type?: string[]; enabled?: boolean }): Promise<{ id: number; name: string; type: string; division: string; enabled: boolean }> =>
    api.patch(`/api/legality/ruleset/${worksetId}`, patch) as Promise<{ id: number; name: string; type: string; division: string; enabled: boolean }>,
```

- [ ] **Step 3: Add the `RuleTypeToggleGroup` component**

In `gantt/src/components/legality/rule-set-dialogs.tsx`, after the `DIVISIONS` const, add:

```tsx
/** Rule Type multi-select toggle buttons — at least one must stay selected. */
const RuleTypeToggleGroup = ({ types, onChange, options }: {
  types: string[]
  onChange: (types: string[]) => void
  options: RuleSetTypeOption[]
}) => {
  const toggle = (code: string) => {
    onChange(types.includes(code) ? types.filter((t) => t !== code) : [...types, code])
  }
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const active = types.includes(o.code)
        return (
          <button
            key={o.code}
            type="button"
            data-testid={`rule-set-type-${o.code.toLowerCase()}`}
            aria-pressed={active}
            onClick={() => toggle(o.code)}
            className={`h-7 flex-1 rounded-md border text-xs font-medium transition-colors ${
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent/60'
            }`}
          >
            {o.name}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Rework `NewRuleSetDialog`**

Replace the `type` state with `types`, and the Rule Type `<select>` with the toggle group + min-1 hint:

```tsx
export const NewRuleSetDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const createSet = useLegalityStore((s) => s.createSet)
  const [name, setName] = useState('')
  const [division, setDivision] = useState('P')
  const [types, setTypes] = useState<string[]>(['RO'])
  const [enabled, setEnabled] = useState(false)
  const [typeOptions, setTypeOptions] = useState<RuleSetTypeOption[]>([])
  useEffect(() => { if (open) { setName(''); setDivision('P'); setTypes(['RO']); setEnabled(false); void legalityApi.listRulesetTypes().then(setTypeOptions).catch(() => setTypeOptions([])) } }, [open])

  const options = typeOptions.length ? typeOptions : [{ code: 'LIVE', name: 'Live', value: 'LIVE' }, { code: 'RO', name: 'RO', value: 'RO' }, { code: 'PBS', name: 'PBS', value: 'PBS' }]

  return (
    <AppDialog ... >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Name</span>
          <input data-testid="rule-set-name-input" value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} placeholder="e.g. F8 Reserve Ruleset" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Division</span>
          <select value={division} onChange={(e) => setDivision(e.target.value)} className={fieldInput}>
            {DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Rule Type</span>
          <RuleTypeToggleGroup types={types} onChange={setTypes} options={options} />
          {types.length === 0 && <span className="text-2xs text-amber-600">Select at least one rule type</span>}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable this rule set
        </label>
        <div className="text-2xs text-amber-600">LIVE/PBS: each division should have at least one enabled rule set. Enabling a set deactivates the previous enabled set of the same type.</div>
      </div>
    </AppDialog>
  )
}
```

And update the footer button (the `disabled`/`onClick`):

```tsx
          <Button
            data-testid="rule-set-new-confirm"
            disabled={!name.trim() || types.length === 0}
            onClick={() => {
              if (types.includes('LIVE') && enabled && !confirmLiveRefresh()) return
              void createSet({ name: name.trim(), division, type: types, enabled }); onClose()
            }}
          >
            Create
          </Button>
```

- [ ] **Step 5: Rework `EditRuleSetDialog`**

Replace `type` state with `types`, initialize from `set.type.split(',')`, and swap the select for the toggle group:

```tsx
export const EditRuleSetDialog = ({ open, onClose, set }: { open: boolean; onClose: () => void; set: LegalityRulesetSummary | null }) => {
  const editSet = useLegalityStore((s) => s.editSet)
  const [name, setName] = useState('')
  const [division, setDivision] = useState('P')
  const [types, setTypes] = useState<string[]>(['RO'])
  const [enabled, setEnabled] = useState(false)
  const [typeOptions, setTypeOptions] = useState<RuleSetTypeOption[]>([])
  useEffect(() => {
    if (open && set) {
      setName(set.name); setDivision(set.division); setTypes(set.type.split(',').filter(Boolean)); setEnabled(set.enabled)
      void legalityApi.listRulesetTypes().then(setTypeOptions).catch(() => setTypeOptions([]))
    }
  }, [open, set])

  const options = typeOptions.length ? typeOptions : [{ code: 'LIVE', name: 'Live', value: 'LIVE' }, { code: 'RO', name: 'RO', value: 'RO' }, { code: 'PBS', name: 'PBS', value: 'PBS' }]

  return (
    <AppDialog ... >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Name</span>
          <input data-testid="rule-set-name-input" value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Division</span>
          <select value={division} onChange={(e) => setDivision(e.target.value)} className={fieldInput}>{DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Rule Type</span>
          <RuleTypeToggleGroup types={types} onChange={setTypes} options={options} />
          {types.length === 0 && <span className="text-2xs text-amber-600">Select at least one rule type</span>}
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enable this rule set</label>
        <div className="text-2xs text-amber-600">LIVE/PBS: each division should have at least one enabled rule set. Enabling a set deactivates the previous enabled set of the same type.</div>
      </div>
    </AppDialog>
  )
}
```

And the footer Save button:

```tsx
          <Button
            data-testid="rule-set-edit-confirm"
            disabled={!name.trim() || !set || types.length === 0}
            onClick={() => {
              if (!set) return
              const liveRefresh = types.includes('LIVE') && enabled &&
                (!set.enabled || !set.type.split(',').includes('LIVE') || set.division !== division)
              if (liveRefresh && !confirmLiveRefresh()) return
              void editSet(set.id, { name: name.trim(), division, type: types, enabled }); onClose()
            }}
          >
            Save
          </Button>
```

Note: keep the `AppDialog` `open`/`onOpenChange`/`data-testid`/`icon`/`title`/`className` props exactly as they are today.

- [ ] **Step 6: Update `legality-store.ts`**

- `createSet` signature (L45): `createSet: (data: { name: string; division?: string; type?: string[]; enabled?: boolean }) => Promise<void>`
- `editSet` signature (L46): `editSet: (id: number, patch: { name?: string; division?: string; type?: string[]; enabled?: boolean }) => Promise<void>`
- `init` livePilot (L74):
  ```ts
  const livePilot = sets.find((s) => s.type.split(',').includes('LIVE') && s.division === 'P' && s.enabled)
  ```
- `createSet` notify (L129): `if (data.type?.includes('LIVE') && data.enabled === true) {`
- `editSet` notify block (L142-145), replace with:
  ```ts
  const currentTypes = current?.type?.split(',') ?? []
  const nextTypes = patch.type ?? currentTypes
  const nextEnabled = patch.enabled ?? current?.enabled
  const liveRefresh = nextTypes.includes('LIVE') && nextEnabled === true &&
    (!currentTypes.includes('LIVE') || current?.enabled !== true || patch.type !== undefined || patch.division !== undefined || patch.enabled === true)
  ```

- [ ] **Step 7: Typecheck + build + lint gate**

```bash
cd gantt && npm run build
cd /home/yuan.z/rois/rois-ai && npm run check:ui
```

Expected: `tsc -b` exits 0, Vite build succeeds, `check:ui` reports hard violations = 0.

- [ ] **Step 8: Run existing gantt store tests**

```bash
cd gantt && npm test -- --run src/stores/__tests__/legality-store-catalog-selection.test.ts
```

Expected: PASS (this file exercises catalog selection, not set type; should be unaffected).

- [ ] **Step 9: Commit**

```bash
git add gantt/src/components/legality/rule-set-dialogs.tsx gantt/src/services/legality-api.ts gantt/src/stores/legality-store.ts gantt/src/types/legality.ts
git commit -m "feat(gantt): rule-set Rule Type multi-select toggle (min 1)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Frontend selectors + display — containment matching

**Files:**
- Modify: `gantt/src/components/common/rule-group-selector.tsx`
- Modify: `gantt/src/components/scenario/scenario-basic-info.tsx`
- Modify: `gantt/src/components/legality/legality-rule-sets-view.tsx`
- Test: `gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx`

**Interfaces:**
- Consumes: Task 3 (store `sets[].type` is a comma string; dialogs multi-select).
- Produces: LIVE toolbar + RO scenario picker match by containment; Rule Sets list renders one chip per claimed type; coverage warning per claimed type. No API shape changes.

- [ ] **Step 1: Write the failing scenario picker tests first**

Append to `gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx` before the closing `})` of the describe:

```tsx
  it('an RO scenario lists an enabled multi-type (LIVE,PBS,RO) set in the rule-set picker', async () => {
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([
      { id: 752, name: 'Unified FD', category: 'RULE', type: 'LIVE,PBS,RO', division: 'P', enabled: true },
    ] as never)
    const container = await render(roDetail)
    await act(async () => { await Promise.resolve() })
    const item = container.querySelector('[data-value="752"]')
    expect(item).toBeTruthy()
    expect(item?.textContent).toContain('LIVE,PBS,RO')
  })

  it('an RO scenario excludes an enabled set that does not claim RO', async () => {
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([
      { id: 754, name: 'Portal FD', category: 'RULE', type: 'LIVE,PBS', division: 'P', enabled: true },
    ] as never)
    const container = await render(roDetail)
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('[data-value="754"]')).toBeNull()
  })
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd gantt && npx vitest run src/components/scenario/__tests__/scenario-basic-info.test.tsx
```

Expected: the two new tests FAIL (752 not found / 754 incorrectly listed) because `r.type === 'RO'` doesn't match `LIVE,PBS,RO` / wrongly treats `LIVE,PBS` as not-RO correctly already — the 752 case fails first. Existing tests still PASS.

- [ ] **Step 3: Update `rule-group-selector.tsx` (3 sites)**

- Line 30: `const current = groups.find((g) => g.type === 'LIVE' && g.division === division && g.enabled)` → `groups.find((g) => g.type.split(',').includes('LIVE') && g.division === division && g.enabled)`
- Line 34: `const next = groups.find((g) => g.type === 'LIVE' && g.division === nextDivision && g.enabled)` → `groups.find((g) => g.type.split(',').includes('LIVE') && g.division === nextDivision && g.enabled)`
- Line 61: `const g = groups.find((item) => item.type === 'LIVE' && item.division === d && item.enabled)` → `groups.find((item) => item.type.split(',').includes('LIVE') && item.division === d && item.enabled)`

- [ ] **Step 4: Update `scenario-basic-info.tsx`**

- `visibleRulesets` (L67-72): `detail.fileType === 'RO' ? sortedRulesets.filter((r) => r.division === divisionValue && r.type.split(',').includes('RO') && r.enabled) : sortedRulesets`
- Division-alignment useEffect (L129-136), replace the three `r.type === 'RO'` / `'PBS'` comparisons:
  ```ts
  const candidates = rulesets.filter((r) => r.division === divisionValue &&
    (detail.fileType === 'RO' ? r.type.split(',').includes('RO') && r.enabled : true))
  if (candidates.length === 0) return
  const current = rulesets.find((r) => r.id === detail.rulesetId)
  if (current?.division === divisionValue &&
    (detail.fileType !== 'RO' || (current.type.split(',').includes('RO') && current.enabled))) return
  const next = candidates.find((r) => r.enabled && (r.type.split(',').includes('RO') || r.type.split(',').includes('PBS')))
    ?? candidates.find((r) => r.type.split(',').includes('RO') || r.type.split(',').includes('PBS'))
    ?? candidates[0]
  ```
- `ruleSetTypeStyle` (L31-37), make multi-strings neutral:
  ```ts
  const ruleSetTypeStyle = (type: string, division: string): string => {
    if (!type.includes(',')) {
      if (type === 'LIVE' && division === 'P') return DEFAULT_CHIP
      if (type === 'LIVE') return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
      if (type === 'RO') return 'bg-[#DFF7EA] text-[#065F46]'
      if (type === 'PBS') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    }
    return 'bg-muted text-muted-foreground'
  }
  ```

- [ ] **Step 5: Update `legality-rule-sets-view.tsx`**

- `missingRuleSetCoverage` (L88-90): `.filter((division) => !sets.some((s) => s.type.split(',').includes(type) && s.division === division && s.enabled))`
- Left-list card type chip (L228 + L240 + L245): keep the id badge colored by the FIRST claimed type, and render one chip per claimed type:
  ```tsx
  const typeChip = ruleSetTypeChip(s.type.split(',')[0] ?? '', ruleSetTypeColors)
  ```
  and replace the single type `<span>` (L245) with one chip per claimed type
  (`shrink-0` so three short codes never break the outer horizontal row at L243):
  ```tsx
  <div className="flex shrink-0 items-center gap-1">
    {s.type.split(',').filter(Boolean).map((t) => {
      const chip = ruleSetTypeChip(t, ruleSetTypeColors)
      return <span key={t} className={`text-3xs ${chip.className}`} style={chip.style}>{t}</span>
    })}
  </div>
  ```
  Keep `s.id` badge (L240) unchanged (it already uses `typeChip`, now derived from the first claimed type).

- [ ] **Step 6: Run the gantt unit + scenario tests**

```bash
cd gantt && npx vitest run src/components/scenario/__tests__/scenario-basic-info.test.tsx src/stores/__tests__/legality-store-catalog-selection.test.ts
```

Expected: all PASS (including the two new multi-type picker tests).

- [ ] **Step 7: Build + lint gate**

```bash
cd gantt && npm run build
cd /home/yuan.z/rois/rois-ai && npm run check:ui
```

Expected: `tsc -b` and Vite succeed; `check:ui` hard violations = 0.

- [ ] **Step 8: Commit**

```bash
git add gantt/src/components/common/rule-group-selector.tsx gantt/src/components/scenario/scenario-basic-info.tsx gantt/src/components/legality/legality-rule-sets-view.tsx gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx
git commit -m "feat(gantt): match rule-set type by containment in LIVE/RO selectors
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Help docs — Rule Type is now multi-select

**Files:**
- Modify: `gantt/src/components/help/topics/legality/legality-rule-sets.tsx`

**Interfaces:**
- Consumes: Task 3/4 UI behavior (toggle buttons, min 1, multi-type chips, containment selectors).
- Produces: accurate help text matching the shipped UI (§Help Authoring — doc/UI parity is mandatory).

- [ ] **Step 1: Update the create-set step**

Replace the `Rule Type` sentence in Step 4 (L39-40):

```tsx
        the <strong>Division</strong> (<strong>Pilot (P)</strong> or <strong>Cabin (C)</strong>),
        and pick one or more <strong>Rule Types</strong> — toggle <strong>LIVE</strong> /{' '}
        <strong>PBS</strong> / <strong>RO</strong> (at least one is required). A set that claims
        multiple types serves all of them, e.g. a <strong>LIVE,PBS,RO</strong> set works for live
        checks, PBS scenarios, and RO scenarios.
```

- [ ] **Step 2: Update the coverage note**

In Step 6, after the "Enabling a LIVE set disables the previous one..." sentence (L54-56), clarify per-type:

```tsx
        see the missing combinations (for example <strong>PBS/C</strong>). Enabling a set that claims{' '}
        <strong>LIVE</strong> or <strong>PBS</strong> disables the previous enabled set of that type
        for the same division and re-checks the affected roster period in the background.
```

- [ ] **Step 3: Update the Controls Reference descriptions**

- The `New (+)` description (L73): `'Admin. Opens the New Rule Set dialog (Name, Division, Rule Type, Enable this rule set).'` → `'Admin. Opens the New Rule Set dialog (Name, Division, one or more Rule Types, Enable this rule set).'`
- The card description (L71): mention multiple type badges: `'Cards for every rule set: id, name, last editor, type + division badges, Enabled/Disabled, rule count. Click a card to load the set.'` → `'Cards for every rule set: id, name, last editor, one badge per claimed type, division badge, Enabled/Disabled, rule count. Click a card to load the set.'`

- [ ] **Step 4: Verify help-doc coverage test**

```bash
cd /home/yuan.z/rois/rois-ai && node scripts/check-legality-help-coverage.mjs 2>/dev/null || true
```

Expected: no failure (the script checks help-data consistency; if it fails, run the same command without `|| true` and fix the reported mismatch).

- [ ] **Step 5: Build + commit**

```bash
cd gantt && npm run build
git add gantt/src/components/help/topics/legality/legality-rule-sets.tsx
git commit -m "docs(help): rule-set Rule Type is a multi-select
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Playwright e2e — multi-type management + LIVE selector rendering

**Files:**
- Modify: `e2e/tests/gantt/legality-rule-sets.spec.ts`

**Interfaces:**
- Consumes: Task 3 (toggle testids `rule-set-type-live|pbs|ro`, min-1 disabled state, `createSet` storing comma type), Task 4 (LIVE selector containment).
- Produces: two new passing Playwright tests proving the dialog multi-select, the API round-trip, and selector containment (§Playwright-Required, §No-Illusion). Reuses the file's existing `adminLogin`/`seedAdmin`/`sets`/`findSet` helpers.

- [ ] **Step 1: Extend the `sets` helper type**

In `e2e/tests/gantt/legality-rule-sets.spec.ts`, update the `sets()` cast so `type` is available (L28-29):

```ts
const sets = async (request: APIRequestContext, token: string) =>
  ((await (await request.get(`${GANTT_API}/api/legality/rulesets`, { headers: { Authorization: `Bearer ${token}` } })).json()) as
    { data: Array<{ id: number; name: string; ruleCount: number; type: string }> }).data
```

- [ ] **Step 2: Add the management-dialog test**

Append a second `test(...)` inside `test.describe`:

```ts
  test('admin creates a multi-type rule set: min-1 enforced, stored as LIVE,PBS,RO', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)
    const token = auth.token
    const SET = `QA-Multi-${Date.now()}`

    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible()

    // New dialog defaults to RO. Deselecting it must disable Create (min-1).
    await page.getByTestId('rule-set-new-btn').click()
    await page.getByTestId('rule-set-name-input').fill(SET)
    const confirm = page.getByTestId('rule-set-new-confirm')
    await expect(confirm).toBeEnabled()
    await page.getByTestId('rule-set-type-ro').click()
    await expect(confirm).toBeDisabled()
    // Select all three → Create enabled again.
    await page.getByTestId('rule-set-type-live').click()
    await page.getByTestId('rule-set-type-pbs').click()
    await page.getByTestId('rule-set-type-ro').click()
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page.getByTestId('legality-set-name')).toContainText(SET)

    // The set is stored with the canonical comma type (no enable → no live-state side effects).
    await expect.poll(async () => (await findSet(request, token, SET))?.type ?? null).toBe('LIVE,PBS,RO')

    // Cleanup: delete through the UI.
    const s = await findSet(request, token, SET)
    if (s) {
      await page.getByTestId(`legality-ruleset-card-${s.id}`).click()
      await expect(page.getByTestId('legality-set-name')).toContainText(SET)
      await page.getByTestId('rule-set-delete-btn').click()
      await page.getByTestId('rule-set-delete-confirm').click()
      await expect.poll(async () => Boolean(await findSet(request, token, SET))).toBe(false)
    }
  })
```

- [ ] **Step 3: Add the LIVE-selector rendering test**

Append a third `test(...)` inside `test.describe` (uses `page.route` to render a multi-type set without touching the real DB):

```ts
  test('LIVE toolbar selector resolves an enabled LIVE,PBS,RO set as the LIVE set', async ({ page, request }) => {
    const auth = await adminLogin(request)
    await seedAdmin(page, auth)

    // Seed the ruleset list with a multi-type enabled set for division P; backstop its
    // auto-selection (getRuleset) with a stub workset so no real DB row is touched.
    await page.route('**/api/legality/rulesets', async (route) => {
      const res = await route.fetch()
      const json = await res.json() as { data: Array<{ id: number; name: string; type: string }> }
      json.data = [
        { id: 999001, name: 'Mock Unified FD', category: 'RULE', type: 'LIVE,PBS,RO', division: 'P', enabled: true, updatedBy: 'admin', ruleCount: 3, isDefault: true },
        ...json.data.filter((s) => s.id !== 999001),
      ]
      await route.fulfill({ response: res, json })
    })
    await page.route('**/api/legality/ruleset/999001', (route) =>
      route.fulfill({ json: { code: 200, data: { workset: { id: 999001, name: 'Mock Unified FD', category: 'RULE' }, rules: [] }, message: 'ok' } }))

    await page.goto('/')
    await page.getByTestId('module-nav-live').click()
    await expect(page.getByRole('button', { name: /P · Mock Unified FD/ })).toBeVisible({ timeout: 15_000 })
  })
```

- [ ] **Step 4: Run the spec and paste the PASS output**

Requires the real live-server + gantt running (same as the existing spec in this file):

```bash
cd e2e && npx playwright test tests/gantt/legality-rule-sets.spec.ts --reporter=list
```

Expected: 3/3 PASS (existing lifecycle + the two new tests). If the environment is unavailable, state that clearly and run the command that CAN run (unit tests from Tasks 2/4) as the executable proof for this change.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/gantt/legality-rule-sets.spec.ts
git commit -m "test(e2e): rule-set multi-type management + LIVE selector rendering
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Final validation

**Files:** none (verification only).

- [ ] **Step 1: Full unit suites**

```bash
cd live-server && node --env-file=.env node_modules/.bin/vitest run src/__tests__/unit/legality-ruleset-crud.test.ts src/__tests__/unit/rule-check-trigger.test.ts
cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run src/components/scenario/__tests__/scenario-basic-info.test.tsx src/stores/__tests__/legality-store-catalog-selection.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Builds + UI gate**

```bash
cd live-server && npm run build
cd gantt && npm run build
cd /home/yuan.z/rois/rois-ai && npm run check:ui
```

Expected: both builds exit 0; `check:ui` hard violations = 0.

- [ ] **Step 3: Remote DB state check (post-migration sanity)**

```bash
cd live-server && set -a && . ./.env && set +a
psql "$DATABASE_URL" -c "SET search_path TO f8; SELECT id, name, type, division, enabled FROM workset WHERE category='RULE' ORDER BY id;"
```

Expected: 10 rows unchanged in `type`/`enabled` (capability-only), `type` column now `varchar(20)`.

- [ ] **Step 4: Paste the receipts**

Summarize to the user with the exact PASS outputs from Steps 1-2 (tables or verbatim lines) — §No-Illusion.
