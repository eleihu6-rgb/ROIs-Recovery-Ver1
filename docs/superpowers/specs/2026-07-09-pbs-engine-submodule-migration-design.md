# PBS Engine Submodule Migration Design

Date: 2026-07-09

## Goal

Introduce `pbs-engine` as the latest PBS optimization engine source, managed as a Git submodule at the repository root:

```text
pbs-engine -> https://github.com/yuapply/PBS_column_based_algorithm.git
```

The existing in-repository embedded solver copy will be removed from the parent repository. All code, scripts, tests, generated metadata, and documentation that currently point at the embedded copy will be updated to point at `pbs-engine`.

`pbs-optimization-report` is a separate report submodule and remains unchanged.

## Non-Goals

- Do not preserve a legacy compatibility path for the removed embedded solver copy.
- Do not leave official documentation pointing readers or AI agents at removed solver-copy paths.
- Do not change solver algorithms or business behavior as part of this migration.
- Do not move or modify the existing `pbs-optimization-report` submodule.
- Do not introduce wrapper scripts, symlinks, or fallback path probing unless a current runtime entrypoint needs a minimal path-root helper.

## Current State

The parent repository currently tracks an embedded solver copy as normal files; a local check found 266 tracked files there. References to that embedded copy exist in deployment scripts, local solver helper scripts, engine-server shell wrappers, rule-engine-rs tests/benchmarks, E2E comments, generated dev skill metadata, and docs.

The parent repository already has these submodules:

- `rule-engine-rs`
- `pbs-optimization-report`

The new `pbs-engine` submodule is distinct from both.

## Target State

Repository structure:

```text
rois-ai/
+-- pbs-engine/                 # Git submodule: yuapply/PBS_column_based_algorithm.git
+-- pbs-optimization-report/    # Existing report submodule, unchanged
+-- rule-engine-rs/             # Existing Rust rule engine submodule, unchanged
`-- ro-engine/
    `-- ...                     # No embedded PBS solver copy
```

Path ownership:

- `pbs-engine` owns PBS column-generation optimizer source.
- `ro-engine` continues to own RO integration context and baseline artifacts, but not the copied PBS solver source.
- Engine-server scripts that launch the PBS solver resolve the solver from `pbs-engine`.

Documentation rule:

- Official docs and AI-facing generated metadata must describe `pbs-engine` as the current source path.
- Removed solver-copy references are not preserved as migration breadcrumbs, because stale path hints can mislead future agents.

## Files And Areas To Update

Expected touched areas:

- `.gitmodules` and Git index: add `pbs-engine` submodule.
- Removed embedded solver-copy path: remove tracked files from the parent repository.
- `deploy/sit/deploy.sh`: update solver source and pyproject path assumptions.
- `scripts/pull-solver.sh`: retire or rewrite CoreServer solver-copy sync behavior so it does not repopulate removed embedded source.
- `engine-server/F8/ro_rust.sh`: update `RO_SOLVER_DIR` default to `pbs-engine` or its actual solver root.
- `engine-server/F8/ro_solver_wrapper.py`: update comments/path references if present.
- `rule-engine-rs/ro-tests/ro_check.py` and `rule-engine-rs/py/bench_check_single.py`: update local path resolution.
- `e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts`: update path comments only unless executable logic references removed embedded source.
- `gantt/src/components/dev/dev-skills-data.generated.ts`: update generated skill metadata text if the generated file is tracked and currently references removed embedded source.
- Docs under `docs/`: update current playbooks/plans/specs that tell agents or humans where the PBS solver source lives.
- Skill files under `.agents/skills/`: update AI-facing instructions that point to the removed embedded solver copy.

Before implementation, inspect the checked-out `pbs-engine` directory shape. If the new submodule repository root is already the solver package root, update references to `pbs-engine`. If it contains a nested package directory, update references to the actual runnable package root under `pbs-engine`.

## Implementation Approach

1. Add the new submodule at root:

   ```bash
   git submodule add https://github.com/yuapply/PBS_column_based_algorithm.git pbs-engine
   ```

2. Inspect `pbs-engine` layout and identify the correct solver root.

3. Remove the tracked embedded solver-copy files from the parent repository.

4. Replace all effective references to the removed embedded copy with the new `pbs-engine` path.

5. Remove stale documentation references instead of adding legacy notes.

6. Verify that active references point to `pbs-engine`.

## Verification

Minimum verification:

```bash
git submodule status --recursive
git ls-files --stage pbs-engine
rg -n "removed embedded solver copy patterns" -S .
```

Expected:

- `pbs-engine` appears in `.gitmodules`.
- `git ls-files --stage pbs-engine` reports mode `160000`.
- Removed-copy path references are gone from code, scripts, generated metadata, and active docs.

Additional verification:

- Run shell syntax checks for touched shell scripts where available.
- Run any focused Python or TypeScript checks only if executable logic changes beyond path constants/comments.
- Do not claim solver runtime success unless a real solver command is run against the new submodule.

## Risks

- The new submodule may not have the same internal directory layout as the removed embedded copy. The implementation must inspect the checked-out structure before replacing path constants.
- Removing the embedded copy deletes parent-repository copies of solver source. This is intentional; future solver changes should happen in the `pbs-engine` repository.
- Existing unrelated dirty files must be preserved. The implementation should stage or report only files touched for this migration.

## Acceptance Criteria

- `pbs-engine` is a root-level Git submodule pointing at `https://github.com/yuapply/PBS_column_based_algorithm.git`.
- `pbs-optimization-report` remains a separate unchanged submodule.
- The parent repository no longer tracks embedded solver-copy source files.
- Code, scripts, tests, generated metadata, and active docs point to `pbs-engine`.
- No official doc or AI-facing instruction retains removed solver-copy paths as current or compatibility paths.
- Verification commands and their PASS/FAIL results are reported in the final implementation response.
