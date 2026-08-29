# ROIS-AI 项目开发规范

> 机组排班系统重建项目 — Claude Code 开发指引
> 各模块专属规范见对应目录下的 CLAUDE.md

## Shared Claude / Codex Rule Contract

This file is the canonical shared project guide for Claude, Codex, and other AI agents working in this repository.

Cold-start rule loading:

1. Read this root `CLAUDE.md` before project work.
2. Codex-specific startup and workflow rules live in root `AGENTS.md`; Codex must read that file as its entrypoint and then follow this file for shared project rules.
3. Read `NEXT_CONTEXT.md` when recovering recent development context.
4. Before module work, read the relevant module guide:
   - module `CLAUDE.md` when present
   - nested `AGENTS.md` when present
5. Project-wide rules must be tracked in `CLAUDE.md`, `AGENTS.md`, or referenced files under `docs/`; local non-git memos may only supplement machine-specific runtime state.

When `CLAUDE.md` and `AGENTS.md` overlap, keep them synchronized. If they conflict, this file is canonical for shared project behavior unless a rule is explicitly Codex-only in `AGENTS.md`.

## Current F8 Engine Scope

- Optimization engine: `pbs-engine/` is the active PBS optimization engine source.
- Legality engine: `rule-engine-rs/` is the active Rust legality engine.
- `ro-engine/` and `po-engine/` are temporarily retained legacy modules and are not active F8 delivery development targets.
- `crewrule-dev/` is legacy C++ reference material for porting/verifying Rust rules in `rule-engine-rs`.
- `ai-server/` is retained for future AI workflows but is outside the current F8 delivery scope.

## Senior Engineering Workflow

All agents and contributors working in this repository must follow Ryan's enterprise engineering workflow:

- Understand before coding: read relevant files, module guides, data-model docs, and existing tests before changing behavior; never guess — ask or gather evidence when requirements or business meaning are unclear.
- Follow existing architecture and reuse existing patterns: preserve module boundaries, naming, data flow, and prefer current utilities/components/services/tests over new ones.
- Treat the data model as source of truth: do not change, duplicate, or infer structures without understanding their purpose and relationships.
- Preserve business logic: assume complex logic exists for a reason; understand it before modifying, simplifying, or deleting it.
- Source-of-truth migrations: when a business field changes owner/storage/derivation, follow `docs/architecture/source-of-truth-migration-gate.md` before implementation.
- Validate every change: run the smallest relevant build/test/lint/UI/manual verification scope and report exact results.
- Explain significant design decisions before implementing them, including affected modules, risks, and alternatives when the change is material; if a requirement conflicts with architecture, propose trade-offs instead of forcing it.
- Detect dead ends early: after repeated failure with the same approach, stop, identify the false assumption, and switch strategy.
- Be transparent: state uncertainty, blockers, viable alternatives, test gaps, and remaining risks clearly.

> Smallest-change and touch-only-what's-needed discipline is covered by §Minimal-First and §Surgical below — not repeated here.

## §First-Paint — 1-2 秒首屏是第一优先级（强制，全员遵守）

> **数据加载与 Gantt 渲染的第一目标：把「第一批 X 条机组/航班（pairing）」在 1-2 秒内呈现到用户视口。** 这是所有团队成员、所有相关代码（前端渲染 + 后端数据接口）的最高优先级，优先于功能完整性、统计准确性、附加信息加载。

铁律：

- **首屏只加载视口需要的第一批数据**（first X crew / pairings），其余分页 / 滚动 / 后台懒加载（`loadMore`、虚拟化）。禁止首屏全量加载阻塞渲染。
- **任何附加数据都不得拖慢首屏**——法规违规（violation / 告警铃铛）、KPI、积分、统计、资质等一律在首屏渲染**之后**异步加载，且只为「已加载进视口的机组」加载（与机组加载同一批次、同一集合）。违规加载严禁阻塞或延迟机组/航班首帧。
- **违规数据加载范围 = 已加载机组集合**：接口/前端按 `selectedCrewIds`（已加载机组）拉取，不得因后端 cap（如 `MAX_CREWS`）小于已加载机组数而静默丢弃后段机组的告警。
- 新功能、新数据源接入前自问：**它会不会让首屏变慢？** 若会，改成异步/懒加载。
- 性能回归（首屏 > 2 秒）视同 bug，必须修复。E2E 应有首屏耗时基准（见 `Perf-4xxx`）。

## 项目结构

