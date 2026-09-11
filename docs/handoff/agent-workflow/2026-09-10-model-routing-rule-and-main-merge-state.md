# Handoff — §Model-Routing rule + main merge state

**Date:** 2026-09-10
**Author:** Claude (Opus 4.8), with Ryan
**Scope:** Agent operating rules (CLAUDE.md / AGENTS.md) + a caution about the current git worktree state.

---

## 1. What was done (DONE, already on origin/main)

Added a new cost-aware delegation rule to the shared agent guide:

- **`CLAUDE.md` → `## §Model-Routing`** — agent-neutral rule. Split work by the seam
  between **judgment** and **mechanical execution**: keep judgment at full model
  capability, run mechanical execution at the cheapest capability that still produces a
  correct artifact. Never lowers a correctness/verification bar.
  - Per-agent mechanism (phrased by behavior, no model names / no invented settings, per
    the "keep instructions independent of model names" contract):
    - **Claude Code** → delegate the mechanical artifact (PW script body, fixtures,
      repetitive edits, running `check:ui`/tests, screenshot triage, doc formatting) to a
      **lower-cost subagent** via the Agent tool once the scenario is pinned; primary model
      reviews before "done".
    - **Codex** → **down-shift reasoning effort** for mechanical steps, raise it for
      judgment, and keep context tight (progressive loading, codebase-memory graph / `rg`
      over dumping whole files — Codex's biggest token cost is over-loaded context).
  - All existing gates still apply to the cheaply-produced artifact: §Simulate-User,
    §No-Illusion (paste exact command + PASS/FAIL), §PW-Snapshot (versioned screenshot,
    visually inspected).
- **`AGENTS.md`** (Codex entrypoint) → one-line pointer added to the named-rules list under
  Daily Workflow, referencing §Model-Routing (no duplicated text).

**Status:** ✅ Verified live on `origin/main` — `git grep -c "Model-Routing" origin/main -- CLAUDE.md AGENTS.md` returns 1 each.

## 2. "Merge to main and push" — already satisfied on the remote

Ryan asked to merge to main and push. Investigation showed **the concurrent session
already did it** (in worktree `/Users/kimi/DevOps/.worktrees/ROIs-Recovery-Ver1-roundtrip-merge`,
which has `main` checked out):

- `origin/main` top at time of writing: `3f49411 fix(pairing): compute build-time credit so ET/EK pairings carry real credit`.
- `origin/main` already contains the feature merge **plus 12 further commits** of
  recovery + cost-library work (`recovery-cost.ts`, `cost-library`, `pg-error`, etc.).

**Nothing to push.** The request is satisfied on the remote.

## 3. ⚠️ Caution for the next session — do NOT force-push this checkout

This working directory is checkout `feat/gantt/roundtrip-pairing-builder` @ `ffcbe34`:

- It is **BEHIND** `origin/main` (origin/main is ahead by ~12 commits / 99 files / +4294 lines).
- **Force-pushing `ffcbe34` to main would REGRESS main** — wiping the recovery/cost-library work. Do not do it.
- The tree was **dirty (18–19 files)** and belongs to a concurrent session. Mix of:
  - real edits: `gantt/src/components/pairing/duty-node-*.tsx`, `duty-node-utils.ts`,
    `live-server/src/services/roster/auto-assign-service.ts`, `legality-recheck-core.mjs`,
    `verify-rule-batch-parity.mjs`, new `e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts`
    + `-Ver1/-Ver2` screenshots.
  - throwaway debug: `live-server/scratch-7305-*.mjs`, `live-server/probe-7305-timing.mjs`.

## 4. Repo was actively churning during this session

Multiple worktrees / a concurrent agent were moving refs and switching branches mid-session
(branch flipped `feat/gantt/roundtrip-pairing-builder` ↔ `tmp-credit-merge`; MEMORY.md changed
on disk; dirty→clean→dirty). Worktrees seen:

- `.worktrees/ROIs-Recovery-Ver1-roundtrip-merge` → `main`
- `.worktrees/ROIs-Recovery-Ver1-f8-crew-app-live-roster` → `feat/f8-crew-app-live-roster`

**Before any merge/push, re-snapshot** (`git branch --show-current`, `git status --short`,
`git rev-list --left-right --count origin/main...main`) and confirm activity has settled.
Note `main` is checked out in another worktree, so `git checkout main` here will be refused.

## 5. Open item (needs Ryan's go-ahead)

Sync this working directory to `origin/main`? It's behind and dirty. If yes: **stash/save the
real edits first** (§3) — they are not obviously on main — then fast-forward. Left to the
session that owns this tree; Ryan had not decided at handoff time.
