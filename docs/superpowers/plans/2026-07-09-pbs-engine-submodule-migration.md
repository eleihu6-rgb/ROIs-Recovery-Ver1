# PBS Engine Submodule Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the embedded PBS solver copy with a root-level `pbs-engine` submodule pointing at `https://github.com/yuapply/PBS_column_based_algorithm.git`.

**Architecture:** The parent repository will own integration scripts, docs, and baseline artifacts; `pbs-engine` will own solver source. Runtime and test paths that used the removed embedded solver copy will resolve directly to `pbs-engine`, with no legacy compatibility path or official stale-path documentation.

**Tech Stack:** Git submodules, PowerShell, Bash scripts, Python path constants/comments, TypeScript generated metadata/docs.

---

## File Map

- Modify `.gitmodules`: add the `pbs-engine` submodule entry.
- Create Git index entry `pbs-engine`: gitlink mode `160000` for `yuapply/PBS_column_based_algorithm.git`.
- Delete tracked files under the removed embedded solver-copy path: remove the embedded solver copy from the parent repository.
- Modify `deploy/sit/deploy.sh`: replace removed embedded-copy source and pyproject references with `pbs-engine`.
- Modify `scripts/pull-solver.sh`: remove the old CoreServer-to-embedded-copy sync behavior and make the script direct maintainers to update the `pbs-engine` submodule instead.
- Modify `engine-server/F8/ro_rust.sh`: update default `RO_SOLVER_DIR` to the actual solver root under `pbs-engine`.
- Modify `engine-server/F8/ro_solver_wrapper.py`: update stale comments mentioning the removed embedded copy.
- Modify `rule-engine-rs/ro-tests/ro_check.py`: update path resolution to `pbs-engine`.
- Modify `rule-engine-rs/py/bench_check_single.py`: update path resolution to `pbs-engine`.
- Modify `e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts`: update comments that describe the solver path.
- Modify `gantt/src/components/dev/dev-skills-data.generated.ts`: update AI-facing generated metadata text to `pbs-engine`.
- Modify current docs under `docs/` that reference removed solver-copy paths: update to `pbs-engine` and keep only current guidance.
- Modify `.agents/skills/104-run-pbs-solver-local/SKILL.md` if it references the removed embedded copy: update to `pbs-engine`.

## Task 1: Add `pbs-engine` Submodule And Inspect Layout

**Files:**
- Modify: `.gitmodules`
- Create: `pbs-engine` gitlink

- [ ] **Step 1: Confirm no existing `pbs-engine` path conflicts**

Run:

```powershell
Test-Path pbs-engine
git submodule status --recursive
```

Expected:

```text
False
```

`git submodule status --recursive` should list the existing `pbs-optimization-report` and `rule-engine-rs` submodules, but not `pbs-engine`.

- [ ] **Step 2: Add the submodule**

Run:

```powershell
git submodule add https://github.com/yuapply/PBS_column_based_algorithm.git pbs-engine
```

Expected: Git clones the repository into `pbs-engine` and stages changes to `.gitmodules` plus the `pbs-engine` gitlink.

- [ ] **Step 3: Inspect the new repository layout**

Run:

```powershell
Get-ChildItem -Force pbs-engine | Select-Object Name,Mode,Length
git -C pbs-engine remote -v
git -C pbs-engine status --short --branch
```

Expected:

```text
origin  https://github.com/yuapply/PBS_column_based_algorithm.git (fetch)
origin  https://github.com/yuapply/PBS_column_based_algorithm.git (push)
```

Record whether the runnable solver root is `pbs-engine` or a nested directory such as `pbs-engine/PBS_column_based_algorithm`.

- [ ] **Step 4: Verify gitlink mode**

Run:

```powershell
git ls-files --stage pbs-engine
```

Expected: one row beginning with mode `160000`.

## Task 2: Remove Embedded Snapshot Files

**Files:**
- Delete: tracked files under the removed embedded solver-copy path

- [ ] **Step 1: Count tracked embedded-copy files before removal**

Run the tracked-file count against the embedded solver-copy path identified during implementation.

Expected: current baseline is `266` tracked files unless the workspace changed.

- [ ] **Step 2: Remove tracked embedded-copy files from the parent repository**

Run `git rm -r` against the embedded solver-copy path identified during implementation.

Expected: Git stages deletions for tracked files under the removed embedded solver-copy path.

- [ ] **Step 3: Confirm the parent repo no longer tracks the removed embedded-copy path**

Run `git ls-files` against the embedded solver-copy path identified during implementation.

Expected: no output.

Do not create a README or any other marker under the removed embedded-copy path.

## Task 3: Update Runtime And Deployment Script Paths

**Files:**
- Modify: `deploy/sit/deploy.sh`
- Modify: `scripts/pull-solver.sh`
- Modify: `engine-server/F8/ro_rust.sh`
- Modify: `engine-server/F8/ro_solver_wrapper.py`

