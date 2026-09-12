# Agent workflow — full rule text

> Detail for Agent Operating Defaults, §Model-Routing, MCP and Skills, Design Before Implementation, Senior Engineering Workflow, §Minimal-First, §Surgical and the docs directory standard, summarised in root `CLAUDE.md`. Moved here 2026-09-12.

## Agent Operating Defaults

- Keep project instructions independent of model names and context-window sizes. Select models, reasoning settings, permissions, and MCP installations in the agent's supported runtime configuration; do not invent settings in this guide.
- Optimize total task effort, including tokens, tool calls, and rework, without omitting necessary work or verification. Establish the deliverable, constraints, and completion criteria from the available context; keep a short plan of unfinished work and dependencies only when complexity warrants it.
- Match action to intent: discussion, comparison, review, and diagnosis remain within that scope; a change or fix request authorizes the necessary reversible implementation and verification. Preserve authorization already given. Before asking for new authority, finish independent preparation and present a concrete, reviewable result.
- Ask when missing decisions materially affect correctness, scope, or hard-to-reverse outcomes. Resolve routine engineering choices using existing patterns and state consequential assumptions. Explain concrete tradeoffs when a proposed approach undermines the goal.
- Check relevant worktree state before editing and preserve user and concurrent changes. Do not overwrite, revert, or clean up content of uncertain ownership; see §Surgical.
- Lead with the result or key finding. Follow Ryan's formatting and language preferences in `AGENTS.md` → Working With Ryan; include only relevant evidence, limitations, and decisions.
- Keep interaction focused: group independent questions, give recommended answers with reasons, and wait for prerequisites before asking dependent questions. Avoid repeating requests, settled plans, or process logs.
- Keep progress updates brief: report a useful discovery, direction change, or blocker and the next action when relevant. Meet platform update requirements without narrating routine tool calls.
- Finish when the requested deliverable exists, required verification passes, and known limitations are disclosed. Optional improvements do not extend the task indefinitely. If blocked, report completed work, the specific blocker, and the minimum condition needed to continue; do not claim completion.

## §Model-Routing — 主模型负责规划与核心实现，低成本模型执行明确的辅助任务（Claude / Codex 通用）

> Applies to every coding agent (Claude, Codex, others). Keep planning, core feature implementation, business judgment, and final review with the primary high-capability model. Prefer an explicitly selected lower-cost subagent for bounded supporting tasks when the runtime supports it and delegation overhead is justified. This optimizes cost; it does not guarantee fewer total tokens or relax verification.

- **Define the task before delegating.** The primary model specifies scope, inputs, allowed files/actions, expected output, and acceptance checks. For tests, it decides the realistic business scenario, user operation, and assertions first, including §Real-Business-Case-Test multi-leg base→base fixtures where applicable.
- **Lower-cost candidates** (scope already fixed, low blast radius): implementing Playwright/unit tests and fixtures from defined cases; running checks and collecting exact output; initial screenshot triage; repetitive edits; documentation formatting; read-only Git status/diff/history inspection; drafting commit messages and PR descriptions.
- **Primary-model responsibilities**: planning and architecture, core feature implementation, deciding test coverage/assertions, complex failure diagnosis, cascade/KPI reasoning (§Flight-Change-Ripple-Required), base-loop invariants, data-model changes, source-of-truth migrations, legality/rule logic, §Gantt-Unify decisions, performance/security judgment, meaningful merge-conflict resolution, and final review of changes and verification evidence. Escalate supporting work back to the primary model when it requires these decisions.
- **Use supported model selection for both Claude Code and Codex.** Select the lower-cost subagent model explicitly through the current runtime's delegation tool or agent configuration; check current capabilities rather than assuming support. Keep actual model names in runtime configuration or explicit session instructions. Lower reasoning effort alone is not lower-cost-model delegation. Adjust effort only through supported controls; never claim to have switched model or effort without doing so. If model selection/delegation is unavailable, report that limitation and complete the task with the available model.
- **Keep delegation economical.** Delegate only when allowed and the independent subtask's benefit exceeds coordination cost. Pass only relevant context and request concise artifacts/evidence. Keep tiny tasks local. Parallel work can reduce elapsed time without reducing tokens; avoid duplicating the same investigation across agents.
- **Git authorization is unchanged.** Delegation does not authorize commit, push, destructive commands, or history rewriting. Commit/push still require the user's explicit instruction; keep shared-state Git operations coordinated through the primary agent.
- **Review before delivery.** The primary model integrates delegated results and verifies key conclusions without mechanically repeating the whole subtask. Every existing gate still applies — §Simulate-User, §No-Illusion (exact command + PASS/FAIL), and §PW-Snapshot (versioned screenshot, visually inspected). A delegated PASS summary alone does not replace the required evidence.

For substantial work, delegate a bounded, independent supporting task only when the current runtime permits it and the handoff and review cost is justified. Define scope, expected output, and acceptance checks first. The primary model reviews delegated changes and evidence before delivery. Keep small or tightly coupled tasks local. Delegation is not an approval gate and never relaxes verification or Git authorization.

## MCP and Skills

