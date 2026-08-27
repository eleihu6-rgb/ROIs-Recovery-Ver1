# Regression Actor Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who acted on every regression test — baseline creator (`created_by`, defaulting all 158 existing tests to `AI`), per-version modifier (`modified_by` / `applied_by`), and per-round tester — flowing identity via an `X-User-Code` header from gantt to ai-server.

**Architecture:** ai-server's JSON `RegressionStore` gains three actor fields with load-time migration; FastAPI routes read `X-User-Code` (`Header(default='User')`) and thread it into the store; gantt's dedicated regression axios client attaches the header from `useAuthStore`; the version-history detail panel displays creator/modifier/tester chips. No auth verification (trust-based internal tool).

**Tech Stack:** Python 3.12 / FastAPI / pytest (ai-server); React 19 + TS + axios / Playwright (gantt + e2e).

**Spec:** `docs/superpowers/specs/2026-06-06-regression-actor-tracking-design.md`

**Working directory:** repo root `/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS` (paths below are relative to it). ai-server tests run as `cd ai-server && .venv/bin/python -m pytest tests/<file> -v`.

**Note on uncommitted files:** `ai-server/src/regression/*.py`, the ai-server tests, and the gantt regression components already carry uncommitted changes from in-flight work on this branch. Do not revert anything — only add.

---

### Task 1: Store — `created_by` baseline creator

**Files:**
- Modify: `ai-server/src/regression/store.py`
- Test: `ai-server/tests/test_regression_store.py`

- [ ] **Step 1: Write the failing tests** (append to `ai-server/tests/test_regression_store.py`)

```python
def test_load_defaults_created_by_to_ai(tmp_path):
    """All 158 pre-existing tests lack created_by — migration attributes them to AI."""
    import json
    path = tmp_path / 'r.json'
    path.write_text(json.dumps({'next_id': 2, 'tests': [{
        'id': 1, 'title': 'legacy', 'spec_file': 'a.spec.ts', 'test_name': 'legacy',
        'category': 'c', 'source': 'User', 'priority': 'Low', 'description': '',
        'last_status': None, 'run_count': 0, 'pass_count': 0, 'fail_count': 0,
        'total_duration_ms': 0, 'flakiness_score': 0.0,
        'versions': [{'version': 1, 'trigger': 'created', 'timestamp': '', 'title': 'legacy', 'code': ''}],
    }]}))
    store = RegressionStore(path)
    t = store.get_test(1)
    assert t['created_by'] == 'AI'
    # Legacy version history is NOT backfilled — modified_by stays empty.
    assert t['versions'][0]['modified_by'] == ''
    assert t['versions'][0]['applied_by'] == ''


def test_create_test_records_creator_and_v1_modifier(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='',
                          created_by='P10001')
    assert t['created_by'] == 'P10001'
    assert t['versions'][0]['trigger'] == 'created'
    assert t['versions'][0]['modified_by'] == 'P10001'


def test_create_test_creator_defaults_to_ai(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    assert t['created_by'] == 'AI'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_store.py -v -k "created_by or creator"`
Expected: 3 FAIL (KeyError `created_by` / unexpected kwarg)

- [ ] **Step 3: Implement in `ai-server/src/regression/store.py`**

In `_load`, add the migration default alongside the existing setdefaults:

```python
        for t in data.get('tests', []):
            t.setdefault('recent_results', [])
            t.setdefault('quarantined', False)
            t.setdefault('instability', 0.0)
            t.setdefault('created_by', 'AI')  # baseline creator for pre-actor-tracking tests
            self._normalize_versions(t)
```

Extend `_version_snapshot` with actor params (used fully in Task 2; add now so v1 carries the creator):

```python
    def _version_snapshot(self, t: dict[str, Any], *, version: int, trigger: str,
                          code: str = '', timestamp: str | None = None,
                          modified_by: str = '', applied_by: str = '') -> dict[str, Any]:
        return {
            'version': version,
            'timestamp': _now() if timestamp is None else timestamp,
            'trigger': trigger,
            'modified_by': modified_by,
            'applied_by': applied_by,
            'title': t.get('title', ''),
            ...  # rest unchanged
        }
```

In `_normalize_versions`, preserve raw actor fields (legacy → empty, no backfill) inside the normalized-version dict:

```python
                version = {
                    'version': int(raw.get('version') or len(normalized) + 1),
                    'timestamp': raw.get('timestamp', ''),
                    'trigger': raw.get('trigger', 'created'),
                    'modified_by': raw.get('modified_by', ''),
                    'applied_by': raw.get('applied_by', ''),
                    ...  # rest unchanged
                }
```

