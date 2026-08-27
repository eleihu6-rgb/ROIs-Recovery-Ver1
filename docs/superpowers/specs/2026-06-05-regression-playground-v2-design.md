# Regression Playground v2 — IBP Edition (Design)

> Date: 2026-06-05
> Modules: ai-server (backend), gantt (frontend), e2e
> Status: approved design, pending implementation plan
> Prior spec: `2026-06-02-regression-testing-website-design.md` (v1 port from EVACC). This spec supersedes the run-execution and flakiness sections of v1.

## Background

The Regression tab (`gantt/src/components/regression/regression-view.tsx`, backend `ai-server/src/regression/`) is the **testers' playground**: describe a test in plain English → AI generates Playwright code → run it in-app → track stability over time. The v1 port is ~85% complete but the page is effectively dead:

**Pre-existing bugs (must fix):**

1. `routes.py` `create_run` executes Playwright **synchronously inside the POST handler** (blocks up to 600 s). The poll endpoint `GET /runs/{run_id}` only ever sees finished runs — the polling UI was never implementable against it.
2. `runner.py` targets `e2e/gantt/…` from repo root with no `--config`. Real tests live in `e2e/tests/gantt/` with config `e2e/config/playwright.config.ts` (project `gantt`, dependency `gantt-setup`). Runs can never have worked. `apply-generated` also writes to the wrong path (`e2e/gantt/user-tests.spec.ts`).

**Industry research basis** (deep-research run, 2026-06-05; 28 sources, 24 verified claims): Playwright Test Agents (plan→generate→heal), Meta PFS / Atlassian Flakinator (fail/run ratio is inadequate — outcomes are asymmetric), Google/Atlassian quarantine workflows, Allure TestOps transition-based instability, LLM-test research (coverage ≠ quality; feed gate failures back into the regeneration prompt).

## Goals

1. Make the playground functional end-to-end: populated catalog, working async runs, live progress.
2. Explain the playground's goal and usage in-app (info popover).
3. Incorporate industry best practices: implicit-retry flake detection, transition-based instability score, quarantine workflow, locator-quality + assertion-strength generation gate with regeneration feedback, trace artifacts on failure.

## Non-goals (explicitly out of scope)

- Stop-run button (no cancel endpoint in v2).
- Mutation testing / Bayesian (PFS-style) scoring — transition heuristic is the pragmatic v1; revisit if the JSON store moves to a DB.
- Migrating `regression_tests.json` to a database.
- CI integration; runs remain user-triggered from the UI.

## Design

### 1. Info popover (goal + how-to-use)

`(i)` icon button next to the "Regression Tests" header title; click opens a popover (Radix Popover via `@rois/ui`, not a dialog). Content (English, §English-UI):

- **Goal**: "Your testing playground — describe a test in plain English, AI turns it into a runnable Playwright spec, the system runs it and tracks stability over time. No coding required."
- **How to use**: ① Add Test with a plain-English story → ② Generate (AI writes the code; resolve flagged issues with Regenerate) → ③ Apply, then Run → ④ Watch live results; unstable tests are auto-flagged and can be quarantined.
- **Badge legend**: priority colors; `flaky` (passed only on retry); `quarantined` (excluded from Run All); fail count; instability %.

`data-testid="regression-info"` (trigger) / `"regression-info-popover"` (content).

### 2. Backend repairs

**Async runs** (`routes.py`): `POST /runs` creates the registry entry `{status:'running', total, passed:0, failed:0, started_at}` and returns `{run_id}` immediately; a `threading.Thread(daemon=True)` executes the run and finalizes the entry (`done`/`error`, results, per-test logs). Registry stays in-memory/process-local (matches EVACC; uvicorn single-process).

**Runner fix** (`runner.py`):

- cwd = `<repo_root>/e2e`
- cmd = `npx playwright test --config=config/playwright.config.ts --project=gantt <tests/gantt/spec…> --grep <name|name…> --reporter=json --retries=1 --trace=on-first-retry`
- JSON report statuses mapped: `expected`→pass, `flaky`→flaky (passed on retry), otherwise fail. Per-test error snippets extracted into `last_log`.
- `apply-generated` target corrected to `e2e/tests/gantt/user-tests.spec.ts`.
- Requires gantt dev stack running (same assumption as manual e2e runs); a run started without it fails with the Playwright error surfaced in the run status.

### 3. Spec importer (populate the catalog)

`POST /ai/regression/import-specs`:

- Scans `e2e/tests/gantt/*.spec.ts` (top level; skips `auth.setup.ts` and the `help/` subdir).
- Extracts `test('title', …)` titles by regex (ignores `test.skip` / `test.fixme` / `test.describe` lines).
- Registers each as `{spec_file: '<file>.spec.ts', test_name: title, source:'User', priority:'Medium', category: inferred}`.
- Category inference from filename prefix map: `auth*`→Auth, `pane-*`/`*-pane`→Panes, `load-speed|first-paint|*performance*`→Performance, `pairing*`→Pairing, `filter|*-filter*|query-filter`→Filter, `ai-chat`→AI Chat, `regression-page`→Regression, else General.
- Idempotent: skips entries whose `(spec_file, test_name)` already exist. Response: `{imported: n, skipped: m}`.

Frontend: **Import specs** button in the header and in the empty state. After import the list refreshes.

### 4. Flakiness + quarantine (IBP)

**Data** (`store.py`, per test): `recent_results: list[str]` ring buffer of the last 20 run outcomes (`pass`/`fail`/`flaky`), `quarantined: bool` (default false), `instability: float` recomputed on every `record_run`.

