# Regression Playground v2 (IBP Edition) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Regression tab a working testers' playground: populated catalog, real async runs with live progress, transition-based flakiness + quarantine, stronger AI-generation gate with regeneration feedback, trace artifacts, and an in-app goal/how-to popover.

**Architecture:** Backend (ai-server, FastAPI) gains pure modules `flakiness.py` / `importer.py`, a fixed `runner.py` (correct e2e paths, `--retries=1 --trace=on-first-retry`, JSON output file), and async thread-based runs in `routes.py`. Frontend (gantt) extends the regression module with an info popover, run-status polling bar, row badges, quarantine toggle, version-history panel, and spec import. Storage stays in `regression_tests.json` (new per-test fields are migrated on load).

**Tech Stack:** FastAPI + pytest (ai-server), React 19 + Vitest (gantt), Playwright (e2e). Spec: `docs/superpowers/specs/2026-06-05-regression-playground-v2-design.md`.

**Conventions that apply to every task:** All user-visible strings in English (§English-UI). Backend tests: `cd ai-server && .venv/bin/python -m pytest <file> -v` (create venv per ai-server/CLAUDE.md if missing). Frontend unit tests: `cd gantt && npx vitest run <file>`. Commit after each task with the repo's commit format.

**Working directory for all commands:** repo root `/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS` unless stated otherwise (quote the path — it contains spaces).

---

### Task 1: Pure flakiness module (instability + quarantine rules)

**Files:**
- Create: `ai-server/src/regression/flakiness.py`
- Test: `ai-server/tests/test_flakiness.py`

- [ ] **Step 1: Write the failing tests**

```python
# ai-server/tests/test_flakiness.py
from src.regression.flakiness import instability, should_suggest_quarantine, should_release


def test_instability_empty_and_single():
    assert instability([]) == 0.0
    assert instability(['pass']) == 0.0


def test_instability_stable_pass_is_zero():
    assert instability(['pass'] * 10) == 0.0


def test_instability_alternating_is_one():
    # pass/fail/pass/fail -> 3 transitions / 3 = 1.0 (capped)
    assert instability(['pass', 'fail', 'pass', 'fail']) == 1.0


def test_instability_counts_transitions_not_ratio():
    # 5 fails then 5 passes: 1 transition / 9 — low instability even at 50% fail ratio.
    recent = ['fail'] * 5 + ['pass'] * 5
    assert instability(recent) == round(1 / 9, 3)


def test_instability_flaky_outcomes_add_weight():
    # one flaky among passes: 2 transitions/4 = 0.5, + 0.15 * 1/5 = 0.53
    recent = ['pass', 'pass', 'flaky', 'pass', 'pass']
    assert instability(recent) == round(2 / 4 + 0.15 * 1 / 5, 3)


def test_instability_capped_at_one():
    recent = ['pass', 'flaky'] * 10
    assert instability(recent) == 1.0


def test_suggest_quarantine_needs_five_runs_and_threshold():
    assert not should_suggest_quarantine(['pass', 'fail', 'pass'], quarantined=False)  # <5 runs
    assert should_suggest_quarantine(['pass', 'fail', 'pass', 'fail', 'pass'], quarantined=False)
    assert not should_suggest_quarantine(['pass'] * 8, quarantined=False)  # stable
    assert not should_suggest_quarantine(['pass', 'fail'] * 4, quarantined=True)  # already quarantined


def test_release_after_five_consecutive_passes():
    assert should_release(['fail', 'pass', 'pass', 'pass', 'pass', 'pass'], quarantined=True)
    assert not should_release(['pass', 'pass', 'pass', 'pass'], quarantined=True)  # only 4
    assert not should_release(['fail', 'pass', 'pass', 'pass', 'flaky', 'pass'], quarantined=True)
    assert not should_release(['pass'] * 6, quarantined=False)  # not quarantined
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_flakiness.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.regression.flakiness'`

- [ ] **Step 3: Implement the module**

```python
# ai-server/src/regression/flakiness.py
"""Transition-based instability scoring + quarantine rules (spec §4).

Replaces the naive fail/run ratio: outcomes are asymmetric (a pass proves
absence of regression; a fail is only a hint), so we score status *flips*
over a recent-results window, weighted up by 'flaky' outcomes (tests that
passed only on retry).
"""

QUARANTINE_THRESHOLD = 0.3
MIN_RUNS_FOR_SUGGESTION = 5
RELEASE_STREAK = 5
FLAKY_WEIGHT = 0.15


def instability(recent: list[str]) -> float:
    """Score 0..1: status transitions / (n-1), plus a weight per flaky outcome."""
    n = len(recent)
    if n < 2:
        return 0.0
    transitions = sum(1 for a, b in zip(recent, recent[1:]) if a != b)
    score = transitions / (n - 1) + FLAKY_WEIGHT * recent.count('flaky') / n
    return round(min(1.0, score), 3)


def should_suggest_quarantine(recent: list[str], *, quarantined: bool) -> bool:
    """Suggest quarantine for unstable, not-yet-quarantined tests with enough history."""
    if quarantined or len(recent) < MIN_RUNS_FOR_SUGGESTION:
        return False
    return instability(recent) >= QUARANTINE_THRESHOLD


def should_release(recent: list[str], *, quarantined: bool) -> bool:
    """Auto-release after RELEASE_STREAK consecutive passes while quarantined."""
    if not quarantined or len(recent) < RELEASE_STREAK:
        return False
    return all(s == 'pass' for s in recent[-RELEASE_STREAK:])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_flakiness.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/flakiness.py ai-server/tests/test_flakiness.py
git commit -m "feat: transition-based instability score + quarantine rules (ai-server)"
```

---

### Task 2: Store extensions — recent_results, quarantined, instability, migration

**Files:**
- Modify: `ai-server/src/regression/store.py`
- Test: `ai-server/tests/test_regression_store.py` (append tests)

- [ ] **Step 1: Write the failing tests** (append to `ai-server/tests/test_regression_store.py`)

```python
from pathlib import Path
from src.regression.store import RegressionStore


def _mk_store(tmp_path: Path) -> RegressionStore:
    s = RegressionStore(tmp_path / 'reg.json')
    s.create_test(title='t1', category='Smoke', priority='High', description='d')
    return s


def test_new_test_has_flakiness_fields(tmp_path):
    s = _mk_store(tmp_path)
    t = s.list_tests()[0]
    assert t['recent_results'] == []
    assert t['quarantined'] is False
    assert t['instability'] == 0.0


def test_load_migrates_legacy_tests(tmp_path):
    p = tmp_path / 'reg.json'
    p.write_text('{"next_id": 1002, "tests": [{"id": 1001, "title": "old", "spec_file": "manual", '
                 '"test_name": "", "category": "Smoke", "source": "User", "priority": "High", '
                 '"description": "", "created_at": "", "updated_at": "", "last_status": null, '
                 '"last_run_at": null, "last_duration_ms": null, "last_log": null, "run_count": 0, '
                 '"pass_count": 0, "fail_count": 0, "total_duration_ms": 0, "flakiness_score": 0.0, '
                 '"versions": []}]}')
    s = RegressionStore(p)
    t = s.get_test(1001)
    assert t['recent_results'] == []
    assert t['quarantined'] is False
    assert t['instability'] == 0.0


def test_record_run_updates_window_and_instability(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    for status in ('pass', 'fail', 'pass', 'fail'):
        s.record_run(tid, status=status, duration_ms=10, log='')
    t = s.get_test(tid)
    assert t['recent_results'] == ['pass', 'fail', 'pass', 'fail']
    assert t['instability'] == 1.0
    assert t['run_count'] == 4 and t['pass_count'] == 2 and t['fail_count'] == 2


def test_record_run_flaky_counts_as_pass_in_totals(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    s.record_run(tid, status='flaky', duration_ms=10, log='')
    t = s.get_test(tid)
    assert t['pass_count'] == 1 and t['fail_count'] == 0
    assert t['recent_results'] == ['flaky']
    assert t['last_status'] == 'flaky'


def test_recent_results_window_caps_at_20(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    for _ in range(25):
        s.record_run(tid, status='pass', duration_ms=1, log='')
    assert len(s.get_test(tid)['recent_results']) == 20


def test_quarantine_auto_release_after_streak(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    s.update_test(tid, quarantined=True)
    for _ in range(5):
        s.record_run(tid, status='pass', duration_ms=1, log='')
    t = s.get_test(tid)
    assert t['quarantined'] is False
    assert any(v['trigger'] == 'quarantine-release' for v in t['versions'])


def test_update_test_accepts_quarantined_flag(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    s.update_test(tid, quarantined=True)
    assert s.get_test(tid)['quarantined'] is True
    s.update_test(tid, quarantined=False)
    assert s.get_test(tid)['quarantined'] is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_store.py -v`
