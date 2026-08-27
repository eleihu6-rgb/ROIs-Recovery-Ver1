# R'Bot Simulate Crew Bids To Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let R'Bot recognize short commands like `simulate crew bids to portal for June YUL base`, ask for rank when rank is missing, then launch the existing headed crew-portal Playwright bid simulation.

**Architecture:** Reuse the existing `create_crew_bids` server-side chat tool and `ai-server/src/crewbids/runner.py`. Add deterministic month-to-date normalization in chat tooling so LLM calls can pass `month`/`year` or direct `start`/`end`, while `crew_bids_params` remains the final no-rank/no-run guard.

**Tech Stack:** FastAPI/Python 3.12+, Pydantic, pytest, existing Playwright runner launched from Python subprocess.

## Global Constraints

- Bids must be entered only through the existing headed Playwright crew portal flow; no direct DB/API bid writes.
- Rank is required. If rank is missing, R'Bot must ask for it and must not launch the run.
- Month and base are key slots extracted from natural language.
- Month-only input resolves against the current year from the chat system prompt date.
- The final runner input remains `{ bases, ranks, start, end }`.
- Product code must not be changed to force unmapped or rejected bids to fit.
- Do not touch unrelated dirty worktree files.

---

## File Structure

- Modify `ai-server/src/chat/tools.py`
  - Update `create_crew_bids` tool wording and schema.
  - Add pure helpers `month_range_from_input(input_data, today)` and `crew_bids_params(call, today=None)` support for month/year.
- Modify `ai-server/src/chat/routes.py`
  - Pass `date.today()` into `crew_bids_params`.
  - Update `SYSTEM_PROMPT` so R'Bot extracts month/base and asks for rank when missing.
  - Preserve the existing start reply shape with scope, period, run id, and watch URL.
- Modify `ai-server/tests/test_chat_tools.py`
  - Add month-derived date tests and tool-advertising assertions.
- Modify `ai-server/tests/test_chat_route.py`
  - Add chat route tests for missing rank and complete month/base/rank launch.
- Modify `ai-server/tests/test_crewbids.py`
  - Add summary-shape coverage for completed runs.
- Modify `gantt/src/version.ts`
  - Backend-only runtime change: increment `BACKEND_VERSION` by 1 and leave `FRONTEND_VERSION` unchanged.

---

### Task 1: Month/Base/Rank Slot Handling

**Files:**
- Modify: `ai-server/src/chat/tools.py`
- Modify: `ai-server/src/chat/routes.py`
- Test: `ai-server/tests/test_chat_tools.py`
- Test: `ai-server/tests/test_chat_route.py`
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Consumes: existing `crew_bids_params(call: dict[str, Any]) -> dict[str, Any] | None`
- Produces: `month_range_from_input(data: dict[str, Any], today: date) -> tuple[str, str] | None`
- Produces: updated `crew_bids_params(call: dict[str, Any], today: date | None = None) -> dict[str, Any] | None`

- [ ] **Step 1: Write failing tool tests for month-derived dates and rank guard**

Add these tests to `ai-server/tests/test_chat_tools.py` after `test_create_crew_bids_advertised_with_required_scope_and_dates`:

```python
from datetime import date


def test_create_crew_bids_advertises_month_base_rank_prompting():
    tool = next(t for t in TOOLS if t['name'] == 'create_crew_bids')
    assert 'simulate crew bids to portal' in tool['description']
    assert 'ask' in tool['description'].lower()
    assert 'rank' in tool['description'].lower()
    props = tool['input_schema']['properties']
    assert 'month' in props
    assert 'year' in props


def test_crew_bids_params_accepts_month_and_year():
    params = crew_bids_params({'name': 'create_crew_bids', 'input': {
        'bases': ['yul'], 'ranks': ['ca'], 'month': 'June', 'year': 2026,
    }}, today=date(2026, 6, 24))
    assert params == {
        'bases': ['YUL'], 'ranks': ['CA'],
        'start': '2026-06-01', 'end': '2026-06-30',
    }


def test_crew_bids_params_month_defaults_to_current_year():
    params = crew_bids_params({'name': 'create_crew_bids', 'input': {
        'bases': ['YUL'], 'ranks': ['FO'], 'month': 'July',
    }}, today=date(2026, 6, 24))
    assert params['start'] == '2026-07-01'
    assert params['end'] == '2026-07-31'


def test_crew_bids_params_month_still_requires_rank():
    assert crew_bids_params({'name': 'create_crew_bids', 'input': {
        'bases': ['YUL'], 'ranks': [], 'month': 'June', 'year': 2026,
    }}, today=date(2026, 6, 24)) is None
```