```
rois-ai/
├── packages/
│   └── ui/          # 共享UI组件库 (@rois/ui, shadcn + Tailwind)
├── live-server/     # 实时排班服务 (Fastify + Drizzle + TS, 端口3000)
├── gantt/           # 排班前端 (React 19 + Vite + TS, 端口5173)
├── rois-rule-engine/ # 法规引擎 Python 版 (pip包 rois_rule_engine，由 engine-server 内嵌的 Rule Engine Service 使用；PO/RO 直接 import)
├── pbs-server/      # PBS后端 (Fastify + Drizzle + TS, 端口3002)
├── engine-server/   # 优化引擎调度服务 + Rule Engine Service (FastAPI + Python, 端口3003；单一实例管理 active_groups + user_sessions + violation_worker)
├── connector-server/ # 外部系统对接服务 (Fastify + Drizzle + TS, 端口3004)
├── pbs-engine/      # Active PBS optimization engine submodule
├── rule-engine-rs/  # Active Rust legality engine
├── po-engine/       # Legacy PO engine, temporarily retained; not current F8 delivery scope
├── ro-engine/       # Legacy RO engine/baselines, temporarily retained; not current F8 delivery scope
├── crewrule-dev/    # Legacy C++ rule reference for Rust rule ports
├── ai-server/       # AI service retained for future workflows; outside current F8 delivery scope
├── pbs-portal/     # PBS网页前端 (React 19 + Vite + TS, 端口5174)
├── pbs-app/         # PBS移动端App (React Native + Expo)
├── sql/             # 数据库脚本 (schema/建表 + seed/基础数据 + migration/增量)
├── e2e/             # E2E测试 (Playwright)
└── docs/           # 项目文档与 AI 开发文档统一目录
```

## AI 文档目录规范

所有 AI（Claude、Codex、其他 agent）生成或维护的开发文档，统一放在根目录 `docs/` 下。后续禁止新增 `doc/` 下的 AI 开发文档；如果旧文档仍在 `doc/` 或模块私有 `docs/` 中，迁移时单独规划，不在日常开发中继续扩散。

目录职责：

| 目录 | 用途 |
|------|------|
| `docs/ai/` | AI 文档放置规范、协作约定、目录说明 |
| `docs/dev-context/` | AI / Claude / Codex 对话上下文与开发决策快照 |
| `docs/superpowers/specs/` | 需求确认、设计文档、brainstorming 输出的正式 spec |
| `docs/superpowers/plans/` | 实施计划、分阶段开发计划 |
| `docs/superpowers/completed/` | 已完成设计 / 计划归档 |
| `docs/handoff/` | 跨窗口、跨人、跨 agent 交接文档 |
| `docs/test-cases/` | 人工测试用例、回归测试说明 |
| `docs/modules/` | 模块级长期文档，例如 PBS、Gantt、engines、live-server |
| `docs/architecture/` | 全局架构、技术决策、系统级设计 |

文档写入规则：

- 新功能、行为变更、流程变更的设计文档写入 `docs/superpowers/specs/`。
- 实施计划写入 `docs/superpowers/plans/`。
- 大任务结束时的对话上下文写入 `docs/dev-context/`。
- handoff 文档写入 `docs/handoff/<module>/`，不要再散落在仓库根目录、`pbs-portal/docs/` 或 `doc/`。
- 测试用例写入 `docs/test-cases/<module>/`。
- 长期模块说明写入 `docs/modules/<module>/`，全局架构写入 `docs/architecture/`。
- `.env`、数据库密码、Token、生产账号等敏感信息不得写入任何文档。

## 数据库

### §Remote-DB-Only — 查询必须打远端库（强制）

**本地开发直接用 `f8_sit_live` / `f8_sit_scenario` / `f8_sit_pbs`（SIT schema）**，不再维护独立的 `f8_dev_*` 隔离 schema（`docs/architecture/dev-db-schema-isolation.md` 中的 DEV 隔离方案已废弃，historical-only）。所有 SQL 查询、数据核查、业务逻辑验证，**必须通过各服务 `.env` 的 `DATABASE_URL`（search_path 已指向目标 schema）**，禁止用 localhost 之外的裸连接。

动态 SQL（模板字符串、条件片段、动态 filter/property/schema）必须遵守
`docs/modules/database/generated-sql-safety-standard.md`：不能只靠 TypeScript build 或 mock/string
test，必须同时具备 fixture/结构完整性检查、远端 PostgreSQL `EXPLAIN` 或最小只读执行，以及关键
HTTP/文件入口 smoke。不得静默跳过失败条件。

### 连接信息

项目当前只上线 **F8** 航司。远端 PostgreSQL：`47.253.173.207:55432`，database `rois`（多环境共用同一库、按 schema 隔离）：

| 环境 | Live | Scenario | PBS |
|------|------|----------|-----|
| SIT（本地开发也用这套）| `f8_sit_live` | `f8_sit_scenario` | `f8_sit_pbs` |
| UAT | `f8_uat_live` | `f8_uat_scenario` | `f8_uat_pbs` |