Expected: new tests FAIL (KeyError `recent_results`, etc.); pre-existing tests still PASS.

- [ ] **Step 3: Implement store changes**

In `ai-server/src/regression/store.py`:

a) Add import at top:

```python
from src.regression.flakiness import instability, should_release
```

b) Add a window constant under the imports:

```python
RECENT_WINDOW = 20
```

c) In `_load`, migrate legacy records. Replace the body with:

```python
    def _load(self) -> dict[str, Any]:
        data: dict[str, Any] = {'next_id': 1001, 'tests': []}
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        for t in data.get('tests', []):
            t.setdefault('recent_results', [])
            t.setdefault('quarantined', False)
            t.setdefault('instability', 0.0)
        return data
```

d) In `create_test`, add the three fields to the `test` dict (after `'flakiness_score': 0.0,`):

```python
            'recent_results': [], 'quarantined': False, 'instability': 0.0,
```

e) In `update_test`, extend the allowed-keys tuple:

```python
        for k in ('title', 'category', 'priority', 'description', 'spec_file', 'test_name', 'quarantined'):
```

f) In `record_run`, after the `t['flakiness_score'] = ...` line and before `append_version`, insert:

```python
        if status == 'flaky':
            # passed on retry — counts as a pass in totals, recorded as 'flaky' in the window
            t['fail_count'] -= 1
            t['pass_count'] += 1
        t['recent_results'] = (t['recent_results'] + [status])[-RECENT_WINDOW:]
        t['instability'] = instability(t['recent_results'])
        if should_release(t['recent_results'], quarantined=t['quarantined']):
            t['quarantined'] = False
            self.append_version(test_id, trigger='quarantine-release', persist=False)
```

Note: the existing `if status == 'pass': pass_count += 1 else: fail_count += 1` ran first, so `flaky` was counted as fail — the inserted block corrects the totals. Also recompute `flakiness_score` after the correction by moving the existing `t['flakiness_score'] = ...` line *below* the inserted block.

- [ ] **Step 4: Run the full store test file**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_store.py -v`
Expected: all PASS (old + 7 new)

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/store.py ai-server/tests/test_regression_store.py
git commit -m "feat: store recent-results window, instability, quarantine with auto-release"
```

---

### Task 3: Generation gate — locator-quality rules

**Files:**
- Modify: `ai-server/src/regression/validate.py`
- Test: `ai-server/tests/test_validate.py` (append)

- [ ] **Step 1: Write the failing tests** (append to `ai-server/tests/test_validate.py`)

```python
from src.regression.validate import validate_generated


GOOD_BODY = "await expect(page.getByTestId('regression-list')).toHaveCount(1);"


def test_xpath_locator_rejected():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('//div[@id=1]').click(); {GOOD_BODY} }});"
    issues = validate_generated(code)['issues']
    assert any('xpath' in i for i in issues)


def test_xpath_prefix_rejected():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('xpath=//tr').click(); {GOOD_BODY} }});"
    assert any('xpath' in i for i in validate_generated(code)['issues'])


def test_css_locator_rejected():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('div.row > span#id').click(); {GOOD_BODY} }});"
    issues = validate_generated(code)['issues']
    assert any('CSS locator' in i for i in issues)


def test_data_testid_locator_allowed():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('[data-testid=\"row\"]').click(); {GOOD_BODY} }});"
    issues = validate_generated(code)['issues']
    assert not any('CSS locator' in i or 'xpath' in i for i in issues)


def test_getby_locators_allowed():
    code = f"test('x', async ({{ page }}) => {{ await page.getByRole('button', {{ name: 'Run' }}).click(); {GOOD_BODY} }});"
    assert validate_generated(code)['ok']
```

- [ ] **Step 2: Run to verify failures**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_validate.py -v`
Expected: the 3 rejection tests FAIL (no such issues produced); allowed-locator tests PASS.

- [ ] **Step 3: Implement in `validate.py`**

Add near the other regexes (top of file):

```python
# Locator quality (spec §5): xpath and raw CSS selectors are brittle — require
# getByTestId/getByRole/getByText/getByLabel/getByPlaceholder or [data-testid=…].
_XPATH_LOCATOR = re.compile(r"""\.locator\(\s*['"]\s*(?://|xpath=)""")
_RAW_CSS_LOCATOR = re.compile(r"""\.locator\(\s*['"](?!\[data-testid)""")
```

Add inside `validate_generated`, after the `toBeVisible` check:

```python
    if _XPATH_LOCATOR.search(code):
        issues.append('uses an xpath selector — forbidden; use getByTestId/getByRole/getByText')
    elif _RAW_CSS_LOCATOR.search(code):
        issues.append('uses a raw CSS locator — use getByTestId/getByRole/getByText or [data-testid=…]')
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_validate.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/validate.py ai-server/tests/test_validate.py
git commit -m "feat: generation gate rejects xpath/raw-CSS locators"
```

---

### Task 4: Runner rebuild — correct paths, retries, traces, robust JSON

**Files:**
- Modify: `ai-server/src/regression/runner.py` (full rewrite)
- Create: `ai-server/tests/test_runner.py`

- [ ] **Step 1: Write the failing tests**

```python
# ai-server/tests/test_runner.py
import json
from pathlib import Path

from src.regression.runner import build_cmd, parse_report, collect_traces


def test_build_cmd_uses_e2e_config_project_retries_trace():
    cmd = build_cmd(['user-tests.spec.ts'], ['adds a chip'])
    assert cmd[:3] == ['npx', 'playwright', 'test']
    assert '--config=config/playwright.config.ts' in cmd
    assert '--project=gantt' in cmd
    assert 'tests/gantt/user-tests.spec.ts' in cmd
    assert '--retries=1' in cmd
    assert '--trace=on-first-retry' in cmd
    assert cmd[cmd.index('--grep') + 1] == 'adds\\ a\\ chip'


def test_build_cmd_escapes_regex_metachars_in_grep():
    cmd = build_cmd(['a.spec.ts'], ['runs (all) tests'])
    assert cmd[cmd.index('--grep') + 1] == 'runs\\ \\(all\\)\\ tests'


def test_build_cmd_no_grep_when_no_names():
    cmd = build_cmd(['a.spec.ts'], [])
    assert '--grep' not in cmd


def _report(status_lists):
    """Build a minimal playwright JSON report. status_lists: {title: [run statuses]}"""
    specs = []
    for title, statuses in status_lists.items():
        specs.append({'title': title, 'tests': [{
            'status': 'expected' if statuses == ['passed'] else ('flaky' if 'passed' in statuses else 'unexpected'),
            'results': [{'status': s, 'duration': 100,
                         'error': ({'message': 'boom'} if s == 'failed' else None)} for s in statuses],
        }]})
    return {'suites': [{'specs': specs, 'suites': []}]}


def test_parse_report_maps_pass_fail_flaky():
    report = _report({'ok': ['passed'], 'bad': ['failed', 'failed'], 'shaky': ['failed', 'passed']})
    out = parse_report(report, {'ok': 1, 'bad': 2, 'shaky': 3})
    assert out['results']['1']['status'] == 'pass'
    assert out['results']['2']['status'] == 'fail'
    assert out['results']['2']['log'] == 'boom'
    assert out['results']['3']['status'] == 'flaky'
    assert out['passed'] == 2 and out['failed'] == 1  # flaky counts as passed


def test_parse_report_ignores_unknown_titles():
    report = _report({'mystery': ['passed']})
    out = parse_report(report, {'known': 9})
    assert out['results'] == {}


def test_collect_traces_copies_matching_zip(tmp_path):
    results_dir = tmp_path / 'test-results' / 'user-tests-adds-a-BKK-chip-gantt-retry1'
    results_dir.mkdir(parents=True)
    (results_dir / 'trace.zip').write_bytes(b'PK')
    artifacts = tmp_path / 'artifacts'
    found = collect_traces(tmp_path / 'test-results', artifacts / 'run-1', {'adds a BKK chip': 7})
    assert found == {7: True}
    assert (artifacts / 'run-1' / '7.zip').read_bytes() == b'PK'


def test_collect_traces_handles_missing_dir(tmp_path):
    assert collect_traces(tmp_path / 'nope', tmp_path / 'a' / 'r', {'x': 1}) == {}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_runner.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_cmd'`

- [ ] **Step 3: Rewrite `runner.py`**