- [ ] **Step 2: Write failing chat-route tests for R'Bot prompt behavior**

Add these tests to `ai-server/tests/test_chat_route.py` after `test_create_crew_bids_complete_starts_run`:

```python
def test_create_crew_bids_month_base_rank_starts_run(monkeypatch):
    started = {}

    def fake_start_run(params):
        started['params'] = params
        return 'runmonth123'

    monkeypatch.setattr(routes, 'start_run', fake_start_run)
    monkeypatch.setattr(routes, 'get_run', lambda rid: {
        'watchUrl': '/fpqe/ai/live/streams/month/watch?token=tok',
    })
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Starting the June YUL CA crew-bid simulation.',
        [{'name': 'create_crew_bids', 'input': {
            'bases': ['YUL'], 'ranks': ['CA'], 'month': 'June', 'year': 2026,
        }}],
    ))

    r = client.post('/ai/chat', json={'messages': [{
        'role': 'user',
        'content': 'simulate crew bids to portal for June YUL base CA',
    }]})
    assert r.status_code == 200
    body = r.json()
    assert body['actions'] == []
    assert 'runmonth123' in body['content']
    assert started['params'] == {
        'bases': ['YUL'], 'ranks': ['CA'],
        'start': '2026-06-01', 'end': '2026-06-30',
    }


def test_create_crew_bids_month_base_missing_rank_asks_without_run(monkeypatch):
    calls = {'n': 0}
    monkeypatch.setattr(routes, 'start_run', lambda params: calls.__setitem__('n', calls['n'] + 1) or 'x')
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Which rank should I use for June YUL crew bids?',
        [],
    ))

    r = client.post('/ai/chat', json={'messages': [{
        'role': 'user',
        'content': 'simulate crew bids to portal for June YUL base',
    }]})
    assert r.status_code == 200
    assert 'rank' in r.json()['content'].lower()
    assert calls['n'] == 0
```

- [ ] **Step 3: Run the targeted tests and verify they fail**

Run:

```bash
cd ai-server && .venv/bin/python -m pytest tests/test_chat_tools.py tests/test_chat_route.py -q
```

Expected before implementation: failures mentioning missing `month` property and/or unexpected `None` from `crew_bids_params`.

- [ ] **Step 4: Implement month parsing and update tool schema**

In `ai-server/src/chat/tools.py`, add imports:

```python
import calendar
from datetime import date
```

Replace the existing `from datetime import date` line with the combined imports above.

Add helpers above `crew_bids_params`:

```python
MONTH_NAME_TO_NUMBER = {name.lower(): index for index, name in enumerate(calendar.month_name) if name}
MONTH_NAME_TO_NUMBER.update({name.lower(): index for index, name in enumerate(calendar.month_abbr) if name})


def month_range_from_input(data: dict[str, Any], today: date) -> tuple[str, str] | None:
    month_value = data.get('month')
    if month_value is None:
        return None
    if isinstance(month_value, int):
        month_num = month_value
    elif isinstance(month_value, str):
        stripped = month_value.strip()
        if stripped.isdigit():
            month_num = int(stripped)
        else:
            month_num = MONTH_NAME_TO_NUMBER.get(stripped.lower())
    else:
        return None
    if not isinstance(month_num, int) or month_num < 1 or month_num > 12:
        return None
    year_value = data.get('year', today.year)
    if isinstance(year_value, str) and year_value.strip().isdigit():
        year = int(year_value.strip())
    elif isinstance(year_value, int):
        year = year_value
    else:
        return None
    if year < 2000 or year > 2100:
        return None
    last_day = calendar.monthrange(year, month_num)[1]
    return f'{year:04d}-{month_num:02d}-01', f'{year:04d}-{month_num:02d}-{last_day:02d}'
```

Update the `create_crew_bids` tool description and properties in `TOOLS`:

```python
        'description': "Simulate crew ADDING/CREATING/ENTERING bids in the crew portal: launches a "
                       "headed browser that logs in as each crew, submits their bids on the "
                       "days-off, pairing and line pages, then logs out and moves to the next. "
                       "Use when the user says 'simulate crew bids to portal', 'enter crew bids', "
                       "'create crew bids', 'add bids', or 'simulate crew adding bids'. Extract "
                       "base airport codes and month words like June from the user request. "
                       "REQUIRES at least one base AND at least one rank. If rank is missing, "
                       "ask which rank to use and DO NOT call this tool. Provide either start/end "
                       "dates or month/year. Bases are airport codes (e.g. YUL, YVR, YYZ); ranks "
                       "are codes (CA, FO, IFD, FA).",
```