- [ ] **Step 1: Read current PBS engine references**

Run a focused search for PBS engine path patterns in `deploy`, `scripts`, and `engine-server`.

Expected: references in `deploy/sit/deploy.sh`, `scripts/pull-solver.sh`, `engine-server/F8/ro_rust.sh`, and `engine-server/F8/ro_solver_wrapper.py`.

- [ ] **Step 2: Update `deploy/sit/deploy.sh`**

Change removed embedded-copy solver paths from:

```bash
$ROIS_AI/(embedded solver copy)
$ROIS_AI/(embedded solver copy)/PBS_column_based_algorithm/pyproject.toml
$PORTAL_DEV/(embedded solver copy)
```

to the inspected `pbs-engine` solver root. If Task 1 finds `pyproject.toml` at `pbs-engine/pyproject.toml`, use:

```bash
$ROIS_AI/pbs-engine/pyproject.toml
$ROIS_AI/pbs-engine
$PORTAL_DEV/pbs-engine
```

If Task 1 finds the solver root nested under `pbs-engine/PBS_column_based_algorithm`, use:

```bash
$ROIS_AI/pbs-engine/PBS_column_based_algorithm/pyproject.toml
$ROIS_AI/pbs-engine
$PORTAL_DEV/pbs-engine
```

- [ ] **Step 3: Rewrite `scripts/pull-solver.sh` to stop repopulating removed embedded source**

Replace the script body with a short, executable failure that points to submodule update. Use this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'MSG'
The embedded PBS solver copy has been removed.

Use the pbs-engine submodule instead:
  git submodule update --init --recursive pbs-engine
  git -C pbs-engine pull --ff-only

Solver source now lives at: pbs-engine
MSG

exit 1
```

- [ ] **Step 4: Update `engine-server/F8/ro_rust.sh` default solver root**

If Task 1 finds the runnable solver root at `pbs-engine`, set:

```bash
SNAP="${RO_SOLVER_DIR:-$REPO_ROOT/pbs-engine}"
```

If Task 1 finds a nested solver root, set:

```bash
SNAP="${RO_SOLVER_DIR:-$REPO_ROOT/pbs-engine/PBS_column_based_algorithm}"
```

Also update adjacent comments to say `pbs-engine`, with no mention of removed embedded-copy paths.

- [ ] **Step 5: Update `engine-server/F8/ro_solver_wrapper.py` comments**

Replace stale comment text:

```python
without touching removed embedded-copy paths or monkey-patching Python objects.
```

with:

```python
without monkey-patching solver Python objects in pbs-engine.
```

- [ ] **Step 6: Syntax-check touched shell scripts**

Run:

```powershell
bash -n deploy/sit/deploy.sh
bash -n scripts/pull-solver.sh
bash -n engine-server/F8/ro_rust.sh
```

Expected: no output and exit code `0` for each command.

## Task 4: Update Test, Bench, And E2E References

**Files:**
- Modify: `rule-engine-rs/ro-tests/ro_check.py`
- Modify: `rule-engine-rs/py/bench_check_single.py`
- Modify: `e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts`

- [ ] **Step 1: Read current references**

Run:

```powershell
rg -n "embedded solver copy path patterns" rule-engine-rs e2e
```

Expected: references in the three files listed above.

- [ ] **Step 2: Update `rule-engine-rs/ro-tests/ro_check.py`**

Replace the removed embedded-copy path segment:

```python
/ "ro-engine"
/ "(embedded solver copy segment)"
```

with the inspected `pbs-engine` path. If Task 1 finds root solver layout, use:

```python
/ "pbs-engine"
```

If Task 1 finds nested solver layout, use:

```python
/ "pbs-engine"
/ "PBS_column_based_algorithm"
```

- [ ] **Step 3: Update `rule-engine-rs/py/bench_check_single.py`**

If Task 1 finds root solver layout, change:

```python
SNAP = Path(__file__).resolve().parents[2] / "ro-engine" / "(embedded solver copy segment)" / "PBS_column_based_algorithm"
```

to:

```python
SNAP = Path(__file__).resolve().parents[2] / "pbs-engine"
```

If Task 1 finds nested solver layout, change it to:

```python
SNAP = Path(__file__).resolve().parents[2] / "pbs-engine" / "PBS_column_based_algorithm"
```

- [ ] **Step 4: Update E2E comment**

In `e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts`, make the solver path comment current:

```typescript
 *          Runs the local PBS solver from pbs-engine with rule_engine.mode=rust