```python
# ai-server/src/regression/runner.py
"""Playwright execution for regression runs (spec §2/§6).

Runs from <repo>/e2e with the repo's config + gantt project; --retries=1 gives
the implicit-retry flake signal (fail-then-pass => 'flaky'); --trace=on-first-retry
bounds trace cost to initially-failing tests. The JSON report is written to a
temp file (PLAYWRIGHT_JSON_OUTPUT_NAME) so stdout noise can't corrupt parsing.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

from src.config.settings import settings


def _repo_root() -> Path:
    if settings.repo_root:
        return Path(settings.repo_root)
    # ai-server/src/regression/runner.py -> repo root is 3 parents up from ai-server/
    return Path(__file__).resolve().parents[3]


def build_cmd(specs: list[str], names: list[str]) -> list[str]:
    """Build the playwright CLI command (cwd: <repo>/e2e). Pure — unit-testable."""
    spec_args = [f'tests/gantt/{s}' for s in specs]
    cmd = ['npx', 'playwright', 'test', '--config=config/playwright.config.ts',
           '--project=gantt', *spec_args, '--reporter=json',
           '--retries=1', '--trace=on-first-retry']
    if names:
        cmd += ['--grep', '|'.join(re.escape(n) for n in names)]
    return cmd


def parse_report(report: dict[str, Any], id_by_name: dict[str, int]) -> dict[str, Any]:
    """Map a playwright JSON report onto test ids. 'flaky' = passed on retry."""
    results: dict[str, Any] = {}
    passed = failed = 0
    for suite in report.get('suites', []):
        for spec in _iter_specs(suite):
            tid = id_by_name.get(spec.get('title', ''))
            if tid is None:
                continue
            statuses = [t.get('status') for t in spec.get('tests', [])]
            if all(s == 'expected' for s in statuses):
                status = 'pass'
            elif any(s == 'flaky' for s in statuses):
                status = 'flaky'
            else:
                status = 'fail'
            duration = sum(r.get('duration', 0)
                           for t in spec.get('tests', []) for r in t.get('results', []))
            log = ''
            for t in spec.get('tests', []):
                for r in t.get('results', []):
                    msg = (r.get('error') or {}).get('message', '')
                    if msg:
                        log = msg[:2000]
                        break
            if status == 'fail':
                failed += 1
            else:
                passed += 1
            results[str(tid)] = {'status': status, 'duration_ms': int(duration), 'log': log}
    return {'passed': passed, 'failed': failed, 'results': results}


def _slug(name: str) -> str:
    return re.sub(r'[^A-Za-z0-9]+', '-', name).strip('-')


def collect_traces(test_results_dir: Path, artifact_dir: Path,
                   id_by_name: dict[str, int]) -> dict[int, bool]:
    """Copy trace.zip files into artifact_dir/<test_id>.zip, matched by title slug."""
    found: dict[int, bool] = {}
    if not test_results_dir.is_dir():
        return found
    dirs = [d for d in test_results_dir.iterdir() if d.is_dir() and (d / 'trace.zip').exists()]
    for name, tid in id_by_name.items():
        slug = _slug(name)
        for d in dirs:
            if slug and slug in d.name:
                artifact_dir.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(d / 'trace.zip', artifact_dir / f'{tid}.zip')
                found[tid] = True
                break
    return found


def run_playwright(specs: list[str], names: list[str], id_by_name: dict[str, int],
                   artifact_dir: Path | None = None) -> dict[str, Any]:
    """Execute selected tests; parse report; collect traces. Raises on timeout."""
    root = _repo_root()
    e2e = root / 'e2e'
    out_file = Path(tempfile.gettempdir()) / f'pw-regression-{uuid.uuid4().hex}.json'
    env = {**os.environ, 'PLAYWRIGHT_JSON_OUTPUT_NAME': str(out_file)}
    cmd = build_cmd(specs, names)
    proc = subprocess.run(cmd, cwd=e2e, capture_output=True, text=True, timeout=600, env=env)
    try:
        report = json.loads(out_file.read_text())
    except (OSError, json.JSONDecodeError):
        return {'passed': 0, 'failed': len(names), 'results': {},
                'error': (proc.stderr or proc.stdout)[-2000:] or 'playwright produced no JSON output'}
    finally:
        out_file.unlink(missing_ok=True)
    parsed = parse_report(report, id_by_name)
    if artifact_dir is not None:
        traces = collect_traces(e2e / 'test-results', artifact_dir, id_by_name)
        for tid, has in traces.items():
            if str(tid) in parsed['results']:
                parsed['results'][str(tid)]['has_trace'] = has
    return parsed


def _iter_specs(suite: dict[str, Any]):
    yield from suite.get('specs', [])
    for child in suite.get('suites', []):
        yield from _iter_specs(child)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_runner.py -v`
Expected: 7 PASS

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/runner.py ai-server/tests/test_runner.py
git commit -m "fix: runner targets e2e/tests/gantt with repo config; retries+traces; robust JSON"
```

---

### Task 5: Spec importer

**Files:**
- Create: `ai-server/src/regression/importer.py`
- Test: `ai-server/tests/test_importer.py`

- [ ] **Step 1: Write the failing tests**

```python
# ai-server/tests/test_importer.py
from pathlib import Path

from src.regression.importer import parse_spec_titles, infer_category, import_specs
from src.regression.store import RegressionStore


SPEC = """
import { test, expect } from '@playwright/test'

test.describe('panes', () => {})
test('opens the roster pane', async ({ page }) => {})
test.skip('legacy broken case', async ({ page }) => {})
test.fixme('todo case', async ({ page }) => {})
test("closes the pane", async ({ page }) => {})
"""


def test_parse_titles_skips_describe_skip_fixme():
    assert parse_spec_titles(SPEC) == ['opens the roster pane', 'closes the pane']


def test_infer_category():
    assert infer_category('auth.spec.ts') == 'Auth'
    assert infer_category('pane-limits.spec.ts') == 'Panes'
    assert infer_category('flight-pane.spec.ts') == 'Panes'
    assert infer_category('load-speed.spec.ts') == 'Performance'
    assert infer_category('first-paint-phases.spec.ts') == 'Performance'
    assert infer_category('pairing-filter-chips.spec.ts') == 'Pairing'
    assert infer_category('query-filter.spec.ts') == 'Filter'
    assert infer_category('ai-chat.spec.ts') == 'AI Chat'
    assert infer_category('regression-page.spec.ts') == 'Regression'
    assert infer_category('whatever-else.spec.ts') == 'General'


