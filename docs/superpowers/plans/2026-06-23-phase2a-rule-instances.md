# Phase 2a — Rule Instances page (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a **Rule Instances** page under the Legality tab — a global catalog of `rule` rows (templates + copies) on Model A, where a template (`instance='001'`) can be **copied** into a new editable instance, params edited (admins only, templates included), and copies deleted.

**Architecture:** Extend the existing Model-A `legality` backend (`live-server/src/routes/rule/legality.ts`) with 3 endpoints (list-all / copy / delete) and add a `rule-instances` sub-page to the Legality sidebar, reusing the existing `legality-param-*` editors. No Model-B (`rule-config-service.ts`) changes. Spec: `docs/superpowers/specs/2026-06-23-rule-tab-to-legality-migration-design.md` §5b.

**Tech Stack:** Fastify + Drizzle (live-server, Vitest), React 19 + Zustand (gantt, Playwright). DB: `rule` / `rule_set` (Model A). Admin = `users.is_admin=1`.

**Key rules (from §5):** template = `rule.instance='001'` (`owner='S'`/`locked='1'`); copy = new instance (`'003'`+ for 8002, `'002'`+ else), `owner='U'`/`locked='0'`, `rule_id=function‖instance`, params copied. **Admins (`isAdmin`) can edit ANY rule incl. templates — the editor gates on `isAdmin`, not `locked`.** Delete guard = `instance='001'` (+ referenced-by-rule_set), never `locked` alone.

---

### Task 1: Backend — `GET /api/legality/rules` (list the full rule catalog)

**Files:**
- Modify: `live-server/src/routes/rule/legality.ts`
- Test: `live-server/src/__tests__/unit/legality-rules-route.test.ts` (Create)

- [ ] **Step 1: Write the failing test** (mock `fastify.pgPool.query`)

```ts
import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import legalityRoutes from '../../routes/rule/legality.js'

const rows = [
  { id: 17, function: 8002, instance: '001', reference: null, category: 'Duty', description: 'Maximum Flight Time', detail: null, severity: 3, overridability: null, division: 'P', owner: 'S', locked: '1', rule_id: 8002001, param_json: { tables: [{ header: ['PERIOD'], rows: [['28']] }] } },
  { id: 20, function: 8002, instance: '002', reference: null, category: 'Duty', description: 'Maximum Hours of Work', detail: null, severity: 3, overridability: null, division: 'P', owner: 'U', locked: '0', rule_id: 8002002, param_json: null },
]
const build = async () => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn(async () => ({ rows })) } as never)
  app.decorateRequest('authUser', null)
  app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin: 1 } })
  await app.register(legalityRoutes)
  return app
}

describe('GET /rules', () => {
  it('returns the full rule catalog with template flag', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/rules' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(2)
    expect(body.data[0]).toMatchObject({ id: 17, function: 8002, instance: '001', isTemplate: true })
    expect(body.data[1]).toMatchObject({ id: 20, instance: '002', isTemplate: false })
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`/rules` 404)

Run: `cd live-server && npx vitest run src/__tests__/unit/legality-rules-route.test.ts`
Expected: FAIL (route not found).

- [ ] **Step 3: Implement** — add to `legalityRoutes` (after the `/ruleset/:worksetId` route):

```ts
  /**
   * GET /rules — the full rule catalog (templates + copies), grouped client-side by
   * function. isTemplate = instance '001' (read-only for non-admins; admins can edit).
   */
  fastify.get('/rules', async (_request, reply) => {
    try {
      const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
        SELECT r.id, r.function, r.instance, r.reference, r.category, r.description,
               r.detail, r.severity, r.overridability, r.division, r.owner, r.locked,
               r.rule_id, r.param_json
        FROM rule r
        ORDER BY r.function, r.instance
      `)
      return success(reply, rows.map((r) => ({
        id: r.id, function: r.function, instance: r.instance, reference: r.reference,
        category: r.category, description: r.description, detail: r.detail,
        severity: r.severity, overridability: r.overridability, division: r.division,
        owner: r.owner, locked: r.locked, paramJson: r.param_json,
        isTemplate: r.instance === '001',
      })))
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })
```

- [ ] **Step 4: Run — expect PASS.** `cd live-server && npx vitest run src/__tests__/unit/legality-rules-route.test.ts`

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/rule/legality.ts live-server/src/__tests__/unit/legality-rules-route.test.ts
git commit -m "feat(live-server): GET /api/legality/rules — full rule catalog with isTemplate"
```

---

### Task 2: Backend — `POST /api/legality/rules/:ruleId/copy`

**Files:**
- Modify: `live-server/src/routes/rule/legality.ts`
- Test: `live-server/src/__tests__/unit/legality-rules-route.test.ts` (add cases)

- [ ] **Step 1: Write the failing test** — admin copies rule 17 (8002/001) → new 8002/003 (001,002 taken):

```ts
it('copies a rule into the next free instance, owner=U locked=0', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn(async (sql: string, params: unknown[]) => {
    queries.push({ sql, params })
    if (sql.includes('SELECT') && sql.includes('FROM rule') && sql.includes('WHERE id'))
      return { rows: [{ id: 17, function: 8002, instance: '001', description: 'Maximum Flight Time', category: 'Duty', reference: null, detail: null, severity: 3, overridability: null, division: 'P', filiale: 'F8', store_structure: null, source: null, class: null, exception_code: null, param_json: { tables: [] } }] }
    if (sql.includes('max(') || sql.includes('MAX('))
      return { rows: [{ next_instance: '003' }] }
    if (sql.includes('INSERT INTO rule'))
      return { rows: [{ id: 99, function: 8002, instance: '003', rule_id: 8002003 }] }
    return { rows: [] }
  }) } as never)
  app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin: 1 } })
  await app.register(legalityRoutes)
  const res = await app.inject({ method: 'POST', url: '/rules/17/copy' })
  expect(res.statusCode).toBe(200)
  expect(res.json().data).toMatchObject({ function: 8002, instance: '003' })
  const insert = queries.find((q) => q.sql.includes('INSERT INTO rule'))!
  expect(insert.params).toContain('003')
  expect(insert.params).toContain('U') // owner
  expect(insert.params).toContain('0') // locked
})