Add these properties under `start` and `end`:

```python
                'month': {'type': ['string', 'integer'],
                          'description': 'Target bidding month, e.g. "June", "Jun", or 6'},
                'year': {'type': ['string', 'integer'],
                         'description': 'Target bidding year, defaults to current year if omitted'},
```

Change the required fields to base and rank only. Dates can be supplied either directly as `start`/`end` or indirectly as `month`/`year`, and `crew_bids_params` is the final guard before any run starts:

```python
            'required': ['bases', 'ranks'],
```

Update `test_create_crew_bids_advertised_with_required_scope_and_dates` to:

```python
def test_create_crew_bids_advertised_with_required_scope_and_dates():
    tool = next(t for t in TOOLS if t['name'] == 'create_crew_bids')
    assert set(tool['input_schema']['required']) == {'bases', 'ranks'}
```

- [ ] **Step 5: Update `crew_bids_params` to accept direct dates or month-derived dates**

Replace the function signature and date section in `ai-server/src/chat/tools.py`:

```python
def crew_bids_params(call: dict[str, Any], today: date | None = None) -> dict[str, Any] | None:
    """Validate a create_crew_bids tool call into a normalized run spec.

    Returns {'bases','ranks','start','end'} only when the scope is complete
    (>=1 base AND >=1 rank) and either dates are valid YYYY-MM-DD or a valid
    month/year can be resolved; otherwise None, so no run is started.
    """
    if call.get('name') != 'create_crew_bids':
        return None
    data = call.get('input') or {}
    bases = data.get('bases')
    ranks = data.get('ranks')
    start = data.get('start')
    end = data.get('end')
    if not isinstance(bases, list) or not isinstance(ranks, list):
        return None
    bases = [b.upper() for b in bases if isinstance(b, str) and b.strip()][:MAX_SCOPE_ITEMS]
    ranks = [r.upper() for r in ranks if isinstance(r, str) and r.strip()][:MAX_SCOPE_ITEMS]
    if not bases or not ranks:
        return None
    if not (_is_iso_date(start) and _is_iso_date(end)):
        resolved = month_range_from_input(data, today or date.today())
        if resolved is None:
            return None
        start, end = resolved
    if start > end:
        start, end = end, start
    return {'bases': bases, 'ranks': ranks, 'start': start, 'end': end}
```

- [ ] **Step 6: Update chat prompt and pass today into validation**

In `ai-server/src/chat/routes.py`, replace the crew-bid paragraph in `SYSTEM_PROMPT` with:

```python
    "You can also SIMULATE crew adding bids in the crew portal via the create_crew_bids tool "
    "(triggers: 'simulate crew bids to portal', 'enter crew bids', 'crew bids to portal', "
    "'create crew bids', 'add bids', 'simulate crew adding bids'). Extract month words and base "
    "airport codes from the user request. Month-only requests resolve to the current year from "
    "the Today value in this system prompt. That run needs at least one base AND at least one "
    "rank. If rank is missing, ask exactly which rank to use and DO NOT call the tool. If base "
    "or month/date range is missing, ask for the missing piece and DO NOT call the tool. "
```

In `chat`, set `today = date.today()` once and use it for the prompt and validation:

```python
    today = date.today()
    system = f"{SYSTEM_PROMPT} Today is {today.isoformat()}."
```

Change:

```python
        params = crew_bids_params(c)
```

to:

```python
        params = crew_bids_params(c, today=today)
```

- [ ] **Step 7: Bump backend version**

Open `gantt/src/version.ts` and increment only `BACKEND_VERSION` by 1. Example if the file contains:

```typescript
export const BACKEND_VERSION = 45
export const FRONTEND_VERSION = 72
```

change it to:

```typescript
export const BACKEND_VERSION = 46
export const FRONTEND_VERSION = 72
```

Use the actual current numbers in the file.

- [ ] **Step 8: Run targeted tests and verify pass**

Run:

```bash
cd ai-server && .venv/bin/python -m pytest tests/test_chat_tools.py tests/test_chat_route.py -q
```

