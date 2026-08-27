# Regression Testing Website (NL → Playwright) — Design Spec

> Date: 2026-06-02
> Status: Approved (brainstorming) — pending implementation plan
> Source inspiration: EVACC `https://ai.rois.one/regression` (Regression page +
> `/api/regression/*` endpoints)
> Depends on: `ai-server` foundation defined in
> `2026-06-02-ai-chat-gantt-control-design.md` §3.1

## 1. Goal

A regression testing website where the user creates test cases in **natural
language** ("Filtering to BKK shows a base chip and the roster row count
drops"), the AI **interprets and converts** them into actionable Playwright
specs against this project's gantt app, and the user **runs tests from the UI**
and sees pass/fail + logs. Mirrors EVACC's regression suite, adapted to this
repo's shell architecture, auth model, and `e2e/gantt/` layout.

## 1a. Goals & Quality Bar (v2 — 2026-06-03)

These seven product goals govern the feature and raise the quality bar on what
the AI may emit and how runs are sequenced:

1. **TDD drives all new code.** Every feature/fix starts with a failing test.
2. **Validate every change with regression cases** — for new features *and* bug
   fixes (a bugfix ships with a case that would have caught it).
3. **Scope ladder per change: changed → related → full suite.** Run the directly
   changed test(s) first, then related tests, then the whole suite. (See §4.4a.)
4. **AI-generated cases must be QUANTIFIED**, not vague. "API returns in
   acceptable time" is rejected; "API returns 200 in < 800 ms" is required.
   Assertions measure exact values/counts/latency, never bare visibility. (§4.2)
5. **User-created / edited NL cases are interpreted to real executable
   Playwright** — the generate/apply pipeline (§4.2–4.3) is the only path; no
   pseudo-tests.
6. **Record failure counts and run failing cases first** (priority by history).
   Real-world lesson: historically-failing tests carry the most signal. (§4.4)
7. **Incorporate researched best practices** — see §10.

## 2. Architecture

```
gantt (5173)  — new shell module 'regression'        ai-server (:3005)
┌──────────────────────────────┐                     ┌─────────────────────────────────┐
│ RegressionView               │  POST generate      │ POST /ai/regression/             │
│  ├ stats dashboard           │────────────────────▶│      generate-playwright         │
│  ├ Add Test (AppDialog)      │  {title,desc,cat}   │   _llm_text(_PW_GEN_SYSTEM)      │
│  ├ test rows (run/log/edit)  │◀────────────────────┤   → {code} | {questions[]}       │
│  └ run-status bar (polling)  │  POST apply-generated│ POST .../tests/{id}/apply-generated│
│                              │  POST runs ─────────▶│   spawn `npx playwright test`    │
│                              │  GET  runs/{id} ◀────┤   parse JSON reporter            │
└──────────────────────────────┘                     │   storage: regression_tests.json │
                                                      └─────────────────────────────────┘
```

## 3. Frontend (gantt — new shell module `regression`)

The gantt app is **not** router-based; it uses a shell module system
(`useShellStore.ActiveModule`). Implementation:
- Extend `ActiveModule` with `'regression'`; add a sidebar/nav entry (FlaskConical
  icon, English label "Regression").
- `gantt/src/components/regression/regression-view.tsx` mounted by `AppShell`
  when `activeModule === 'regression'` (consistent with other modules; only the
  active module is in the DOM).

Sub-components (all `@rois/ui` + Tailwind tokens, English UI):
- **Stats dashboard**: cards — total / passing / failing / not-run / user-added.
- **Toolbar**: search + category + priority + source + status filters.
- **Test list**: grouped by category (collapsible). Each row: title, status
  badge, last duration, **fail-count badge**, and Run / Log / Edit / Delete
  actions. Default sort is **failure-first** (Goal 6) — `fail_count desc` — so
  the most failure-prone cases surface at the top. A **"Run failing first"**
  toolbar button runs the whole suite with `order: 'failing-first'`, and a
  **scope selector** (selected / related / all — §4.4a) drives the run.
- **Generated-code quality chips**: when generate/apply returns `issues[]`
  (§4.2 validation gate), the preview shows them (e.g. "uses waitForTimeout",
  "no measured assertion") and **Apply is disabled** until blocking issues are
  resolved by regenerating.
- **Add Test modal** (`AppDialog`, per Pop-up Standard — blue title bar, left
  icon, draggable, footer Cancel/Save): fields — *Story / what does this test
  check?* (textarea, required), Category (dropdown, keyword auto-suggest),
  Priority (High/Medium/Low), Notes / acceptance criteria (optional).
- **Generate flow**: from a saved test, "Generate Playwright" calls the AI. If
  the AI returns `questions[]`, show them inline and let the user refine the
  story; if it returns `code`, show a code preview with "Apply" → writes the
  spec.
- **Run-status bar**: bottom-fixed; after triggering a run, polls
  `GET /ai/regression/runs/{id}` every 2s until `done`/`error`, then updates row
  statuses.
- Service base URL from `VITE_AI_SERVER_URL` (shared with chat), never hardcoded.

## 4. Backend (`ai-server`)

### 4.1 Endpoints

| Method + path | Purpose |
|---|---|
| `GET  /ai/regression/tests` | List all test cases + stats |
| `POST /ai/regression/tests` | Create a test case (source=`User`, spec_file=`manual`) |
| `PUT  /ai/regression/tests/{id}` | Edit title/category/priority/description |
| `DELETE /ai/regression/tests/{id}` | Delete a test case |
| `POST /ai/regression/generate-playwright` | NL → Playwright; `{code}` or `{questions[]}` |
| `POST /ai/regression/tests/{id}/apply-generated` | Append generated `test()` block to `e2e/gantt/user-tests.spec.ts` |
| `POST /ai/regression/runs` | Run selected tests; returns `run_id` |
| `GET  /ai/regression/runs/{id}` | Poll run status/results |

### 4.2 NL → Playwright generation

`POST /ai/regression/generate-playwright` calls `_llm_text()` with a system
prompt `_PW_GEN_SYSTEM` **adapted to this app** (this is the key change from
EVACC, whose prompt targeted `localhost:5566`):

- App base path `/fpqe/gantt/` (per project memory).
- **Auth**: gantt auth is sessionStorage-based, seeded via Playwright
  `addInitScript` — the prompt instructs reuse of the existing
  `e2e/gantt/` auth helper rather than a login form.
- **Data-ready signal**: `window.__ganttTest` introspection hooks for Canvas
  panes (per project memory) instead of DOM row selectors where appropriate.
- Real gantt selectors / `data-testid`s.
- Instruction: a shared helper (e.g. `loginAndSeed(page)`) already exists in the
  target spec file — do NOT redeclare it; emit ONLY the `test('...', async ({ page }) => { ... })`
  block.

**Quantified-assertion mandate (Goal 4 + §10).** The prompt MUST require:
- **Measured assertions only** — exact `toHaveCount(n)` / `toHaveText(exact)` /
  status code / numeric value. **Bare `toBeVisible()` is rejected** as the sole
  proof of success.
- **No hard sleeps** — `page.waitForTimeout()` is forbidden; all waits are
  bounded retrying assertions (`expect.poll(..., { timeout })` / `expect(async
  () => {...}).toPass({ timeout })`).
- **Performance budgets as assertions** — when the case concerns timing
  ("returns quickly"), the AI must pick a concrete threshold and assert
  completion under N ms (e.g. measure elapsed around the action, or
  `expect.poll(getStatus, { timeout: 800 }).toBe(200)`). It must turn vague
  timing language into a number, asking via `questions[]` if no budget is given.
- **Spec-derived oracles, not implementation snapshots** — assert the *expected*
  value from the story/acceptance criteria, never a value copied from current
  output (avoids locking in bugs; arXiv 2410.21136).

**Server-side validation gate.** A pure `validate_generated(code) -> {ok, issues[]}`
helper rejects/flags emitted code that (a) contains `waitForTimeout`, (b) has a
`toBeVisible` with no accompanying measured assertion, or (c) contains no
`expect(` at all. `generate-playwright` returns these `issues[]` so the UI can
show them and the user can regenerate; `apply-generated` refuses code with
blocking issues.

Request `{ title, description, category }` → response
`{ code, issues[] }` **or** `{ questions: string[] }` when the story is
underspecified (including: timing mentioned but no numeric budget).

### 4.3 Apply generated code

`POST /ai/regression/tests/{id}/apply-generated` appends the `test(...)` block to
`e2e/gantt/user-tests.spec.ts` with a `// user-test-{id}` marker, extracts the
test name, and updates the record: `spec_file = 'user-tests.spec.ts'`,
`test_name = <extracted>`, plus a new version entry (trigger `script`).

### 4.4 Running tests

`POST /ai/regression/runs` spawns from the **repo root** (where Playwright is
configured for `e2e/`):

```
npx playwright test e2e/gantt/<spec...> --reporter=json --grep "<name1>|<name2>"
```

600s timeout; parse JSON reporter; update each test's `run_count`, `pass_count`,
`fail_count`, `last_status`, `last_duration_ms`, `last_log`, `flakiness_score`
(= fail_count / run_count); persist. `GET /ai/regression/runs/{id}` returns a
`RunStatus` for polling.

**Failure-first ordering (Goal 6).** `POST /ai/regression/runs` accepts
`{ test_ids[], order?: 'failing-first' | 'as-given' }` (default `failing-first`).
`failing-first` sorts the selected tests by a priority key
`(fail_count desc, flakiness_score desc, last_status==fail first, last_run_at asc)`
before building the `--grep`, so the highest-signal tests execute earliest. A
pure `prioritize(tests) -> tests` helper encodes this and is unit-tested.

### 4.4a Scope ladder (Goal 3)

`POST /ai/regression/runs` accepts `scope?: 'selected' | 'related' | 'all'`
(default `selected`):
- **selected** — only the given `test_ids` (the directly changed cases).
- **related** — `selected` ∪ every test sharing a `category` with any selected
  test (the cheapest useful "related code" proxy without full test-impact
  instrumentation).
- **all** — every non-`manual` test.
Each resolved set is then failure-first ordered (above). Full test-impact
analysis (a test→source dependency map) is a documented follow-up (§9), not v1.

## 5. Data model / storage

JSON file `ai-server/regression_tests.json` (ported from EVACC — no DB table, no
schema churn; aligns with "use files not snapshot tables" project rule).

```jsonc
{
  "next_id": 1001,
  "tests": [{
    "id": 1001, "title": str, "spec_file": str, "test_name": str,
    "category": str, "source": "AI" | "User",
    "priority": "High" | "Medium" | "Low", "description": str,
    "created_at": str, "updated_at": str,
    "last_status": "pass" | "fail" | null, "last_run_at": str | null,
    "last_duration_ms": int | null, "last_log": str | null,
    "run_count": int, "pass_count": int, "fail_count": int,
    "total_duration_ms": int, "flakiness_score": float,
    "versions": [{ "version": int, "timestamp": str,
                   "trigger": "created"|"edit"|"script"|"run"|"manual",
                   "title": str, "code": str, "status": str,
                   "log": str, "run_at": str, "duration_ms": int }]
  }]
}
```

Versions capped at 50 per test (EVACC behavior).

## 6. Error handling

- LLM failure during generate → `{ error }`, surfaced in the modal; no spec
  written.
- Playwright spawn failure / timeout → run marked `error` with captured stderr in
  the run log; row statuses unchanged.
- `apply-generated` on a missing test id → 404.
- Corrupt/missing `regression_tests.json` → start from `{ next_id: 1001, tests: [] }`.

## 7. Testing (mandatory — §Playwright-Required, §No-Illusion)

**Playwright** `e2e/gantt/regression-page.spec.ts` (multi-step):
1. Open Regression module → click Add Test → fill story/category/priority →
   Save → assert the new row appears in the list with `source = User` and the
   correct title/category (not just visible).
2. Click Generate (LLM stubbed at network layer to return canned `code`) →
   assert the code preview renders the returned `test(...)` snippet.
3. Assert stats card "user-added" count incremented by 1.

**Backend pytest** `ai-server/tests/test_regression.py` (LLM + playwright spawn
mocked):
- `generate-playwright` returns `{questions}` for an empty story, `{code}` for a
  detailed one.
- `apply-generated` appends a marked block and updates `spec_file`/`test_name`.
- `runs` parses a fake JSON reporter payload into correct pass/fail stats.

## 8. Versioning

- `ai-server` endpoints → `BACKEND_VERSION` +1.
- gantt regression module → `FRONTEND_VERSION` +1.

## 9. Non-goals (v1)

- Real-time log streaming (poll-based only).
- Parallel/sharded runs, scheduling, CI integration.
- Editing generated code in-browser beyond regenerate + apply.
- Auth/roles on the regression page beyond the existing gantt session.
- **Full Test Impact Analysis** (a precise test→source dependency map). v1 uses
  the category-based `related` proxy (§4.4a); a real dependency map is a
  documented follow-up.
- **Mutation-based validation** of generated tests (§10 rule 4) — v1 ships the
  static `validate_generated` heuristic gate; mutation scoring is a follow-up.

## 10. Best practices baked in (researched 2026-06-03)

Top rules adopted, with where each is enforced. Sources are primary (official
docs / well-known engineering blogs / peer-reviewed).

| # | Rule | Enforced in |
|---|------|-------------|
| 1 | Assertions measure, never merely observe (exact count/text/status) | `PW_GEN_SYSTEM` + `validate_generated` (§4.2) |
| 2 | Ban hard sleeps; waits are bounded retrying assertions (`expect.poll`/`toPass`) | `PW_GEN_SYSTEM` + `validate_generated` rejects `waitForTimeout` |
| 3 | Oracles derived from spec/expected behavior, not copied from current output | `PW_GEN_SYSTEM` (story = acceptance criteria) |
| 4 | Validate generated tests (heuristic gate now; mutation later) | `validate_generated` (§4.2); mutation = follow-up |
| 5 | Scope ladder: changed → related → full, with time budgets | run `scope` (§4.4a) + dev workflow |
| 6 | Order each tier by failure history / risk | `prioritize()` failing-first (§4.4) |
| 7 | Track flakiness as a per-test score; triage worst first | `flakiness_score` + failure-first list sort (§3) |
| 8 | Performance budgets as assertions ("< N ms"), not "acceptable time" | `PW_GEN_SYSTEM` timing rule (§4.2) |
| 9 | Reserve E2E for critical journeys; push logic to unit tests | dev workflow (unit-test pure helpers; E2E the user path) |
| 10 | Full test isolation per test (own storage/session) | reuse `seedGanttAuth` per-test (existing e2e pattern) |

Sources: Playwright best-practices & assertions docs
(playwright.dev/docs/best-practices, /docs/test-assertions, /docs/actionability);
Martin Fowler — TestPyramid & Eradicating Non-Determinism in Tests; Google
Testing Blog — Flaky Tests & What Makes a Good E2E Test; Microsoft Learn — Test
Impact Analysis; Dropbox — Athena; arXiv 2410.21136 (LLM oracles capture actual
vs expected behaviour).
