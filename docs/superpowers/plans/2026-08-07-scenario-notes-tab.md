# Scenario Notes Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Scenario 详情底部 Tab rail（Versions 右侧）新增 Notes Tab：线程式问答留言，数据存 `scenario_result` 表，Remove Result 保留 Notes、删场景全删，DRAFT 也可用。

**Architecture:** 后端在 live-server 新增 `scenario-note-store.ts`（复用 `scenario_result` 表，`type='notes'` 单行 json 存消息数组，add 用原子 `jsonb ||` 追加），新增 `/api/scenario/:id/notes` 系列路由；前端 gantt 在 `scenario-kpi-section.tsx` 加 Notes Tab 并重构 DRAFT 可见性，新增 `ScenarioNotesPanel` 组件（UI 参考 report 项目 `unittest/NotesPanel.tsx`）。

**Tech Stack:** Fastify + Drizzle + Vitest (live-server)；React 19 + Zustand + Playwright (gantt)；`@rois/ui` AppDialog。

**Spec:** `docs/superpowers/specs/2026-08-06-scenario-notes-tab-design.md`

## Global Constraints

- **UI 默认英文**：所有按钮/标签/占位符/空态用英文（`Ask a question…`、`Your name`、`Post`、`Clear messages` 等）。
- **弹窗用 `@rois/ui` `AppDialog`**：禁止裸 Dialog。六条标准外观（icon / bg-primary 标题 / showClose / footer / draggable / dismissable）。
- **样式 token 驱动**：字号只用 `text-3xs/2xs/xs/sm`，数字列配 `font-mono tabular-nums`，图标+文字用 `flex items-center` + `gap-1.5/2`，图标加 `shrink-0`。禁止 `text-[Npx]`、`m-[Npx]`、`rounded-[Npx]`、写死颜色。改前端样式后必跑 `npm run check:ui`。
- **§Playwright-Required**：UI 变更必须带 e2e；运行 `npx playwright test e2e/tests/gantt/scenario/scenario-notes.spec.ts --reporter=list` 并贴 PASS 收据。
- **§No-Illusion**：每个改动跑测试贴结果才算完成；禁止只靠 code inspection。
- **后端测试**：live-server Vitest，新功能附单元测试。
- **§Minimal-First**：不预埋未要求的抽象/缓存/实时推送。Notes 不做 Redis 缓存、不做 WS 推送。
- **不要改 `sql/schema/` 建表脚本**；`scenario_result` 由 `ensureScenarioResultTable` 幂等确保。
- **版本号**：gantt dev/build 自动递增 runtime frontend 版本，不手动改 tracked 文件。

---

### Task 1: Backend note-store 服务（scenario-note-store.ts）

**Files:**
- Create: `live-server/src/services/scenario/scenario-note-store.ts`
- Test: `live-server/src/__tests__/services/scenario/scenario-note-store.test.ts`

**Interfaces:**
- Consumes: `ensureScenarioResultTable` from `./scenario-result-store.js`（`import { ensureScenarioResultTable } from './scenario-result-store.js'`）。
- Produces（Task 3 路由依赖这些签名）:
  - `getNotes(fastify: FastifyLike, scenarioId: number): Promise<ScenarioNoteMessage[]>`
  - `addNote(fastify: FastifyLike, scenarioId: number, input: AddNoteInput, username?: string): Promise<ScenarioNoteMessage>`
  - `patchNote(fastify: FastifyLike, scenarioId: number, messageId: string, text: string): Promise<ScenarioNoteMessage>`
  - `deleteNote(pool: Queryable, scenarioId: number, messageId: string): Promise<void>`
  - `clearNotes(pool: Queryable, scenarioId: number): Promise<void>`
  - 类型导出：`ScenarioNoteMessage { id: string; author: string; text: string; at: string; editedAt: string | null; replyTo: string | null }`、`AddNoteInput { text: string; author: string; replyTo?: string | null }`

- [ ] **Step 1: Write the failing test**

Create `live-server/src/__tests__/services/scenario/scenario-note-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../services/scenario/scenario-result-store.js', () => ({
  ensureScenarioResultTable: vi.fn(async () => undefined),
}))

import { ensureScenarioResultTable } from '../../../services/scenario/scenario-result-store.js'
import {
  addNote, clearNotes, deleteNote, getNotes, patchNote,
  type ScenarioNoteMessage,
} from '../../../services/scenario/scenario-note-store.js'

const ensureMock = vi.mocked(ensureScenarioResultTable)

type QueryResult = { rows: unknown[] }
const queryMock = vi.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>()

beforeEach(() => {
  vi.clearAllMocks()
  queryMock.mockResolvedValue({ rows: [] })
})

const fastifyLike = { pgPool: { query: queryMock } }

describe('scenario note store', () => {
  it('getNotes returns [] when no notes row exists', async () => {
    expect(await getNotes(fastifyLike, 1)).toEqual([])
    expect(ensureMock).toHaveBeenCalled()
  })

  it('getNotes parses the stored notes array', async () => {
    const stored: ScenarioNoteMessage = { id: 'n_a', author: 'admin', text: 'q', at: '2026-08-07T00:00:00Z', editedAt: null, replyTo: null }
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ json: [stored] }] })
    expect(await getNotes(fastifyLike, 1)).toEqual([stored])
  })

  it('addNote appends a message with generated id and replyTo', async () => {
    const item = await addNote(fastifyLike, 7, { text: 'Hello', author: 'admin', replyTo: 'n_root' })
    expect(item.id).toMatch(/^n_[0-9a-f]{8}$/)
    expect(item.text).toBe('Hello')
    expect(item.author).toBe('admin')
    expect(item.replyTo).toBe('n_root')
    expect(item.editedAt).toBeNull()
    expect(typeof item.at).toBe('string')
    // atomic append SQL: INSERT ... ON CONFLICT
    const [sql, params] = queryMock.mock.calls[0]
    expect(String(sql)).toContain('on conflict')
    expect(params?.[0]).toBe(7)
    expect(params?.[2]).toContain('"replyTo":"n_root"')
  })

  it('addNote defaults replyTo to null', async () => {
    const item = await addNote(fastifyLike, 7, { text: 'Hi', author: 'a' })
    expect(item.replyTo).toBeNull()
  })

  it('patchNote updates text and editedAt but preserves author', async () => {
    const original: ScenarioNoteMessage = { id: 'n_a', author: 'admin', text: 'old', at: '2026-08-07T00:00:00Z', editedAt: null, replyTo: null }
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ json: [original] }] })
    const updated = await patchNote(fastifyLike, 7, 'n_a', 'new text')
    expect(updated.text).toBe('new text')
    expect(updated.author).toBe('admin')
    expect(updated.editedAt).not.toBeNull()
    // write-back UPDATE contains the new text
    const updateCall = queryMock.mock.calls.at(-1)
    expect(String(updateCall?.[0])).toContain('update scenario_result set json')
    expect(String(updateCall?.[1])).toContain('new text')
  })

  it('patchNote throws for a missing message', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ json: [] }] })
    await expect(patchNote(fastifyLike, 7, 'n_missing', 'x')).rejects.toThrow('not found')
  })

  it('patchNote rejects empty text', async () => {
    await expect(patchNote(fastifyLike, 7, 'n_a', '   ')).rejects.toThrow('cannot be empty')
  })

  it('deleteNote removes the message and cascades descendants', async () => {
    const root: ScenarioNoteMessage = { id: 'n_r', author: 'a', text: 'root', at: 't', editedAt: null, replyTo: null }
    const child: ScenarioNoteMessage = { id: 'n_c', author: 'b', text: 'child', at: 't', editedAt: null, replyTo: 'n_r' }
    const grand: ScenarioNoteMessage = { id: 'n_g', author: 'c', text: 'grand', at: 't', editedAt: null, replyTo: 'n_c' }
    const other: ScenarioNoteMessage = { id: 'n_o', author: 'd', text: 'other', at: 't', editedAt: null, replyTo: null }
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ json: [root, child, grand, other] }] })
    await deleteNote(fastifyLike.pgPool, 7, 'n_r')
    const updateCall = queryMock.mock.calls.at(-1)
    const written = JSON.parse(String(updateCall?.[1]))
    expect(written.map((m: ScenarioNoteMessage) => m.id)).toEqual(['n_o'])
  })

  it('deleteNote throws for a missing message', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ json: [] }] })
    await expect(deleteNote(fastifyLike.pgPool, 7, 'n_x')).rejects.toThrow('not found')
  })

  it('clearNotes issues a delete for the notes type', async () => {
    await clearNotes(fastifyLike.pgPool, 7)
    const [sql, params] = queryMock.mock.calls[0]
    expect(String(sql)).toContain('delete from scenario_result')
    expect(params?.[1]).toBe('notes')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-note-store.test.ts`