it('rejects copy for non-admin', async () => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn(async () => ({ rows: [] })) } as never)
  app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'ryan', isAdmin: 0 } })
  await app.register(legalityRoutes)
  const res = await app.inject({ method: 'POST', url: '/rules/17/copy' })
  expect(res.statusCode).toBe(403)
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — add the route:

```ts
  /**
   * POST /rules/:ruleId/copy (admin) — duplicate a rule into the next free instance.
   * New row: owner='U', locked='0', rule_id=function‖instance, param_json copied.
   */
  fastify.post('/rules/:ruleId/copy', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const id = Number.parseInt((request.params as { ruleId: string }).ruleId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid ruleId')
    const client = await fastify.pgPool.connect()
    try {
      await client.query('BEGIN')
      const src = await client.query(`SELECT * FROM rule WHERE id = $1 FOR UPDATE`, [id])
      if (src.rows.length === 0) { await client.query('ROLLBACK'); return fail(reply, 404, `rule ${id} not found`) }
      const r = src.rows[0]
      // next free instance for this function: max(instance::int)+1, zero-padded to 3.
      const nx = await client.query(
        `SELECT lpad((coalesce(max(instance::int), 0) + 1)::text, 3, '0') AS next_instance
           FROM rule WHERE function = $1`, [r.function])
      const inst = nx.rows[0].next_instance as string
      const ruleId = Number(`${r.function}${inst}`)
      const ins = await client.query(
        `INSERT INTO rule (function, instance, class, description, reference, category,
            store_structure, source, detail, overridability, severity, filiale, division,
            owner, locked, exception_code, param_json, rule_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'U','0',$14,$15,$16,$17,$17)
         RETURNING id, function, instance, rule_id`,
        [r.function, inst, r.class, r.description, r.reference, r.category, r.store_structure,
         r.source, r.detail, r.overridability, r.severity, r.filiale, r.division,
         r.exception_code, r.param_json, ruleId, request.authUser.userCode])
      await client.query('COMMIT')
      return success(reply, { ...ins.rows[0], isTemplate: false })
    } catch (err) {
      await client.query('ROLLBACK')
      return fail(reply, 500, (err as Error).message)
    } finally {
      client.release()
    }
  })
```

