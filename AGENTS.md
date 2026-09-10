# ROIS-AI Agent Entry Point

## Load the Right Context

1. Read root `CLAUDE.md`, the canonical shared project guide for Claude, Codex, and other coding agents.
2. Read `NEXT_CONTEXT.md` when resuming prior work. Context recovery instructions do not cancel an explicit current task.
3. Before module edits, read its `AGENTS.md` / `AGENTS.override.md` and `CLAUDE.md` when present. Inspect the relevant source and tests, not every module.
4. For ports and public routing, read `.agents/skills/005-routing-debug/SKILL.md` and, on Kimi's machine, the supplemental memo `/Users/kimi/.codex/local-memos/rois-port-usage.md`. Verify the current service configuration before starting a server.

Shared project rules belong in `CLAUDE.md` or referenced `docs/` files. Do not duplicate their full text here. Module-specific instructions apply within their scope; root `CLAUDE.md` resolves duplicate shared rules between the two root guides. Session system/developer instructions and explicit user direction take precedence.

## Working With Ryan

- At the first response of a cold session, use the actual Mac local time: `Hey Good day, <yyyy-mm-dd HH:MM>, Ryan and Kimi ~`.
- Lead with plain English and the product/data flow. Keep final answers concise.
- Explain material risks, uncertainty, and test gaps. When a real product choice is needed, offer 2-3 options with a recommendation.
- Continue authorized work through implementation and verification. Ask for missing business decisions, not routine reversible engineering choices or permission already given.

## Daily Workflow

- Follow **MCP and Skills**, **Design Before Implementation**, and **Senior Engineering Workflow** in `CLAUDE.md`.
- Prefer the codebase-memory graph for code discovery; check current tool availability and indexing. Use `rg` for docs/config/literals or insufficient graph results.
- Resolve skills through the session catalog and read the applicable `SKILL.md`. Old model names, local installation paths, and prior transcripts are not capability guarantees.
- Inspect the worktree before editing. Preserve other contributors' changes, including concurrent work.
- Follow **Current F8 Engine Scope**: `pbs-engine` for optimization and `rule-engine-rs` for legality. Retained legacy and future-workflow modules are not default F8 targets.
- Reuse current architecture and utilities; keep changes scoped. Business ownership migrations require `docs/architecture/source-of-truth-migration-gate.md`.
- Do not commit or push without the user's explicit instruction.

## Delivery Checks

All detailed checks live in `CLAUDE.md`. Before claiming completion:

- Identify affected modules and run the smallest relevant verification, broadening for shared contracts or data writes.
- Every change affecting what a user does or sees requires real-UI Playwright validation, including backend, permissions, scripts, and SQL/data changes. Assert the user-visible outcome; API/DB checks alone do not replace this gate.
- Capture and visually inspect a screenshot from that same Playwright run under `docs/assets/screenshots/<module>/`. Preserve earlier captures with `-Ver<N>` filenames on repeat validation. Report the test command, PASS/FAIL, and screenshot path; update legitimate stale tests.
- Backend behavior needs focused tests using the module's framework. Bug fixes need regression coverage, or an explicit explanation of why it was infeasible.
- PBS business changes also require considering manual QA cases under `docs/test-cases/pbs/`.
- Frontend style changes require `npm run check:ui`; documentation-only changes require diff, path, and consistency checks, not runtime builds.
- Report exact commands with PASS/FAIL, unrun required checks, and remaining risks.

## Development Memory

Use `NEXT_CONTEXT.md` and `memory/README.md` for development history. MemPalace and codebase-memory serve different purposes; current source and schema remain authoritative.

Save substantial cross-module work, API/schema changes, and durable decisions with `./save-context.sh <wing> <topic>` under `docs/dev-context/`. Verify the result and report any indexing failure. Small edits and explanations do not need a context save.

Formal designs belong in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, handoffs in `docs/handoff/<module>/`, and audit findings in timestamped, versioned documents under `docs/`. Never put secrets or product-user memory into development docs.