**Instability score** = `(status transitions across recent_results) / (len − 1)`, then `min(1.0, score + 0.15 × flaky_count_in_window / len)`. Replaces the naive `flakiness_score` in the UI (old field kept for compat, still updated).

**Quarantine workflow:**

- Auto-suggest: when `instability ≥ 0.3` and `len(recent_results) ≥ 5`, the row shows a "Quarantine?" suggestion chip; quarantine itself is a manual toggle (`PUT /tests/{id}` with `quarantined`).
- Effect: quarantined tests are excluded when resolving `scope='all'` and `scope='related'` runs; still runnable via `scope='selected'` (single-row Run).
- Auto-release: after 5 consecutive `pass` outcomes recorded while quarantined, `quarantined` flips back to false (version entry trigger `quarantine-release`).
- UI: amber `quarantined` badge; `flaky` badge when latest outcome was flaky; instability shown as `N% unstable` replacing the raw fail-ratio badge (fail count badge retained).

### 5. Stronger generation gate + regeneration feedback (IBP)

`validate.py` additions (all blocking):

- **xpath** selectors (`xpath=` or a locator string starting with `//`) — forbidden.
- **CSS-style `page.locator(...)`** — forbidden unless the selector is `[data-testid=…]`. Allowed locators: `getByTestId` / `getByRole` / `getByText` / `getByLabel` / `getByPlaceholder`.

`POST /generate-playwright` gains optional `previous_code: str` and `issues: list[str]`. When present, the user prompt appends: "Previous attempt failed the quality gate with these issues: … Fix them and return the corrected test block." Frontend: when a preview has issues, show **Regenerate with fixes** which calls generate with the previous code + issues and replaces the preview.

### 6. Trace artifacts (IBP)

- `--trace=on-first-retry` (with `--retries=1`, only initially-failing tests get traced — bounded cost, Playwright-recommended).
- After a run, trace zips found under e2e output dirs are copied to `ai-server/artifacts/<run_id>/<test_id>.zip` (directory gitignored).
- `GET /ai/regression/runs/{run_id}/trace/{test_id}` → `FileResponse` (404 if absent). Run results include `has_trace` per test.
- UI: failed/flaky rows from the latest run show **View Trace** (downloads zip; tooltip: "Open at trace.playwright.dev").

### 7. UI completion

**Run-status bar** (bottom of the view while a run is active): spinner + "Running N tests — passed X · failed Y", polls `GET /runs/{run_id}` every 2 s, on `done` refreshes the list, hides the bar, and toasts a summary ("Run finished: X passed, Y failed"); on `error` shows the error text inline (distinct from empty/loading states). `data-testid="run-status-bar"`, `"run-status-text"`.

**Version history**: chevron expander per row → fetches `GET /tests/{id}/detail` (new endpoint returning the test + `versions[]`) and renders a timeline (version #, trigger, status, timestamp, collapsible code snapshot). Frontend `RegressionTest` type gains `versions?: RegressionVersion[]`.

### 8. API surface after this change

| Method | Path | Change |
|---|---|---|
| GET | `/ai/regression/tests` | unchanged (rows gain `recent_results`, `instability`, `quarantined`) |
| GET | `/ai/regression/tests/{id}/detail` | **new** — test + versions |
| POST | `/ai/regression/import-specs` | **new** — idempotent catalog import |
| POST | `/ai/regression/generate-playwright` | + optional `previous_code`, `issues` |
| POST | `/ai/regression/runs` | now async; excludes quarantined for all/related |
| GET | `/ai/regression/runs/{run_id}` | now observable mid-run (`running`) |
| GET | `/ai/regression/runs/{run_id}/trace/{test_id}` | **new** — trace zip |
| PUT | `/ai/regression/tests/{id}` | + `quarantined` field |

## Error handling

- Run thread failures land in the run registry as `status='error'` with the message; UI shows it in the status bar.
- Importer returns 200 with `{imported:0, skipped:n}` when nothing new; filesystem errors → 500 with English detail.
- Trace endpoint 404s cleanly when no artifact exists.
- Gate failures remain 422 with `issues[]` (existing contract).

## Testing

**pytest (ai-server):** importer parsing + idempotency; async run registry lifecycle (running→done, subprocess mocked); runner command construction (config/project/retries/trace flags, paths); instability computation + quarantine suggest/exclude/auto-release; new gate rules (xpath, css locator, allowed forms); regeneration prompt assembly; detail endpoint; trace endpoint (artifact present/absent).

**Playwright (`e2e/tests/gantt/regression-page.spec.ts`, stubbed API):** popover opens with goal text + 4 steps; import button populates list with specific titles/count; run lifecycle — status bar appears with "Running", updates counts, disappears, toast summary, row statuses updated; quarantine badge + exclusion messaging; version history expansion shows trigger/status entries; regenerate-with-fixes flow replaces preview. Specific-value assertions throughout (§No-Illusion).

## Compliance checklist

- §English-UI: all new strings English.
- §Help-Sync: add Regression help topic under `gantt/src/components/help/topics/` before commit; update screenshot count table if screenshots added.
- Version bump: `FRONTEND_VERSION +1`, `BACKEND_VERSION +1` in `gantt/src/version.ts`.
- `ai-server/artifacts/` added to gitignore (alongside `regression_tests.json`).
- ai-server module CLAUDE.md route table updated with the new endpoints.
