# F8 Delivery Engine Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark the current F8 delivery engine scope, remove the obsolete `rust-ro-engine` copy, and hide only the floating R'Bot UI while keeping Regression available.

**Architecture:** Documentation becomes the source of truth for current engine ownership: `pbs-engine` for optimization and `rule-engine-rs` for legality. Legacy projects stay in the tree only when they still have a current reference purpose. The UI change is a minimal shell-level unmount of `AiChatPanel`, leaving ai-server and Regression untouched.

**Tech Stack:** Markdown docs, Git tracked-file deletion, React/Vite/TypeScript, Vitest or existing Gantt test runner, Playwright where available for authenticated shell UI.

---

## File Map

- Modify: `AGENTS.md` and `CLAUDE.md` to mark current F8 scope.
- Modify: `docs/architecture/codebase-index.md` and related architecture docs to point current optimization/rule work to `pbs-engine` / `rule-engine-rs`.
- Modify: `docs/modules/dev/local-start-playbook.md`, `docs/modules/ro-engine/solver-playbook.md`, `docs/deployment/deployment-guide.md`, and AI-facing skill metadata when they present legacy modules as active F8 delivery targets.
- Delete: `rust-ro-engine/**`.
- Modify: `gantt/src/components/shell/app-shell.tsx` to stop importing and mounting `AiChatPanel`.
- Add or update focused Gantt test coverage for hidden R'Bot and visible Regression.

## Task 1: Confirm Current References And Protect Existing Dirty Files

**Files:**
- Read only: repo root and docs.

- [ ] **Step 1: Capture current dirty state**

Run:

```powershell
git status --short --branch
```

Expected: note any pre-existing unrelated dirty files, especially `AGENTS.md`, `CLAUDE.md`, and `docs/superpowers/specs/2026-07-09-merged-branch-archive-rule-design.md`. If editing `AGENTS.md` and `CLAUDE.md` for this task, inspect their current diffs first and preserve existing user changes.

- [ ] **Step 2: Search scope references**

Run:

```powershell
rg -n "\b(ro-engine|po-engine|rust-ro-engine|crewrule-dev|ai-server|pbs-engine|rule-engine-rs)\b" AGENTS.md CLAUDE.md docs .agents gantt/src --glob "!node_modules/**" --glob "!dist/**" --glob "!build/**"
```

Expected: results include current docs and AI-facing skill metadata. Use this list to choose current guidance files; do not rewrite every historical spec.

- [ ] **Step 3: Confirm `rust-ro-engine` has no external consumers**

Run:

```powershell
rg -n "rust-ro-engine|rust_ro_engine|_python_reference" . --glob "!rust-ro-engine/**" --glob "!node_modules/**" --glob "!dist/**" --glob "!build/**" --glob "!pbs-engine/**"
```

Expected: no output. If output exists, update or remove those references before deleting `rust-ro-engine`.

## Task 2: Update Current Documentation Contract

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture/codebase-index.md`
- Modify: `docs/architecture/rule-migration-playbook.md`
- Modify: `docs/modules/dev/local-start-playbook.md`
- Modify: `docs/modules/ro-engine/solver-playbook.md`
- Modify: `docs/deployment/deployment-guide.md`
- Modify: selected `.agents/skills/**/SKILL.md` files and `gantt/src/components/dev/dev-skills-data.generated.ts` only when they describe legacy engines as active F8 targets.

- [ ] **Step 1: Add the canonical F8 engine scope block**

Add the following concise contract to root guidance and architecture docs near the project structure or engine sections:

```markdown
### Current F8 Engine Scope

