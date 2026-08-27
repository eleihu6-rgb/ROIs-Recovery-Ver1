# Global Workflow Guardrails

## Canonical Project Rules

`AGENTS.md` is the Codex entrypoint, but the shared Claude/Codex project guide is `CLAUDE.md`.

Before doing project work in a cold Codex session:

1. Read root `CLAUDE.md`.
2. Read `NEXT_CONTEXT.md` when recovering recent development context.
3. Read the relevant module guide before module work:
   - Prefer nested `AGENTS.md` when present.
   - Also read the module `CLAUDE.md` when present, because most module-specific rules live there.
4. For local ports, Cloudflare tunnels, public routing, or `ai.rois.one` / `flair.rois.cloud` work, read the local non-git memo:
   `/Users/kimi/.codex/local-memos/rois-port-usage.md`.

Tracked project-wide rules must live in `CLAUDE.md`, `AGENTS.md`, or a referenced file under `docs/`. Local memos are only supplemental for machine-specific runtime state and must not be the only place a team rule exists.

If root `AGENTS.md` and root `CLAUDE.md` duplicate a rule and conflict, follow `CLAUDE.md` unless the rule is explicitly Codex-only in this file. Do not copy secrets from `CLAUDE.md` into new docs or comments.

## Senior Engineering Workflow

Follow the canonical workflow in root `CLAUDE.md`. For Codex work, apply it as an operational checklist:

- Read the relevant files, module guides, data-model docs, and touched-area tests before editing; do not guess about requirements, business rules, schema relationships, or hidden side effects — ask or gather evidence.
- Preserve existing architecture, module boundaries, data flow, naming, UI standards, and test strategy; reuse existing utilities/components/services/validators/test patterns before adding new abstractions.
- Treat the data model and FK definitions as source of truth; never duplicate or reshape data structures casually.
- For any business field ownership/source-of-truth migration, follow `docs/architecture/source-of-truth-migration-gate.md` before editing consumers.
- Preserve business logic unless the task explicitly changes it and the impact is understood.
- Explain significant design decisions, affected modules, trade-offs, and risks before implementation; if a requirement conflicts with architecture, surface the conflict and propose viable alternatives.
- Validate with the smallest relevant commands first, then broaden only when contracts or shared behavior are touched.
- When repeated attempts fail, stop the loop, inspect the failed assumptions, and choose a different strategy based on evidence.
- Report uncertainty, blockers, test gaps, and remaining risk directly.

(Smallest-change / no-unrelated-refactor discipline is covered by §Minimal-First / §Surgical below — not repeated here.)

## Brainstorming First

For any request that adds functionality, changes behavior, changes workflows, or requires multi-file edits, you MUST use the `brainstorming` skill before implementation.

- Do not replace `brainstorming` with an equivalent lightweight flow, a short in-chat summary, or an ad hoc confirmation pattern
- Do not start implementation, scaffolding, or non-spec file edits before `brainstorming` is complete
- Writing the spec/design document itself does not require a separate approval pause once enough context has been gathered
- `brainstorming` is only complete after a written spec/design document exists and the user has explicitly approved moving into implementation
- `karpathy-guidelines` is supplemental only; it does not replace `brainstorming`

Read-only tasks such as code explanation, investigation, and review can stay outside this workflow. Anything that will change files or behavior must go through `brainstorming` first.

# ROIS-AI 项目开发规范

> 机组排班系统重建项目 — Codex 开发指引
> 共享规范以根目录 `CLAUDE.md` 为准；各模块专属规范见对应目录下的 `AGENTS.md` / `CLAUDE.md`

## Critical Shared Rules From CLAUDE.md

Codex must follow these root `CLAUDE.md` rules even when they are not repeated elsewhere:

- **§First-Paint**: Gantt first visible crew / pairing data must render in 1-2 seconds. Do not block first paint on full datasets, violation/KPI/stat loads, or non-viewport data.
- **§Remote-DB-Only**: Real data checks and SQL validation must use the remote PostgreSQL authority from `CLAUDE.md`; the local f8 schema is not authoritative for business data.
- **Data model first**: Before inferring table relationships, read `docs/architecture/data-model.md` and `docs/architecture/codebase-index.md`. Foreign keys in `sql/schema/**.sql` are authoritative.
- **Version bumping**: Runtime versions now live in ignored `live-server/version.tmp` and are bumped by module `dev` / `build` scripts plus Vite HMR. Do not edit a tracked `gantt/src/version.ts`; that file has been removed. Pure docs/tests may skip runtime version bumps.
- **§Playwright-Required / §Simulate-User / §No-Illusion**: UI features and UI bug fixes need Playwright coverage that drives the real UI. Do not claim done without a test run receipt.
- **§Stale-Test**: If a touched-area test is stale because the product legitimately changed, update the test to cover the current behavior instead of merely reporting it.
- **§Minimal-First**: Implement the smallest real solution. Do not add speculative abstractions, caches, retries, or config switches for future possibilities.
- **§Surgical**: Touch only what the task requires. Keep existing style and avoid unrelated refactors, except mandatory nearby UI-standard cleanup and stale-test updates.
- **§Gantt-Unify**: Live and Scenario Gantt share one user-facing code path wherever behavior is the same; differences belong behind source/capability adapters.
- **UI language**: Product UI text defaults to English unless a user explicitly asks for Chinese UI or i18n says otherwise.
- **Popup standard**: Business dialogs use `@rois/ui` `AppDialog`; do not build new dialogs from raw `DialogContent`, Modal, Drawer, or Popover.
- **CSS / Typography standard**: Frontend UI uses tokens from `packages/ui/src/styles/globals.css`; avoid magic `text-[Npx]`, hard-coded colors/fonts/radii, overweight fonts, and icon misalignment.
- **UI standard gate**: Run `npm run check:ui` after frontend style changes and report the PASS result. Hard violations must be zero.
- **Module rules**: For `gantt`, `live-server`, `pbs-server`, `ai-server`, `engine-server`, `po-engine`, `ro-engine`, `connector-server`, `packages/ui`, and `pbs-app`, read that module's `CLAUDE.md` before changing it.