def test_import_specs_idempotent(tmp_path):
    spec_dir = tmp_path / 'tests' / 'gantt'
    spec_dir.mkdir(parents=True)
    (spec_dir / 'pane-limits.spec.ts').write_text(SPEC)
    (spec_dir / 'auth.setup.ts').write_text("test('must be skipped', () => {})")
    (spec_dir / 'help').mkdir()
    (spec_dir / 'help' / 'help-x.spec.ts').write_text("test('help case', () => {})")

    store = RegressionStore(tmp_path / 'reg.json')
    first = import_specs(store, spec_dir)
    assert first == {'imported': 2, 'skipped': 0}
    t = store.list_tests()[0]
    assert t['spec_file'] == 'pane-limits.spec.ts'
    assert t['test_name'] == 'opens the roster pane'
    assert t['category'] == 'Panes'
    assert t['source'] == 'User'

    second = import_specs(store, spec_dir)
    assert second == {'imported': 0, 'skipped': 2}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_importer.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```python
# ai-server/src/regression/importer.py
"""One-click catalog import: register existing e2e specs as regression cases (spec §3)."""

import re
from pathlib import Path
from typing import Any

from src.regression.store import RegressionStore

# Only plain `test('title'` — test.skip / test.fixme / test.describe don't match.
_TEST_RE = re.compile(r"""^\s*test\(\s*['"](.+?)['"]""", re.MULTILINE)

_SKIP_FILES = {'auth.setup.ts'}

_CATEGORY_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'^auth'), 'Auth'),
    (re.compile(r'(^pane-|-pane\b|-pane\.)'), 'Panes'),
    (re.compile(r'(load-speed|first-paint|performance)'), 'Performance'),
    (re.compile(r'^pairing'), 'Pairing'),
    (re.compile(r'filter'), 'Filter'),
    (re.compile(r'^ai-chat'), 'AI Chat'),
    (re.compile(r'^regression'), 'Regression'),
]


def parse_spec_titles(text: str) -> list[str]:
    return _TEST_RE.findall(text)


def infer_category(filename: str) -> str:
    for pattern, category in _CATEGORY_RULES:
        if pattern.search(filename):
            return category
    return 'General'


def import_specs(store: RegressionStore, spec_dir: Path) -> dict[str, Any]:
    """Scan top-level *.spec.ts files; register unseen (spec_file, test_name) pairs."""
    existing = {(t['spec_file'], t['test_name']) for t in store.list_tests()}
    imported = skipped = 0
    for path in sorted(spec_dir.glob('*.spec.ts')):
        if path.name in _SKIP_FILES:
            continue
        for title in parse_spec_titles(path.read_text()):
            if (path.name, title) in existing:
                skipped += 1
                continue
            t = store.create_test(title=title, category=infer_category(path.name),
                                  priority='Medium', description=f'Imported from {path.name}')
            store.update_test(t['id'], spec_file=path.name, test_name=title)
            existing.add((path.name, title))
            imported += 1
    return {'imported': imported, 'skipped': skipped}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_importer.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/importer.py ai-server/tests/test_importer.py
git commit -m "feat: idempotent e2e spec importer for the regression catalog"
```

---

### Task 6: Routes — async runs, quarantine exclusion, import/detail/trace endpoints, regeneration feedback

**Files:**
- Modify: `ai-server/src/regression/routes.py`
- Test: `ai-server/tests/test_regression_routes.py` (append)

- [ ] **Step 1: Write the failing tests** (append to `ai-server/tests/test_regression_routes.py`)

```python
import time
from pathlib import Path


def _mk_test(title='case A', spec='user-tests.spec.ts'):
    r = client.post('/ai/regression/tests', json={'title': title, 'category': 'Smoke', 'priority': 'High', 'description': 'd'})
    tid = r.json()['id']
    rroutes.store.update_test(tid, spec_file=spec, test_name=title)
    return tid


def test_detail_returns_versions():
    tid = _mk_test('detail case')
    r = client.get(f'/ai/regression/tests/{tid}/detail')
    assert r.status_code == 200
    body = r.json()
    assert body['id'] == tid
    assert body['versions'][0]['trigger'] == 'created'


def test_import_specs_endpoint(tmp_path, monkeypatch):
    spec_dir = tmp_path / 'e2e' / 'tests' / 'gantt'
    spec_dir.mkdir(parents=True)
    (spec_dir / 'auth.spec.ts').write_text("test('logs in cleanly', async ({ page }) => {})")
    monkeypatch.setattr(rroutes, '_spec_dir', lambda: spec_dir)
    r = client.post('/ai/regression/import-specs')
    assert r.json() == {'imported': 1, 'skipped': 0}
    assert client.post('/ai/regression/import-specs').json() == {'imported': 0, 'skipped': 1}


def test_run_is_async_and_pollable(monkeypatch):
    tid = _mk_test('async run case')
    started = {'flag': False}

    def fake_run(specs, names, id_by_name, artifact_dir=None):
        started['flag'] = True
        return {'passed': 1, 'failed': 0,
                'results': {str(tid): {'status': 'pass', 'duration_ms': 50, 'log': ''}}}

    monkeypatch.setattr(rroutes, 'run_playwright', fake_run)
    r = client.post('/ai/regression/runs', json={'test_ids': [tid], 'scope': 'selected'})
    run_id = r.json()['run_id']
    for _ in range(50):  # poll until the worker thread finishes
        body = client.get(f'/ai/regression/runs/{run_id}').json()
        if body['status'] != 'running':
            break
        time.sleep(0.05)
    assert started['flag']
    assert body['status'] == 'done'
    assert body['passed'] == 1
    assert body['results'][str(tid)]['status'] == 'pass'
    assert rroutes.store.get_test(tid)['last_status'] == 'pass'


def test_run_excludes_quarantined_for_all_scope(monkeypatch):
    good = _mk_test('stable case Q1')
    bad = _mk_test('quarantined case Q2')
    rroutes.store.update_test(bad, quarantined=True)
    captured = {}

    def fake_run(specs, names, id_by_name, artifact_dir=None):
        captured['names'] = names
        return {'passed': 0, 'failed': 0, 'results': {}}

    monkeypatch.setattr(rroutes, 'run_playwright', fake_run)
    r = client.post('/ai/regression/runs', json={'test_ids': [good], 'scope': 'all'})
    run_id = r.json()['run_id']
    for _ in range(50):
        if client.get(f'/ai/regression/runs/{run_id}').json()['status'] != 'running':
            break
        time.sleep(0.05)
    assert 'quarantined case Q2' not in captured['names']
    assert 'stable case Q1' in captured['names']


def test_generate_feedback_includes_previous_issues(monkeypatch):
    seen = {}

    def fake_llm(system, user, max_tokens=1024):
        seen['user'] = user
        return json.dumps({'code': "test('y', async ({ page }) => { await expect(page.getByTestId('x')).toHaveCount(1); });"})

    monkeypatch.setattr(rroutes, 'llm_text', fake_llm)
    r = client.post('/ai/regression/generate-playwright', json={
        'title': 'y', 'description': 'desc', 'category': 'c',
        'previous_code': "test('y', async ({ page }) => {});",
        'issues': ['no assertion (expect) found'],
    })
    assert r.status_code == 200
    assert 'no assertion (expect) found' in seen['user']
    assert 'Previous attempt failed the quality gate' in seen['user']


def test_trace_endpoint_serves_artifact(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes, '_ARTIFACT_ROOT', tmp_path)
    (tmp_path / 'run-77').mkdir()
    (tmp_path / 'run-77' / '5.zip').write_bytes(b'PK-test')
    r = client.get('/ai/regression/runs/run-77/trace/5')
    assert r.status_code == 200
    assert r.content == b'PK-test'
    assert client.get('/ai/regression/runs/run-77/trace/6').status_code == 404
```

Note: `test_run_is_async_and_pollable` also implicitly asserts POST returns before the thread finishes is *observable*; the polling loop tolerates both fast and slow completion.

- [ ] **Step 2: Run to verify failures**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_routes.py -v`
Expected: new tests FAIL (404s for new endpoints, sync-run shape mismatch); existing tests PASS.

- [ ] **Step 3: Implement route changes** in `ai-server/src/regression/routes.py`

a) Update imports:

```python
import threading
from fastapi.responses import FileResponse
from src.regression.importer import import_specs
```

b) Add module-level helpers below `store = RegressionStore(...)`:

```python
_ARTIFACT_ROOT = Path(settings.repo_root or Path(__file__).resolve().parents[2]) / 'artifacts'


def _spec_dir() -> Path:
    root = Path(settings.repo_root) if settings.repo_root else Path(__file__).resolve().parents[3]
    return root / 'e2e' / 'tests' / 'gantt'
```

c) Extend `GenerateReq`:

```python
class GenerateReq(BaseModel):
    title: str
    description: str = ''
    category: str = ''
    previous_code: str = ''
    issues: list[str] = []
```

d) Extend `UpdateTest` with `quarantined: bool | None = None` (the store already whitelists it).

e) In `generate`, build the user prompt with feedback:

```python
    user = f"Title: {req.title}\nCategory: {req.category}\nStory / acceptance: {req.description}"
    if req.previous_code:
        issue_lines = '\n'.join(f'- {i}' for i in req.issues)
        user += ("\n\nPrevious attempt failed the quality gate with these issues:\n"
                 f"{issue_lines}\nPrevious code:\n{req.previous_code}\n"
                 "Fix every issue and return only the corrected test block.")
```

f) Fix the `apply-generated` spec path (replace the `spec_path = ...` line):

```python
    spec_path = _spec_dir() / 'user-tests.spec.ts'
```

g) Add the new endpoints (anywhere after the existing test CRUD):

```python
@router.get('/tests/{test_id}/detail')
def test_detail(test_id: int) -> dict:
    t = store.get_test(test_id)
    if t is None:
        raise HTTPException(404, 'test not found')
    return t


@router.post('/import-specs')
def import_existing_specs() -> dict:
    spec_dir = _spec_dir()
    if not spec_dir.is_dir():
        raise HTTPException(500, f'spec directory not found: {spec_dir}')
    return import_specs(store, spec_dir)


@router.get('/runs/{run_id}/trace/{test_id}')
def get_trace(run_id: str, test_id: int):
    path = _ARTIFACT_ROOT / run_id / f'{test_id}.zip'
    if not path.exists():
        raise HTTPException(404, 'trace not found')
    return FileResponse(path, media_type='application/zip', filename=f'{run_id}-{test_id}-trace.zip')
```

h) Replace `create_run` with the async version:

```python
def _execute_run(run_id: str, tests: list[dict], run_at: str) -> None:
    """Worker thread: run playwright, record results, finalize the registry entry."""
    try:
        specs = sorted({t['spec_file'] for t in tests})
        names = [t['test_name'] for t in tests if t['test_name']]
        id_by_name = {t['test_name']: t['id'] for t in tests if t['test_name']}
        result = run_playwright(specs, names, id_by_name, artifact_dir=_ARTIFACT_ROOT / run_id)
        for tid_str, res in result['results'].items():
            store.record_run(int(tid_str), status=res['status'],
                             duration_ms=res['duration_ms'], log=res.get('log', ''), run_at=run_at)
        _runs[run_id].update(status='done', passed=result['passed'], failed=result['failed'],
                             results=result['results'], error=result.get('error'))
    except Exception as exc:  # noqa: BLE001
        _runs[run_id].update(status='error', error=str(exc))


@router.post('/runs')
def create_run(req: RunReq) -> dict:
    _run_seq['n'] += 1
    run_id = f"run-{_run_seq['n']}"
    run_at = datetime.now(timezone.utc).isoformat()

    selected = [t for t in (store.get_test(i) for i in req.test_ids) if t is not None]
    if req.scope == 'all':
        resolved = [t for t in store.list_tests() if not t.get('quarantined')]
    elif req.scope == 'related':
        categories = {t['category'] for t in selected}
        by_id = {t['id']: t for t in selected}
        for t in store.list_tests():
            if t['category'] in categories and not t.get('quarantined'):
                by_id[t['id']] = t
        resolved = list(by_id.values())
    else:  # selected — runs even quarantined tests (explicit user intent)
        resolved = selected

    tests = [t for t in resolved if t['spec_file'] != 'manual']
    if req.order == 'failing-first':
        tests = prioritize(tests)
    _runs[run_id] = {'run_id': run_id, 'status': 'running', 'total': len(tests),
                     'passed': 0, 'failed': 0, 'results': {}, 'error': None}
    threading.Thread(target=_execute_run, args=(run_id, tests, run_at), daemon=True).start()
    return {'run_id': run_id}
```

- [ ] **Step 4: Run the full ai-server suite**

Run: `cd ai-server && .venv/bin/python -m pytest -v`
Expected: all PASS (note pre-existing failures per memory are in engine-server, not ai-server; if an ai-server test was already red before this branch, report it but do not chase it here).

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/routes.py ai-server/tests/test_regression_routes.py
git commit -m "feat: async regression runs, quarantine exclusion, import/detail/trace endpoints, regeneration feedback"
```

---

### Task 7: ai-server housekeeping — gitignore + CLAUDE.md route table

**Files:**
- Modify: `ai-server/.gitignore`
- Modify: `ai-server/CLAUDE.md` (Regression route table)

- [ ] **Step 1: Append to `ai-server/.gitignore`**

```
artifacts/
```

- [ ] **Step 2: Update the Regression route table in `ai-server/CLAUDE.md`** — add rows:

```markdown
| `GET` | `/ai/regression/tests/{id}/detail` | 用例详情（含 versions 历史） |
| `POST` | `/ai/regression/import-specs` | 幂等导入 `e2e/tests/gantt/*.spec.ts` 既有用例 |
| `GET` | `/ai/regression/runs/{run_id}/trace/{test_id}` | 下载失败用例的 Playwright trace.zip |
```

And in the same file's run-strategy section, append one line:

```markdown
- **flake 检测**：运行带 `--retries=1`（fail→pass 记为 `flaky`）+ `--trace=on-first-retry`；不稳定度按状态翻转计算，支持隔离（quarantine）与连续 5 次通过自动解除。
```

- [ ] **Step 3: Commit**

```bash
git add ai-server/.gitignore ai-server/CLAUDE.md
git commit -m "chore: gitignore run artifacts; document new regression endpoints"
```

---

### Task 8: Frontend types + API client

**Files:**
- Modify: `gantt/src/types/regression.ts`
- Modify: `gantt/src/services/regression-api.ts`

- [ ] **Step 1: Update `gantt/src/types/regression.ts`**

Replace `RegressionTest`, `RunStatusResult` and add `RegressionVersion` / `ImportResult` (keep the other types as-is):

```typescript
export type RunOutcome = 'pass' | 'fail' | 'flaky'

export interface RegressionVersion {
  version: number
  timestamp: string
  trigger: string
  title: string
  code: string
  status: string
  log: string
  run_at: string
  duration_ms: number
}

export interface RegressionTest {
  id: number
  title: string
  spec_file: string
  test_name: string
  category: string
  source: 'AI' | 'User'
  priority: 'High' | 'Medium' | 'Low'
  description: string
  last_status: RunOutcome | null
  last_duration_ms: number | null
  run_count: number
  pass_count: number
  fail_count: number
  flakiness_score: number
  recent_results: RunOutcome[]
  instability: number
  quarantined: boolean
  versions?: RegressionVersion[]
}

export interface RunStatusResult {
  status: 'running' | 'done' | 'error'
  total?: number
  passed: number
  failed: number
  results?: Record<string, { status: RunOutcome; duration_ms?: number; has_trace?: boolean }>
  error?: string | null
}

export interface ImportResult {
  imported: number
  skipped: number
}
```

- [ ] **Step 2: Update `gantt/src/services/regression-api.ts`**

a) Extend the import list with `ImportResult`.

b) Extend `UpdateTestBody` and `GenerateBody`:

```typescript
type UpdateTestBody = Partial<CreateTestBody> & { quarantined?: boolean }

interface GenerateBody {
  title: string
  description: string
  category: string
  previous_code?: string
  issues?: string[]
}
```

c) Add methods to `regressionApi`:

```typescript
  importSpecs: (): Promise<ImportResult> =>
    client.post('/regression/import-specs') as Promise<ImportResult>,

  detail: (id: number): Promise<RegressionTest> =>
    client.get(`/regression/tests/${id}/detail`) as Promise<RegressionTest>,

  setQuarantined: (id: number, quarantined: boolean): Promise<RegressionTest> =>
    client.put(`/regression/tests/${id}`, { quarantined }) as Promise<RegressionTest>,

  /** Browser-navigable URL for a failed test's trace zip (open at trace.playwright.dev). */
  traceUrl: (runId: string, testId: number): string =>
    `${AI_API_BASE}/regression/runs/${runId}/trace/${testId}`,
```

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit 2>&1 | grep -v "pre-existing" | head -20`
Expected: no NEW errors referencing `regression` files (memory: 2 gantt tsc errors are pre-existing elsewhere).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/types/regression.ts gantt/src/services/regression-api.ts
git commit -m "feat: regression API client — import, detail, quarantine, trace URL, run polling types"
```

---

### Task 9: Regression utils — instability badge + quarantine suggestion helpers

**Files:**
- Modify: `gantt/src/components/regression/regression-utils.ts`
- Test: `gantt/src/components/regression/__tests__/regression-utils.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; reuse the file's existing test-fixture builder if one exists, otherwise build minimal `RegressionTest` literals matching the new type)

```typescript
import { suggestQuarantine, instabilityPct } from '../regression-utils'
import type { RegressionTest } from '@/types/regression'

const base: RegressionTest = {
  id: 1, title: 't', spec_file: 'a.spec.ts', test_name: 't', category: 'Smoke',
  source: 'User', priority: 'High', description: '', last_status: null,
  last_duration_ms: null, run_count: 0, pass_count: 0, fail_count: 0,
  flakiness_score: 0, recent_results: [], instability: 0, quarantined: false,
}

describe('instabilityPct', () => {
  it('rounds instability to a whole percent', () => {
    expect(instabilityPct({ ...base, instability: 0.333 })).toBe(33)
    expect(instabilityPct({ ...base, instability: 0 })).toBe(0)
  })
})

describe('suggestQuarantine', () => {
  it('suggests when unstable with ≥5 runs and not quarantined', () => {
    const t = { ...base, instability: 0.4, recent_results: ['pass', 'fail', 'pass', 'fail', 'pass'] as const }
    expect(suggestQuarantine({ ...t, recent_results: [...t.recent_results] })).toBe(true)
  })
  it('does not suggest below threshold, with <5 runs, or when quarantined', () => {
    expect(suggestQuarantine({ ...base, instability: 0.1, recent_results: ['pass', 'fail', 'pass', 'fail', 'pass'] })).toBe(false)
    expect(suggestQuarantine({ ...base, instability: 0.9, recent_results: ['pass', 'fail'] })).toBe(false)
    expect(suggestQuarantine({ ...base, instability: 0.9, recent_results: ['pass', 'fail', 'pass', 'fail', 'pass'], quarantined: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd gantt && npx vitest run src/components/regression/__tests__/regression-utils.test.ts`
Expected: FAIL — `suggestQuarantine` not exported

- [ ] **Step 3: Implement in `regression-utils.ts`** (append)

```typescript
/** Mirror of ai-server flakiness.py thresholds (spec §4). */
const QUARANTINE_THRESHOLD = 0.3
const MIN_RUNS_FOR_SUGGESTION = 5

export const instabilityPct = (t: RegressionTest): number => Math.round(t.instability * 100)

export const suggestQuarantine = (t: RegressionTest): boolean =>
  !t.quarantined &&
  t.recent_results.length >= MIN_RUNS_FOR_SUGGESTION &&
  t.instability >= QUARANTINE_THRESHOLD
```

(Add `import type { RegressionTest } from '@/types/regression'` if not already imported.)

- [ ] **Step 4: Run to verify pass**

Run: `cd gantt && npx vitest run src/components/regression/__tests__/regression-utils.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/regression/regression-utils.ts gantt/src/components/regression/__tests__/regression-utils.test.ts
git commit -m "feat: instability percent + quarantine-suggestion helpers"
```

---

### Task 10: Info popover component (goal + how-to-use)

**Files:**
- Create: `gantt/src/components/regression/regression-info.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Info } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@rois/ui'

/**
 * Goal + how-to-use popover for the Regression playground (spec §1).
 * Content asserted by e2e/tests/gantt/regression-page.spec.ts.
 */
export const RegressionInfo = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="About the regression playground"
        data-testid="regression-info"
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      data-testid="regression-info-popover"
      className="w-96 p-3 text-xs"
      align="start"
    >
      <p className="font-semibold text-foreground">Your testing playground</p>
      <p className="mt-1 text-muted-foreground">
        Describe a test in plain English, AI turns it into a runnable Playwright spec, the
        system runs it and tracks stability over time. No coding required.
      </p>
      <p className="mt-2 font-medium text-foreground">How to use</p>
      <ol className="mt-1 list-decimal pl-4 text-muted-foreground" data-testid="regression-info-steps">
        <li>Add Test with a plain-English story of what should happen.</li>
        <li>Generate — AI writes the code; resolve flagged issues with Regenerate.</li>
        <li>Apply the code, then Run the test.</li>
        <li>Watch live results; unstable tests are auto-flagged and can be quarantined.</li>
      </ol>
      <p className="mt-2 font-medium text-foreground">Badges</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
        <li><span className="font-semibold text-destructive">N</span> — recorded failures</li>
        <li><span className="font-semibold">N% unstable</span> — pass/fail flips over recent runs</li>
        <li><span className="font-semibold">flaky</span> — passed only on retry</li>
        <li><span className="font-semibold text-amber-600">quarantined</span> — excluded from Run All until stable</li>
      </ul>
    </PopoverContent>
  </Popover>
)
```

- [ ] **Step 2: Verify it compiles**

Run: `cd gantt && npx tsc --noEmit 2>&1 | grep regression`
Expected: no output (no regression-file errors). Behavior is covered by the e2e test in Task 13.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/regression/regression-info.tsx
git commit -m "feat: regression playground goal/how-to info popover"
```

---

### Task 11: Run-status bar + polling

**Files:**
- Create: `gantt/src/components/regression/run-status-bar.tsx`
- Create: `gantt/src/components/regression/use-run-poll.ts`

- [ ] **Step 1: Create the polling hook**

```typescript
// gantt/src/components/regression/use-run-poll.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { regressionApi } from '@/services/regression-api'
import type { RunStatusResult } from '@/types/regression'

export interface ActiveRun extends RunStatusResult {
  runId: string
}

const POLL_MS = 2000

/**
 * Starts a run and polls GET /runs/{id} every 2s until done/error (spec §7).
 * onDone fires once with the final payload so the caller can refresh + toast.
 */
export const useRunPoll = (onDone: (run: ActiveRun) => void) => {
  const [run, setRun] = useState<ActiveRun | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])

  const start = useCallback(
    (runId: string, total: number) => {
      stop()
      setRun({ runId, status: 'running', total, passed: 0, failed: 0 })
      timer.current = setInterval(async () => {
        try {
          const status = await regressionApi.runStatus(runId)
          const next: ActiveRun = { runId, ...status }
          setRun(next)
          if (status.status !== 'running') {
            stop()
            onDoneRef.current(next)
            // keep error visible; clear successful runs from the bar
            if (status.status === 'done') setRun(null)
          }
        } catch {
          // transient poll failure — keep polling; the 600s server timeout bounds the run
        }
      }, POLL_MS)
    },
    [stop],
  )

  useEffect(() => stop, [stop])

  return { run, start, dismiss: () => setRun(null) }
}
```

- [ ] **Step 2: Create the status bar component**

```tsx
// gantt/src/components/regression/run-status-bar.tsx
import { Loader2, XCircle, X } from 'lucide-react'
import type { ActiveRun } from './use-run-poll'

