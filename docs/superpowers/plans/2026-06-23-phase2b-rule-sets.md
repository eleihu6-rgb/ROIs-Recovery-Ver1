# Phase 2b — Rule Sets management (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Extend the Legality **Rule Sets** page with management actions on `workset`/`rule_set` (Model A), migrating Rule Manager's New / Edit / Delete / Copy + rule membership — finishing Phase 2.

**Architecture:** Add 6 admin-only endpoints to `live-server/src/routes/rule/legality.ts` (workset create/edit/delete/copy + membership add/remove) and extend `gantt`'s `legality-rule-sets-view.tsx` + `legality-store` + `legality-api` with the actions and `AppDialog`s. No Model-B (`rule-config-service.ts`). Spec §5.3.

**Schema:** `workset(id bigint id, filiale, division NOT NULL, name NOT NULL, category, type NOT NULL, created_by/at, updated_by/at)`. `rule_set(id, workset_id, rule_id)` where `rule_set.rule_id = rule.rule_id` (composite, populated in Phase 2.0). Admin = `users.is_admin=1`. Delete guard: refuse if a scenario resolves to the workset by name (`scenario.rule_group_code → rule_group.name = workset.name`).

---

### Task 1: Backend — create + edit workset (`POST /rulesets`, `PATCH /ruleset/:id`)

**Files:** Modify `live-server/src/routes/rule/legality.ts`; Create `live-server/src/__tests__/unit/legality-ruleset-crud.test.ts`.

- [ ] **Step 1: Failing test** (mock `fastify.pgPool.query`; admin hook):

```ts
import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import legalityRoutes from '../../routes/rule/legality.js'

const build = (q: (sql: string, p: unknown[]) => unknown, isAdmin = 1) => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn(async (sql: string, p: unknown[]) => q(sql, p)) } as never)
  app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin } })
  return app.register(legalityRoutes).then(() => app)
}

describe('ruleset CRUD', () => {
  it('POST /rulesets creates a workset (admin)', async () => {
    const app = await build((sql) => sql.includes('INSERT INTO workset') ? { rows: [{ id: 900, name: 'My Set', division: 'P', category: null, type: 'CU' }] } : { rows: [] })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'My Set', division: 'P' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ id: 900, name: 'My Set', ruleCount: 0, isDefault: false })
  })
  it('POST /rulesets rejects non-admin + missing name', async () => {
    expect((await (await build(() => ({ rows: [] }), 0)).inject({ method: 'POST', url: '/rulesets', payload: { name: 'X', division: 'P' } })).statusCode).toBe(403)
    expect((await (await build(() => ({ rows: [] }))).inject({ method: 'POST', url: '/rulesets', payload: { division: 'P' } })).statusCode).toBe(400)
  })
  it('PATCH /ruleset/:id updates name', async () => {
    const app = await build((sql) => sql.includes('UPDATE workset') ? { rows: [{ id: 900, name: 'Renamed', division: 'P', category: null, type: 'CU' }] } : { rows: [{ id: 900 }] })
    const res = await app.inject({ method: 'PATCH', url: '/ruleset/900', payload: { name: 'Renamed' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.name).toBe('Renamed')
  })
})
```

- [ ] **Step 2: Run → FAIL.** `cd live-server && npx vitest run src/__tests__/unit/legality-ruleset-crud.test.ts`