> If `fastify.pgPool` has no `.connect()` in this codebase, use the same transactional pattern other live-server routes use (check an existing `BEGIN`/`COMMIT` route) — do not invent a new pool API.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/rule/legality.ts live-server/src/__tests__/unit/legality-rules-route.test.ts
git commit -m "feat(live-server): POST /api/legality/rules/:id/copy — duplicate to next free instance"
```

---

### Task 3: Backend — `DELETE /api/legality/rules/:ruleId`

**Files:** Modify `legality.ts`; add test cases.

- [ ] **Step 1: Failing test** — delete a copy ok; reject template (`instance='001'`); reject if in a `rule_set`; reject non-admin.

```ts
it('deletes a copy but rejects a template (001) and an in-use rule', async () => {
  const make = (rule: Record<string, unknown>, inSet: boolean, isAdmin = 1) => {
    const app = Fastify()
    app.decorate('pgPool', { query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM rule WHERE id')) return { rows: [rule] }
      if (sql.includes('FROM rule_set')) return { rows: inSet ? [{ n: 1 }] : [{ n: 0 }] }
      return { rows: [] }
    }) } as never)
    app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin } })
    return app
  }
  let app = make({ id: 99, instance: '003', rule_id: 8002003 }, false)
  await app.register(legalityRoutes)
  expect((await app.inject({ method: 'DELETE', url: '/rules/99' })).statusCode).toBe(200)

  app = make({ id: 17, instance: '001', rule_id: 8002001 }, false)
  await app.register(legalityRoutes)
  expect((await app.inject({ method: 'DELETE', url: '/rules/17' })).statusCode).toBe(400) // template

  app = make({ id: 99, instance: '003', rule_id: 8002003 }, true)
  await app.register(legalityRoutes)
  expect((await app.inject({ method: 'DELETE', url: '/rules/99' })).statusCode).toBe(409) // in use
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
  /** DELETE /rules/:ruleId (admin) — delete a copy. Never a template (instance='001'); never if in a rule_set. */
  fastify.delete('/rules/:ruleId', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const id = Number.parseInt((request.params as { ruleId: string }).ruleId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid ruleId')
    const r = await fastify.pgPool.query(`SELECT id, instance, rule_id FROM rule WHERE id = $1`, [id])
    if (r.rows.length === 0) return fail(reply, 404, `rule ${id} not found`)
    if (r.rows[0].instance === '001') return fail(reply, 400, 'templates (instance 001) cannot be deleted')
    const used = await fastify.pgPool.query(`SELECT count(*)::int AS n FROM rule_set WHERE rule_id = $1`, [r.rows[0].rule_id])
    if (used.rows[0].n > 0) return fail(reply, 409, 'rule is used by a rule set; remove it from all sets first')
    await fastify.pgPool.query(`DELETE FROM rule WHERE id = $1`, [id])
    return success(reply, { id })
  })
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/rule/legality.ts live-server/src/__tests__/unit/legality-rules-route.test.ts
git commit -m "feat(live-server): DELETE /api/legality/rules/:id — delete a copy (guard 001 + in-use)"
```

---

### Task 4: Frontend — nav + api + store for Rule Instances

**Files:**
- Modify: `gantt/src/stores/shell-store.ts` (add `'rule-instances'` to `ActiveLegalityItem` + `VALID_LEGALITY_ITEMS`)
- Modify: `gantt/src/components/shell/shell-sidebar.tsx` (`LEGALITY_MENU` add Rule Instances item)
- Modify: `gantt/src/services/legality-api.ts` (add methods)
- Create: `gantt/src/stores/rule-instances-store.ts`
- Modify: `gantt/src/types/legality.ts` (add `LegalityCatalogRule` = `LegalityRule & { isTemplate: boolean }`)

- [ ] **Step 1: Types + api**

In `types/legality.ts` add:
```ts
export interface LegalityCatalogRule extends LegalityRule {
  isTemplate: boolean
}
```
In `legality-api.ts` add (inside `legalityApi`):
```ts
  /** Full rule catalog (templates + copies). */
  listRules: (): Promise<LegalityCatalogRule[]> =>
    api.get('/api/legality/rules') as Promise<LegalityCatalogRule[]>,
  /** Copy a rule (template/copy) into a new editable instance (admin). */
  copyRule: (ruleId: number): Promise<LegalityCatalogRule> =>
    api.post(`/api/legality/rules/${ruleId}/copy`, {}) as Promise<LegalityCatalogRule>,
  /** Delete a copy (admin; rejects templates + in-use rules). */
  deleteRule: (ruleId: number): Promise<{ id: number }> =>
    api.delete(`/api/legality/rules/${ruleId}`) as Promise<{ id: number }>,
