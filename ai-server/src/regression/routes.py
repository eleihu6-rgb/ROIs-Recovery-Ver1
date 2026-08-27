import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from src.llm.client import llm_text
from src.regression.importer import import_specs
from src.regression.prompts import PW_GEN_SYSTEM, DIAGNOSE_SYSTEM
from src.regression.store import RegressionStore
from src.regression.runner import run_playwright
from src.regression.validate import validate_generated
from src.regression.priority import prioritize
from src.config.settings import settings

router = APIRouter(prefix='/ai/regression', tags=['regression'])

# Trust-based identity from the gantt frontend (internal QA tool — no auth by design).
XUserCode = Annotated[str, Header(alias='X-User-Code')]

_STORE_PATH = Path(settings.repo_root or Path(__file__).resolve().parents[2]) / 'regression_tests.json'
store = RegressionStore(_STORE_PATH)

# In-memory run registry (poll target). Process-local, matches EVACC.
_runs: dict[str, dict[str, Any]] = {}
_run_seq = {'n': 0}

_ARTIFACT_ROOT = Path(settings.repo_root or Path(__file__).resolve().parents[2]) / 'artifacts'


def _e2e_tests_dir() -> Path:
    root = Path(settings.repo_root) if settings.repo_root else Path(__file__).resolve().parents[3]
    return root / 'e2e' / 'tests'


class CreateTest(BaseModel):
    title: str
    category: str
    priority: str
    description: str = ''


class UpdateTest(BaseModel):
    title: str | None = None
    category: str | None = None
    priority: str | None = None
    description: str | None = None
    quarantined: bool | None = None


class GenerateReq(BaseModel):
    title: str
    description: str = ''
    category: str = ''
    previous_code: str = ''
    issues: list[str] = []
    conditions: list[str] = []
    entity_intents: list[dict] = []


class ExtractEntitiesReq(BaseModel):
    conditions: list[str]


class StoryReq(BaseModel):
    story: str


class EntityIntent(BaseModel):
    value: str
    entity_type: str
    intent: str
    condition_index: int
    context: str = ''


class ApplyReq(BaseModel):
    code: str


class RunReq(BaseModel):
    test_ids: list[int]
    order: Literal['failing-first', 'as-given'] = 'failing-first'
    scope: Literal['selected', 'related', 'all'] = 'selected'
    base_url: str = ''  # browser origin, e.g. https://crew-f8-usva-uat.roiscloud.com


class ManualRoundReq(BaseModel):
    status: Literal['pass', 'fail', 'flaky']
    duration_ms: int = 0
    details: dict[str, Any] = {}
    log: str = ''


@router.get('/tests')
def list_tests() -> dict:
    return {'tests': store.list_tests()}


@router.post('/tests')
def create_test(req: CreateTest,
                x_user_code: XUserCode = 'User') -> dict:
    return store.create_test(title=req.title, category=req.category, priority=req.priority,
                             description=req.description, created_by=x_user_code)


@router.put('/tests/{test_id}')
def update_test(test_id: int, req: UpdateTest,
                x_user_code: XUserCode = 'User') -> dict:
    t = store.update_test(test_id, modified_by=x_user_code, **req.model_dump(exclude_none=True))
    if t is None:
        raise HTTPException(404, 'test not found')
    return t


@router.delete('/tests/{test_id}')
def delete_test(test_id: int) -> dict:
    if not store.delete_test(test_id):
        raise HTTPException(404, 'test not found')
    return {'deleted': test_id}


@router.put('/tests/{test_id}/conditions')
def update_conditions(test_id: int, conditions: list[str]) -> dict:
    t = store.update_conditions(test_id, conditions)
    if t is None:
        raise HTTPException(404, 'test not found')
    return t


@router.put('/tests/{test_id}/story')
def update_story(test_id: int, req: StoryReq) -> dict:
    t = store.update_story(test_id, req.story)
    if t is None:
        raise HTTPException(404, 'test not found')
    return t


_EXTRACT_ENTITIES_SYSTEM = """Extract concrete specific values from test conditions.
Return ONLY a JSON array.
Each item: {"value": "...", "entity_type": "fleet|crew|flight|pairing|date|other", "condition_index": N, "context": "short quote"}
Only extract values that are specific identifiers (fleet codes, IDs, dates) — not generic words like "crew" or "roster".
Examples of values to extract: "73M", "7M8", "TG123", "P10001", "2026-06-01", "1001".
If no specific values found, return [].
Respond with raw JSON array only."""


@router.post('/tests/{test_id}/extract-entities')
def extract_entities(test_id: int, req: ExtractEntitiesReq) -> list:
    t = store.get_test(test_id)
    if t is None:
        raise HTTPException(404, 'test not found')
    user_msg = '\n'.join(f'{i}: {c}' for i, c in enumerate(req.conditions))
    try:
        raw = llm_text(_EXTRACT_ENTITIES_SYSTEM, user_msg, max_tokens=512)
        # Strip markdown code fences the model sometimes wraps the JSON in
        cleaned = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r'\s*```$', '', cleaned)
        result = json.loads(cleaned)
        if not isinstance(result, list):
            return []
        return result
    except Exception:  # noqa: BLE001
        return []