…and attribute the synthesized default v1 (tests with no versions at all) to the creator:

```python
        if not normalized:
            normalized = [self._version_snapshot(t, version=1, trigger='created',
                                                 modified_by=t.get('created_by', 'AI'))]
```

In `create_test`, accept and store the creator and stamp v1:

```python
    def create_test(self, *, title: str, category: str, priority: str, description: str,
                    source: str = 'User', created_by: str = 'AI') -> dict[str, Any]:
        ...
        test = {
            'id': test_id, 'title': title, 'spec_file': 'manual', 'test_name': '',
            'category': category, 'source': source, 'priority': priority, 'description': description,
            'created_by': created_by,
            ...  # rest unchanged
        }
        test['versions'].append(self._version_snapshot(test, version=1, trigger='created',
                                                       modified_by=created_by))
```

- [ ] **Step 4: Run the store suite**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_store.py -v`
Expected: ALL PASS (new + pre-existing)

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/store.py ai-server/tests/test_regression_store.py
git commit -m "feat(ai-server): regression baseline creator created_by, default AI for legacy tests"
```

---

### Task 2: Store — version `modified_by` / `applied_by` and round `tester`

**Files:**
- Modify: `ai-server/src/regression/store.py`
- Test: `ai-server/tests/test_regression_store.py`

- [ ] **Step 1: Write the failing tests** (append)

```python
def test_update_test_version_records_modifier(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    store.update_test(t['id'], title='y', modified_by='P10002')
    latest = store.get_test(t['id'])['versions'][-1]
    assert latest['trigger'] == 'edit'
    assert latest['modified_by'] == 'P10002'
    assert latest['applied_by'] == ''


def test_script_version_records_ai_modifier_and_applier(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    store.update_test(t['id'], spec_file='gantt/user-tests.spec.ts', test_name='n',
                      trigger='script', code='code', modified_by='AI', applied_by='P10003')
    latest = store.get_test(t['id'])['versions'][-1]
    assert latest['trigger'] == 'script'
    assert latest['modified_by'] == 'AI'
    assert latest['applied_by'] == 'P10003'


def test_record_run_stamps_tester_on_round(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    store.record_run(t['id'], status='pass', duration_ms=5, log='', tester='P10004')
    rounds = store.get_test(t['id'])['versions'][-1]['rounds']
    assert rounds[-1]['tester'] == 'P10004'


def test_round_tester_defaults_empty(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    store.record_run(t['id'], status='pass', duration_ms=5, log='')
    assert store.get_test(t['id'])['versions'][-1]['rounds'][-1]['tester'] == ''
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_store.py -v -k "modifier or applier or tester"`
Expected: 4 FAIL

- [ ] **Step 3: Implement in `ai-server/src/regression/store.py`**

`create_version` passes actors through:

```python
    def create_version(self, test_id: int, *, trigger: str, code: str = '',
                       modified_by: str = '', applied_by: str = '',
                       persist: bool = True) -> dict[str, Any] | None:
        t = self.get_test(test_id)
        if t is None:
            return None
        self._normalize_versions(t)
        version_num = t['versions'][-1]['version'] + 1 if t['versions'] else 1
        version = self._version_snapshot(t, version=version_num, trigger=trigger, code=code,
                                         modified_by=modified_by, applied_by=applied_by)
        ...  # rest unchanged
```

`update_test` forwards actor kwargs to the version it creates (the loop over named keys already ignores extra kwargs):

```python
        if changed_version_field:
            self.create_version(test_id, trigger=fields.get('trigger', 'edit'),
                                code=fields.get('code', ''),
                                modified_by=fields.get('modified_by', ''),
                                applied_by=fields.get('applied_by', ''),
                                persist=False)
```

`record_round` stamps the tester (and `record_run` threads it):

```python
    def record_round(self, test_id: int, *, status: str, duration_ms: int, log: str,
                     run_at: str = '', run_id: str = '', details: dict[str, Any] | None = None,
                     has_trace: bool = False, version: int | None = None,
                     tester: str = '', persist: bool = True) -> dict[str, Any] | None:
        ...
        round_entry = {
            'round': (rounds[-1]['round'] + 1) if rounds else 1,
            'run_id': run_id,
            'status': status,
            'run_at': run_at,
            'duration_ms': duration_ms,
            'log': log,
            'has_trace': has_trace,
            'tester': tester,
            'details': details or {'summary': log, 'steps': [], 'artifacts': []},
        }
```