/** Bottom status bar shown while a run is active or after an error (spec §7). */
export const RunStatusBar = ({ run, onDismiss }: { run: ActiveRun; onDismiss: () => void }) => (
  <div
    data-testid="run-status-bar"
    className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2 text-xs"
  >
    {run.status === 'running' ? (
      <>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span data-testid="run-status-text" className="text-foreground">
          Running {run.total ?? 0} tests — passed {run.passed} · failed {run.failed}
        </span>
      </>
    ) : (
      <>
        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span data-testid="run-status-text" className="truncate text-destructive">
          Run failed: {run.error || 'unknown error'}
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </>
    )}
  </div>
)
```

- [ ] **Step 3: Type-check** — `cd gantt && npx tsc --noEmit 2>&1 | grep regression` → no output.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/regression/use-run-poll.ts gantt/src/components/regression/run-status-bar.tsx
git commit -m "feat: run-status polling hook + bottom status bar"
```

---

### Task 12: Wire up regression-view — import, badges, quarantine, trace, version history, regenerate

**Files:**
- Create: `gantt/src/components/regression/version-history.tsx`
- Modify: `gantt/src/components/regression/regression-view.tsx`

- [ ] **Step 1: Create the version-history panel**

```tsx
// gantt/src/components/regression/version-history.tsx
import { useEffect, useState } from 'react'
import { regressionApi } from '@/services/regression-api'
import type { RegressionVersion } from '@/types/regression'

/** Expandable per-test version timeline, fetched from GET /tests/{id}/detail (spec §7). */
export const VersionHistory = ({ testId }: { testId: number }) => {
  const [versions, setVersions] = useState<RegressionVersion[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    regressionApi
      .detail(testId)
      .then((t) => alive && setVersions([...(t.versions ?? [])].reverse()))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [testId])

  if (error)
    return (
      <div className="px-4 py-2 text-2xs text-destructive" data-testid="version-history-error">
        Failed to load version history
      </div>
    )
  if (versions === null)
    return <div className="px-4 py-2 text-2xs text-muted-foreground">Loading history…</div>

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-2" data-testid="version-history">
      {versions.length === 0 ? (
        <span className="text-2xs text-muted-foreground">No versions recorded yet.</span>
      ) : (
        versions.map((v) => (
          <div key={v.version} className="flex items-center gap-2 py-0.5 text-2xs" data-testid="version-row">
            <span className="font-mono tabular-nums text-muted-foreground">v{v.version}</span>
            <span className="font-medium text-foreground">{v.trigger}</span>
            {v.status && <span className="text-muted-foreground">{v.status}</span>}
            {v.run_at && <span className="text-muted-foreground">{v.run_at.slice(0, 19)}</span>}
            {v.code && (
              <details className="ml-auto">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">code</summary>
                <pre className="mt-1 max-h-32 max-w-xl overflow-auto rounded-sm bg-muted p-2">{v.code}</pre>
              </details>
            )}
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 2: Modify `regression-view.tsx`**

The diff touches imports, header, rows, and the bottom of the layout. Apply these changes:

a) **Imports** — replace the lucide + local imports at the top:

```tsx
import { useEffect, useState, useCallback, Fragment } from 'react'
import {
  FlaskConical, Plus, Play, Wand2, Trash2, Download, ChevronRight, ChevronDown,
  ShieldAlert, FileArchive,
} from 'lucide-react'
import { Button, toast } from '@rois/ui'
import { regressionApi } from '@/services/regression-api'
import type { RegressionTest, RunScope, ApplyGateError } from '@/types/regression'
import { AddTestDialog, type AddTestData } from './add-test-dialog'
import { sortByFailFirst, computeStats, instabilityPct, suggestQuarantine } from './regression-utils'
import { RegressionInfo } from './regression-info'
import { RunStatusBar } from './run-status-bar'
import { useRunPoll, type ActiveRun } from './use-run-poll'
import { VersionHistory } from './version-history'
```

b) **State + polling** — inside the component, after the existing state hooks add:

```tsx
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [lastRun, setLastRun] = useState<ActiveRun | null>(null)

  const onRunDone = useCallback(
    (run: ActiveRun) => {
      setLastRun(run)
      if (run.status === 'done') {
        toast.success(`Run finished: ${run.passed} passed, ${run.failed} failed`)
        void refresh()
      }
    },
    [refresh],
  )
  const { run: activeRun, start: startPolling, dismiss: dismissRun } = useRunPoll(onRunDone)