**本地开发一律使用 `f8_sit_live` / `f8_sit_scenario` / `f8_sit_pbs`**，与 SIT 环境共用同一份 schema（非隔离）。连接串通过环境变量注入（各服务 `.env` 的 `DATABASE_URL`，UAT 连接串向团队成员或密钥管理工具索取），**密码不得写入任何文档或代码**。**本地跑单元/集成/E2E 测试、seed、脚本的写操作都落在共享的 `f8_sit_live` 等 schema 上，会影响其他人正在跑的测试/演示数据——批量写入、delete、或改动特定日期范围的数据前，先确认没有其他 agent/测试依赖同一批数据（如约定好的日期/flight number 白名单），禁止无协调地覆盖。**

### 设计规范

- **推理表关系前必读** `docs/architecture/data-model.md`（实体关系图），代码归属见 `docs/architecture/codebase-index.md`（表↔entity/service/route）。关系以 `sql/schema/**.sql` 的 `foreign key ... references` 为唯一权威，这两份文档是导航，不要靠猜或凭记忆推断
- **核心数据模型陷阱（高频踩坑，写代码/查询前先看）**：
  - `pairing` **不直连** `flight`：环→航班是 N:M，必须经 `pairing → pairing_segment.flt_id → flight`，没有 `pairing.flight_id`
  - `roster_flight` 粒度 = **机组 × 航段**（一个环派给机组会炸开成每航段一行）；机组×航班的执行级信息（实际职级/席位/时间/积分）只在这里
  - `roster_flight.flt_id` → `flight` 是**按值关联、无 FK 约束**（只声明了 `fk_rf_crew` / `fk_rf_pairing`），别假设 DB 替你保证引用完整性
  - 机组的 Base 来自 `crew_base` 表，**不是** `roster_flight.base`
  - 地面任务 = `roster_flight.pairing_id IS NULL`（同时 `flt_id` 为 null）；查飞行任务要显式 `WHERE pairing_id IS NOT NULL`
- PostgreSQL 16，多航司通过 Schema 隔离（schema 名 = 航司二字码小写）
- **所有数据库对象统一小写**：schema 名、表名、字段名、索引名、约束名全部使用小写 + 下划线（`snake_case`），禁止使用大写或双引号包裹
- 建表脚本在 `sql/schema/` 目录下，无 schema 前缀，通过 `search_path` 切换
- 主键统一使用 `bigint GENERATED ALWAYS AS IDENTITY`
- `is_deleted`：**取消状态标记**（0=正常，1=已取消），不是软删除——DELETE 操作执行真实物理删除
- 审计字段：`created_by`, `created_at`, `updated_by`, `updated_at` 每张表必须有
- **外键约束**：核心表已建立 FK RESTRICT 约束，删除父记录前必须先通过应用层 pre-check（返回 409）再在事务中删子记录
- **地面任务**：`roster_flight.pairing_id` 为 `NULL`（不是 0），`NULL` 表示无配对的地面任务
- **filiale 默认值**：每个航司 schema 下所有含 `filiale` 字段的表均已设置列默认值（如 f8 schema 全部为 `DEFAULT 'F8'`），新航司初始化后执行对应 migration 即可；seed 脚本中 INSERT 语句无需显式写 `filiale`，让数据库默认值填充
- **rank 直接用代码**：`composition_rank`、`rank_position`、`rank_acting` 表直接以 `rank varchar` 存储职级代码（如 `'CA'`、`'FO'`），不再保存 `rank_id` 外键，避免不必要的 join

## TypeScript 通用规范

适用于：live-server / pbs-server / gantt / pbs-portal

### 命名

- 文件名：`kebab-case`（如 `crew-service.ts`, `use-roster.ts`）
- 变量/函数：`camelCase`
- 类/接口/类型：`PascalCase`
- 常量：`UPPER_SNAKE_CASE`
- 数据库字段映射：`snake_case`（与数据库一致）

### 代码风格

- 使用 `const` 优先，避免 `var`，必要时用 `let`
- 函数优先使用箭头函数
- 所有函数参数和返回值必须有类型声明，禁止 `any`
- 使用 Zod 做运行时数据校验（API 入参、环境变量）
- 错误处理使用 try/catch，统一错误响应格式
- 异步操作统一使用 `async/await`，不用 `.then()` 链

### 导入顺序

```typescript
// 1. Node.js 内置模块
import path from 'node:path'
// 2. 第三方库
import Fastify from 'fastify'
// 3. 项目内部模块
import { crewService } from '@/services/crew-service'
// 4. 类型导入
import type { Crew } from '@/types'
```

## Python 通用规范

适用于：po-engine / ro-engine

### 命名

- 文件名/模块名：`snake_case`
- 变量/函数：`snake_case`
- 类：`PascalCase`
- 常量：`UPPER_SNAKE_CASE`

### 代码风格

- 使用 Python 3.12+
- 使用 type hints 类型注解
- 数据模型使用 Pydantic v2
- 配置使用 pydantic-settings
- FastAPI 响应统一格式，与 TypeScript 后端一致