Expected: FAIL — `Cannot find module '../../../services/scenario/scenario-note-store.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `live-server/src/services/scenario/scenario-note-store.ts`:

```ts
// live-server/src/services/scenario/scenario-note-store.ts
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { ensureScenarioResultTable } from './scenario-result-store.js'

export interface ScenarioNoteMessage {
  id: string
  author: string
  text: string
  at: string
  editedAt: string | null
  replyTo: string | null
}

export interface AddNoteInput {
  text: string
  author: string
  replyTo?: string | null
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }
type FastifyLike = { pgPool: Queryable }

const NOTES_TYPE = 'notes'

const nowIso = (): string => new Date().toISOString()

const newNoteId = (): string => `n_${randomUUID().replaceAll('-', '').slice(0, 8)}`

const asMessages = (value: unknown): ScenarioNoteMessage[] =>
  Array.isArray(value) ? value as ScenarioNoteMessage[] : []

const ensureTable = async (fastify: FastifyLike): Promise<void> => {
  await ensureScenarioResultTable(fastify as unknown as FastifyInstance)
}

const readMessages = async (fastify: FastifyLike, scenarioId: number): Promise<ScenarioNoteMessage[]> => {
  const { rows } = await fastify.pgPool.query(
    `select json from scenario_result where scenario_id = $1 and type = $2`,
    [scenarioId, NOTES_TYPE],
  )
  return rows.length > 0 ? asMessages((rows[0] as { json: unknown }).json) : []
}

const writeMessages = async (pool: Queryable, scenarioId: number, messages: ScenarioNoteMessage[]): Promise<void> => {
  await pool.query(
    `update scenario_result set json = $2::jsonb, updated_at = now() where scenario_id = $1 and type = $3`,
    [scenarioId, JSON.stringify(messages), NOTES_TYPE],
  )
}

export const getNotes = async (fastify: FastifyLike, scenarioId: number): Promise<ScenarioNoteMessage[]> => {
  await ensureTable(fastify)
  return readMessages(fastify, scenarioId)
}

export const addNote = async (
  fastify: FastifyLike,
  scenarioId: number,
  input: AddNoteInput,
  username = 'system',
): Promise<ScenarioNoteMessage> => {
  const text = input.text.trim()
  const author = input.author.trim()
  if (!text) throw new Error('Note text cannot be empty')
  if (!author) throw new Error('Note author cannot be empty')
  await ensureTable(fastify)
  const message: ScenarioNoteMessage = {
    id: newNoteId(),
    author,
    text,
    at: nowIso(),
    editedAt: null,
    replyTo: input.replyTo ?? null,
  }
  await fastify.pgPool.query(
    `
    insert into scenario_result (scenario_id, type, json, created_by, updated_by)
    values ($1, $2, jsonb_build_array($3::jsonb), $4, $4)
    on conflict (scenario_id, type) do update set
      json = scenario_result.json || excluded.json,
      updated_by = excluded.updated_by,
      updated_at = now()
    `,
    [scenarioId, NOTES_TYPE, JSON.stringify(message), username],
  )
  return message
}

export const patchNote = async (
  fastify: FastifyLike,
  scenarioId: number,
  messageId: string,
  text: string,
): Promise<ScenarioNoteMessage> => {
  const clean = text.trim()
  if (!clean) throw new Error('Note text cannot be empty')
  await ensureTable(fastify)
  const messages = await readMessages(fastify, scenarioId)
  const message = messages.find((m) => m.id === messageId)
  if (!message) throw new Error(`Note message not found: ${messageId}`)
  const updated: ScenarioNoteMessage = { ...message, text: clean, editedAt: nowIso() }
  await writeMessages(fastify.pgPool, scenarioId, messages.map((m) => (m.id === messageId ? updated : m)))
  return updated
}

export const deleteNote = async (pool: Queryable, scenarioId: number, messageId: string): Promise<void> => {
  const messages = await readMessages({ pgPool: pool } as FastifyLike, scenarioId)
  const removed = new Set<string>([messageId])
  let changed = true
  while (changed) {
    changed = false
    for (const m of messages) {
      if (m.replyTo && removed.has(m.replyTo) && !removed.has(m.id)) {
        removed.add(m.id)
        changed = true
      }
    }
  }
  const kept = messages.filter((m) => !removed.has(m.id))
  if (kept.length === messages.length) throw new Error(`Note message not found: ${messageId}`)
  await writeMessages(pool, scenarioId, kept)
}