```

(`refresh` is declared above with `useCallback`, so this compiles.)

c) **Run helpers** — replace `runFailingFirst` and the row Run handler with a shared starter:

```tsx
  const startRun = async (ids: number[], runScope: RunScope, total: number) => {
    try {
      const { run_id } = await regressionApi.run(ids, { order: 'failing-first', scope: runScope })
      startPolling(run_id, total)
    } catch (e) {
      console.error('[regression]', e)
      toast.error('Run failed to start')
    }
  }

  const runFailingFirst = () => {
    const runnable = tests.filter((t) => t.spec_file !== 'manual' && !t.quarantined)
    if (runnable.length === 0) {
      toast.error('No runnable tests (manual and quarantined tests are excluded)')
      return
    }
    void startRun(runnable.map((t) => t.id), scope, runnable.length)
  }
```

d) **Import + quarantine handlers** — add:

```tsx
  const onImport = async () => {
    try {
      const { imported, skipped } = await regressionApi.importSpecs()
      toast.success(`Imported ${imported} tests (${skipped} already present)`)
      await refresh()
    } catch (e) {
      console.error('[regression]', e)
      toast.error('Import failed')
    }
  }

  const onToggleQuarantine = async (t: RegressionTest) => {
    try {
      await regressionApi.setQuarantined(t.id, !t.quarantined)
      await refresh()
    } catch (e) {
      console.error('[regression]', e)
      toast.error('Update failed')
    }
  }

  const onRegenerate = async (t: RegressionTest) => {
    if (!preview) return
    try {
      const res = await regressionApi.generate({
        title: t.title,
        description: t.description,
        category: t.category,
        previous_code: preview.code,
        issues: preview.issues,
      })
      if (res.code) setPreview({ id: t.id, code: res.code, issues: res.issues ?? [], questions: [] })
      else if (res.error) toast.error(res.error)
    } catch (e) {
      console.error('[regression]', e)
      toast.error('Regenerate failed')
    }
  }
