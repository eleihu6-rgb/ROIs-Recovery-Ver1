# Coding conventions — full rule text

> TypeScript / Python / Git / versioning / parameterisation / security conventions summarised in root `CLAUDE.md`. Moved here 2026-09-12.
> Full text refreshed 2026-10-22 from the pre-router root `CLAUDE.md`; edit rules here, not in a second copy.

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

适用于：engine-server / pbs-engine；po-engine / ro-engine 仅在维护历史代码时适用。子模块的 Python 版本及依赖约束以各自指南和项目配置为准。

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

```

Only add a `Co-Authored-By` trailer when the actual contributor identity is known and attribution is requested or supplied by the agent environment. Do not invent a model name, context size, or email address.

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
- Deployment also requires explicit user authorization for the target. Authorization for commit, push, or deployment does not imply the others; preserve authorization already supplied within scope.

## 版本号管理（Version Bumping，强制执行）

- 版本来源为 ignored 的 `live-server/version.tmp`，由 `scripts/version-state.mjs` 在各模块 `npm run dev` / `npm run build`（及 gantt HMR）时自动递增。
- **不要手动修改 tracked 文件来 bump 版本**；**永不回退**，只增不减。纯文档/注释/E2E 数据改动可不递增。
- 格式、展示位置、各模块递增时机见 `docs/architecture/version-bumping.md`。

## 参数化开发规范

> 当前项目只支持 **F8** 一家航司，暂不做多航司上线相关设计/脚本。以下参数化规则是通用编码纪律，与航司数量无关：

- **禁止**在代码中硬编码业务常量（如时间阈值、人数上限、法规值等），必须从 `dictionary` 表或配置文件读取
- 所有下拉选项、枚举值从 `dictionary` 表动态加载，不在前端写死
- seed 脚本必须**幂等**（`INSERT ... ON CONFLICT DO NOTHING`），参数文档见 `docs/params/`

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

## Security — dev-environment posture

> This is a development system, not production. Security controls are relaxed to keep development fast. Production hardening is a deployment-time gate, not a per-change rule.

Still required in dev (cheap, and the repo is pushed to GitHub):

- Never commit secrets: passwords, tokens, keys and full connection strings stay in ignored `.env` files and out of tracked code, docs and logs. Hosts, ports and schema names may appear in docs.
- Dependencies: permissive licenses only (MIT, Apache-2.0, ISC, BSD; no GPL/copyleft) and no telemetry/analytics packages (Sentry, Segment, Amplitude, PostHog, etc.) without explicit approval.
- Do not log crew personal data to the browser console in code that is meant to ship.

Relaxed in dev (allowed without asking):

- Permissive CORS, plain HTTP/WS, and unauthenticated WebSocket subscriptions on local or SIT services.
- Hardcoded `localhost` / SIT base URLs in dev-only config, scripts and tests.
- Unreviewed low-star packages that meet the license and no-telemetry rules; dev-dependency audit findings unless critical.

Production checklist (apply when preparing a production or customer-facing deployment, not during routine dev):

- `npm audit --omit=dev` = 0 vulnerabilities; critical dev-dependency findings fixed.
- CORS allowlist (no `origin: '*'`), HTTPS/WSS, WebSocket schema/user verification before channel subscription.
- Redis and PostgreSQL reachable only on internal networks; frontend API base URL from env or `window.location`.