## Agent Delivery Completion Gate

This section strengthens the `AGENTS.md` side of the workflow by carrying proven delivery rules from `CLAUDE.md` into the constraints followed by Codex and any other agent that reads this file. It does not modify `CLAUDE.md` or Claude-specific skills.

## Current F8 Engine Scope

- Optimization engine: `pbs-engine/` is the active PBS optimization engine source.
- Legality engine: `rule-engine-rs/` is the active Rust legality engine.
- `ro-engine/` and `po-engine/` are temporarily retained legacy modules and are not active F8 delivery development targets.
- `crewrule-dev/` is legacy C++ reference material for porting/verifying Rust rules in `rule-engine-rs`.
- `ai-server/` is retained for future AI workflows but is outside the current F8 delivery scope.

Before changing code, the agent must identify the relevant module guide and the touched-area tests. A task is not complete until the verification scope is explicit.

For every implementation, bug fix, performance change, refactor, or workflow change:

- UI features, UI bug fixes, and core page interactions must add or update Playwright coverage that drives the real UI.
- Backend route, service, sync, schema, contract, or data-write changes must add or update focused Vitest / integration coverage.
- A bug fix must include a regression test that would have caught the original problem, unless the final response explains why that is not feasible.
- PBS changes that affect verifiable business behavior must consider both automated tests and QA manual test cases under `docs/test-cases/pbs/...`; one does not replace the other.
- If a touched-area test is stale because the product legitimately changed, update that test to cover current behavior and run it.
- Run the smallest relevant test set first. Broaden to module or root verification when the change crosses contracts, shared utilities, UI standards, or data writes.
- Final delivery must list the exact verification commands and PASS / FAIL results. If a required test was not run, state the blocker, manual verification performed, and remaining risk.
- Do not claim "done", "fixed", or "working" from code inspection alone.

## 项目结构

```
rois-ai/
├── packages/
│   └── ui/          # 共享UI组件库 (@rois/ui, shadcn + Tailwind)
├── live-server/     # 实时排班服务 (Fastify + Drizzle + TS, 端口3000)
├── gantt/           # 排班前端 (React 19 + Vite + TS, 端口5173)
├── rule-engine/     # 法规引擎 TS 版 (@rois/rule-engine；HTTP服务端口3001供旧路径)
├── rois-rule-engine/ # 法规引擎 Python 版，由 engine-server / PO / RO 使用
├── engine-server/   # 优化调度服务 + Rule Engine Service (FastAPI + Python, 端口3003)
├── connector-server/ # 外部系统对接服务 (Fastify + Drizzle + TS, 端口3004)
├── pbs-engine/      # Active PBS optimization engine submodule
├── rule-engine-rs/  # Active Rust legality engine
├── po-engine/       # Legacy PO engine, temporarily retained; not current F8 delivery scope
├── ro-engine/       # Legacy RO engine/baselines, temporarily retained; not current F8 delivery scope
├── crewrule-dev/    # Legacy C++ rule reference for Rust rule ports
├── ai-server/       # AI service retained for future workflows; outside current F8 delivery scope
├── pbs-server/      # PBS后端 (Fastify + Drizzle + TS, 端口3002)
├── pbs-portal/     # PBS网页前端 (React 19 + Vite + TS, 端口5174)
├── pbs-app/         # PBS移动端App (React Native + Expo)
├── sql/             # 数据库脚本 (schema/建表 + seed/基础数据 + migration/增量)
├── e2e/             # E2E测试 (Playwright)
└── docs/           # 项目文档与 AI 开发文档统一目录
```

## AI 文档目录规范

所有 AI（Codex、Claude、其他 agent）生成或维护的开发文档，统一放在根目录 `docs/` 下。后续禁止新增 `doc/` 下的 AI 开发文档；如果发现旧文档仍在 `doc/` 或模块私有 `docs/` 中，优先保留历史引用，迁移时单独规划。

目录职责：