- [ ] **Step 3: Implement** (add to `legalityRoutes`; use Zod like `rule-config.ts` or inline validation matching the file's style):

```ts
  /** POST /rulesets (admin) — create a workset. Body { name, division, category?, type? }. */
  fastify.post('/rulesets', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const b = request.body as { name?: string; division?: string; category?: string | null; type?: string }
    if (!b?.name?.trim()) return fail(reply, 400, 'name is required')
    const division = b.division?.trim() || 'P'
    const type = b.type?.trim() || 'CU'
    try {
      const { rows } = await fastify.pgPool.query<{ id: number; name: string; category: string | null }>(
        `INSERT INTO workset (name, division, category, type, filiale, created_by, updated_by)
         VALUES ($1, $2, $3, $4, 'F8', $5, $5) RETURNING id, name, category`,
        [b.name.trim(), division, b.category ?? null, type, request.authUser.userCode])
      return success(reply, { id: Number(rows[0].id), name: rows[0].name, category: rows[0].category, ruleCount: 0, isDefault: false })
    } catch (err) { return fail(reply, 500, (err as Error).message) }
  })

  /** PATCH /ruleset/:worksetId (admin) — edit name/division/category/type. */
  fastify.patch('/ruleset/:worksetId', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const wid = Number.parseInt((request.params as { worksetId: string }).worksetId, 10)
    if (Number.isNaN(wid)) return fail(reply, 400, 'invalid worksetId')
    const b = request.body as { name?: string; division?: string; category?: string | null; type?: string }
    const sets: string[] = []; const vals: unknown[] = []
    for (const [k, col] of [['name', 'name'], ['division', 'division'], ['category', 'category'], ['type', 'type']] as const) {
      if (b[k] !== undefined) { sets.push(`${col} = $${sets.length + 1}`); vals.push(b[k]) }
    }
    if (sets.length === 0) return fail(reply, 400, 'no fields to update')
    sets.push(`updated_by = $${sets.length + 1}`); vals.push(request.authUser.userCode)
    sets.push(`updated_at = now()`)
    vals.push(wid)
    try {
      const { rows } = await fastify.pgPool.query<{ id: number; name: string; category: string | null }>(
        `UPDATE workset SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, name, category`, vals)
      if (rows.length === 0) return fail(reply, 404, `workset ${wid} not found`)
      return success(reply, { id: Number(rows[0].id), name: rows[0].name, category: rows[0].category })
    } catch (err) { return fail(reply, 500, (err as Error).message) }
  })
```

- [ ] **Step 4: Run → PASS.** Commit:
```bash
git add live-server/src/routes/rule/legality.ts live-server/src/__tests__/unit/legality-ruleset-crud.test.ts
git commit -m "feat(live-server): create + edit workset (POST /rulesets, PATCH /ruleset/:id)"
```

---

### Task 2: Backend — `DELETE /ruleset/:worksetId` (guard: in-use by a scenario)

**Files:** Modify `legality.ts`; add test cases.

- [ ] **Step 1: Failing test** — delete ok when not in use; 409 when a scenario resolves to it; 403 non-admin.

```ts
it('DELETE /ruleset/:id — ok when free, 409 when a scenario uses it', async () => {
  const inUse = (n: number) => async (sql: string) =>
    sql.includes('FROM workset WHERE id') ? { rows: [{ id: 900, name: 'My Set' }] }
    : sql.includes('FROM scenario') ? { rows: [{ n }] } : { rows: [] }
  let app = await build(inUse(0)); expect((await app.inject({ method: 'DELETE', url: '/ruleset/900' })).statusCode).toBe(200)
  app = await build(inUse(2)); expect((await app.inject({ method: 'DELETE', url: '/ruleset/900' })).statusCode).toBe(409)
})
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```ts
  /** DELETE /ruleset/:worksetId (admin) — delete the workset + its rule_set rows.
   *  Guard: refuse if a scenario resolves to this workset by name (rule_group.name = workset.name). */
  fastify.delete('/ruleset/:worksetId', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const wid = Number.parseInt((request.params as { worksetId: string }).worksetId, 10)
    if (Number.isNaN(wid)) return fail(reply, 400, 'invalid worksetId')
    const ws = await fastify.pgPool.query<{ id: number; name: string }>(`SELECT id, name FROM workset WHERE id = $1`, [wid])
    if (ws.rows.length === 0) return fail(reply, 404, `workset ${wid} not found`)
    const used = await fastify.pgPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM scenario sc
         JOIN rule_group rg ON rg.group_code = sc.rule_group_code AND rg.is_deleted = 0
        WHERE rg.name = $1`, [ws.rows[0].name])
    if (used.rows[0].n > 0) return fail(reply, 409, `ruleset is used by ${used.rows[0].n} scenario(s); cannot delete`)
    try {
      await fastify.pgPool.query('BEGIN')
      await fastify.pgPool.query(`DELETE FROM rule_set WHERE workset_id = $1`, [wid])
      await fastify.pgPool.query(`DELETE FROM workset WHERE id = $1`, [wid])
      await fastify.pgPool.query('COMMIT')
      return success(reply, { id: wid })
    } catch (err) { await fastify.pgPool.query('ROLLBACK'); return fail(reply, 500, (err as Error).message) }
  })
```

- [ ] **Step 4: PASS.** Commit `feat(live-server): DELETE /api/legality/ruleset/:id (guard in-use scenarios)`.

---

### Task 3: Backend — `POST /ruleset/:worksetId/copy` (copy-rules | share-rules)

**Files:** Modify `legality.ts`; add test cases.

- [ ] **Step 1: Failing test** — share-rules copies membership (same rule_ids); copy-rules duplicates each rule.

```ts
it('copy share-rules → new workset, same rule_ids', async () => {
  const seen: string[] = []
  const app = await build((sql) => { seen.push(sql)
    if (sql.includes('INSERT INTO workset')) return { rows: [{ id: 901, name: 'Copy', category: null }] }
    if (sql.includes('FROM rule_set WHERE workset_id')) return { rows: [{ rule_id: 8002001 }, { rule_id: 8030001 }] }
    return { rows: [{ id: 900, name: 'Src', division: 'P', category: null, type: 'CU' }] } })
  const res = await app.inject({ method: 'POST', url: '/ruleset/900/copy', payload: { name: 'Copy', mode: 'share-rules' } })
  expect(res.statusCode).toBe(200)
  expect(res.json().data).toMatchObject({ id: 901, name: 'Copy' })
  expect(seen.some((s) => s.includes('INSERT INTO rule_set'))).toBe(true)
})
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** (transaction; share-rules = copy membership; copy-rules = duplicate each member rule into a new instance then point membership at the copy — reuse the next-free-instance logic from Phase 2a):

```ts
  /** POST /ruleset/:worksetId/copy (admin) — Body { name, mode: 'copy-rules' | 'share-rules' }.
   *  share-rules: new workset + rule_set rows pointing at the SAME rule_ids.
   *  copy-rules:  new workset + each member rule duplicated into a new instance, membership → the copies. */
  fastify.post('/ruleset/:worksetId/copy', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const wid = Number.parseInt((request.params as { worksetId: string }).worksetId, 10)
    if (Number.isNaN(wid)) return fail(reply, 400, 'invalid worksetId')
    const b = request.body as { name?: string; mode?: string }
    if (!b?.name?.trim()) return fail(reply, 400, 'name is required')
    const mode = b.mode === 'copy-rules' ? 'copy-rules' : 'share-rules'
    const by = request.authUser.userCode
    try {
      await fastify.pgPool.query('BEGIN')
      const src = await fastify.pgPool.query(`SELECT * FROM workset WHERE id = $1`, [wid])
      if (src.rows.length === 0) { await fastify.pgPool.query('ROLLBACK'); return fail(reply, 404, `workset ${wid} not found`) }
      const s = src.rows[0]
      const nw = await fastify.pgPool.query<{ id: number; name: string; category: string | null }>(
        `INSERT INTO workset (name, division, category, type, filiale, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id, name, category`,
        [b.name.trim(), s.division, s.category, s.type, s.filiale ?? 'F8', by])
      const newWid = Number(nw.rows[0].id)
      const members = await fastify.pgPool.query<{ rule_id: number }>(`SELECT rule_id FROM rule_set WHERE workset_id = $1`, [wid])
      for (const m of members.rows) {
        let ruleId = m.rule_id
        if (mode === 'copy-rules') {
          const r = await fastify.pgPool.query(`SELECT * FROM rule WHERE rule_id = $1`, [m.rule_id])
          if (r.rows.length === 0) continue
          const rr = r.rows[0]
          const nx = await fastify.pgPool.query<{ ni: string }>(
            `SELECT lpad((coalesce(max(instance::int),0)+1)::text,3,'0') AS ni FROM rule WHERE function = $1`, [rr.function])
          const inst = nx.rows[0].ni
          ruleId = Number(`${rr.function}${inst}`)
          await fastify.pgPool.query(
            `INSERT INTO rule (function, instance, class, description, reference, category, store_structure,
               source, detail, overridability, severity, filiale, division, owner, locked, exception_code,
               param_json, rule_id, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'U','0',$14,$15,$16,$17,$17)`,
            [rr.function, inst, rr.class, rr.description, rr.reference, rr.category, rr.store_structure, rr.source,
             rr.detail, rr.overridability, rr.severity, rr.filiale, rr.division, rr.exception_code, rr.param_json, ruleId, by])
        }
        await fastify.pgPool.query(
          `INSERT INTO rule_set (workset_id, rule_id, created_by, updated_by) VALUES ($1,$2,$3,$3)`, [newWid, ruleId, by])
      }
      await fastify.pgPool.query('COMMIT')
      return success(reply, { id: newWid, name: nw.rows[0].name, category: nw.rows[0].category, ruleCount: members.rows.length, isDefault: false })
    } catch (err) { await fastify.pgPool.query('ROLLBACK'); return fail(reply, 500, (err as Error).message) }
  })
```

- [ ] **Step 4: PASS.** Commit `feat(live-server): POST /api/legality/ruleset/:id/copy (copy-rules | share-rules)`.

---

### Task 4: Backend — membership add/remove

**Files:** Modify `legality.ts`; add test cases.

- [ ] **Step 1: Failing test** — add inserts a rule_set row for the rule's rule_id; remove deletes it; reject duplicates.

```ts
it('POST/DELETE /ruleset/:wid/rules/:ruleId manages membership', async () => {
  const app = await build((sql) =>
    sql.includes('FROM rule WHERE id') ? { rows: [{ id: 17, rule_id: 8002001 }] }
    : sql.includes('FROM rule_set WHERE workset_id') && sql.includes('rule_id') ? { rows: [] } : { rows: [] })
  expect((await app.inject({ method: 'POST', url: '/ruleset/433/rules/17' })).statusCode).toBe(200)
  expect((await app.inject({ method: 'DELETE', url: '/ruleset/433/rules/17' })).statusCode).toBe(200)
})
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```ts
  /** POST /ruleset/:worksetId/rules/:ruleId (admin) — add a rule (by rule.id) to the workset. */
  fastify.post('/ruleset/:worksetId/rules/:ruleId', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const p = request.params as { worksetId: string; ruleId: string }
    const wid = Number.parseInt(p.worksetId, 10), rid = Number.parseInt(p.ruleId, 10)
    if (Number.isNaN(wid) || Number.isNaN(rid)) return fail(reply, 400, 'invalid ids')
    const r = await fastify.pgPool.query<{ rule_id: number }>(`SELECT rule_id FROM rule WHERE id = $1`, [rid])
    if (r.rows.length === 0) return fail(reply, 404, `rule ${rid} not found`)
    const dup = await fastify.pgPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM rule_set WHERE workset_id = $1 AND rule_id = $2`, [wid, r.rows[0].rule_id])
    if (dup.rows[0].n > 0) return fail(reply, 409, 'rule already in this set')
    await fastify.pgPool.query(
      `INSERT INTO rule_set (workset_id, rule_id, created_by, updated_by) VALUES ($1,$2,$3,$3)`,
      [wid, r.rows[0].rule_id, request.authUser.userCode])
    return success(reply, { worksetId: wid, ruleId: rid })
  })

  /** DELETE /ruleset/:worksetId/rules/:ruleId (admin) — remove a rule from the workset. */
  fastify.delete('/ruleset/:worksetId/rules/:ruleId', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const p = request.params as { worksetId: string; ruleId: string }
    const wid = Number.parseInt(p.worksetId, 10), rid = Number.parseInt(p.ruleId, 10)
    if (Number.isNaN(wid) || Number.isNaN(rid)) return fail(reply, 400, 'invalid ids')
    const r = await fastify.pgPool.query<{ rule_id: number }>(`SELECT rule_id FROM rule WHERE id = $1`, [rid])
    if (r.rows.length === 0) return fail(reply, 404, `rule ${rid} not found`)
    await fastify.pgPool.query(`DELETE FROM rule_set WHERE workset_id = $1 AND rule_id = $2`, [wid, r.rows[0].rule_id])
    return success(reply, { worksetId: wid, ruleId: rid })
  })