- Discover capabilities from the current session's tool and skill catalogs. A configured server, local skill directory, or old transcript does not prove that a capability is callable now.
- Reuse confirmed context when its source has not changed and there is no unresolved doubt. Locate relevant files, symbols, or document sections before reading deeply; broaden only when evidence is insufficient. Honor required instruction reads, but load supporting skills, memory, and references only when applicable.
- Prefer an available task-specific tool, API, or CLI for direct operations; use browser interaction when the task or real-UI verification requires it. Batch independent reads and queries; sequence dependent operations, shared-state mutations, and verification that relies on them.
- Prefer `codebase-memory-mcp` for code discovery. Check `list_projects`; call `index_repository` with the current repository path only if this checkout is not indexed. Use the returned project identifier in subsequent calls.
- Use `search_graph` for symbols, `trace_path` for callers/callees, `get_code_snippet` for exact qualified names returned by search, `query_graph` for complex relationships, `search_code` for text-aware code search, and `get_architecture` for an overview. Check the current tool schema before supplying arguments.
- If a tool is unavailable or results are insufficient/stale, state the limitation and use available graph tools or `rg` and source reads. Documentation, configuration, and literal searches may use `rg` directly.
- Bound searches by directory, pattern, and output size. For long logs, extract the failure and relevant context while preserving necessary error details. Stop exploration when evidence supports the next decision; move to the requested fix and verification rather than gathering duplicate evidence.
- Read a relevant skill's `SKILL.md` before applying it. Resolve its location from the session catalog; do not assume Claude and Codex expose identical skills or paths. Retained legacy skills are references, not evidence that their module is an active delivery target.
- MemPalace stores development history through `memory/README.md` and the memory scripts; it is separate from the code knowledge graph. Neither replaces current source, schema, or test evidence. Never claim a memory save or indexing operation succeeded without its result.

## Design Before Implementation

Use the agent's native planning, debugging, implementation, and review capabilities. For new functionality, business behavior, or material workflow changes that need a design decision, write a proportionate design in `docs/superpowers/specs/`, covering scope, affected modules, risks, and verification. Resolve material product choices before implementation and apply the authorization and completion rules in Agent Operating Defaults.

Read-only investigation and authorized documentation maintenance do not need a separate design approval. Multi-file edits alone do not determine whether a design is needed. Product skills supply domain knowledge and operational constraints; no Superpowers workflow skill is required. The `docs/superpowers/` directory remains the established location for project records and does not require the plugin.

## Senior Engineering Workflow

All agents and contributors working in this repository must follow Ryan's enterprise engineering workflow:

- Understand before coding: use the context and evidence rules in MCP and Skills; establish affected behavior and business meaning before changing it.
- Follow existing architecture and reuse existing patterns: preserve module boundaries, naming, data flow, and prefer current utilities/components/services/tests over new ones.
- Treat the data model as source of truth: do not change, duplicate, or infer structures without understanding their purpose and relationships.
- Preserve business logic: assume complex logic exists for a reason; understand it before modifying, simplifying, or deleting it.
- Source-of-truth migrations: when a business field changes owner/storage/derivation, follow `docs/architecture/source-of-truth-migration-gate.md` before implementation.
- Validate every change according to §No-Illusion and the applicable module checks.
- Explain significant design decisions before implementing them, including affected modules, risks, and alternatives when the change is material; if a requirement conflicts with architecture, propose trade-offs instead of forcing it.
- Detect dead ends early: use failure evidence to revise the hypothesis or method. Do not repeat an unchanged failing approach; use bounded retries only when evidence indicates a transient fault.

> Smallest-change and touch-only-what's-needed discipline is covered by §Minimal-First and §Surgical below — not repeated here.

## §Minimal-First — 实现最小可解，不做投机性复杂化（强制执行）

**Write the minimum code that solves the actual request. Nothing speculative.** 只实现被请求的东西，**禁止**为「以后可能用到」预埋抽象（Strategy/工厂/抽象基类只有一个实现）、配置开关（dictionary 里无对应项）、缓存/批处理/重试等无人要求的基础设施、或为不可能出现的输入写防御性分支。提交前自问：一个资深工程师会不会把它标记为「过度设计」？会，就简化。

不算过度设计：CLAUDE.md 已强制的参数化（从 `dictionary` 读业务常量）、§First-Paint 要求的分页/懒加载、抽取重复逻辑为复用方法——这些是**已确认**的真实需求，不是投机。

---

## §Surgical — 只动该动的，不顺手重构（强制执行）

**Touch only what the task requires. Clean up only your own mess.** drive-by 重构会放大 diff、掩盖真实改动、增加回归面——改动只覆盖完成任务所必需的行，保持被改文件的现有风格，只移除本次改动产生的未用依赖。

Remove only temporary artifacts created for this task and confirmed unnecessary. Preserve deliverables and reproduction evidence. Do not change global rules or persistent memory unless requested; authorized project context saves follow Development Memory in `AGENTS.md`.

唯一例外（优先于本节）：改到的文件里命中「样式与排版标准」的历史魔法值必须顺手归一到 token；改到的区域发现 stale 测试按 §Stale-Test 重写。除此之外的「顺手优化」一律先单独提出、单独提交。

---

## AI 文档目录规范

所有 AI（Claude、Codex、其他 agent）生成或维护的开发文档，统一放在根目录 `docs/` 下。后续禁止新增 `doc/` 下的 AI 开发文档；如果旧文档仍在 `doc/` 或模块私有 `docs/` 中，迁移时单独规划，不在日常开发中继续扩散。

目录职责：

| 目录 | 用途 |
|------|------|
| `docs/ai/` | AI 文档放置规范、协作约定、目录说明 |
| `docs/dev-context/` | AI / Claude / Codex 对话上下文与开发决策快照 |
| `docs/superpowers/specs/` | 需求确认、设计文档、正式 spec |
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