| 目录 | 用途 |
|------|------|
| `docs/ai/` | AI 文档放置规范、协作约定、目录说明 |
| `docs/dev-context/` | AI / Codex / Claude 对话上下文与开发决策快照，只放 `save-context.sh` 或同类上下文产物 |
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
- 大任务结束时的对话上下文使用 `./save-context.sh <wing> <topic>` 写入 `docs/dev-context/`。
- handoff 文档写入 `docs/handoff/<module>/`，不要再散落在仓库根目录、`pbs-portal/docs/` 或 `doc/`。
- 测试用例写入 `docs/test-cases/<module>/`。
- 长期模块说明写入 `docs/modules/<module>/`，全局架构写入 `docs/architecture/`。
- `.env`、数据库密码、Token、生产账号等敏感信息不得写入任何文档。
- 若必须引用旧 `doc/` 下资料，应在新文档中说明“历史资料路径”，不要继续在旧路径新增 AI 文档。

## Developer Memory

- 仓库级开发记忆统一使用 `MemPalace`。
- 使用说明和约定见 `memory/README.md`。
- 该流程只用于开发侧 memory，不得写入产品用户记忆或运行时敏感数据。
- 新开 AI / Codex 对话窗口时，优先阅读根目录 `NEXT_CONTEXT.md`，再按其中流程恢复上下文。
- 大任务、跨文件/跨模块改动、API/schema/workflow 变化、形成长期决策或用户准备新开窗口时，应使用 `./save-context.sh <wing> <topic>` 保存本轮“对话上下文”和开发决策，并挖入 MemPalace。
- 小任务、局部解释、无长期决策的小修小补，不需要保存开发上下文，避免记忆噪音。
- `docs/dev-context/` 只保存开发侧对话上下文；正式产品/架构设计仍应进入 `docs/superpowers/specs/` 或对应模块 handoff 文档。
- AI 文档目录规范以本文件“AI 文档目录规范”章节为准；Claude / Codex 均需遵守同一套 `docs/` 路径规则。

## 数据库

### §Remote-DB-Only — 业务数据查询必须打远端库

本地 f8 schema 不作为业务数据核查权威。SQL 查询、数据核查、场景 run 排查、业务逻辑验证必须使用 root `CLAUDE.md` 中的远端 PostgreSQL 连接信息。不要在新文档里复制数据库密码或 token。

Before reasoning about table relationships, read:

- `docs/architecture/data-model.md`
- `docs/architecture/codebase-index.md`
- The actual FK definitions in `sql/schema/**.sql`

动态 SQL（模板字符串、条件片段、动态 filter/property/schema）必须遵守
`docs/modules/database/generated-sql-safety-standard.md`：不能只靠 TypeScript build 或 mock/string
test，必须同时具备 fixture/结构完整性检查、远端 PostgreSQL `EXPLAIN` 或最小只读执行，以及关键
HTTP/文件入口 smoke。不得静默跳过失败条件。

### 设计规范

- PostgreSQL 16，多航司通过 Schema 隔离（schema 名 = 航司二字码小写）
- **所有数据库对象统一小写**：schema 名、表名、字段名、索引名、约束名全部使用小写 + 下划线（`snake_case`），禁止使用大写或双引号包裹
- 建表脚本在 `sql/schema/` 目录下，无 schema 前缀，通过 `search_path` 切换
- 主键统一使用 `bigint GENERATED ALWAYS AS IDENTITY`
- `is_deleted` 表示取消状态（0=正常，1=已取消），不是通用软删除语义；删除父子数据前按业务 pre-check / FK 约束处理
- 审计字段：`created_by`, `created_at`, `updated_by`, `updated_at` 每张表必须有

## TypeScript 通用规范

适用于：live-server / rule-engine / pbs-server / gantt / pbs-portal

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

Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>
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

## 参数化开发规范

> 当前项目只支持 **F8** 一家航司，暂不做多航司上线相关设计/脚本。以下参数化规则是通用编码纪律，与航司数量无关：

- **禁止**在代码中硬编码业务常量（如时间阈值、人数上限、法规值等），必须从 `dictionary` 表或配置文件读取
- 所有下拉选项、枚举值从 `dictionary` 表动态加载，不在前端写死
- seed 脚本必须**幂等**（`INSERT ... ON CONFLICT DO NOTHING`），参数文档见 `docs/params/`

## 测试策略总览

| 模块 | 单元测试 | 集成测试 | E2E 测试 |
|------|---------|---------|---------|
| live-server | Vitest — service 业务逻辑 | Vitest — API + DB + **缓存一致性** | — |
| rule-engine | Vitest — 法规计算逻辑、法规组合 | — | — |
| po-engine | pytest — 优化算法、约束验证 | — | — |
| ro-engine | pytest — 分配算法、约束校验 | — | — |
| pbs-server | Vitest — 申请校验、权限逻辑 | Vitest — API + DB + **缓存一致性** + 并发 | — |
| gantt | — | — | Playwright — UI 流程回归 |
| pbs-portal / pbs-app | — | — | Playwright — UI 流程回归 |

覆盖率目标：后端 ≥ 80%，集成测试 ≥ 70%，新功能必须附带测试用例。

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