## Git 规范

### 提交信息格式

```
<类型>: <简要描述>

<详细说明（可选）>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### 提交类型

- `feat`: 新功能
- `fix`: 修复 bug
- `refactor`: 重构（不改变功能）
- `style`: 代码格式调整
- `docs`: 文档更新
- `chore`: 构建/工具/依赖变更
- `test`: 测试相关

### 分支策略

- `main`: 主分支，保持可部署状态
- `feat/<module>/<feature>`: 功能分支
- `fix/<module>/<description>`: 修复分支

### 已合并分支归档规则

- 归档工作分支前，必须先确认 `git merge-base --is-ancestor <branch> main` 成功。
- 已确认合并到 `main` 的分支统一归档到 `done/<原分支名>`，例如 `codex/example` 归档为 `done/codex/example`。
- 删除原远端分支前，必须先推送并确认对应 `origin/done/...` 分支存在。
- 归档分支存在后，再删除原本地分支。
- 未找到或未合并的分支不得凭猜测移动。

### §No-Auto-Commit — 禁止自动提交和推送（强制执行）

- **禁止**在没有用户明确命令时执行 `git commit` 或 `git push`。
- 代码修改完成后，可以提示用户"等你命令 commit"，但不得主动执行。
- 此规则适用于所有仓库（主仓库和所有 submodule）。

## 版本号管理（Version Bumping，强制执行）

> 版本号用于快速确认当前本机/部署运行态，不再写入 tracked 源码，避免每次提交都修改同一个文件。

- **版本来源**：`live-server/version.tmp`（JSON，本机运行态文件，已加入 `.gitignore`），由 `scripts/version-state.mjs` 创建、读取、递增。
- **格式**：全局 Gantt 显示 `Ver:B{backend}/F{frontend}/R{rule}`；PBS 显示 `Ver:B{pbsBackend}/F{pbsFrontend}`。
- **展示位置**：gantt 顶部导航与 ThemeSwitcher 下拉中（与 `__APP_VERSION__` 的 commit/构建时间并列）。
- **递增时机**：
  - `gantt` 执行 `npm run dev` / `npm run build` 前，自动递增全局 `frontend`。
  - Vite HMR 完成热更新时，自动递增全局 `frontend` 并推送到页面。
  - `live-server` 执行 `npm run dev` / `npm run build` 前，自动递增全局 `backend`。
  - `connector-server` 执行 `npm run dev` / `npm run build` 前，自动递增全局 `backend`。
  - `pbs-server` 执行 `npm run dev` / `npm run build` 前，自动递增 `pbsBackend`。
  - `pbs-portal` 执行 `npm run dev` / `npm run build` 前，自动递增 `pbsFrontend`。
- **不要手动修改 tracked 文件来 bump 版本**；`gantt/src/version.ts` 已废弃并删除。
- **永不回退**：版本号只增不减，不复用旧值。若需手动修正本机运行态，仅编辑 ignored 的 `live-server/version.tmp`。
- 纯文档（`docs/`、`*.md`）、注释、E2E 测试数据等非运行代码改动可不递增。

## 参数化开发规范

> 当前项目只支持 **F8** 一家航司，暂不做多航司上线相关设计/脚本。以下参数化规则是通用编码纪律，与航司数量无关：

- **禁止**在代码中硬编码业务常量（如时间阈值、人数上限、法规值等），必须从 `dictionary` 表或配置文件读取
- 所有下拉选项、枚举值从 `dictionary` 表动态加载，不在前端写死
- seed 脚本必须**幂等**（`INSERT ... ON CONFLICT DO NOTHING`），参数文档见 `docs/params/`

## 测试策略总览

| 模块 | 单元测试 | 集成测试 | E2E 测试 |
|------|---------|---------|---------|
| live-server | Vitest — service 业务逻辑 | Vitest — API + DB + **缓存一致性** | — |
| po-engine | pytest — 优化算法、约束验证 | — | — |
| ro-engine | pytest — 分配算法、约束校验 | — | — |
| pbs-server | Vitest — 申请校验、权限逻辑 | Vitest — API + DB + **缓存一致性** + 并发 | — |
| gantt | — | — | Playwright — UI 流程回归 |
| pbs-portal / pbs-app | — | — | Playwright — UI 流程回归 |

覆盖率目标：后端 ≥ 80%，集成测试 ≥ 70%，新功能必须附带测试用例。

## Testing Discipline（强制执行 — UI 变更硬性门禁）

### §Playwright-Required — every feature and every bug fix ships with a Playwright test

**Non-negotiable.** After implementing ANY feature OR fixing ANY bug that touches the UI (gantt / pbs-portal / pbs-app) — see §User-Operation-Playwright-Required below for the broader rule covering changes that affect a user operation even when the change itself is backend-only, a script, or a raw SQL/migration:

1. Write a Playwright e2e test in `e2e/gantt/` or `e2e/pbs-portal/` (Vitest unit test acceptable only for pure backend logic with no UI surface).
2. Run it: `npx playwright test e2e/<module>/<your-test-file>.spec.ts --reporter=list`.
3. All tests must pass before the work is considered done.

Minimum coverage per change type:

| Change type | Minimum coverage |
|---|---|
| New UI feature | Specific data visible; empty state vs. load failure distinguished; all interactive elements exercised |
| Bug fix | A regression test that would have caught the bug **before** the fix — not just a test that passes after it |
| New API endpoint (with UI) | 200 response shape asserted via UI action; error path handled gracefully |
| State / filter change | Correct items shown after filter; wrong items absent |
| Any change affecting a user operation, regardless of layer (backend logic, data/permission change, script, **raw SQL/migration**) | Real UI simulation of that operation as the affected user(s); user-visible outcome asserted, not status codes/DB flags — see §User-Operation-Playwright-Required |

Anti-patterns — do NOT write these:

| Anti-pattern | Correct replacement |
|---|---|
| `toBeVisible()` alone | `toContainText(specificValue)` or `toHaveCount(n)` |
| Single-step workflow test | 2+ sequential steps with intermediate assertions |
| "No error shown" as proof of success | Loader gone + correct data present + count matches |
| Test added after marking done | Write the test first, or alongside the code — never after |

File naming: `e2e/<module>/<feature-name>.spec.ts`, named after the changed component or bug, e.g. `test('scenario list filters to PO only when PO sidebar item is active', ...)`.

### §User-Operation-Playwright-Required — any change touching a user operation must be validated by Playwright as a real user

**Non-negotiable, and scope is by effect, not by layer.** If a change affects anything a real user does or experiences in gantt / pbs-portal / pbs-app — logs in, clicks, filters, edits, assigns, gets a permission/role, hits a limit, sees data or an error — it must be validated end-to-end as that user, regardless of whether the change itself was frontend code, backend logic, a one-off script, or a raw SQL migration run directly against a database. "I only touched the DB / a script / the backend" is not an exemption.

1. Identify the concrete user operation the change affects (e.g. "Tiao logs in and sees the Live nav", "dispatcher filters flights by fleet", "crew member is reassigned off a pairing").
2. Write or extend a Playwright test that performs that operation through the **real UI** (§Simulate-User — real clicks/typing/navigation, no `request.post`/API-injection shortcut for the operation under test itself).
3. Assert the outcome a real user would actually see (correct data, correct permissions/menus, correct error message) — never a 200 status, a DB flag, or "no error thrown".
4. Run it and paste the PASS/FAIL result (§No-Illusion) before calling the change done.

**Why:** a change can look correct at the code/DB/API level — status codes match, flags look right — while silently breaking for the actual user (a missing permission binding, a timezone-sensitive `eff_dt`/`exp_dt` column, a stale cache, a race in a multi-step flow). Only a Playwright run that behaves like the user is proof the change actually works, not just that it should.

### §Simulate-User — Playwright must drive the REAL UI

**A Playwright run against gantt or pbs-portal exists for one reason: to reproduce the real user experience — click the actual buttons, menus, dialogs the product exposes and let the UI fire its own network calls. Nothing else counts.**

**禁止**让脚本直接 `fetch` / `request.post` 业务写接口来代替用户操作（即使浏览器开着）；「DB 层面已生效」不算成功标准。只读 seed/校验前置数据可以走 API，但被测的用户动作本身必须经 UI 完成；纯后端逻辑走 Vitest。若某个用户动作**还没有 UI 入口**，先把 UI 补上再测，不要写脚本直接调 API 假装功能可用。

### §No-Illusion — prove it, do not claim it

**Claims are worthless. The test output is the proof.** A feature is not working until a test proves it works; a bug is not fixed until a test proves it cannot recur. Never state "this should work" or "this looks correct" — run the test and paste the result.

Required after every code change: write/update the test → run `npx playwright test e2e/<file>.spec.ts --reporter=list` → paste the PASS/FAIL summary → only then mark done. Forbidden: claiming "fixed"/"working" from code inspection alone, a test that always passes (`expect(true).toBe(true)`), or a test that only checks visibility instead of correct data.

### §PW-Snapshot — every UI-related Playwright validation captures a screenshot, versioned per iteration

**A passing test is not enough for a visual/UI change — capture a screenshot during the same Playwright run and keep it as the visible proof.** Pass/fail text alone doesn't show *what* rendered; a reviewer (or Ryan) needs to see the actual pixels.

- Save under `docs/assets/screenshots/<module>/<feature-name>.png` (module = `gantt`/`pbs-portal`/`pbs-app`/etc., feature-name matches the changed component or spec).
- **If the same feature/fix gets re-validated across multiple rounds** (a design tweak, a bug re-fix, feedback-driven iteration), do **not** overwrite the previous screenshot — suffix the filename with `-Ver<N>` (`Ver1`, `Ver2`, `Ver3`, ...), incrementing per round, so the sequence of screenshots documents visible progress across iterations. First capture of a feature may omit the suffix or start at `Ver1`; be consistent within one feature's history.
- Capture via a Playwright script/test (`page.screenshot()` / `locator.screenshot()`), not a manual/out-of-band screenshot — it must come from the same automated run that proves the behavior, per §No-Illusion.
- After capturing, verify the PNG visually with the Read tool before reporting done — a screenshot of the wrong element/state is worse than no screenshot.

### §Stale-Test — update it, never just report it

**If a test is stale (asserts a DOM/API/behavior that no longer exists because the code was legitimately refactored), UPDATE it to validate the current implementation — same intent, new selectors/endpoints/assertions. Do not ask first, do not skip it, do not leave it red.** Then run it and paste the PASS receipt (§No-Illusion).

Stale = selector/route/field renamed but the feature still exists, or UI structure changed after a redesign. **NOT stale** (don't silently "fix"): test is red because the code is actually broken (debug the code, never weaken the test), the feature was intentionally removed (delete the test, say so), or you're unsure whether the behavior change was intended (investigate first — may be a regression).

---

## §Minimal-First — 实现最小可解，不做投机性复杂化（强制执行）

**Write the minimum code that solves the actual request. Nothing speculative.** 只实现被请求的东西，**禁止**为「以后可能用到」预埋抽象（Strategy/工厂/抽象基类只有一个实现）、配置开关（dictionary 里无对应项）、缓存/批处理/重试等无人要求的基础设施、或为不可能出现的输入写防御性分支。提交前自问：一个资深工程师会不会把它标记为「过度设计」？会，就简化。

不算过度设计：CLAUDE.md 已强制的参数化（从 `dictionary` 读业务常量）、§First-Paint 要求的分页/懒加载、抽取重复逻辑为复用方法——这些是**已确认**的真实需求，不是投机。

---

## §Surgical — 只动该动的，不顺手重构（强制执行）

**Touch only what the task requires. Clean up only your own mess.** drive-by 重构会放大 diff、掩盖真实改动、增加回归面——改动只覆盖完成任务所必需的行，保持被改文件的现有风格，只移除本次改动产生的未用依赖。

唯一例外（优先于本节）：改到的文件里命中「样式与排版标准」的历史魔法值必须顺手归一到 token；改到的区域发现 stale 测试按 §Stale-Test 重写。除此之外的「顺手优化」一律先单独提出、单独提交。

---

## §Gantt-Unify — Live 与 Scenario 共用一套 Gantt 代码路径（强制执行）

**One shared Gantt code path for Live and Scenario wherever the user-facing function is the same.** 用户看来是同一张甘特图，分叉成两套 UI 会导致重复实现和「Live 能用、Scenario 不能用」的体验差异。动任何 gantt 功能前先自问：能否一次加到 shared 层让两边同时受益？来源差异（Live vs Scenario 的数据来源、能力开关）一律藏进适配器 capability，禁止散落成 `if (live) … else …` 或重复实现同一功能。只有业务差异**真实存在且已在 spec/PR 中写明**时，才允许 Live-only / Scenario-only 代码。

架构落点（改前核对）：共享层 `gantt/src/components/panes/shared/`（`SharedRosterPane`/`SharedFlightPane`/`SharedPairingPane`）；数据抽象 `gantt/src/components/gantt/source/gantt-pane-source.ts` 的 `GanttPaneSource`；两个薄适配器 `live-gantt-source.ts` / `scenario-gantt-source.ts`；上下文包装 `GanttSourceProvider`。

与 §Minimal-First / §Surgical 不冲突：只下沉**已确认**的共同行为，不预埋投机性抽象，也不顺手重构无关分叉。

---

## 前端语言规范

- **UI 默认语言为英文**：所有按钮、标签、占位符、提示文字、空态文案、弹框内容等，默认一律使用英文
- 中文仅在用户明确要求「显示中文」或配置了 i18n 语言为中文时才出现
- 代码注释、commit message、文档可以用中文；用户界面文字不行
- 违反此规范的中文 UI 字符串视同 bug，必须还原为英文

## 弹窗窗口标准（Pop-up Window Standard，强制执行）

> 全平台所有弹窗（gantt / pbs-portal / pbs-app）必须共用同一套窗口外观，参考 `image/pop-up-window-template.png`。

唯一实现组件：`@rois/ui` 的 **`AppDialog`**（`packages/ui/src/composites/app-dialog.tsx`，基于 Radix Dialog 原语）。**禁止**再直接用裸 `Dialog`/`DialogContent` 拼装业务弹窗，也禁止用 Modal/Drawer/Popover 代替弹窗。

标准外观（六条，缺一不可，具体 prop 见组件源码）：左上角图标（`icon`）、蓝色标题栏+白色标题（`bg-primary`/`text-primary-foreground`，禁止硬编码颜色）、右上角关闭按钮（`showClose`）、右下角按钮区（`footer`，取消在左主操作在右）、可拖拽（`draggable`）、可关闭性由 `dismissable` 控制（执行中操作应临时设为 `false`）。

新增弹窗或改造旧弹窗一律走 `AppDialog`；若标准本身需要扩展，改 `AppDialog` 而非在业务侧另起炉灶。

## 样式与排版标准（CSS / Typography Standard，强制执行）

> 适用于所有前端模块（gantt / pbs-portal / pbs-app / packages/ui）。本系统是高密度航空运行界面（Jeppesen / Bloomberg 风格），所有视觉量纲必须 **token 驱动**，禁止散落的魔法值。Token 的唯一来源是 `packages/ui/src/styles/globals.css` 的 `@theme`。

### 字体（Font family）

- **正文 / UI 文本**：`font-sans`（`--font-sans`，系统字体栈），是默认值，一般无需显式写
- **数字 / 代码 / ID**：`font-mono`（`--font-mono`），机组号、时间、航班号等**成列数字**必须配 `tabular-nums`（等宽数字对齐），例：`className="font-mono tabular-nums"`
- **禁止**引入自定义 Web 字体或在组件里写死 `font-family`

### 字号（Font size）— 唯一标准刻度

全平台只用下面这 **8 级** 命名 token，**禁止** 再写任意 `text-[Npx]`（如 `text-[11px]`、`text-[13px]`）。`xs`–`2xl` 沿用 Tailwind 默认值，`2xs`/`3xs` 由本项目 `@theme` 扩展：

| Token | px | 典型用途 |
|-------|----|---------|
| `text-3xs` | 9  | 大写微标签（配 `uppercase tracking-wide`）|
| `text-2xs` | 10 | 徽章、chip、表格微信息、表单字段标签 |
| `text-xs`  | 12 | **正文默认**、次级文本、提示 |
| `text-sm`  | 14 | 强调正文、输入框、小节标题 |
| `text-base`| 16 | 面板 / 弹窗标题 |
| `text-lg`  | 18 | 页面标题 |
| `text-xl`  | 20 | 大标题 |
| `text-2xl` | 24 | Hero / 极少数场景 |

> 历史代码里的 `text-[Npx]` 仍可渲染，但**新代码禁止新增**；改动到的文件就近迁移。迁移映射表见 `docs/superpowers/specs/2026-06-15-rois-ui-standard-for-ai-agents-design.md`。

### 字重（Font weight）

只用 4 档：`font-normal`(400) 正文 · `font-medium`(500) 标签/次强调 · `font-semibold`(600) 标题/强调 · `font-bold`(700) 关键数据。**禁止** `font-extrabold` 及更重档位。

### 间距 / 圆角（Spacing / Radius）

- 间距走 Tailwind 4px 基准刻度（`gap-1`/`p-2`/`mt-1.5` 等），**禁止**任意 `m-[Npx]`/`p-[Npx]`；确需精确像素（如 Canvas 定位）才用动态 inline style
- 圆角统一用 `rounded-sm/md/lg/xl`（映射 `--radius`，默认 2px 紧凑风格），禁止写死圆角像素

### 颜色

- 见 `@rois/ui` 规范：一律用语义化 token（`bg-primary`/`text-muted-foreground` 等），**禁止**硬编码颜色值（Canvas 的 `--gantt-*` 变量除外）

### 对齐（Alignment）

图标 + 文字（标题、按钮、列表项、徽章）必须严格对齐，新组件要和现有组件视觉一致：

- **图标与文字同行必须用 `flex items-center`** 做垂直居中，**禁止**用 `mt-*`/`-translate-y-*` 等手动微调图标位置（拖拽指示器等动态定位除外）
- **间距按文字大小取标准 `gap`**：紧凑行（`text-2xs`/`text-xs`）用 `gap-1.5`；标题/标准行（`text-sm`/`text-base`）用 `gap-2`；**禁止** `gap-3` 及以上的过宽图标-文字间距和任意 `gap-[Npx]`
- **前导图标尺寸跟随文字**：配 `text-xs` 用 `h-3.5 w-3.5`，配 `text-sm`/`text-base` 用 `h-4 w-4`；图标一律加 `shrink-0`，避免文字 `truncate` 时挤压图标
- **装饰性前导图标默认 `text-muted-foreground`**，需要强调才用 `text-primary`；**禁止**用 `text-sidebar-primary` 给内容区图标上色（该 token 仅用于侧栏表面）
- **纯图标按钮**用 `inline-flex items-center justify-center` + 方形点击区（如 `h-7 w-7 p-0`）
- **内容面板/区块标题栏统一形态**：`flex h-10 shrink-0 items-center gap-2 border-b border-border px-4` + 前导图标 `h-4 w-4 shrink-0 text-muted-foreground` + 标题 `text-sm font-semibold text-foreground`（参照 `scenario-detail-panel` / `crew-bids-view`）

违反以上（魔法字号、写死字体/颜色/圆角、超档字重、图标错位/间距不一致）视同样式 bug，改到的地方必须顺手修正。

### §UI-Standard-Gate — 自动门禁（强制执行，团队 + AI agent 全员）

> 上述样式标准由 `scripts/check-ui-standard.mjs` 守护，**禁止靠自觉**。全文见 `docs/superpowers/specs/2026-06-15-rois-ui-standard-for-ai-agents-design.md`。

提交/推送前必跑 `npm run check:ui`，**硬违规必须为 0**：魔法字号 `text-[Npx]`、超档字重、写死圆角 `rounded-[Npx]`、任意字体族 `font-[...]`（扫描 `gantt/src` + `packages/ui/src`）。像素间距/内联 `fontFamily` 仅 WARN 不阻断（1px 边框补偿等合法例外）。豁免写 `ui-standard-ignore` / `ui-standard-ignore-next-line`，滥用视同违规。`.githooks/pre-push` 拦截硬违规推送；改动前端样式后必须运行 `npm run check:ui` 并在完成消息贴出 PASS 结果（§No-Illusion）。

## 开发注意事项

- 不要修改 `sql/` 下已确认的建表脚本，除非被明确要求
- 不要在 live 业务表中加 `scenario_id` 字段
- 不要创建 `system_parameter` 表，用 `dictionary` 替代
- 不要创建 `schedule_*` 系列历史快照表，用文件替代
- Oracle 触发器全部废弃，改为应用层事件（BullMQ）
- PBS 端与 Live Server 完全解耦，独立数据库连接池和 Redis 实例
- **禁止**在代码中硬编码业务常量，必须参数化
- **代码复用**：相同或相似逻辑必须抽取为可复用的方法/工厂/工具函数，禁止在多个文件中散落重复代码。常见场景包括但不限于：HTTP 客户端配置、响应封装解包、错误处理、日期格式化、权限校验、表单校验等。新增功能前先检查是否已有类似实现可以复用或扩展
- **性能意识**：编写代码时必须考虑性能影响，发现潜在性能问题（如 N+1 查询、全量计算、缺少索引、大数据量循环、不必要的重复计算等）必须主动提醒用户并给出优化建议

## 信息安全规范

> 航空机组排班数据属于高度敏感信息，信息安全是所有项目模块的硬性要求。

### 依赖安全

- **只允许使用开源许可的依赖**：MIT、Apache-2.0、ISC、BSD（禁止 GPL 或其他 copyleft 许可）
- **只允许使用知名可信来源的包**：Meta (React)、Microsoft (TypeScript)、Fastify 团队、Radix/WorkOS、Vite 生态、Drizzle 团队、Redis Ltd 等
- **禁止引入任何包含遥测/分析/外发数据功能的包**：如 Sentry、Segment、Amplitude、PostHog 等 — 除非经过明确授权
- **禁止引入来源不明或维护不活跃的包**：GitHub star < 1000 且无知名组织背书的包需经过评审
- 新增任何依赖前必须确认：许可证合规 + 无已知漏洞 + 无外发数据行为

### 漏洞管理

- 生产依赖（dependencies）：**零容忍**，`npm audit --omit=dev` 必须 0 vulnerabilities
- 开发依赖（devDependencies）：moderate 以上需评估影响，critical 必须立即修复
- 定期（每月至少一次）运行 `npm audit` 全量扫描
- CI/CD 流水线应加入 `npm audit --audit-level=moderate` 门禁

### 数据安全

- **禁止**在代码、配置文件或日志中明文存储密码、密钥、Token
- 数据库连接串、Redis 密码、JWT 密钥等必须通过环境变量（`.env`）注入
- `.env` 文件必须在 `.gitignore` 中，**禁止**提交到仓库
- API 通信中的敏感数据（机组个人信息、排班数据）禁止记录到前端 console.log
- 前端 API baseURL 必须从环境变量或 `window.location` 动态获取，禁止硬编码外部地址

### 网络安全

- 所有 HTTP 端点必须启用 CORS 白名单（不使用 `origin: '*'` 通配符在生产环境）
- WebSocket 连接需要验证 schema/用户身份后才允许订阅频道
- 生产环境必须使用 HTTPS / WSS
- Redis 和 PostgreSQL 只监听内网地址，禁止暴露公网