```

e) **Header** — after the title `<span>` add `<RegressionInfo />`; in the right-side button group add the Import button before "Add Test":

```tsx
          <Button size="sm" variant="outline" data-testid="import-specs" onClick={onImport}>
            <Download className="h-3.5 w-3.5" /> Import specs
          </Button>
```

f) **Empty state** — replace the empty-state div content:

```tsx
          <div
            data-testid="regression-empty"
            className="flex flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground"
          >
            <span>No regression tests yet.</span>
            <span>Click "Import specs" to load the existing test catalog, or "Add Test" to write one in plain English.</span>
            <Button size="sm" variant="outline" data-testid="import-specs-empty" onClick={onImport}>
              <Download className="h-3.5 w-3.5" /> Import specs
            </Button>
          </div>
```

g) **Rows** — wrap each row in a `Fragment` with the expander + new badges. Replace the `sorted.map((t) => (...))` block body with:

```tsx
          sorted.map((t) => {
            const rowResult = lastRun?.results?.[String(t.id)]
            return (
              <Fragment key={t.id}>
                <div
                  data-testid="regression-row"
                  className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-xs"
                >
                  <button
                    type="button"
                    aria-label="Toggle history"
                    data-testid="row-expand"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  >
                    {expandedId === t.id ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="font-mono tabular-nums text-muted-foreground">{t.id}</span>
                  <span className="flex-1 truncate text-foreground">{t.title}</span>
                  <span className="text-2xs text-muted-foreground">{t.category}</span>
                  <span className="text-2xs text-muted-foreground">{t.source}</span>
                  {t.quarantined && (
                    <span
                      data-testid="row-quarantined"
                      className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-2xs font-semibold text-amber-600"
                    >
                      quarantined
                    </span>
                  )}
                  {t.last_status === 'flaky' && (
                    <span
                      data-testid="row-flaky"
                      className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-2xs font-semibold text-amber-600"
                    >
                      flaky
                    </span>
                  )}
                  {t.instability > 0 && t.recent_results.length >= 2 && (
                    <span
                      data-testid="row-instability"
                      className="rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground tabular-nums"
                      title="Status flips over recent runs (transition-based instability)"
                    >
                      {instabilityPct(t)}% unstable
                    </span>
                  )}
                  {suggestQuarantine(t) && (
                    <span
                      data-testid="row-quarantine-suggest"
                      className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-600"
                    >
                      Quarantine?
                    </span>
                  )}
                  {t.fail_count > 0 && (
                    <span
                      data-testid="row-failcount"
                      className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-2xs font-semibold text-destructive tabular-nums"
                      title={`${t.fail_count} recorded failures`}
                    >
                      {t.fail_count}
                    </span>
                  )}
                  {lastRun && rowResult?.has_trace && (
                    <a
                      data-testid="row-trace"
                      aria-label="View trace"
                      title="Download trace — open it at trace.playwright.dev"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      href={regressionApi.traceUrl(lastRun.runId, t.id)}
                      download
                    >
                      <FileArchive className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={t.quarantined ? 'Release from quarantine' : 'Quarantine'}
                    data-testid="row-quarantine-toggle"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-sm hover:bg-muted ${
                      t.quarantined ? 'text-amber-600' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => onToggleQuarantine(t)}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Generate"
                    data-testid="row-generate"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onGenerate(t)}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Run"
                    data-testid="row-run"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void startRun([t.id], 'selected', 1)}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    data-testid="row-delete"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDelete(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {expandedId === t.id && <VersionHistory testId={t.id} />}
              </Fragment>
            )
          })
```

h) **Preview footer** — in the preview's button row, add a Regenerate button after Apply (only when issues exist). The preview belongs to a test; look it up:

```tsx
            {preview.issues.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                data-testid="regenerate-with-fixes"
                onClick={() => {
                  const t = tests.find((x) => x.id === preview.id)
                  if (t) void onRegenerate(t)
                }}
              >
                <Wand2 className="h-3.5 w-3.5" /> Regenerate with fixes
              </Button>
            )}
```

And change the hint text `Resolve issues by regenerating before applying.` to `Issues block Apply — use Regenerate with fixes.`

i) **Bottom of layout** — before `<AddTestDialog …/>` render the status bar:

```tsx
      {(activeRun || lastRun?.status === 'error') && (
        <RunStatusBar
          run={activeRun ?? (lastRun as ActiveRun)}
          onDismiss={() => {
            dismissRun()
            setLastRun(null)
          }}
        />
      )}
```

- [ ] **Step 3: Type-check + unit tests**

Run: `cd gantt && npx tsc --noEmit 2>&1 | grep -i regression; npx vitest run src/components/regression`
Expected: no tsc output for regression files; vitest PASS.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/regression/
git commit -m "feat: regression view — import, run polling bar, quarantine, instability badges, version history, regenerate"
```

---

### Task 13: E2E regression-page spec (stubbed API)

**Files:**
- Modify: `e2e/tests/gantt/regression-page.spec.ts` (extend; keep existing passing tests, update any that assert the old row layout)

- [ ] **Step 1: Read the existing spec** to reuse its auth-seeding + `page.route` stubbing helpers (memory: gantt auth is sessionStorage, seeded via `addInitScript`; app base path `/fpqe/gantt/`). Extend — do not duplicate — its fixture helpers.

- [ ] **Step 2: Add the new tests.** Use the existing stub helper for `**/fpqe/ai/regression/**` routes; the JSON bodies below are the contract:

```typescript
const T = (over: Record<string, unknown> = {}) => ({
  id: 1001, title: 'opens the roster pane', spec_file: 'pane-limits.spec.ts',
  test_name: 'opens the roster pane', category: 'Panes', source: 'User', priority: 'Medium',
  description: '', last_status: null, last_duration_ms: null, run_count: 0, pass_count: 0,
  fail_count: 0, flakiness_score: 0, recent_results: [], instability: 0, quarantined: false,
  ...over,
})

test('info popover explains the playground goal and 4 usage steps', async ({ page }) => {
  // stub GET tests -> { tests: [T()] }; open regression module
  await page.getByTestId('regression-info').click()
  const pop = page.getByTestId('regression-info-popover')
  await expect(pop).toContainText('Your testing playground')
  await expect(pop).toContainText('No coding required')
  await expect(pop.getByTestId('regression-info-steps').locator('li')).toHaveCount(4)
  await expect(pop).toContainText('quarantined')
})

test('import specs populates the catalog with named tests', async ({ page }) => {
  // GET tests returns { tests: [] } first; after POST import-specs (stub {imported: 2, skipped: 0})
  // the refetch returns two named tests.
  await expect(page.getByTestId('regression-empty')).toContainText('Import specs')
  await page.getByTestId('import-specs-empty').click()
  await expect(page.getByTestId('regression-row')).toHaveCount(2)
  await expect(page.getByTestId('regression-list')).toContainText('opens the roster pane')
  await expect(page.getByTestId('stat-total')).toContainText('Total: 2')
})

test('run shows live status bar, then summary toast and refreshed rows', async ({ page }) => {
  // stub POST runs -> {run_id: 'run-9'}; GET runs/run-9 returns running(1/0) on first call,
  // then done {passed: 1, failed: 1, results: {'1001': {status:'pass'}, '1002': {status:'fail', has_trace: true}}}.
  // After done, GET tests returns updated last_status values.
  await page.getByTestId('run-failing-first').click()
  const bar = page.getByTestId('run-status-bar')
  await expect(bar.getByTestId('run-status-text')).toContainText('Running 2 tests')
  await expect(bar.getByTestId('run-status-text')).toContainText('passed 1')
  await expect(page.getByTestId('run-status-bar')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByTestId('row-trace')).toHaveCount(1)
})

test('quarantined test shows badge and Run All excludes it client-side', async ({ page }) => {
  // GET tests -> [T(), T({id: 1002, title: 'shaky case', quarantined: true, instability: 0.6,
  //   recent_results: ['pass','fail','pass','fail','pass']})]
  await expect(page.getByTestId('row-quarantined')).toHaveCount(1)
  await expect(page.getByTestId('row-instability')).toContainText('60% unstable')
  // intercept POST runs and assert body.test_ids === [1001] (quarantined 1002 excluded)
})

test('version history expands with trigger entries', async ({ page }) => {
  // stub GET tests/1001/detail -> T({versions: [
  //   {version: 1, trigger: 'created', status: '', ...}, {version: 2, trigger: 'script', status: '', code: 'test(...)', ...}]})
  await page.getByTestId('row-expand').first().click()
  await expect(page.getByTestId('version-row')).toHaveCount(2)
  await expect(page.getByTestId('version-history')).toContainText('script')
})

test('regenerate with fixes resubmits previous code and issues', async ({ page }) => {
  // 1st POST generate-playwright -> {code: 'bad', issues: ['no assertion (expect) found']}
  // 2nd POST -> {code: 'good', issues: []}; assert 2nd request body contains previous_code='bad'
  await page.getByTestId('row-generate').first().click()
  await expect(page.getByTestId('generate-issue')).toContainText('no assertion')
  await page.getByTestId('regenerate-with-fixes').click()
  await expect(page.getByTestId('generate-issue')).toHaveCount(0)
  await expect(page.getByTestId('apply-generated')).toBeEnabled()
})
```

Fill in the route stubs concretely following the file's existing stubbing pattern. Every comment line above describing a stub must become real `page.route` code.

- [ ] **Step 3: Run the spec**

Run (repo root): `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/regression-page.spec.ts --reporter=list`
Expected: all PASS (existing + 6 new). The gantt dev server must be running (memory: vite at 5173 serving `/fpqe/gantt/`; if this workspace is shared with another session, use the worktree/alt-port isolation noted in memory).

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/regression-page.spec.ts
git commit -m "test: regression playground e2e — popover, import, run polling, quarantine, history, regenerate"
```

---

### Task 14: Help topic (§Help-Sync)

**Files:**
- Create: `gantt/src/components/help/topics/regression/regression-overview.tsx`
- Modify: `gantt/src/components/help/help-data.ts`
- Modify: `gantt/src/components/help/help-view.tsx`

- [ ] **Step 1: Create the topic component**

```tsx
// gantt/src/components/help/topics/regression/regression-overview.tsx
import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'

export default function RegressionOverview() {
  return (
    <>
      <HelpStep n={1}>
        Open the <strong>Regression</strong> tab and click <strong>Add Test</strong>. Describe
        what should happen in plain English — for example, "filtering the roster to BKK shows
        a BKK chip and only BKK crew rows". Pick a category and priority, then save.
      </HelpStep>

      <HelpStep n={2}>
        Click the <strong>wand</strong> button on the test row. The AI writes Playwright code
        from your story. If the code preview shows red issue chips (for example a missing
        assertion), click <strong>Regenerate with fixes</strong> until the chips are gone, then
        click <strong>Apply</strong>.
      </HelpStep>

      <HelpStep n={3}>
        Click the <strong>play</strong> button to run one test, or <strong>Run failing
        first</strong> to run the whole catalog (most-recently-failing tests run first). A
        status bar at the bottom shows live progress; results update when the run finishes.
      </HelpStep>

      <HelpStep n={4}>
        Watch the stability badges. <strong>flaky</strong> means a test passed only on retry;
        <strong> N% unstable</strong> counts pass/fail flips over recent runs. When a test is
        too unstable, quarantine it with the <strong>shield</strong> button — it is excluded
        from Run All until it passes 5 runs in a row, then released automatically.
      </HelpStep>

      <HelpNote>
        Click <strong>Import specs</strong> once to load the existing automated test catalog,
        and use the row chevron to see a test's full version history (every edit, generated
        script, and run result).
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Import specs', description: 'Registers the existing automated e2e tests as catalog entries. Safe to repeat — already-imported tests are skipped.' },
        { name: 'Add Test', description: 'Create a test from a plain-English story. No coding required.' },
        { name: 'Wand (Generate)', description: 'AI writes Playwright code from the story; quality issues are flagged before you can apply.' },
        { name: 'Play (Run) / Run failing first', description: 'Run one test or the whole catalog with live progress at the bottom.' },
        { name: 'Shield (Quarantine)', description: 'Excludes an unstable test from Run All. Auto-released after 5 consecutive passes.' },
        { name: 'Chevron (History)', description: 'Shows the version timeline: edits, generated scripts, and run outcomes.' },
      ]} />
    </>
  )
}
```

- [ ] **Step 2: Register in `help-data.ts`** — add a category after the `rbot` category and before `glossary`:

```typescript
  {
    slug: 'regression',
    title: 'Regression Playground',
    lucideIcon: 'FlaskConical',
    defaultExpanded: false,
    topics: [
      {
        slug: 'regression-overview',
        title: 'Overview & how to use',
        categorySlug: 'regression',
        stepCount: 4,
        overview:
          'The Regression tab is the testing playground: describe a test in plain English, AI generates runnable Playwright code, and the system runs it and tracks stability over time.',
      },
    ],
  },