```python
    def record_run(self, test_id: int, *, status: str, duration_ms: int, log: str,
                   run_at: str = '', run_id: str = '',
                   details: dict[str, Any] | None = None,
                   has_trace: bool = False,
                   version: int | None = None,
                   tester: str = '') -> None:
        ...
        self.record_round(test_id, status=status, duration_ms=duration_ms, log=log,
                          run_at=run_at, run_id=run_id, details=details,
                          has_trace=has_trace, version=version, tester=tester, persist=False)
```

Also thread tester through `append_version`'s run branch for consistency (signature gains `tester: str = ''`; pass it to `record_round`).

- [ ] **Step 4: Run the store suite**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_store.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/store.py ai-server/tests/test_regression_store.py
git commit -m "feat(ai-server): version modified_by/applied_by + round tester in regression store"
```

---

### Task 3: Routes — `X-User-Code` header wiring + importer attribution

**Files:**
- Modify: `ai-server/src/regression/routes.py`
- Modify: `ai-server/src/regression/importer.py:82`
- Test: `ai-server/tests/test_regression_routes.py`, `ai-server/tests/test_importer.py`

- [ ] **Step 1: Write the failing route tests** (append to `ai-server/tests/test_regression_routes.py`)

```python
def test_create_test_header_sets_creator():
    r = client.post('/ai/regression/tests',
                    json={'title': 'Actor', 'category': 'c', 'priority': 'Low', 'description': ''},
                    headers={'X-User-Code': 'P10001'})
    assert r.status_code == 200
    assert r.json()['created_by'] == 'P10001'


def test_create_test_defaults_user_without_header():
    r = client.post('/ai/regression/tests',
                    json={'title': 'NoHeader', 'category': 'c', 'priority': 'Low', 'description': ''})
    assert r.json()['created_by'] == 'User'