```

- [ ] **Step 4: PASS.** Commit `feat(live-server): rule_set membership add/remove endpoints`.

---

### Task 5: Frontend — legality-api + store actions

**Files:** Modify `gantt/src/services/legality-api.ts`, `gantt/src/stores/legality-store.ts`.

- [ ] **Step 1: api methods**

```ts
  createRuleset: (data: { name: string; division?: string; category?: string | null; type?: string }): Promise<LegalityRulesetSummary> =>
    api.post('/api/legality/rulesets', data) as Promise<LegalityRulesetSummary>,
  updateRuleset: (worksetId: number, patch: { name?: string; division?: string; category?: string | null; type?: string }): Promise<{ id: number; name: string }> =>
    api.patch(`/api/legality/ruleset/${worksetId}`, patch) as Promise<{ id: number; name: string }>,
  deleteRuleset: (worksetId: number): Promise<{ id: number }> =>
    api.delete(`/api/legality/ruleset/${worksetId}`) as Promise<{ id: number }>,
  copyRuleset: (worksetId: number, name: string, mode: 'copy-rules' | 'share-rules'): Promise<LegalityRulesetSummary> =>
    api.post(`/api/legality/ruleset/${worksetId}/copy`, { name, mode }) as Promise<LegalityRulesetSummary>,
  addRuleToSet: (worksetId: number, ruleId: number): Promise<void> =>
    api.post(`/api/legality/ruleset/${worksetId}/rules/${ruleId}`, {}) as Promise<void>,
  removeRuleFromSet: (worksetId: number, ruleId: number): Promise<void> =>
    api.delete(`/api/legality/ruleset/${worksetId}/rules/${ruleId}`) as Promise<void>,