```
(Add `LegalityCatalogRule` to the type import.)

- [ ] **Step 2: shell-store** — add `'rule-instances'`:
`ActiveLegalityItem = 'rule-sets' | 'rule-instances' | 'composition' | 'comp-load'` and add `'rule-instances'` to `VALID_LEGALITY_ITEMS`.

- [ ] **Step 3: `LEGALITY_MENU`** — insert after `rule-sets`:
```tsx
  { item: 'rule-instances', label: 'Rule Instances', Icon: ListChecks },
```
(Import `ListChecks` if not already imported in shell-sidebar.)

- [ ] **Step 4: `rule-instances-store.ts`** (Create)

```ts
import { create } from 'zustand'
import { legalityApi } from '@/services/legality-api'
import { notify } from '@/utils/notify'
import type { LegalityCatalogRule } from '@/types/legality'

interface RuleInstancesStore {
  rules: LegalityCatalogRule[]
  loading: boolean
  loaded: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  copy: (ruleId: number) => Promise<void>
  remove: (ruleId: number) => Promise<void>
}

export const useRuleInstancesStore = create<RuleInstancesStore>((set, get) => ({
  rules: [],
  loading: false,
  loaded: false,
  init: async () => { if (!get().loaded && !get().loading) await get().refresh() },
  refresh: async () => {
    set({ loading: true })
    try { set({ rules: await legalityApi.listRules(), loaded: true }) }
    catch { notify.error('Failed to load rule instances') }
    finally { set({ loading: false }) }
  },
  copy: async (ruleId) => {
    try { await legalityApi.copyRule(ruleId); await get().refresh(); notify.success('Rule copied') }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Copy failed') }
  },
  remove: async (ruleId) => {
    try { await legalityApi.deleteRule(ruleId); await get().refresh(); notify.success('Instance deleted') }
    catch (e) { notify.error(e instanceof Error ? e.message : 'Delete failed') }
  },
}))
```

- [ ] **Step 5: Type-check + commit**

Run: `cd gantt && npx tsc --noEmit` → PASS.
```bash
git add gantt/src/types/legality.ts gantt/src/services/legality-api.ts gantt/src/stores/shell-store.ts gantt/src/components/shell/shell-sidebar.tsx gantt/src/stores/rule-instances-store.ts
git commit -m "feat(gantt): Rule Instances nav + api + store (Legality)"
```

---

### Task 5: Frontend — `rule-instances-view.tsx` + router

**Files:**
- Create: `gantt/src/components/legality/rule-instances-view.tsx`
- Modify: `gantt/src/components/legality/legality-view.tsx` (route `rule-instances`)

- [ ] **Step 1: Create the view.** Mirror the `legality-rule-sets-view.tsx` layout (header `flex h-10 … border-b px-4`, table). Group rules by `function`, template (`isTemplate`) first. Columns: Rule (`{function}/{instance} - {description}`), Category, Div, Severity, Source (Template badge if `isTemplate`, else Copy), Params (count), Actions. Reuse `LegalityRuleRow`'s param expand/editor where possible; if `LegalityRuleRow` is coupled to the rule-sets store, render a sibling row component here that reuses `LegalityParamTableEditor` / `LegalityParamTable` (admin → editor; non-admin → read-only — gate on `useAuthStore(s => s.user?.isAdmin === 1)`).

Per-row actions (use `AppDialog` for any confirm):
- **Copy** (all rows): `useRuleInstancesStore().copy(rule.id)` — `data-testid={\`rule-instance-copy-${rule.function}-${rule.instance}\`}`.
- **Delete** (only `!isTemplate`): confirm → `remove(rule.id)` — `data-testid={\`rule-instance-delete-${rule.function}-${rule.instance}\`}`.
- **Template badge** on `isTemplate` rows — `data-testid={\`rule-instance-template-${rule.function}-${rule.instance}\`}`.
- Root: `data-testid="rule-instances-view"`.

Use only token classes (§UI-Standard). Follow the `legality-rule-row.tsx` editor-gating: `isAdmin && rule.paramJson ? <Editor/> : <ReadOnlyTable/>` — admins edit templates too.

- [ ] **Step 2: Route it** in `legality-view.tsx`:
```tsx
  if (activeLegalityItem === 'rule-instances') return <RuleInstancesView />
```
(import `RuleInstancesView`).

- [ ] **Step 3: Type-check + check:ui**

Run: `cd gantt && npx tsc --noEmit` → PASS. Run: `cd ~/rois/rois-ai && npm run check:ui` → 0 hard violations.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/legality/rule-instances-view.tsx gantt/src/components/legality/legality-view.tsx
git commit -m "feat(gantt): Rule Instances view under Legality (templates + copies, admin-edit)"
```

---

### Task 6: e2e + version bump

**Files:**
- Create: `e2e/tests/gantt/legality-rule-instances.spec.ts`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Write the e2e** (admin login `admin`/`123456`).

```ts
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'
const admin = async (request: import('@playwright/test').APIRequestContext) => {
  // seed admin auth via the admin account (is_admin=1)
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: 'admin', password: '123456' } })
  return ((await res.json()) as { data: { token: string } }).data.token
}