@router.put('/tests/{test_id}/entity-intents')
def update_entity_intents(test_id: int, intents: list[EntityIntent]) -> dict:
    t = store.update_entity_intents(test_id, [i.model_dump() for i in intents])
    if t is None:
        raise HTTPException(404, 'test not found')
    return t


class DiagnoseResult(BaseModel):
    issue_type: str
    summary: str
    explanation: str
    recommendation: str


@router.post('/tests/{test_id}/diagnose')
def diagnose_test(test_id: int) -> dict:
    t = store.get_test(test_id)
    if t is None:
        raise HTTPException(404, 'test not found')
    # Find the last failed round across all versions
    last_fail = None
    for v in reversed(t.get('versions', [])):
        for r in reversed(v.get('rounds', [])):
            if r.get('status') == 'fail':
                last_fail = r
                break
        if last_fail:
            break
    if last_fail is None:
        return {'issue_type': 'none', 'summary': 'No failed rounds found', 'explanation': '', 'recommendation': ''}
    d = last_fail.get('details') or {}
    user_msg = f"""Test title: {t.get('title', '')}
Conditions: {json.dumps(t.get('conditions', []))}
Status: {last_fail.get('status')}
Duration: {last_fail.get('duration_ms')}ms
Log: {last_fail.get('log', '')[:1000]}
Summary: {d.get('summary', '')}
Steps: {json.dumps(d.get('steps', [])[:10])}"""
    try:
        raw = llm_text(DIAGNOSE_SYSTEM, user_msg, max_tokens=512)
        result = json.loads(raw)
        return result
    except Exception as exc:  # noqa: BLE001
        return {'issue_type': 'unknown', 'summary': str(exc), 'explanation': '', 'recommendation': ''}


@router.get('/tests/{test_id}/detail')
def test_detail(test_id: int) -> dict:
    t = store.get_test(test_id)
    if t is None:
        raise HTTPException(404, 'test not found')
    return t


@router.post('/import-specs')
def import_existing_specs() -> dict:
    spec_dir = _e2e_tests_dir()
    if not spec_dir.is_dir():
        raise HTTPException(500, f'spec directory not found: {spec_dir}')
    return import_specs(store, spec_dir)


@router.post('/generate-playwright')
def generate(req: GenerateReq) -> dict:
    conditions_block = ''
    if req.conditions:
        conditions_block = '\n\nPass/fail conditions (MUST all be asserted):\n' + '\n'.join(f'- {c}' for c in req.conditions)
    if req.entity_intents:
        intent_lines = []
        for e in req.entity_intents:
            if e.get('intent') == 'must_find':
                intent_lines.append(
                    f"- Value '{e['value']}' ({e['entity_type']}): MUST exist in the app. "
                    f"Assert count > 0. FAIL the test with 'DATA GAP: {e['value']} not found' if the UI returns empty."
                )
            elif e.get('intent') == 'empty_state':
                intent_lines.append(
                    f"- Value '{e['value']}' ({e['entity_type']}): intentionally absent. "
                    f"Assert the UI shows an appropriate empty state (0 results, empty message, or error). "
                    f"PASS if handled gracefully."
                )
        if intent_lines:
            conditions_block += '\n\nEntity intent overrides (MUST follow):\n' + '\n'.join(intent_lines)
    user = f"Title: {req.title}\nCategory: {req.category}\nStory / acceptance: {req.description}{conditions_block}"
    if req.previous_code:
        issue_lines = '\n'.join(f'- {i}' for i in req.issues)
        user += ("\n\nPrevious attempt failed the quality gate with these issues:\n"
                 f"{issue_lines}\nPrevious code:\n{req.previous_code}\n"
                 "Fix every issue and return only the corrected test block.")
    try:
        raw = llm_text(PW_GEN_SYSTEM, user, max_tokens=1024)
    except Exception as exc:  # noqa: BLE001
        return {'error': f'generation failed: {exc}'}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Model returned bare code; wrap it.
        code = raw.strip()
        return {'code': code, 'issues': validate_generated(code)['issues']}
    if 'questions' in parsed:
        return {'questions': parsed['questions']}
    code = parsed.get('code', '').strip()
    return {'code': code, 'issues': validate_generated(code)['issues']}


def _extract_test_name(code: str) -> str:
    m = re.search(r"test\(\s*['\"](.+?)['\"]", code)
    return m.group(1) if m else ''