```

- [ ] **Step 2: store actions** — add to `legality-store.ts`: `createSet`, `editSet`, `deleteSet`, `copySet`, `addRule`, `removeRule`. Each calls the api then refreshes: re-run `listRulesets()` into `sets` and re-`selectSet` (for membership/edit, re-select the current/new set). On delete, select the first remaining set. Use `notify`.

```ts
  // (inside the store, after selectSet)
  refreshSets: async () => { set({ sets: await legalityApi.listRulesets() }) },
  createSet: async (data) => {
    try { const s = await legalityApi.createRuleset(data); await get().refreshSets(); await get().selectSet(s.id); notify.success('Rule set created') }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Create failed') }
  },
  editSet: async (id, patch) => {
    try { await legalityApi.updateRuleset(id, patch); await get().refreshSets(); notify.success('Rule set updated') }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Update failed') }
  },
  deleteSet: async (id) => {
    try { await legalityApi.deleteRuleset(id); await get().refreshSets(); const first = get().sets[0]; if (first) await get().selectSet(first.id); notify.success('Rule set deleted') }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Delete failed') }
  },
  copySet: async (id, name, mode) => {
    try { const s = await legalityApi.copyRuleset(id, name, mode); await get().refreshSets(); await get().selectSet(s.id); notify.success('Rule set copied') }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Copy failed') }
  },
  addRule: async (ruleId) => { const id = get().selectedId; if (id == null) return; try { await legalityApi.addRuleToSet(id, ruleId); await get().selectSet(id); await get().refreshSets() } catch (e) { notify.error(e instanceof Error ? e.message : 'Add failed') } },
  removeRule: async (ruleId) => { const id = get().selectedId; if (id == null) return; try { await legalityApi.removeRuleFromSet(id, ruleId); await get().selectSet(id); await get().refreshSets() } catch (e) { notify.error(e instanceof Error ? e.message : 'Remove failed') } },