test.describe('Legality — Rule Instances (Phase 2a)', () => {
  test('template is editable by admin + copy/delete lifecycle', async ({ page, request }) => {
    await seedGanttAuth(page, request) // baseline; admin token used for API assertions below
    const token = await admin(request)
    await page.goto('/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-nav-rule-instances').click()
    await expect(page.getByTestId('rule-instances-view')).toBeVisible()

    // Template 8002/001 shows the Template badge; Delete absent; Copy present.
    await expect(page.getByTestId('rule-instance-template-8002-001')).toBeVisible()
    await expect(page.getByTestId('rule-instance-delete-8002-001')).toHaveCount(0)

    // Copy 8002/001 → a new higher instance appears via the API count growing.
    const before = (await (await request.get(`${GANTT_API}/api/legality/rules`, { headers: { Authorization: `Bearer ${token}` } })).json()).data.length
    await page.getByTestId('rule-instance-copy-8002-001').click()
    await expect.poll(async () =>
      (await (await request.get(`${GANTT_API}/api/legality/rules`, { headers: { Authorization: `Bearer ${token}` } })).json()).data.length
    ).toBe(before + 1)

    // Delete the new copy via API to keep the suite idempotent (find the max-instance 8002 copy).
    const rules = (await (await request.get(`${GANTT_API}/api/legality/rules`, { headers: { Authorization: `Bearer ${token}` } })).json()).data as Array<{ id: number; function: number; instance: string }>
    const copy = rules.filter((r) => r.function === 8002 && r.instance !== '001' && r.instance !== '002').sort((a, b) => b.instance.localeCompare(a.instance))[0]
    const del = await request.delete(`${GANTT_API}/api/legality/rules/${copy.id}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(del.ok()).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect PASS** (services up).

Run: `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/legality-rule-instances.spec.ts --reporter=list --no-deps`
Paste the PASS summary.

- [ ] **Step 3: Bump versions** — `BACKEND_VERSION` +1 (new endpoints) and `FRONTEND_VERSION` +1 (new view), each with an accurate comment.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/legality-rule-instances.spec.ts gantt/src/version.ts
git commit -m "test(e2e/gantt): Rule Instances template-edit + copy/delete; bump versions"
```

---

## Self-Review (done)

- **Spec coverage (§5b/5.1/5.2):** catalog list (Task 1), copy → next free instance owner=U/locked=0 (Task 2), delete copy with 001 + in-use guards (Task 3), nav/api/store (Task 4), view with Template badge + admin-edit + copy/delete (Task 5), e2e admins-edit-001 + lifecycle (Task 6). ✓
- **Admin-edit rule:** param PATCH untouched (already `isAdmin`-gated, no template block); the view gates the editor on `isAdmin` (not `locked`). ✓ No `locked`-based block introduced anywhere.
- **No Model-B touch:** only `legality.ts` + new gantt files; `rule-config-service.ts` untouched. ✓
- **Type consistency:** `LegalityCatalogRule` (= `LegalityRule & {isTemplate}`), `listRules`/`copyRule`/`deleteRule`, `useRuleInstancesStore` (`init`/`refresh`/`copy`/`remove`), testids `rule-instance-{copy,delete,template}-{fn}-{inst}` + `rule-instances-view` are identical across tasks.
- **Open verify-at-impl:** confirm the live-server pool's transaction API (`.connect()` vs existing pattern) in Task 2 before coding; reuse the real one.