- Optimization engine: `pbs-engine/` is the active PBS optimization engine source.
- Legality engine: `rule-engine-rs/` is the active Rust legality engine.
- `ro-engine/` and `po-engine/` are temporarily retained legacy modules and are not active F8 delivery development targets.
- `crewrule-dev/` is legacy C++ reference material for porting/verifying Rust rules in `rule-engine-rs`.
- `ai-server/` is retained for future AI workflows but is outside the current F8 delivery scope.
```

- [ ] **Step 2: Update project structure rows**

Change project-structure descriptions so they do not imply `ro-engine` / `po-engine` are current F8 optimization executables. Use wording like:

```markdown
├── pbs-engine/      # Active PBS optimization engine submodule
├── rule-engine-rs/  # Active Rust legality engine
├── po-engine/       # Legacy PO engine, temporarily retained; not current F8 delivery scope
├── ro-engine/       # Legacy RO engine/baselines, temporarily retained; not current F8 delivery scope
├── crewrule-dev/    # Legacy C++ rule reference for Rust rule ports
├── ai-server/       # AI service retained for future workflows; outside current F8 delivery scope
```

- [ ] **Step 3: Update architecture index engine note**

In `docs/architecture/codebase-index.md`, replace notes that say engine internals are active black-box processes with current wording:

```markdown
Current F8 optimization runs through `pbs-engine/` via engine-server integration scripts. `ro-engine/` and `po-engine/` remain in the repository as retained legacy modules and baseline/reference material, but they are not active F8 delivery development targets.
```

- [ ] **Step 4: Update rule migration wording**

In `docs/architecture/rule-migration-playbook.md`, keep `crewrule-dev` references, but state that it is old C++ reference material:

```markdown
`crewrule-dev/` is the legacy C++ rule source and test oracle. New legality implementation belongs in `rule-engine-rs/`; use C++ files only to understand and verify rule behavior.
```

- [ ] **Step 5: Update local start and deployment docs**

In `docs/modules/dev/local-start-playbook.md` and `docs/deployment/deployment-guide.md`, make `pbs-engine` the optimization engine path and mark `ai-server` as optional/out of current F8 delivery. Keep Regression references if they describe developer tooling, not delivery scope.

- [ ] **Step 6: Update AI-facing skill guidance**

For `.agents/skills/133-ro-solver-algorithm/SKILL.md` and generated dev skill metadata, replace active RO Python solver language with a warning at the top:

```markdown
F8 scope note: `ro-engine/` is retained legacy material. Current F8 PBS optimization work uses `pbs-engine/`; current legality work uses `rule-engine-rs/`.
```

If a skill is intentionally a historical capture/baseline skill, keep it but clarify it is for legacy baseline/reference work only.

## Task 3: Remove Obsolete `rust-ro-engine`

**Files:**
- Delete: `rust-ro-engine/**`

- [ ] **Step 1: Count tracked files before deletion**

Run:

```powershell
(git ls-files rust-ro-engine | Measure-Object).Count
```

Expected: a positive count. Record it for the final response.

- [ ] **Step 2: Remove tracked directory**

Run:

```powershell
git rm -r rust-ro-engine
```

Expected: deletions are staged for all tracked files under `rust-ro-engine`.

- [ ] **Step 3: Verify no tracked files remain**

Run:

```powershell
git ls-files rust-ro-engine
```

Expected: no output.

## Task 4: Hide Floating R'Bot, Keep Regression

**Files:**
- Modify: `gantt/src/components/shell/app-shell.tsx`
- Add or modify: a focused Gantt test file near existing shell/app tests.

- [ ] **Step 1: Write or update a failing UI contract test**

Find an existing shell/nav test. If none exists, create a focused test that renders `AppShell` with minimal store mocks and asserts:

```typescript
expect(screen.queryByTestId('ai-chat-toggle')).not.toBeInTheDocument()
expect(screen.getByTestId('nav-regression')).toBeInTheDocument()
```

If the project uses Playwright for shell-level UI tests instead, add a focused authenticated test that loads the app and asserts:

```typescript
await expect(page.getByTestId('ai-chat-toggle')).toHaveCount(0)
await expect(page.getByTestId('nav-regression')).toBeVisible()
```

- [ ] **Step 2: Run the focused test and confirm it fails before implementation**

Run the matching focused test command, for example:

```powershell
npm -C gantt run test -- app-shell
```

or:

```powershell
npx playwright test e2e/tests/gantt/<focused-file>.spec.ts --reporter=list
```

Expected before implementation: failure because `ai-chat-toggle` is still rendered.

- [ ] **Step 3: Remove the shell import and mount**

In `gantt/src/components/shell/app-shell.tsx`, remove:

```typescript
import { AiChatPanel } from '@/components/ai-chat/ai-chat-panel'
```

and remove this JSX:

```tsx
{/* Floating AI assistant — available on every module */}
<AiChatPanel />
```

Do not delete `gantt/src/components/ai-chat/**` or `ai-server/**`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run the same command from Step 2.

Expected after implementation: PASS; R'Bot trigger absent and Regression nav visible.

## Task 5: Final Verification And Review

**Files:**
- Review all touched files.

- [ ] **Step 1: Scan for obsolete `rust-ro-engine` references**

Run:

```powershell
rg -n "rust-ro-engine|rust_ro_engine" . --glob "!node_modules/**" --glob "!dist/**" --glob "!build/**"
```

Expected: no output, except possibly historical git metadata is not searched by `rg`.

- [ ] **Step 2: Confirm engine scope wording**

Run:

```powershell
rg -n "Current F8 Engine Scope|pbs-engine|rule-engine-rs|temporarily retained legacy|outside the current F8 delivery scope" AGENTS.md CLAUDE.md docs/architecture docs/modules docs/deployment .agents gantt/src/components/dev
```

Expected: current guidance files identify `pbs-engine` and `rule-engine-rs` as active and mark retained legacy/out-of-scope modules clearly.

- [ ] **Step 3: Run frontend quality gates**

Run:

```powershell
npm run check:ui
```

Expected: PASS with zero hard UI violations. If no CSS/style files changed but shell UI changed, still run and report the result.

- [ ] **Step 4: Run GitNexus detect changes**

Run:

```powershell
node .gitnexus/run.cjs detect-changes
```

Expected: PASS if local GitNexus dependencies are installed. If it fails with `LadybugDB package (@ladybugdb/core) is not installed`, report that exact blocker.

- [ ] **Step 5: Review staged boundary**

Run:

```powershell
git status --short --branch
git diff --name-status
git diff --cached --name-status
```

Expected: only this task's documentation, `rust-ro-engine` deletions, R'Bot shell change, and tests are staged for commit. Preserve unrelated pre-existing dirty files unless the user explicitly asks to include them.

## Task 6: Commit And Push If Requested

**Files:**
- Stage only task files.

- [ ] **Step 1: Stage task files only**

Run explicit `git add` commands for the edited docs, shell file, tests, generated metadata if edited, and `git add -u rust-ro-engine`.

- [ ] **Step 2: Commit**

Run:

```powershell
git commit -m "docs: mark F8 engine delivery scope"
```

Expected: one commit for scope docs, `rust-ro-engine` removal, and R'Bot hiding.

- [ ] **Step 3: Push only when asked**

Run:

```powershell
git push origin main
```

Expected: `main -> main` push succeeds.