def test_update_records_modifier_from_header():
    created = client.post('/ai/regression/tests',
                          json={'title': 'Mod', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    tid = created['id']
    r = client.put(f'/ai/regression/tests/{tid}', json={'title': 'Mod v2'},
                   headers={'X-User-Code': 'P10002'})
    assert r.status_code == 200
    detail = client.get(f'/ai/regression/tests/{tid}/detail').json()
    assert detail['versions'][-1]['trigger'] == 'edit'
    assert detail['versions'][-1]['modified_by'] == 'P10002'


def test_apply_generated_records_ai_and_applier(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes.settings, 'repo_root', str(tmp_path))
    created = client.post('/ai/regression/tests',
                          json={'title': 'Apply', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    tid = created['id']
    code = "test('apply actor', async ({ page }) => { await go(); await expect(x).toHaveCount(1); });"
    r = client.post(f'/ai/regression/tests/{tid}/apply-generated', json={'code': code},
                    headers={'X-User-Code': 'P10003'})
    assert r.status_code == 200
    detail = client.get(f'/ai/regression/tests/{tid}/detail').json()
    assert detail['versions'][-1]['trigger'] == 'script'
    assert detail['versions'][-1]['modified_by'] == 'AI'
    assert detail['versions'][-1]['applied_by'] == 'P10003'


def test_run_stamps_tester_on_rounds(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes.settings, 'repo_root', str(tmp_path))
    created = client.post('/ai/regression/tests',
                          json={'title': 'RunActor', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    tid = created['id']
    code = "test('run actor', async ({ page }) => { await expect(x).toHaveCount(1); });"
    client.post(f'/ai/regression/tests/{tid}/apply-generated', json={'code': code})

    def fake_run(specs, names, id_by_name, artifact_dir=None):
        return {'passed': 1, 'failed': 0,
                'results': {str(tid): {'status': 'pass', 'duration_ms': 5, 'log': ''}}}

    monkeypatch.setattr(rroutes, 'run_playwright', fake_run)
    r = client.post('/ai/regression/runs', json={'test_ids': [tid]},
                    headers={'X-User-Code': 'P10004'})
    assert r.status_code == 200
    run_id = r.json()['run_id']
    import time
    for _ in range(50):
        if client.get(f'/ai/regression/runs/{run_id}').json()['status'] != 'running':
            break
        time.sleep(0.05)
    detail = client.get(f'/ai/regression/tests/{tid}/detail').json()
    rounds = detail['versions'][-1]['rounds']
    assert rounds[-1]['tester'] == 'P10004'


def test_manual_round_records_tester():
    created = client.post('/ai/regression/tests',
                          json={'title': 'Manual', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    tid = created['id']
    r = client.post(f'/ai/regression/tests/{tid}/versions/1/rounds',
                    json={'status': 'pass', 'duration_ms': 0, 'log': '', 'details': {}},
                    headers={'X-User-Code': 'P10005'})
    assert r.status_code == 200
    assert r.json()['tester'] == 'P10005'
```

And the importer test (append to `ai-server/tests/test_importer.py`; reuse its existing imports — it already imports `import_specs` and `RegressionStore`):

```python
def test_import_attributes_baseline_to_ai(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    spec_dir = tmp_path / 'tests'
    (spec_dir / 'gantt').mkdir(parents=True)
    (spec_dir / 'gantt' / 'a.spec.ts').write_text("test('t1', async () => {})\n")
    import_specs(store, spec_dir)
    t = store.list_tests()[0]
    assert t['created_by'] == 'AI'
    assert t['versions'][-1]['trigger'] == 'import'
    assert t['versions'][-1]['modified_by'] == 'AI'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ai-server && .venv/bin/python -m pytest tests/test_regression_routes.py tests/test_importer.py -v -k "header or modifier or applier or tester or baseline"`
Expected: new tests FAIL (`created_by == 'AI'` instead of header value, missing `tester`, etc.)

- [ ] **Step 3: Implement**

`ai-server/src/regression/routes.py` — import `Header`:

```python
from fastapi import APIRouter, Header, HTTPException
```

Wire each mutating route (the header is informational identity from gantt — see spec; no verification by design):

```python
@router.post('/tests')
def create_test(req: CreateTest, x_user_code: str = Header('User', alias='X-User-Code')) -> dict:
    return store.create_test(title=req.title, category=req.category, priority=req.priority,
                             description=req.description, created_by=x_user_code)


@router.put('/tests/{test_id}')
def update_test(test_id: int, req: UpdateTest,
                x_user_code: str = Header('User', alias='X-User-Code')) -> dict:
    t = store.update_test(test_id, modified_by=x_user_code, **req.model_dump(exclude_none=True))
    if t is None:
        raise HTTPException(404, 'test not found')
    return t
```

`apply_generated` — add the header param and pass both actors (AI authored, user applied):

```python
@router.post('/tests/{test_id}/apply-generated')
def apply_generated(test_id: int, req: ApplyReq,
                    x_user_code: str = Header('User', alias='X-User-Code')) -> dict:
    ...
    store.update_test(test_id, spec_file='gantt/user-tests.spec.ts', test_name=name,
                      trigger='script', code=req.code,
                      modified_by='AI', applied_by=x_user_code)
    return {'spec_file': 'gantt/user-tests.spec.ts', 'test_name': name}
```

`_execute_run` + `create_run` — thread the tester into every recorded round:

```python
def _execute_run(run_id: str, tests: list[dict], run_at: str, tester: str) -> None:
    """Worker thread: run playwright, record results, finalize the registry entry."""
    try:
        ...
        for tid_str, res in result['results'].items():
            store.record_run(int(tid_str), status=res['status'],
                             duration_ms=res['duration_ms'], log=res.get('log', ''),
                             run_at=run_at, run_id=run_id, details=res.get('details'),
                             has_trace=res.get('has_trace', False), tester=tester)
        ...
```

```python
@router.post('/runs')
def create_run(req: RunReq, x_user_code: str = Header('User', alias='X-User-Code')) -> dict:
    ...
    threading.Thread(target=_execute_run, args=(run_id, tests, run_at, x_user_code),
                     daemon=True).start()
    return {'run_id': run_id}
```

`create_manual_round`:

```python
@router.post('/tests/{test_id}/versions/{version}/rounds')
def create_manual_round(test_id: int, version: int, req: ManualRoundReq,
                        x_user_code: str = Header('User', alias='X-User-Code')) -> dict:
    ...
    store.record_run(test_id, status=req.status, duration_ms=req.duration_ms,
                     log=req.log, run_at=run_at, run_id='manual',
                     details=req.details, version=version, tester=x_user_code)
    ...
```

`ai-server/src/regression/importer.py:82` — attribute the import-trigger version to AI:

```python
            store.update_test(t['id'], spec_file=spec_file, test_name=title,
                              trigger='import', modified_by='AI')
```

(`store.create_test` already defaults `created_by='AI'`, so the importer's create call needs no change.)

- [ ] **Step 4: Run the full ai-server suite**

Run: `cd ai-server && .venv/bin/python -m pytest -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add ai-server/src/regression/routes.py ai-server/src/regression/importer.py ai-server/tests/test_regression_routes.py ai-server/tests/test_importer.py
git commit -m "feat(ai-server): X-User-Code header wires creator/modifier/tester into regression store"
```

---

### Task 4: Gantt — types + axios `X-User-Code` interceptor

**Files:**
- Modify: `gantt/src/types/regression.ts`
- Modify: `gantt/src/services/regression-api.ts`

(Behaviour is proven end-to-end by the Playwright test in Task 6 — the header is asserted on a captured request. No isolated unit test for the interceptor.)

- [ ] **Step 1: Extend the types** in `gantt/src/types/regression.ts`

Add to `RegressionRound` (after `has_trace?: boolean`):

```ts
  tester?: string
```

Add to `RegressionVersion` (after `trigger: string`):

```ts
  modified_by?: string
  applied_by?: string
```

Add to `RegressionTest` (after `source: 'AI' | 'User'`):

```ts
  created_by?: string
```

- [ ] **Step 2: Add the interceptor** in `gantt/src/services/regression-api.ts`

After the `client.interceptors.response.use(...)` block:

```ts
import { useAuthStore } from '@/stores/auth-store'   // add to the imports at the top

// Identity for actor tracking (creator / modifier / tester) — ai-server has no
// auth of its own, so the logged-in planner's userCode rides along as a header.
client.interceptors.request.use((config) => {
  const userCode = useAuthStore.getState().user?.userCode
  if (userCode) config.headers.set('X-User-Code', userCode)
  return config
})
```

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no NEW errors (2 pre-existing tsc errors are known — see memory `live-server-preexisting-test-failures`)

- [ ] **Step 4: Commit**

```bash
git add gantt/src/types/regression.ts gantt/src/services/regression-api.ts
git commit -m "feat(gantt): send X-User-Code on regression API calls + actor fields in types"
```

---

### Task 5: Gantt — display creator / modifier / tester in detail panels

**Files:**
- Modify: `gantt/src/components/regression/version-history.tsx`
- Modify: `gantt/src/components/regression/regression-info.tsx`

- [ ] **Step 1: Show the baseline creator** in `version-history.tsx`

Add a `creator` state and capture it from the detail fetch:

```ts
  const [creator, setCreator] = useState('')
```

In the existing `useEffect` `.then((t) => { ... })`, after `setVersions(next)`:

```ts
        setCreator(t.created_by ?? '')
```

Render it at the end of the version-chips row (inside the `flex flex-wrap items-center gap-2` div, after the `sortedVersions.map(...)`):

```tsx
            <span className="ml-auto text-2xs text-muted-foreground" data-testid="version-creator">
              Created by {creator || '—'}
            </span>
```

- [ ] **Step 2: Show the version modifier chip** — in the active-version header row, directly after the trigger chip (`{active.trigger}` span):

```tsx
                  <span data-testid="version-modifier" className="rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground">
                    by {active.modified_by || '—'}
                    {active.applied_by ? ` · applied by ${active.applied_by}` : ''}
                  </span>
```

- [ ] **Step 3: Show the round tester** — in `RoundDetails`, in the toggle row after the `round {round.round}` span:

```tsx
        <span className="font-mono text-muted-foreground" data-testid="round-tester">{round.tester || '—'}</span>
```

- [ ] **Step 4: Document the actor rule in the in-tab manual** — in `regression-info.tsx`, append one item to the **Badges** `<ul>` (do NOT touch the steps `<ol>` — e2e asserts it has exactly 7 items):

```tsx
          <li><span className="font-semibold">by / tester</span> — who modified the version / who ran the round; imported baseline cases are created by AI</li>
```

- [ ] **Step 5: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no NEW errors

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/regression/version-history.tsx gantt/src/components/regression/regression-info.tsx
git commit -m "feat(gantt): show creator/modifier/tester actors in regression version history"
```

---

### Task 6: Playwright e2e — actor display + header proof

**Files:**
- Modify: `e2e/tests/gantt/regression-page.spec.ts`

Pre-req: gantt vite dev server + live-server reachable (standard setup for this spec; see memory `gantt-worktree-e2e-isolation` if a second session has the default port busy — alt port 5273 via `GANTT_BASE_URL`).

- [ ] **Step 1: Extend the stub types/factory.** In the `StubTest` interface add `created_by?: string`, and inside its `versions?: Array<{...}>` member add `modified_by?: string` and `applied_by?: string`. In `mkTest` defaults add `created_by: 'AI',`.

- [ ] **Step 2: Extend the version-history test** (`'version history expands with versions and run rounds'`). In the `/tests/1001/detail` stub:
  - v1 (trigger `'created'`): leave `modified_by` absent — proves legacy `—` rendering.
  - v2 (trigger `'script'`): add `modified_by: 'AI', applied_by: 'P10001'`, and on its round add `tester: 'P10001'`.

Append assertions after the existing ones:

```ts
    // Actor tracking: baseline creator, per-version modifier, per-round tester.
    await expect(page.getByTestId('version-creator')).toContainText('Created by AI')
    // Active version is v2 (script): AI authored, P10001 applied.
    await expect(page.getByTestId('version-modifier')).toHaveText('by AI · applied by P10001')
    await expect(page.getByTestId('round-tester')).toHaveText('P10001')
    // v1 predates actor tracking — modifier renders as an em-dash, never a wrong name.
    await page.getByTestId('version-row').filter({ hasText: 'v1' }).click()
    await expect(page.getByTestId('version-modifier')).toHaveText('by —')
```

- [ ] **Step 3: Prove the header is sent.** In the quarantine test (`'quarantined test shows badge and Run All excludes it client-side'`), capture the header where the body is captured:

```ts
    let capturedUserCode: string | undefined
    // inside the **/fpqe/ai/regression/runs route handler:
      capturedUserCode = route.request().headers()['x-user-code']
```

After the existing body assertions:

```ts
    // X-User-Code carries the logged-in planner's identity (actor tracking).
    const seededUserCode = await page.evaluate(
      () => (JSON.parse(sessionStorage.getItem('rois-auth') as string) as { user: { userCode: string } }).user.userCode,
    )
    expect(capturedUserCode).toBe(seededUserCode)
```

- [ ] **Step 4: Run the spec**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/regression-page.spec.ts --reporter=list`
Expected: ALL PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/gantt/regression-page.spec.ts
git commit -m "test(e2e): regression actor tracking — creator/modifier/tester display + X-User-Code header"
```

---

### Task 7: Help sync, version bump, full verification

**Files:**
- Modify: `gantt/src/components/help/topics/regression/regression-overview.tsx`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Help sync (§Help-Sync).** In `regression-overview.tsx`, extend the version-history sentence (around line 34) to mention actor tracking, e.g. append after "…every edit, generated": "Each version shows who modified it (AI or a planner's user code) and each run round shows the tester who launched it; imported baseline cases are created by AI." Adjust the `Chevron (History)` Controls Reference description similarly: `'Shows the version timeline: edits, generated scripts, run outcomes, and who modified/ran each one.'` (No screenshots of this panel exist, so no screenshot refresh — verify with `grep -r "version" gantt/src/components/help/topics/regression/` that no other text contradicts.)

- [ ] **Step 2: Version bump.** In `gantt/src/version.ts` increment BOTH `FRONTEND_VERSION` (gantt changes) and `BACKEND_VERSION` (ai-server changes) by 1 each. Read the file first for current values.

- [ ] **Step 3: Full verification (§No-Illusion)**

```bash
cd ai-server && .venv/bin/python -m pytest -v
cd gantt && npx tsc --noEmit
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/regression-page.spec.ts --reporter=list
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/help --reporter=list
```

Expected: pytest ALL PASS; tsc no new errors; regression spec ALL PASS; help suite — `scenario-run.png` test is known-red pre-existing (memory `help-screenshots-preexisting-fail`), everything else PASS.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/help/topics/regression/regression-overview.tsx gantt/src/version.ts
git commit -m "docs(help): regression actor tracking in overview + version bump"
```

---

## Self-review notes

- Spec coverage: created_by migration (T1), version actors (T2), header wiring + importer (T3), frontend header+types (T4), display (T5), Playwright proof (T6), help sync + bump (T7). All spec sections covered.
- The 158-test migration is pure `setdefault` at load — no data script needed; first ai-server restart after deploy rewrites the JSON on the next save.
- `update_test` receives `modified_by` as a kwarg; its field loop iterates a fixed tuple, so the extra kwarg cannot leak onto the test dict.
- e2e quarantine test already has the run-route capture plumbing — header capture rides on it, no new test needed for the header.