Expected: all tests in both files pass.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add ai-server/src/chat/tools.py ai-server/src/chat/routes.py ai-server/tests/test_chat_tools.py ai-server/tests/test_chat_route.py gantt/src/version.ts
git commit -m "feat: let rbot simulate crew bids by month and base"
```

---

### Task 2: Summary Verification And Final Regression

**Files:**
- Modify only if the new test exposes a regression: `ai-server/src/crewbids/runner.py`
- Test: `ai-server/tests/test_crewbids.py`
- Read: `docs/superpowers/specs/2026-06-24-rbot-simulate-crew-bids-to-portal-design.md`

**Interfaces:**
- Consumes: `runner.get_run(run_id) -> dict[str, Any] | None`
- Produces: run records that retain `summary.crewCount`, `summary.placedTotal`, `summary.crews`, `scopedCrew`, `status`, and `watchUrl`

- [ ] **Step 1: Add a summary-shape test**

Add this test to `ai-server/tests/test_crewbids.py` after `test_start_run_registers_and_runs_in_background`:

```python
def test_start_run_preserves_quick_summary(monkeypatch):
    def fake_run(params, run_id, stream=None):
        return {
            'status': 'done',
            'scopedCrew': 2,
            'summary': {
                'crewCount': 2,
                'placedTotal': 7,
                'crews': [
                    {'employeeId': '100', 'category': 'YUL-737-CA', 'placed': 4, 'total': 5, 'blocker': None, 'issues': 1},
                    {'employeeId': '101', 'category': 'YUL-737-CA', 'placed': 3, 'total': 5, 'blocker': 'add-bid-disabled', 'issues': 2},
                ],
            },
        }

    monkeypatch.setattr(runner, 'run_crew_bids', fake_run)
    run_id = runner.start_run({'bases': ['YUL'], 'ranks': ['CA'], 'start': '2026-06-01', 'end': '2026-06-30'})
    for _ in range(50):
        run = runner.get_run(run_id)
        if run and run.get('status') == 'done':
            break
        time.sleep(0.02)
    run = runner.get_run(run_id)
    assert run['scopedCrew'] == 2
    assert run['summary']['crewCount'] == 2
    assert run['summary']['placedTotal'] == 7
    assert run['summary']['crews'][1]['blocker'] == 'add-bid-disabled'
    assert run['watchUrl'].startswith('/fpqe/ai/live/streams/')
```

- [ ] **Step 2: Run the runner tests and verify failure or pass**

Run:

```bash
cd ai-server && .venv/bin/python -m pytest tests/test_crewbids.py -q
```

Expected: pass if the existing runner already preserves summary fields; otherwise fail with the exact missing field.

- [ ] **Step 3: Implement only the minimal runner fix if Step 2 fails**

If the test fails because `_runs[run_id]` loses `summary`, update the merge in `ai-server/src/crewbids/runner.py` inside `_worker` to preserve existing run metadata and result fields:

```python
        with _lock:
            existing = _runs.get(run_id, {})
            _runs[run_id] = {**existing, **result, 'finishedAt': _now()}
```

If this code already exists, do not edit `runner.py`.

- [ ] **Step 4: Run complete ai-server test set**

Run:

```bash
cd ai-server && .venv/bin/python -m pytest -q
```

Expected: all ai-server tests pass.

- [ ] **Step 5: Run formatting/lint checks if configured**

Inspect `ai-server/pyproject.toml` or package docs. If no lint script is configured, record that no lint command exists. If configured, run the exact project command.

- [ ] **Step 6: Commit Task 2 if files changed**

If Task 2 changed files, run:

```bash
git add ai-server/src/crewbids/runner.py ai-server/tests/test_crewbids.py
git commit -m "test: cover rbot crew bid run summary"
```

If only tests were added and passed without runner changes, commit just the test file:

```bash
git add ai-server/tests/test_crewbids.py
git commit -m "test: cover rbot crew bid run summary"
```

If no files changed, skip this commit.

---

## Final Verification

- [ ] Run:

```bash
cd ai-server && .venv/bin/python -m pytest -q
```

Expected: all ai-server tests pass.

- [ ] Run:

```bash
git status --short
```

Expected: only unrelated pre-existing worktree changes remain.

- [ ] Manual smoke, when services are available:

```bash
cd ai-server && python main.py
```

Then in Gantt R'Bot, send `simulate crew bids to portal for June YUL base`. Expected: R'Bot asks for rank and does not start a run until the rank is supplied.