export const clearNotes = async (pool: Queryable, scenarioId: number): Promise<void> => {
  await pool.query(
    `delete from scenario_result where scenario_id = $1 and type = $2`,
    [scenarioId, NOTES_TYPE],
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-note-store.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-note-store.ts live-server/src/__tests__/services/scenario/scenario-note-store.test.ts
git commit -m "feat(scenario): scenario_result-backed notes store (thread add/patch/delete-cascade/clear)"
```

---

### Task 2: 清理语义 — Remove Result 保留 Notes，删场景全删

**Files:**
- Modify: `live-server/src/services/scenario/scenario-result-store.ts`（增 `deleteScenarioResultExceptNotes`）
- Modify: `live-server/src/services/scenario/scenario-service.ts:449-466`（transition→DRAFT 补调）
- Test: `live-server/src/__tests__/services/scenario/scenario-service.test.ts`（增一个 transition 用例）

**Interfaces:**
- Produces: `deleteScenarioResultExceptNotes(pool: { query: (text: string, params?: unknown[]) => Promise<unknown> }, scenarioId: number): Promise<void>` — Task 2 内部自用，无下游依赖。
- Consumes: 现有 `scenarioService.transition`（scenario-service.ts:417），在 `clearingResult` 块末尾补调。

- [ ] **Step 1: Write the failing test**

在 `live-server/src/__tests__/services/scenario/scenario-service.test.ts` 的 `describe('transition')` 内、现有 `'should allow DONE -> DRAFT when removing an optimization result'` 用例之后追加（沿用该文件既有的 `createFastify`/`mockScenario`/`fastify.db.then` mock 风格）：

```ts
    it('DONE -> DRAFT (remove result) clears scenario_result except notes', async () => {
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DONE' }]))
      fastify.db.then.mockImplementationOnce((resolve: any) => resolve([{ ...mockScenario, status: 'DRAFT', division: 'P' }]))

      await scenarioService.transition(fastify, 1, 'DRAFT', 'admin')

      // notes are kept: the delete targets every type EXCEPT notes
      const deleteCall = fastify.pgPool.query.mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('scenario_result') && String(c[0]).includes('<>'))
      expect(deleteCall).toBeTruthy()
      expect(String(deleteCall![0])).toContain("type <> 'notes'")
      expect(deleteCall![1]).toEqual([1])
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-service.test.ts -t "except notes"`
Expected: FAIL — 未调用 `type <> 'notes'` 的删除。

- [ ] **Step 3: Implement**

(a) 在 `live-server/src/services/scenario/scenario-result-store.ts` 的 `deleteScenarioResultJson` 后新增：

```ts
export const deleteScenarioResultExceptNotes = async (
  pool: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  scenarioId: number,
): Promise<void> => {
  try {
    await pool.query(`delete from scenario_result where scenario_id = $1 and type <> 'notes'`, [scenarioId])
  } catch {
    // Older deployments may not have the table until the first result write creates it.
  }
}
```

(b) `live-server/src/services/scenario/scenario-service.ts` 第 8 行 import 增加：

```ts
import { deleteScenarioResultJson, deleteScenarioResultExceptNotes, getScenarioResults } from './scenario-result-store.js'
```

(c) 在 `transition()` 的 `clearingResult` 块内、`scenarioTables` for 循环之后（第 466 行 `}` 之后），追加：

```ts
try {
  await deleteScenarioResultExceptNotes(fastify.pgPool, id)
} catch (err) {
  fastify.log.warn({ err, id }, 'transition→DRAFT: scenario_result cleanup failed')
}
```

> 保持 `clearScenarioOwnedData`（删除场景路径）不变：仍调 `deleteScenarioResultJson` 全删（含 notes）。

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-service.test.ts`
Expected: PASS（含新增用例与既有 transition 用例）。

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-result-store.ts live-server/src/services/scenario/scenario-service.ts live-server/src/__tests__/services/scenario/scenario-service.test.ts
git commit -m "fix(scenario): remove-result clears scenario_result except notes; scenario delete clears all"
```

---

### Task 3: Backend `/api/scenario/:id/notes` 路由

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts`（新增 notes 路由块）
- Test: `live-server/src/__tests__/unit/scenario-notes-route.test.ts`（新）

**Interfaces:**
- Consumes: Task 1 的 `getNotes/addNote/patchNote/deleteNote/clearNotes`；现有 `success/fail/error`（`../../utils/response.js`）、`getAuthUsername`（scenario.ts 已用）。
- Produces: HTTP 接口 `GET/POST /:id/notes`、`PATCH/DELETE /:id/notes/:messageId`、`DELETE /:id/notes`。gantt `scenario-api.ts`（Task 4）依赖这些 URL 与响应形状 `{ items }` / `{ item }` / `{ ok: true }`。

- [ ] **Step 1: Write the failing test**

Create `live-server/src/__tests__/unit/scenario-notes-route.test.ts`（沿用 `scenario-publish-roster-route.test.ts` 的 mock 集合，另加 note-store mock；这是能加载 scenario.ts 的已知最小 mock 集）：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../../services/scenario/scenario-note-store.js', () => ({
  getNotes: vi.fn(async () => []),
  addNote: vi.fn(async (_f, _id, input) => ({
    id: 'n_new1', author: input.author, text: input.text, at: '2026-08-07T00:00:00Z', editedAt: null, replyTo: input.replyTo ?? null,
  })),
  patchNote: vi.fn(async () => ({ id: 'n_a', author: 'admin', text: 'edited', at: '2026-08-07T00:00:00Z', editedAt: '2026-08-07T01:00:00Z', replyTo: null })),
  deleteNote: vi.fn(async () => undefined),
  clearNotes: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    create: vi.fn(async () => ({ id: 901, status: 'DRAFT' })),
    getById: vi.fn(async () => null),
    update: vi.fn(async () => ({ id: 901, status: 'DRAFT' })),
    duplicate: vi.fn(async () => ({ id: 902, status: 'DRAFT' })),
    transition: vi.fn(async () => ({ id: 901, status: 'PUBLISHED' })),
    remove: vi.fn(async () => undefined),
  },
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: { getByParentCode: vi.fn(async () => []) },
}))

