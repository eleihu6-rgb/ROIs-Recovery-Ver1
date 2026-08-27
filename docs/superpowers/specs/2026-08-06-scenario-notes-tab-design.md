# Scenario Notes Tab 设计（2026-08-06）

> 状态：已确认设计。实施计划见同目录 plans（由 writing-plans 产出）。

## 1. 背景与目标

Scenario 详情面板底部有一组结果 Tab（KPI / Credit Hours / Uncovered / Distribution / Versions）。
业务需要一个 **Notes（留言/问答）Tab**，排在 Versions 右侧，用于：

- 用户针对某个场景**提出问题**；
- **实施人员**看到问题后**回复**（也可由实施人员发起问题、用户回复）；
- 记录随场景长期保留，即使场景结果被清理也不丢失。

UI 形态参考 report 项目 `/home/rois/Flair_PBS_Optimization_Report/src/frontend/src/unittest/NotesPanel.tsx`
（Q/A 卡片式问答系统）+ 后端 `src/server/app/unittest_notes.py`。本设计在 gantt + live-server 中落地同款交互，
但存储改用 `scenario_result` 表（用户明确要求），且本系统有登录态（Your name 可带入 UserCode）。

## 2. 需求（用户已确认）

1. 在 Scenario 详情底部 Tab rail 中，**Versions 右侧新增 Notes Tab**。
2. **线程式回复**：消息可回复特定上一条，回复嵌套显示在被回复消息下方（评论/问答形态）。
3. 提交问题时有一个 **Your Name** 输入框：默认自动带入当前登录用户 `UserCode`，**可自行修改**。
4. 每条消息支持**编辑**（保留原作者）。
5. 每条消息支持**单条删除**；面板提供**清除消息（Clear all）**按钮。
6. 数据存入 `scenario_result` 表（`type='notes'`，单行 json = 消息数组）。
7. **清理语义**：
   - 「Remove Optimization Result」（terminal → DRAFT）清结果数据时，**保留 Notes**；
   - **删除场景**时，按 scenario_id 全删 `scenario_result`（**连 Notes 一起删**，不保留）。
8. Notes Tab 在 **DRAFT 状态也可见**（当前整块 KPI 区域在 DRAFT 时整体隐藏，需改造为仅 Notes 可用）。
9. 显示未回复问题数（open count）徽章。

## 3. 参考实现要点（report NotesPanel）

- Composer 常驻顶部：「Ask a question…」textarea + 「Your name」输入 + Post 按钮；text 与 name 都非空才可提交（`canPost`）。
- 卡片：`Q` 标签 + byline（author · date · edited）+ 编辑 ✎ + 删除 ×；`A` 标签嵌套在问题下方；未回答显示 `unanswered` + Answer 按钮。
- 名字是 **display label 而非凭证**（report 无登录）；答案的作者默认空白（作答者通常是另一人）；**编辑保留原作者**。
- 新问题 **newest-first**；删除走确认弹窗「删除该问题及其答案？」。
- 未读/seen 状态：report 用 per-browser hash；本系统不需要（有登录 + 直接展示），**不做 seen 机制**。

## 4. 数据模型

`scenario_result` 表新增一行 `type='notes'`，`json` 为消息数组（**线程式，支持任意深度**）：

```json
[
  {
    "id": "n_3fa8c2d1",
    "author": "admin",
    "text": "为什么 YVR 基地 5 号 coverage 不足？",
    "at": "2026-08-06T03:10:00Z",
    "editedAt": null,
    "replyTo": null
  },
  {
    "id": "n_9b21e7aa",
    "author": "implementation",
    "text": "YVR 5 号当天 Base 缺 1 人，已调整 crew filter。",
    "at": "2026-08-06T04:02:00Z",
    "editedAt": null,
    "replyTo": "n_3fa8c2d1"
  }
]
```