```

- [ ] **Step 3: Register in `help-view.tsx`** topic-component map (follow the existing lazy pattern):

```typescript
  'regression-overview': lazy(() => import('./topics/regression/regression-overview')),
```

- [ ] **Step 4: Run the help regression suite**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/help --reporter=list`
Expected: PASS except the pre-existing known-red 'Running an optimisation' screenshot test (memory: `scenario-run.png` missing since main `4ec4977` — not a regression from this change). If any *other* test fails (e.g. a topic-count assertion), update its expected counts for the new category/topic.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/help/
git commit -m "docs: in-app help topic for the Regression Playground (§Help-Sync)"
```

---

### Task 15: Version bump + full verification

**Files:**
- Modify: `gantt/src/version.ts:17-18`

- [ ] **Step 1: Bump versions** — `BACKEND_VERSION` 45 → 46, `FRONTEND_VERSION` 84 → 85.

- [ ] **Step 2: Full backend suite**

Run: `cd ai-server && .venv/bin/python -m pytest -v`
Expected: all PASS.

- [ ] **Step 3: Frontend checks**

Run: `cd gantt && npx tsc --noEmit; npx vitest run src/components/regression`
Expected: no new tsc errors (2 pre-existing elsewhere per memory); vitest PASS.

- [ ] **Step 4: E2E regression page suite (final receipt)**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/regression-page.spec.ts --reporter=list`
Expected: all PASS. Paste the PASS/FAIL summary into the completion message (§No-Illusion).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump versions B46/F85 for regression playground v2"
```

---

## Self-review notes

- Spec coverage: §1→Task 10, §2→Tasks 4+6, §3→Tasks 5+6+12, §4→Tasks 1+2+6+12, §5→Tasks 3+6+12h, §6→Tasks 4+6+12g, §7→Tasks 11+12, §8 (API table)→Tasks 6+8, Testing→every task + 13, Compliance→Tasks 7+14+15.
- The `selected` scope intentionally still runs quarantined tests (explicit user intent); `all`/`related` exclude them — consistent across routes.py (Task 6h) and the client-side Run All filter (Task 12c).
- Type consistency: `RunOutcome` ('pass'|'fail'|'flaky') used in types, store statuses, and runner parse_report; `has_trace` flows runner→routes results→`RunStatusResult.results`→trace link.
- Manual tests (`spec_file: 'manual'`) remain excluded from runs (existing behavior) and are now also excluded from the client-side Run All count with a clear toast when nothing is runnable.