```
Add the matching members to the `LegalityStore` interface + import `notify` (already imported).

- [ ] **Step 3: tsc + commit**

`cd gantt && npx tsc --noEmit` → PASS.
```bash
git add gantt/src/services/legality-api.ts gantt/src/stores/legality-store.ts
git commit -m "feat(gantt): legality-store + api actions for Rule Set management"
```

---

### Task 6: Frontend — Rule Sets view management actions + dialogs

**Files:** Modify `gantt/src/components/legality/legality-rule-sets-view.tsx`; Create `gantt/src/components/legality/rule-set-dialogs.tsx` (New / Edit / Copy / Add-Rules dialogs, all `AppDialog`).

- [ ] **Step 1: Build the dialogs** (`rule-set-dialogs.tsx`), each `AppDialog` (icon, blue title bar, footer Cancel+action):
  - `NewRuleSetDialog` — fields: Name (required), Division (P/C select, default P). testid `rule-set-new-dialog`, confirm `rule-set-new-confirm`.
  - `EditRuleSetDialog` — fields: Name, Division, Category, Type (prefilled from the set). testid `rule-set-edit-dialog`.
  - `CopyRuleSetDialog` — fields: New Name (required) + **mode radio**: "Copy rules (independent)" = `copy-rules` / "Share rules (reference)" = `share-rules`. testid `rule-set-copy-dialog`, radios `rule-set-copy-mode-copy-rules` / `rule-set-copy-mode-share-rules`, confirm `rule-set-copy-confirm`.
  - `AddRulesDialog` — loads the catalog (`legalityApi.listRules()`), lets the admin pick rules NOT already in the set, calls `addRule(ruleId)` per pick. testid `rule-set-add-rules-dialog`.

- [ ] **Step 2: Wire the view** (`legality-rule-sets-view.tsx`):
  - Left "Rule Sets" panel header: add a **New** button (`rule-set-new-btn`) opening `NewRuleSetDialog` (admin only).
  - Right header (next to the set name): admin-only buttons **Edit** (`rule-set-edit-btn`), **Copy** (`rule-set-copy-btn`), **Delete** (`rule-set-delete-btn`, opens an `AppDialog` confirm `rule-set-delete-confirm`), **Add Rules** (`rule-set-add-rules-btn`).
  - Each rule row in the set gets an admin-only **Remove** action (`rule-set-remove-{fn}-{inst}`) → `removeRule(rule.id)` (needs `rule.id` — the ruleset rules already carry `id`).
  - Gate all management buttons on `useAuthStore(s => s.user?.isAdmin === 1)`.
  - §UI-Standard tokens only; icons from lucide (`Plus`, `Pencil`, `Copy`, `Trash2`).

- [ ] **Step 3: tsc + check:ui**

`cd gantt && npx tsc --noEmit` → PASS. `cd ~/rois/rois-ai && npm run check:ui` → 0 hard violations.

- [ ] **Step 4: Commit** `feat(gantt): Rule Set management (new/edit/delete/copy + membership) under Legality`.

---

### Task 7: e2e + version bump

**Files:** Create `e2e/tests/gantt/legality-rule-sets.spec.ts`; Modify `gantt/src/version.ts`.

- [ ] **Step 1: Write the e2e** (admin `admin`/`123456`, seed like `legality-rule-instances.spec.ts`):
  - New Set → appears in the left list (assert by the new set's name/card).
  - Edit → rename; the set name in the right header updates.
  - Copy (`share-rules`) → a new set appears with the same rule count.
  - Delete the created/copied sets → gone (assert count returns).
  - Assert the API count of rulesets grows/shrinks via `GET /api/legality/rulesets` (admin token) around each action (real-data, not just visible).
  - Keep idempotent: delete every set the test created.

- [ ] **Step 2: Run → PASS.** `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/legality-rule-sets.spec.ts --reporter=list --no-deps`. Paste the receipt.

- [ ] **Step 3: Bump** `BACKEND_VERSION` +1 + `FRONTEND_VERSION` +1 (accurate comments).

- [ ] **Step 4: Commit** `test(e2e/gantt): Rule Set management lifecycle; bump versions`.

---

## Self-Review (done)

- **Spec §5.3 coverage:** New (T1), Edit (T1), Delete + in-use guard (T2), Copy copy-rules/share-rules (T3), membership add/remove (T4), api/store (T5), view + dialogs (T6), e2e (T7). ✓
- **Admin gating:** every endpoint checks `isAdmin`; every management UI control gated on `isAdmin`. ✓ Non-admins keep read-only Rule Sets.
- **Delete safety:** name-match guard (scenario.rule_group_code → rule_group.name = workset.name), the same resolution `scenario_workset_id` / the RUST connector use. ✓
- **No Model-B:** only `legality.ts` + gantt legality files. ✓
- **Type consistency:** api `createRuleset/updateRuleset/deleteRuleset/copyRuleset/addRuleToSet/removeRuleFromSet`; store `createSet/editSet/deleteSet/copySet/addRule/removeRule/refreshSets`; testids `rule-set-{new,edit,copy,delete,add-rules}-{btn,dialog,confirm}` consistent T5↔T6↔T7.
- **Verify-at-impl:** confirm the pool transaction API (`BEGIN`/`COMMIT` via `fastify.pgPool.query`, as Phase 2a used) in T2/T3.