- `id`：服务端生成 `n_<8hex>`（uuid 前缀，仿 report `c_<8hex>`）。
- `author`：客户端提交的 display label（默认 UserCode，可改）；**后端不校验、不强制等于 JWT**。
- `replyTo`：父消息 id，`null` = 根问题（根即「提问」，回复即「解答/追问」）。
- `at` / `editedAt`：ISO 时间；`editedAt` 在编辑时置为当前时间。
- **存储顺序**：追加（chronological）；**展示顺序由前端构建树决定**（根消息 newest-first，回复 chronological）。

约束：沿用 `uq_scenario_result_type (scenario_id, type)`，一个 scenario 只有一行 `notes`。

## 5. 后端设计（live-server）

### 5.1 新服务 `src/services/scenario/scenario-note-store.ts`

复用 `scenario-result-store.ts` 导出的 `ensureScenarioResultTable`（建表/索引幂等）。所有函数签名与现有
store 保持一致（`fastify` / `pool` 注入，便于单测）。

| 函数 | 行为 |
|---|---|
| `getNotes(fastify, scenarioId)` | 读 `type='notes'` 行，返回消息数组（不存在则 `[]`） |
| `addNote(fastify, scenarioId, {text, author, replyTo})` | **原子追加**（见下），返回新消息 |
| `patchNote(fastify, scenarioId, messageId, {text})` | 读改写：按 id 找到消息，更新 `text` + `editedAt`，**保留 `author`**；空 text 拒绝 |
| `deleteNote(pool, scenarioId, messageId)` | 读改写：删除该消息 + **所有后代**（级联，沿 `replyTo` 递归收集） |
| `clearNotes(pool, scenarioId)` | `DELETE FROM scenario_result WHERE scenario_id=$1 AND type='notes'` |

`addNote` 原子追加（避免读改写竞态）：

```sql
INSERT INTO scenario_result (scenario_id, type, json, created_by, updated_by)
VALUES ($1, 'notes', jsonb_build_array($2::jsonb), $3, $3)
ON CONFLICT (scenario_id, type) DO UPDATE SET
  json = scenario_result.json || excluded.json,
  updated_by = excluded.updated_by,
  updated_at = now()
```

`patchNote` / `deleteNote` 使用**读改写**（notes 编辑/删除低频，可接受；实现简单可测）。
写后按现有缓存纪律处理（见 §5.3）。

### 5.2 新路由（`src/routes/scenario/scenario.ts`，挂在 `/:id/notes` 下）

| Method | Path | Body | 响应 |
|---|---|---|---|
| GET | `/:id/notes` | — | `{ items: ScenarioNoteMessage[] }` |
| POST | `/:id/notes` | `{ text, author, replyTo? }` | `{ item }` |
| PATCH | `/:id/notes/:messageId` | `{ text }` | `{ item }` |
| DELETE | `/:id/notes/:messageId` | — | `{ ok: true }` |
| DELETE | `/:id/notes` | — | `{ ok: true }` |

- 校验用 Zod（text 非空、author 非空、replyTo 为 null/字符串）。
- 写入的 `created_by` / `updated_by` 用 `getAuthUsername(request)`（现有工具）。
- 全部走现有 JWT 认证钩子；**登录用户即可读写删**（内网工具，权限最简）。
- 404：messageId 不存在时返回 404。

### 5.3 缓存

- **Notes 不设 Redis 缓存**：数据量小、低频读写、协作流要求读到最新，直接读 DB。
  不为场景结果加缓存 key 的耦合。§Minimal-First：不为无人要求的基础设施预埋。
- 现有 `upsertScenarioResultJson` 会 invalidate `scenario:result:<id>`；notes 写入不经过它，
  因此**不会**污染结果缓存。独立路径，互不干扰。

### 5.4 清理语义（本轮唯一后端改动）

现状：`transition()` → DRAFT（Remove Result）只清分区表（`roster_flight`/`crew_manday_*`/
`rule_violation`/`legality_status`），**不碰 `scenario_result`**；`scenario_result` 只在
`clearScenarioOwnedData`（删除场景）里全删。

改造：