vi.mock('../../services/manday/manday-tool.js', () => ({
  recompute: vi.fn(async () => undefined),
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'
import {
  addNote, clearNotes, deleteNote, getNotes, patchNote,
} from '../../services/scenario/scenario-note-store.js'

const app = Fastify()
beforeEach(async () => {
  vi.clearAllMocks()
  await app.register(scenarioRoutes)
  await app.ready()
})

describe('scenario notes routes', () => {
  it('GET /:id/notes returns { items }', async () => {
    vi.mocked(getNotes).mockResolvedValue([{ id: 'n_a', author: 'admin', text: 'q', at: 't', editedAt: null, replyTo: null }])
    const res = await app.inject({ method: 'GET', url: '/7/notes' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.items).toHaveLength(1)
  })

  it('POST /:id/notes validates body and returns { item }', async () => {
    const res = await app.inject({ method: 'POST', url: '/7/notes', payload: { text: 'hello', author: 'admin', replyTo: null } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.item.text).toBe('hello')
  })

  it('POST /:id/notes rejects empty author with 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/7/notes', payload: { text: 'hello', author: '' } })
    expect(res.statusCode).toBe(400)
  })

  it('PATCH /:id/notes/:messageId updates text', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/7/notes/n_a', payload: { text: 'edited' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.item.editedAt).not.toBeNull()
  })

  it('DELETE /:id/notes/:messageId returns { ok: true }', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/7/notes/n_a' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.ok).toBe(true)
  })

  it('DELETE /:id/notes clears all', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/7/notes' })
    expect(res.statusCode).toBe(200)
    expect(clearNotes).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/unit/scenario-notes-route.test.ts`
Expected: FAIL — 404（notes 路由未注册）。

- [ ] **Step 3: Implement routes**

在 `live-server/src/routes/scenario/scenario.ts`：

(a) 顶部 import 增加（在现有 import 区，第 20 行 `scenarioVersionService` 之后）：

```ts
import {
  addNote as addScenarioNote,
  clearNotes as clearScenarioNotes,
  deleteNote as deleteScenarioNote,
  getNotes as getScenarioNotes,
  patchNote as patchScenarioNote,
} from '../../services/scenario/scenario-note-store.js'
```

(b) 在版本相关路由块之后（`/:id/versions/:version/diff` 路由结束之后），新增：

```ts
// ── Scenario Notes ───────────────────────────────────────────────────────────
const noteCreateSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  author: z.string().trim().min(1).max(60),
  replyTo: z.string().nullable().optional(),
})
const notePatchSchema = z.object({
  text: z.string().trim().min(1).max(5000),
})

// GET /api/scenario/:id/notes — list notes for a scenario
fastify.get('/:id/notes', async (request, reply) => {
  const { id } = request.params as { id: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
  try {
    const items = await getScenarioNotes(fastify, numId)
    return success(reply, { items })
  } catch (err) {
    return error(reply, 500, (err as Error).message)
  }
})

// POST /api/scenario/:id/notes — add a question / reply
fastify.post('/:id/notes', async (request, reply) => {
  const { id } = request.params as { id: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
  const parsed = noteCreateSchema.safeParse(request.body)
  if (!parsed.success) return fail(reply, 400, parsed.error.message)
  try {
    const item = await addScenarioNote(fastify, numId, parsed.data, getAuthUsername(request))
    return success(reply, { item })
  } catch (err) {
    return error(reply, 500, (err as Error).message)
  }
})

// PATCH /api/scenario/:id/notes/:messageId — edit a message (author preserved)
fastify.patch('/:id/notes/:messageId', async (request, reply) => {
  const { id, messageId } = request.params as { id: string; messageId: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
  const parsed = notePatchSchema.safeParse(request.body)
  if (!parsed.success) return fail(reply, 400, parsed.error.message)
  try {
    const item = await patchScenarioNote(fastify, numId, messageId, parsed.data.text)
    return success(reply, { item })
  } catch (err) {
    const msg = (err as Error).message
    return fail(reply, msg.includes('not found') ? 404 : 500, msg)
  }
})

// DELETE /api/scenario/:id/notes/:messageId — delete a message + its replies
fastify.delete('/:id/notes/:messageId', async (request, reply) => {
  const { id, messageId } = request.params as { id: string; messageId: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
  try {
    await deleteScenarioNote(fastify.pgPool, numId, messageId)
    return success(reply, { ok: true })
  } catch (err) {
    const msg = (err as Error).message
    return fail(reply, msg.includes('not found') ? 404 : 500, msg)
  }
})

// DELETE /api/scenario/:id/notes — clear all notes
fastify.delete('/:id/notes', async (request, reply) => {
  const { id } = request.params as { id: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
  try {
    await clearScenarioNotes(fastify.pgPool, numId)
    return success(reply, { ok: true })
  } catch (err) {
    return error(reply, 500, (err as Error).message)
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/unit/scenario-notes-route.test.ts`
Expected: PASS（6 tests）。

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/scenario/scenario.ts live-server/src/__tests__/unit/scenario-notes-route.test.ts
git commit -m "feat(scenario): /api/scenario/:id/notes CRUD routes"
```

---

### Task 4: gantt 类型与 scenario-api 方法

**Files:**
- Modify: `gantt/src/types/scenario.ts`、`gantt/src/types/index.ts`
- Modify: `gantt/src/services/scenario-api.ts`

**Interfaces:**
- Produces: `ScenarioNoteMessage` / `ScenarioNoteListResponse` 类型（Task 6 组件使用）；`scenarioApi.getNotes/addNote/patchNote/deleteNote/clearNotes`（Task 6 使用）。
- Consumes: Task 3 的 HTTP 接口。

- [ ] **Step 1: Add types**

在 `gantt/src/types/scenario.ts` 的 `ScenarioVersionListResponse` 附近新增：

```ts
export interface ScenarioNoteMessage {
  id: string
  author: string
  text: string
  at: string
  editedAt: string | null
  replyTo: string | null
}

export interface ScenarioNoteListResponse {
  items: ScenarioNoteMessage[]
}
```

在 `gantt/src/types/index.ts` 第 7 行 export 列表追加 `ScenarioNoteMessage, ScenarioNoteListResponse`。

- [ ] **Step 2: Add api methods**

在 `gantt/src/services/scenario-api.ts` 顶部 type import（`ScenarioVersionListResponse` 附近）加 `ScenarioNoteMessage, ScenarioNoteListResponse`，并在 `scenarioApi` 对象内、`getVersionDiff` 之后新增：

```ts
  async getNotes(id: number): Promise<ScenarioNoteListResponse> {
    return api.get(`/api/scenario/${id}/notes`) as Promise<ScenarioNoteListResponse>
  },

  async addNote(id: number, input: { text: string; author: string; replyTo?: string | null }): Promise<{ item: ScenarioNoteMessage }> {
    return api.post(`/api/scenario/${id}/notes`, input) as Promise<{ item: ScenarioNoteMessage }>
  },

  async patchNote(id: number, messageId: string, text: string): Promise<{ item: ScenarioNoteMessage }> {
    return api.patch(`/api/scenario/${id}/notes/${encodeURIComponent(messageId)}`, { text }) as Promise<{ item: ScenarioNoteMessage }>
  },

  async deleteNote(id: number, messageId: string): Promise<{ ok: true }> {
    return api.delete(`/api/scenario/${id}/notes/${encodeURIComponent(messageId)}`) as Promise<{ ok: true }>
  },

  async clearNotes(id: number): Promise<{ ok: true }> {
    return api.delete(`/api/scenario/${id}/notes`) as Promise<{ ok: true }>
  },
```

- [ ] **Step 3: Type-check gantt**

Run: `cd gantt && npx tsc --noEmit`
Expected: PASS（无新错误）。

- [ ] **Step 4: Commit**

```bash
git add gantt/src/types/scenario.ts gantt/src/types/index.ts gantt/src/services/scenario-api.ts
git commit -m "feat(scenario): gantt types + api client for scenario notes"
```

---

### Task 5: Notes Tab 挂载 + DRAFT 可见性重构

**Files:**
- Modify: `gantt/src/components/scenario/scenario-kpi-section.tsx`

**Interfaces:**
- Consumes: Task 4 类型；Task 6 的 `ScenarioNotesPanel`（本任务先加 import，Task 6 补组件文件）。
- Produces: `ResultTab` 含 `'notes'`；`RESULT_TABS` 含 Notes；DRAFT 时 rail 仅 Notes。

- [ ] **Step 1: Edit `ResultTab` type**

`gantt/src/components/scenario/scenario-kpi-section.tsx` 第 48 行改为：

```ts
type ResultTab = 'kpi' | 'credit-hours' | 'uncovered' | 'distribution' | 'versions' | 'notes'
```

- [ ] **Step 2: Add Notes to RESULT_TABS**

第 50-56 行的 `RESULT_TABS` 末尾追加：

```ts
  { id: 'notes', label: 'Notes' },
```

- [ ] **Step 3: Import ScenarioNotesPanel**

顶部 import 区（第 9 行 `useAirportTzStore` 附近）新增：

```ts
import { ScenarioNotesPanel } from './scenario-notes-panel'
```

- [ ] **Step 4: Restructure ScenarioKpiSection for DRAFT**

将 `export const ScenarioKpiSection = (...) => {` 函数体开头（第 1434-1437 行）由：

```ts
  const [activeTab, setActiveTab] = useState<ResultTab>('kpi')
  if (status === 'DRAFT') return null
  const kpiRows = results?.kpi.length ? results.kpi : kpis
```

改为：

```ts
  const [activeTab, setActiveTab] = useState<ResultTab>(status === 'DRAFT' ? 'notes' : 'kpi')
  // DRAFT: only Notes is available; other result tabs stay hidden.
  const shownTabs = status === 'DRAFT' ? RESULT_TABS.filter((tab) => tab.id === 'notes') : RESULT_TABS
  const effectiveTab = shownTabs.some((tab) => tab.id === activeTab) ? activeTab : 'notes'
  const kpiRows = results?.kpi.length ? results.kpi : kpis
```

- [ ] **Step 5: Update rail + content switch**

(a) rail 的 `RESULT_TABS.map(...)`（第 1446 行）改为 `shownTabs.map(...)`；`aria-selected={activeTab === tab.id}`（第 1450 行）改为 `aria-selected={effectiveTab === tab.id}`；onClick 保持 `setActiveTab(tab.id)`。

(b) 各内容块判断由 `activeTab === '...'` 改为 `effectiveTab === '...'`（kpi/credit-hours/uncovered/distribution/versions 共 5 处，第 1465/1485/1489/1493/1497 行）。

(c) 在 `{effectiveTab === 'versions' && (...)}` 块之后新增：

```tsx
      {effectiveTab === 'notes' && (
        <ScenarioNotesPanel scenarioId={scenarioId} />
      )}
```

- [ ] **Step 6: Type-check + build**

Run: `cd gantt && npx tsc --noEmit && npm run build`
Expected: PASS（`scenario-notes-panel.tsx` 尚未创建会报模块找不到 — **见 Task 6 Step 1，本任务先跳过 tsc，直接进 Task 6 创建组件后再一起验证**）。

> 说明：为让本任务可独立验收，把 `ScenarioNotesPanel` import 与组件创建放同一验收点（Task 6 完成后 `tsc` 一起过）。若你坚持先验 Task 5，可在本任务先创建 `scenario-notes-panel.tsx` 的占位空组件再在 Task 6 填充。

- [ ] **Step 7: Commit（与 Task 6 合并提交，或先提交占位）**

建议：先创建 Task 6 组件再提交，验收点为 `npx tsc --noEmit` 通过。

---

### Task 6: ScenarioNotesPanel 组件

**Files:**
- Create: `gantt/src/components/scenario/scenario-notes-panel.tsx`

**Interfaces:**
- Consumes: Task 4 `scenarioApi` 方法与类型；`useAuthStore`（`@/stores/auth-store`，`useAuthStore.getState().user?.userCode`）；`notify`（`@/utils/notify`）；`AppDialog/Button/Input`（`@rois/ui`）；lucide-react 图标。
- Produces: `ScenarioNotesPanel({ scenarioId }: { scenarioId: number })`（Task 5 引用）。

- [ ] **Step 1: Create the component**

Create `gantt/src/components/scenario/scenario-notes-panel.tsx`:

```tsx
// gantt/src/components/scenario/scenario-notes-panel.tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Eraser, MessageSquareText, Pencil, Reply, Trash2 } from 'lucide-react'
import { AppDialog, Button, Input } from '@rois/ui'
import { scenarioApi } from '@/services/scenario-api'
import { useAuthStore } from '@/stores/auth-store'
import { notify } from '@/utils/notify'
import type { ScenarioNoteMessage } from '@/types'

interface ScenarioNotesPanelProps {
  scenarioId: number
}

interface NoteNode {
  message: ScenarioNoteMessage
  children: NoteNode[]
}

const formatDate = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA', { month: 'short', day: '2-digit' })
}

const buildTree = (messages: ScenarioNoteMessage[]): NoteNode[] => {
  const nodes = new Map<string, NoteNode>()
  for (const message of messages) nodes.set(message.id, { message, children: [] })
  const roots: NoteNode[] = []
  for (const node of nodes.values()) {
    const parent = node.message.replyTo ? nodes.get(node.message.replyTo) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  roots.sort((a, b) => b.message.at.localeCompare(a.message.at))
  return roots
}

export const ScenarioNotesPanel = ({ scenarioId }: ScenarioNotesPanelProps): ReactNode => {
  const [messages, setMessages] = useState<ScenarioNoteMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [author, setAuthor] = useState(() => useAuthStore.getState().user?.userCode ?? '')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ScenarioNoteMessage | null>(null)
  const [clearOpen, setClearOpen] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await scenarioApi.getNotes(scenarioId)
      setMessages(response.items)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [scenarioId])

  const canPost = draft.trim() !== '' && author.trim() !== ''

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    try {
      await action()
      return true
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Action failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  const post = async (): Promise<void> => {
    if (!canPost) return
    const ok = await run(async () => {
      const response = await scenarioApi.addNote(scenarioId, { text: draft.trim(), author: author.trim(), replyTo })
      setMessages((prev) => [...prev, response.item])
    })
    if (ok) {
      setDraft('')
      setReplyTo(null)
      notify.success('Question posted')
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    const ok = await run(async () => {
      await scenarioApi.deleteNote(scenarioId, deleteTarget.id)
      setMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id))
    })
    if (ok) {
      setDeleteTarget(null)
      notify.success('Message deleted')
    }
  }

  const confirmClear = async (): Promise<void> => {
    const ok = await run(async () => {
      await scenarioApi.clearNotes(scenarioId)
      setMessages([])
    })
    if (ok) {
      setClearOpen(false)
      notify.success('All notes cleared')
    }
  }

  const roots = useMemo(() => buildTree(messages), [messages])
  const openCount = roots.filter((root) => root.children.length === 0).length

  if (loading) return <div className="text-xs text-muted-foreground">Loading notes…</div>

  return (
    <div className="space-y-3" data-testid="scenario-notes-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
          Notes
        </div>
        {openCount > 0 && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary" data-testid="scenario-notes-open-count">
            {openCount} open
          </span>
        )}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setClearOpen(true)}
            data-testid="scenario-notes-clear"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear messages
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span>
              Replying to{' '}
              <span className="font-semibold text-foreground">
                {messages.find((m) => m.id === replyTo)?.author ?? 'message'}
              </span>
            </span>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </div>
        )}
        <textarea
          className="min-h-[64px] w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={replyTo ? 'Write a reply…' : 'Ask a question…'}
          data-testid="scenario-notes-composer-text"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="Your name"
            className="h-7 w-40 text-xs"
            disabled={busy}
            data-testid="scenario-notes-composer-author"
          />
          <Button size="sm" className="h-7 px-3 text-xs" disabled={busy || !canPost} onClick={() => { void post() }} data-testid="scenario-notes-post">
            {busy ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground" data-testid="scenario-notes-empty">
          No questions yet.
        </div>
      ) : (
        <div className="space-y-2">
          {roots.map((root) => (
            <NoteCard
              key={root.message.id}
              scenarioId={scenarioId}
              node={root}
              depth={0}
              onReply={setReplyTo}
              onDeleteRequest={setDeleteTarget}
              onPatched={(updated) => setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))}
            />
          ))}
        </div>
      )}

      <AppDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !busy) setDeleteTarget(null) }}
        title="Delete Message"
        icon={<Trash2 className="h-4 w-4" />}
        description="Delete this message and all its replies? This cannot be undone."
        dismissable={!busy}
        data-testid="scenario-notes-delete-dialog"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => { void confirmDelete() }}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      />

      <AppDialog
        open={clearOpen}
        onOpenChange={(open) => { if (!open && !busy) setClearOpen(open) }}
        title="Clear All Notes"
        icon={<Eraser className="h-4 w-4" />}
        description="Delete every message in this scenario's Notes? This cannot be undone."
        dismissable={!busy}
        data-testid="scenario-notes-clear-dialog"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setClearOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => { void confirmClear() }}>
              {busy ? 'Clearing…' : 'Clear All'}
            </Button>
          </>
        }
      />
    </div>
  )
}

interface NoteCardProps {
  scenarioId: number
  node: NoteNode
  depth: number
  onReply: (id: string) => void
  onDeleteRequest: (message: ScenarioNoteMessage) => void
  onPatched: (message: ScenarioNoteMessage) => void
}

const NoteCard = ({ scenarioId, node, depth, onReply, onDeleteRequest, onPatched }: NoteCardProps): ReactNode => {
  const { message, children } = node
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.text)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (editing) setEditText(message.text)
  }, [editing, message.text])

  const saveEdit = async (): Promise<void> => {
    if (!editText.trim()) return
    setBusy(true)
    try {
      const response = await scenarioApi.patchNote(scenarioId, message.id, editText.trim())
      onPatched(response.item)
      setEditing(false)
      notify.success('Message updated')
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={depth > 0 ? 'ml-6 border-l border-border pl-3' : ''}
      data-testid={depth === 0 ? 'scenario-note-root' : 'scenario-note-reply'}
      data-message-id={message.id}
    >
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={depth === 0 ? 'rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary' : 'rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground'}>
            {depth === 0 ? 'Q' : 'A'}
          </span>
          <span className="text-2xs text-muted-foreground">
            {message.author.trim() || 'unknown'}
            {message.at ? ` · ${formatDate(message.at)}` : ''}
            {message.editedAt ? ' · edited' : ''}
          </span>
          {depth === 0 && children.length === 0 && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-2xs font-semibold text-amber-600">unanswered</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground" title="Reply" onClick={() => onReply(message.id)} data-testid="scenario-note-reply-btn">
              <Reply className="h-3 w-3" />
            </button>
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground" title="Edit" onClick={() => setEditing((v) => !v)} data-testid="scenario-note-edit-btn">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-destructive" title="Delete" onClick={() => onDeleteRequest(message)} data-testid="scenario-note-delete-btn">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="min-h-[56px] w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none"
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              data-testid="scenario-note-edit-text"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="h-7 px-2 text-xs" disabled={busy || !editText.trim()} onClick={() => { void saveEdit() }} data-testid="scenario-note-edit-save">
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 break-words text-xs text-foreground">{message.text}</p>
        )}
      </div>
      {children.map((child) => (
        <NoteCard
          key={child.message.id}
          scenarioId={scenarioId}
          node={child}
          depth={depth + 1}
          onReply={onReply}
          onDeleteRequest={onDeleteRequest}
          onPatched={onPatched}
        />
      ))}
    </div>
  )
}
```

> 注：`className` 中的 `min-h-[64px]` / `min-h-[56px]` 是高度值，不在 check:ui 扫描的「魔法字号/圆角/字体」硬违规内；若被扫描为间距 WARN 属可豁免项。也可用 `min-h-16`（64px）/ `min-h-14`（56px）替代以零告警。

- [ ] **Step 2: Type-check + build**

Run: `cd gantt && npx tsc --noEmit && npm run build`
Expected: PASS（Task 5 的 import 现在解析到真实组件）。

- [ ] **Step 3: Commit（含 Task 5 改动）**

```bash
git add gantt/src/components/scenario/scenario-kpi-section.tsx gantt/src/components/scenario/scenario-notes-panel.tsx
git commit -m "feat(scenario): Notes tab + threaded notes panel (Q/A cards, edit, delete, clear, open count)"
```

---

### Task 7: gantt Playwright e2e

**Files:**
- Create: `e2e/tests/gantt/scenario/scenario-notes.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 HTTP 接口、Task 5/6 的 data-testid。
- 前置：live-server 运行（`SCENARIO_GANTT_SOURCE=db`）、远端 F8 库、gantt dev（5173）。复用 e2e 通用配置（`auth.setup.ts` 或本文件内 API 登录）。

- [ ] **Step 1: Write the spec**

Create `e2e/tests/gantt/scenario/scenario-notes.spec.ts`:

```ts
/**
 * Scenario Notes tab — Q/A threaded messages stored in scenario_result.
 *
 * Runs against a scratch DRAFT scenario created by duplicating #595 (reliably
 * available on the remote live-server DB, same source scenario as the
 * nav-dropdown test), so CRUD leaves no residue on shared scenarios; the
 * duplicate is deleted in afterEach (which also drops its notes).
 *
 * Requires: live-server (SCENARIO_GANTT_SOURCE=db).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SOURCE_SCENARIO_ID = 595

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: GANTT_USER, password: GANTT_PASS } })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: Auth }).data
}

const authHeaders = (auth: Auth): Record<string, string> => ({ Authorization: `Bearer ${auth.token}` })

const duplicateScenario = async (request: APIRequestContext, auth: Auth, sourceId: number): Promise<number> => {
  const res = await request.post(`${GANTT_API}/api/scenario/${sourceId}/duplicate`, { headers: authHeaders(auth) })
  expect(res.ok(), `duplicate failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: { id: number } }).data.id
}

const deleteScenario = async (request: APIRequestContext, auth: Auth, id: number): Promise<void> => {
  await request.delete(`${GANTT_API}/api/scenario/${id}`, { headers: authHeaders(auth) })
}

const clearNotes = async (request: APIRequestContext, auth: Auth, id: number): Promise<void> => {
  await request.delete(`${GANTT_API}/api/scenario/${id}/notes`, { headers: authHeaders(auth) })
}

const seedAuth = (page: Page, auth: Auth): void => {
  void page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
  }, auth)
}

async function openScenarioById(page: Page, id: number): Promise<void> {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-nav-list').click()
  await page.getByPlaceholder('Search scenarios…').fill(String(id))
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(`#${id}`, { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
  await expect(page.getByTestId('scenario-detail-panel')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('scenario-result-tab-notes')).toBeVisible({ timeout: 15_000 })
}

test.describe('Scenario Notes tab', () => {
  let scratchId = 0

  test.beforeEach(async ({ request }) => {
    const auth = await login(request)
    scratchId = await duplicateScenario(request, auth, SOURCE_SCENARIO_ID)
    await clearNotes(request, auth, scratchId)
  })

  test.afterEach(async ({ request }) => {
    const auth = await login(request)
    if (scratchId) await deleteScenario(request, auth, scratchId)
  })

  test('Scen-Notes-1 — DRAFT scenario shows only Notes tab; composer prefills userCode; post works', async ({ page, request }) => {
    const auth = await login(request)
    seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await expect(page.getByTestId('scenario-result-tab-kpi')).toHaveCount(0)
    await expect(page.getByTestId('scenario-result-tab-versions')).toHaveCount(0)

    await expect(page.getByTestId('scenario-notes-composer-author')).toHaveValue(auth.userCode)

    await page.getByTestId('scenario-notes-composer-text').fill('Is YVR coverage sufficient?')
    await page.getByTestId('scenario-notes-post').click()

    await expect(page.getByTestId('scenario-note-root')).toContainText('Is YVR coverage sufficient?')
    await expect(page.getByTestId('scenario-note-root')).toContainText(auth.userCode)
    await expect(page.getByTestId('scenario-notes-empty')).toHaveCount(0)
    await expect(page.getByTestId('scenario-notes-open-count')).toBeVisible()
  })

  test('Scen-Notes-2 — reply nests under the question', async ({ page, request }) => {
    const auth = await login(request)
    seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Question one')
    await page.getByTestId('scenario-notes-post').click()
    const root = page.getByTestId('scenario-note-root')
    await expect(root).toContainText('Question one')
    await expect(root.getByTestId('scenario-note-reply')).toHaveCount(0)

    await root.getByTestId('scenario-note-reply-btn').click()
    await page.getByTestId('scenario-notes-composer-text').fill('Reply one')
    await page.getByTestId('scenario-notes-post').click()

    await expect(root.getByTestId('scenario-note-reply')).toContainText('Reply one')
  })

  test('Scen-Notes-3 — edit updates text and preserves author', async ({ page, request }) => {
    const auth = await login(request)
    seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Original text')
    await page.getByTestId('scenario-notes-post').click()
    const root = page.getByTestId('scenario-note-root')
    await expect(root).toContainText('Original text')

    await root.getByTestId('scenario-note-edit-btn').click()
    await page.getByTestId('scenario-note-edit-text').fill('Edited text')
    await page.getByTestId('scenario-note-edit-save').click()

    await expect(root).toContainText('Edited text')
    await expect(root).toContainText('edited')
    await expect(root).toContainText(auth.userCode)
  })

  test('Scen-Notes-4 — delete a single message with confirm', async ({ page, request }) => {
    const auth = await login(request)
    seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('To delete')
    await page.getByTestId('scenario-notes-post').click()
    const root = page.getByTestId('scenario-note-root')
    await expect(root).toContainText('To delete')

    await root.getByTestId('scenario-note-delete-btn').click()
    await expect(page.getByTestId('scenario-notes-delete-dialog')).toBeVisible()
    await page.getByTestId('scenario-notes-delete-dialog').getByRole('button', { name: 'Delete' }).click()

    await expect(root).toHaveCount(0)
    await expect(page.getByTestId('scenario-notes-empty')).toBeVisible()
  })

  test('Scen-Notes-5 — clear all messages with confirm', async ({ page, request }) => {
    const auth = await login(request)
    seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Message A')
    await page.getByTestId('scenario-notes-post').click()
    await page.getByTestId('scenario-notes-composer-text').fill('Message B')
    await page.getByTestId('scenario-notes-post').click()
    await expect(page.getByTestId('scenario-note-root')).toHaveCount(2)

    await page.getByTestId('scenario-notes-clear').click()
    await expect(page.getByTestId('scenario-notes-clear-dialog')).toBeVisible()
    await page.getByTestId('scenario-notes-clear-dialog').getByRole('button', { name: 'Clear All' }).click()

    await expect(page.getByTestId('scenario-note-root')).toHaveCount(0)
    await expect(page.getByTestId('scenario-notes-empty')).toBeVisible()
  })

  test('Scen-Notes-6 — notes persist across reload', async ({ page, request }) => {
    const auth = await login(request)
    seedAuth(page, auth)
    await openScenarioById(page, scratchId)

    await page.getByTestId('scenario-notes-composer-text').fill('Persisted question')
    await page.getByTestId('scenario-notes-post').click()
    await expect(page.getByTestId('scenario-note-root')).toContainText('Persisted question')

    await page.reload()
    await openScenarioById(page, scratchId)
    await expect(page.getByTestId('scenario-note-root')).toContainText('Persisted question')
  })

  test('Scen-Notes-7 — non-DRAFT scenario shows Notes among the full tab rail', async ({ page, request }) => {
    const auth = await login(request)
    seedAuth(page, auth)
    await openScenarioById(page, SOURCE_SCENARIO_ID)

    await expect(page.getByTestId('scenario-result-tab-kpi')).toBeVisible()
    await expect(page.getByTestId('scenario-result-tab-versions')).toBeVisible()
    await expect(page.getByTestId('scenario-result-tab-notes')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the e2e**

前置：live-server + gantt dev 已在本机运行（或按项目 e2e 脚本启动）。
Run: `npx playwright test e2e/tests/gantt/scenario/scenario-notes.spec.ts --reporter=list`
Expected: PASS（7 tests）。

- [ ] **Step 3: Fix failures if any**

若红，按 §systematic-debugging 排查。常见点：
- `scenario-note-root` 严格模式（多条根）冲突 → 用 `.first()`。
- `toHaveValue(auth.userCode)` 时 Input 受控但初始值在 mount 后异步渲染 → 断言前 `expect(...).toHaveValue` 已自动重试，一般无需等待。
- 删除确认按钮 name `Delete` 可能命中 dialog footer 的其它按钮 → 用 dialog 容器 `getByRole('button', { name: 'Delete', exact: true })`。

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/scenario/scenario-notes.spec.ts
git commit -m "test(gantt): Scenario Notes tab e2e (post/reply/edit/delete/clear/persist/draft)"
```

---

### Task 8: 收尾门禁

**Files:** 无新增（仅验证/文档）。

- [ ] **Step 1: Run backend + route unit tests**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-note-store.test.ts src/__tests__/services/scenario/scenario-service.test.ts src/__tests__/unit/scenario-notes-route.test.ts`
Expected: PASS。

- [ ] **Step 2: Run UI style gate**

Run: `npm run check:ui`
Expected: 硬违规 0（`text-[Npx]`、超档字重、`rounded-[Npx]`、`font-[...]` 无新增）。

- [ ] **Step 3: Run gantt typecheck + build**

Run: `cd gantt && npx tsc --noEmit && npm run build`
Expected: PASS。

- [ ] **Step 4: Re-run full e2e once**

Run: `npx playwright test e2e/tests/gantt/scenario/scenario-notes.spec.ts --reporter=list`
Expected: PASS — 贴出 PASS 收据（§No-Illusion）。

- [ ] **Step 5: 更新 Help 文档（如需）**

参考 `gantt/src/components/help/topics/scenario/` 现有 topic（如 `scenario-kpi.tsx`），若 Notes Tab 属于「KPI 区 Tab」范畴且 Help 需同步，按 `help-data.ts` stepCount/overview 同步规则更新。**若 Help 明确不覆盖该 Tab，跳过并在 PR 说明。**

- [ ] **Step 6: 运行 `git status` 确认改动范围，最终 commit（如有遗漏）**

Run: `git status`
Expected: 改动仅限 Task 1-7 涉及文件 + submodule 漂移（`pbs-engine`/`rule-engine-rs`/`pbs-optimization-report` 为独立 submodule，不在本 feature diff 内）。如有遗漏文件一并提交。

---

## Self-Review

- **Spec 覆盖**：
  - §2.1 Tab 位置 → Task 5（RESULT_TABS 追加 Notes）
  - §2.2 线程式回复 → Task 1 `replyTo` 模型 + Task 6 树渲染
  - §2.3 Your Name 带入 UserCode 可改 → Task 6（`useAuthStore.getState().user?.userCode` + Input 可编辑）
  - §2.4 编辑保留原作者 → Task 1 `patchNote` 保留 author + Task 6 行内编辑
  - §2.5 单条删除 / 清除全部 → Task 1 `deleteNote`(级联)/`clearNotes` + Task 6 两个 AppDialog
  - §2.6 存 scenario_result → Task 1（`type='notes'` 单行 + 原子追加）
  - §2.7 清理语义 → Task 2（transition 清非 notes；删场景全删保持不动）
  - §2.8 DRAFT 可见 → Task 5（`shownTabs`/`effectiveTab`）
  - §2.9 open 徽章 → Task 6（`openCount` chip）
  - §7 测试 → Task 1/2/3 Vitest + Task 7 Playwright
- **占位符扫描**：无 TBD/TODO；每个代码步骤含完整代码。
- **类型一致性**：`ScenarioNoteMessage` 字段名在 store（Task 1）、route（Task 3 测试 mock）、gantt types（Task 4）、组件（Task 6）四处一致（`id/author/text/at/editedAt/replyTo`）；`addNote(fastify, id, input, username?)` 签名在 route 调用与 store 定义一致；`deleteNote(pool, id, messageId)` 签名在 route（传 `fastify.pgPool`）与 store 一致。