```

- [ ] **Step 5: Run Python compile checks for changed Python files**

Run:

```powershell
python -m py_compile rule-engine-rs/ro-tests/ro_check.py rule-engine-rs/py/bench_check_single.py engine-server/F8/ro_solver_wrapper.py
```

Expected: no output and exit code `0`.

## Task 5: Update AI-Facing Metadata And Docs

**Files:**
- Modify: `gantt/src/components/dev/dev-skills-data.generated.ts`
- Modify: `.agents/skills/104-run-pbs-solver-local/SKILL.md`
- Modify: docs found by `rg`.

- [ ] **Step 1: Find all PBS engine references in active docs and metadata**

Run:

```powershell
rg -n "embedded solver copy path patterns" gantt/src/components/dev .agents docs
```

Expected: old references in generated dev skill metadata, skill files, and docs.

- [ ] **Step 2: Update `gantt/src/components/dev/dev-skills-data.generated.ts`**

Replace each old phrase:

```text
pbs-engine/
```

with the inspected current solver root, either:

```text
pbs-engine/
```

or:

```text
pbs-engine/PBS_column_based_algorithm/
```

Use "pbs-engine submodule" as the current source wording.

- [ ] **Step 3: Update `.agents/skills/104-run-pbs-solver-local/SKILL.md`**

Replace all current solver path instructions with `pbs-engine` or the inspected nested solver root.

- [ ] **Step 4: Update docs to current-only wording**

For each `docs/**` file returned by Step 1, use `pbs-engine`. Do not add historical breadcrumbs. For historical plan/spec docs that are still active AI references, update their path language to the current source path.

- [ ] **Step 5: Confirm old references are gone from metadata and docs**

Run:

```powershell
rg -n "embedded solver copy path patterns" gantt/src/components/dev .agents docs
```

Expected: no output.

## Task 6: Final Verification And Change Review

**Files:**
- Review all files changed by Tasks 1-5.

- [ ] **Step 1: Confirm old effective references are gone repo-wide**

Run:

```powershell
rg -n "embedded solver copy path patterns" -S .
```

Expected: no output.

- [ ] **Step 2: Confirm submodule state**

Run:

```powershell
git submodule status --recursive
git ls-files --stage pbs-engine
git config --file .gitmodules --get-regexp "submodule\\.pbs-engine\\..*"
```

Expected:

```text
160000 <commit> 0	pbs-engine
submodule.pbs-engine.path pbs-engine
submodule.pbs-engine.url https://github.com/yuapply/PBS_column_based_algorithm.git
```

- [ ] **Step 3: Confirm embedded-copy files are no longer tracked**

Run `git ls-files` against the embedded solver-copy path identified during implementation.

Expected: no output.

- [ ] **Step 4: Run syntax and compile checks**

Run:

```powershell
bash -n deploy/sit/deploy.sh
bash -n scripts/pull-solver.sh
bash -n engine-server/F8/ro_rust.sh
python -m py_compile rule-engine-rs/ro-tests/ro_check.py rule-engine-rs/py/bench_check_single.py engine-server/F8/ro_solver_wrapper.py
```

Expected: no output and exit code `0`.

- [ ] **Step 5: Try GitNexus change detection**

Run:

```powershell
node .gitnexus/run.cjs detect-changes
```

Expected: PASS if local GitNexus dependencies are installed. If it fails with the current known error:

```text
LadybugDB package (@ladybugdb/core) is not installed.
```

report that blocker exactly and do not claim the GitNexus gate passed.

- [ ] **Step 6: Review final changed files**

Run:

```powershell
git status --short
git diff -- .gitmodules deploy/sit/deploy.sh scripts/pull-solver.sh engine-server/F8/ro_rust.sh engine-server/F8/ro_solver_wrapper.py rule-engine-rs/ro-tests/ro_check.py rule-engine-rs/py/bench_check_single.py e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts gantt/src/components/dev/dev-skills-data.generated.ts .agents/skills/104-run-pbs-solver-local/SKILL.md docs
```

Expected: changes are limited to the approved migration and pre-existing unrelated dirty files remain untouched.

## Task 7: Optional Commit Preparation

**Files:**
- Stage only migration files after verification.

- [ ] **Step 1: Stage migration files only**

Run:

```powershell
git add .gitmodules pbs-engine deploy/sit/deploy.sh scripts/pull-solver.sh engine-server/F8/ro_rust.sh engine-server/F8/ro_solver_wrapper.py rule-engine-rs/ro-tests/ro_check.py rule-engine-rs/py/bench_check_single.py e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts gantt/src/components/dev/dev-skills-data.generated.ts .agents/skills/104-run-pbs-solver-local/SKILL.md docs/superpowers/specs/2026-07-09-pbs-engine-submodule-migration-design.md docs/superpowers/plans/2026-07-09-pbs-engine-submodule-migration.md
```

If docs changed outside `docs/superpowers/**`, add those exact doc files explicitly after reviewing them.

- [ ] **Step 2: Commit only if required gates are satisfied or user explicitly accepts the GitNexus blocker**

Run only when allowed:

```powershell
git commit -m "chore: migrate pbs solver to pbs-engine submodule"
```

Expected: one commit containing the submodule migration and updated references.