1. **新增** `deleteScenarioResultExceptNotes(pool, scenarioId)`：
   `DELETE FROM scenario_result WHERE scenario_id=$1 AND type <> 'notes'`
   （放 `scenario-result-store.ts`，与 `deleteScenarioResultJson` 并列）。
2. **transition → DRAFT** 的 `clearingResult` 块末尾补调该函数 → Remove Result 清掉旧
   kpi/credit_hours/distribution/raw_result，**保留 notes**。
3. **删除场景** `clearScenarioOwnedData` 不变：仍调 `deleteScenarioResultJson`（全删，含 notes）。

> 这样满足：清结果 → 结果清、Notes 留；删场景 → 全清。

## 6. 前端设计（gantt）

### 6.1 类型与 API

- `gantt/src/types/scenario.ts`：新增
  `ScenarioNoteMessage { id: string; author: string; text: string; at: string; editedAt: string | null; replyTo: string | null }`
  及响应类型，并在 `types/index.ts` 导出。
- `gantt/src/services/scenario-api.ts`：新增
  `getNotes(id)` / `addNote(id, {text, author, replyTo})` / `patchNote(id, messageId, {text})` /
  `deleteNote(id, messageId)` / `clearNotes(id)`。

### 6.2 Tab 挂载（`scenario-kpi-section.tsx`）

- `ResultTab` 增加 `'notes'`；`RESULT_TABS` 在 Versions 后追加 `{ id: 'notes', label: 'Notes' }`。
- **DRAFT 可见性重构**（当前 `if (status === 'DRAFT') return null`）：
  - 移除该提前 return；
  - `shownTabs = status === 'DRAFT' ? RESULT_TABS.filter(t => t.id === 'notes') : RESULT_TABS`；
  - `effectiveTab = shownTabs.some(t => t.id === activeTab) ? activeTab : 'notes'`；
  - rail 渲染 `shownTabs`，内容按 `effectiveTab` 分发。
  - 结果类面板（kpi/credit/uncovered/distribution/versions）在 DRAFT 时不在 rail 中出现，天然不可达。
- DRAFT 时 rail 仅有 Notes 一个 tab；非 DRAFT 时全量照旧。

### 6.3 新组件 `gantt/src/components/scenario/scenario-notes-panel.tsx`

`ScenarioNotesPanel({ scenarioId })`，仅在 Notes tab 激活时挂载（仿 `ScenarioVersionsPanel`，
懒加载，不拖慢首屏）。

布局（自上而下）：

1. **头部**：`Notes` 标题 + open 数徽章（未回复根问题数，仿参考 "N open" chip）
   + 右侧 **Clear messages** 按钮（AppDialog 确认后调 `clearNotes`）。
2. **Composer**（常驻顶部）：
   - textarea placeholder `Ask a question…`（根问题）；
   - `Your name` Input：初始值 `useAuthStore.getState().user?.userCode ?? ''`，**可编辑**；
   - Post 按钮：text 与 author 均非空才可点（仿 `canPost`）。
   - 回复状态时 Composer 变为「Reply to <author>」（带取消按钮），Post 文本同规则。
3. **消息线程**：前端按 `replyTo` 构建树：
   - 根消息渲染为卡片（`Q` 标签 + byline `author · date · edited` + Reply / Edit / Delete）；
   - 回复消息嵌套渲染（`A` 标签 + 缩进 + 同样三操作），支持多级（深度用递进缩进）；
   - 未回复根问题显示 `unanswered` chip。
4. **编辑**：点击 Edit → **行内 textarea + Save/Cancel**（仿参考 `BlockEditor`，不另开弹窗），保存调 `patchNote`（**后端保留 author**）。
5. **删除**：点击 Delete → AppDialog 确认「Delete this message and its replies?」→ 调 `deleteNote`（后端级联）。
6. **空态**：无消息时 `No questions yet.`（仿参考）。