@router.post('/tests/{test_id}/apply-generated')
def apply_generated(test_id: int, req: ApplyReq,
                    x_user_code: XUserCode = 'User') -> dict:
    t = store.get_test(test_id)
    if t is None:
        raise HTTPException(404, 'test not found')
    gate = validate_generated(req.code)
    if not gate['ok']:
        raise HTTPException(422, {'detail': 'generated code failed quality gate', 'issues': gate['issues']})
    name = _extract_test_name(req.code)
    spec_path = _e2e_tests_dir() / 'gantt' / 'user-tests.spec.ts'
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    header = "import { test, expect } from '@playwright/test'\n\n"
    start = f"// user-test-{test_id}-start"
    end = f"// user-test-{test_id}-end"
    region = f"\n{start}\n{req.code}\n{end}\n"
    existing = spec_path.read_text() if spec_path.exists() else header
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end) + r"\n?", re.DOTALL)
    if pattern.search(existing):
        content = pattern.sub(region.lstrip('\n'), existing, count=1)
    else:
        content = existing + region
    spec_path.write_text(content)
    store.update_test(test_id, spec_file='gantt/user-tests.spec.ts', test_name=name,
                      trigger='script', code=req.code, modified_by='AI', applied_by=x_user_code)
    return {'spec_file': 'gantt/user-tests.spec.ts', 'test_name': name}


def _execute_run(run_id: str, tests: list[dict], run_at: str, tester: str = 'User', base_url: str = '') -> None:
    """Worker thread: run playwright, record results, finalize the registry entry."""
    try:
        specs = sorted({t['spec_file'] for t in tests})
        names = [t['test_name'] for t in tests if t['test_name']]
        id_by_name = {t['test_name']: t['id'] for t in tests if t['test_name']}
        result = run_playwright(specs, names, id_by_name, artifact_dir=_ARTIFACT_ROOT / run_id, run_id=run_id, base_url=base_url)
        for tid_str, res in result['results'].items():
            store.record_run(int(tid_str), status=res['status'],
                             duration_ms=res['duration_ms'], log=res.get('log', ''),
                             run_at=run_at, run_id=run_id, details=res.get('details'),
                             has_trace=res.get('has_trace', False), tester=tester)
        _runs[run_id].update(status='done', passed=result['passed'], failed=result['failed'],
                             results=result['results'], error=result.get('error'))
    except Exception as exc:  # noqa: BLE001
        _runs[run_id].update(status='error', error=str(exc))


@router.post('/runs')
def create_run(req: RunReq,
               x_user_code: XUserCode = 'User') -> dict:
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
    threading.Thread(target=_execute_run, args=(run_id, tests, run_at, x_user_code, req.base_url), daemon=True).start()
    return {'run_id': run_id}


@router.get('/runs/{run_id}')
def get_run(run_id: str) -> dict:
    run = _runs.get(run_id)
    if run is None:
        raise HTTPException(404, 'run not found')
    return run


@router.post('/tests/{test_id}/versions/{version}/rounds')
def create_manual_round(test_id: int, version: int, req: ManualRoundReq,
                        x_user_code: XUserCode = 'User') -> dict:
    t = store.get_test(test_id)
    if t is None:
        raise HTTPException(404, 'test not found')
    if not any(v['version'] == version for v in t.get('versions', [])):
        raise HTTPException(404, 'version not found')
    run_at = datetime.now(timezone.utc).isoformat()
    store.record_run(test_id, status=req.status, duration_ms=req.duration_ms,
                     log=req.log, run_at=run_at, run_id='manual',
                     details=req.details, version=version, tester=x_user_code)
    updated = store.get_test(test_id)
    target = next(v for v in updated.get('versions', []) if v['version'] == version)
    return target['rounds'][-1]


@router.get('/runs/{run_id}/trace/{test_id}')
def get_trace(run_id: str, test_id: int):
    root = _ARTIFACT_ROOT.resolve()
    path = (_ARTIFACT_ROOT / run_id / f'{test_id}.zip').resolve()
    if not path.is_relative_to(root):
        raise HTTPException(400, 'invalid run id')
    if not path.exists():
        raise HTTPException(404, 'trace not found')
    return FileResponse(path, media_type='application/zip', filename=f'{run_id}-{test_id}-trace.zip')


def _validate_snapshot_filename(filename: str) -> None:
    """Reject path traversal and non-PNG files."""
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(400, 'invalid filename')
    if not filename.endswith('.png'):
        raise HTTPException(400, 'only PNG snapshots are supported')


@router.get('/artifacts/{run_id}/snapshots/{filename}')
def get_snapshot(run_id: str, filename: str):
    _validate_snapshot_filename(filename)
    root = _ARTIFACT_ROOT.resolve()
    path = (_ARTIFACT_ROOT / run_id / 'snapshots' / filename).resolve()
    if not path.is_relative_to(root):
        raise HTTPException(400, 'invalid run id')
    if not path.is_file():
        raise HTTPException(404, 'snapshot not found')
    return FileResponse(str(path), media_type='image/png')


@router.delete('/artifacts/{run_id}/snapshots/{filename}')
def delete_snapshot(run_id: str, filename: str) -> dict:
    _validate_snapshot_filename(filename)
    root = _ARTIFACT_ROOT.resolve()
    path = (_ARTIFACT_ROOT / run_id / 'snapshots' / filename).resolve()
    if not path.is_relative_to(root):
        raise HTTPException(400, 'invalid run id')
    if path.is_file():
        path.unlink()
    store.delete_snapshot(run_id, filename)
    return {'deleted': filename}