交互约束：
- 提交/编辑/删除/清空时禁用对应按钮（busy 态），失败 `notify.error`，成功 `notify.success`。
- 所有弹窗用 `@rois/ui` `AppDialog`（弹窗标准强制执行）。
- 样式 token 驱动（`text-2xs/xs`、`font-mono tabular-nums`、`flex items-center gap-1.5/2`），
  无魔法值；跑 `npm run check:ui`。
- 无实时推送：另一用户发消息后本端刷新/重开 tab 可见（不在本轮范围）。

### 6.4 单条删除 / 清除全部的数据流

- 单条删除：`deleteNote` → 后端级联删子树 → 前端本地移除 → `notify.success`。
- 清除全部：`clearNotes` → 后端删 `type='notes'` 行 → 前端清空列表 → 空态。

## 7. 测试

### 7.1 live-server Vitest（`src/__tests__/services/scenario/scenario-note-store.test.ts`）

- `addNote`：行不存在时 INSERT；已存在时原子追加（并发追加不丢消息）；replyTo 写入正确。
- `patchNote`：改 text + 置 editedAt；**保留 author**；空 text 拒绝。
- `deleteNote`：删除单条；**级联删除后代**；messageId 不存在报错。
- `clearNotes`：清空该场景 notes 行。
- `deleteScenarioResultExceptNotes`：清非 notes 类型、**保留 notes**。
- 集成：`transition→DRAFT` 后 `scenario_result` 中 notes 仍在、非 notes 已清；
  `clearScenarioOwnedData` 后 `scenario_result` 全部删除。

### 7.2 gantt Playwright（`e2e/tests/gantt/scenario/scenario-notes.spec.ts`）

复用现有 e2e 模式（API 登录 + sessionStorage 注入 + 打开真实场景，如 #595）：
1. 打开场景详情 → Notes tab 可见（Versions 右侧）。
2. 发问题：断言 **Your name 默认 = 当前 UserCode**；改名字后提交成功，消息出现。
3. 回复：嵌套在问题下方。
4. 编辑：文字更新、author 不变。
5. 单条删除：确认后消失。
6. 清除全部：回到空态。
7. 刷新页面 → 消息持久化。
8. 一个 DRAFT 场景：Notes tab 可见可写，其余结果 tab 不出现。

（清理语义的 DB 断言由 Vitest 覆盖；e2e 不在真实库删场景，避免污染远端数据。）

## 8. 范围与明确不做

- **不做**：实时推送 / WS；seen/未读机制；附件/富文本；@提及；按角色权限控制（登录即可）。
- **不做**：名字与 JWT 强绑定校验（author 是可改 display label，与参考一致）。
- 不改 `sql/schema/` 建表脚本：`scenario_result` 已由 `ensureScenarioResultTable` 幂等确保。

## 9. 风险与取舍

- **读改写并发**（patch/delete）：低并发场景可接受；add 已用原子追加规避主要竞态。
- **单行 json 膨胀**：消息量极大时单行变大，内网低频场景可接受；超出再考虑拆分。
- **DRAFT 重构**：改动 `ScenarioKpiSection` 的 early-return，需回归确认非 DRAFT 各 tab 不变。
- **缓存**：notes 不经现有结果缓存，避免耦合；代价是每次切 tab 读 DB（数据小，可接受）。

## 10. 文件清单（预估）

**live-server**
- `src/services/scenario/scenario-note-store.ts`（新）
- `src/services/scenario/scenario-result-store.ts`（增 `deleteScenarioResultExceptNotes`）
- `src/services/scenario/scenario-service.ts`（transition→DRAFT 补调）
- `src/routes/scenario/scenario.ts`（增 `/notes` 路由）
- `src/__tests__/services/scenario/scenario-note-store.test.ts`（新）

**gantt**
- `src/types/scenario.ts` + `src/types/index.ts`（增 Note 类型）
- `src/services/scenario-api.ts`（增 notes 方法）
- `src/components/scenario/scenario-kpi-section.tsx`（Tab + DRAFT 可见性）
- `src/components/scenario/scenario-notes-panel.tsx`（新）
- `e2e/tests/gantt/scenario/scenario-notes.spec.ts`（新）
