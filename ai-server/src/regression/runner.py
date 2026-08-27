# ai-server/src/regression/runner.py
"""Playwright execution for regression runs (spec §2/§6).

Runs from <repo>/e2e with the repo's config + gantt project; --retries=1 gives
the implicit-retry flake signal (fail-then-pass => 'flaky'); --trace=on-first-retry
bounds trace cost to initially-failing tests. The JSON report is written to a
temp file (PLAYWRIGHT_JSON_OUTPUT_NAME) so stdout noise can't corrupt parsing.
"""

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.config.settings import settings

# Map settings fields to the env var names Playwright reads.
_PW_ENV_MAP = {
    'gantt_base_url': 'GANTT_BASE_URL',
    'gantt_api_url': 'GANTT_API_URL',
    'pbs_portal_base_url': 'PBS_PORTAL_BASE_URL',
    'pbs_api_url': 'PBS_API_URL',
    'pbs_app_base_url': 'PBS_APP_BASE_URL',
    'gantt_test_user': 'GANTT_TEST_USER',
    'gantt_test_pass': 'GANTT_TEST_PASS',
    'pbs_test_user': 'PBS_TEST_USER',
    'pbs_test_pass': 'PBS_TEST_PASS',
}


def _pw_env_overrides() -> dict[str, str]:
    """Build env overrides from settings; only non-empty values are included."""
    return {env_key: getattr(settings, field)
            for field, env_key in _PW_ENV_MAP.items()
            if getattr(settings, field)}


def _repo_root() -> Path:
    if settings.repo_root:
        return Path(settings.repo_root)
    # ai-server/src/regression/runner.py -> repo root is 3 parents up from ai-server/
    return Path(__file__).resolve().parents[3]


def build_cmd(specs: list[str], names: list[str]) -> list[str]:
    """Build the playwright CLI command (cwd: <repo>/e2e). Pure — unit-testable."""
    spec_args = [f'tests/{s}' if '/' in s else f'tests/gantt/{s}' for s in specs]
    cmd = ['npx', 'playwright', 'test', '--config=config/playwright.config.ts',
           *spec_args, '--reporter=json',
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
            details: dict[str, Any] | None = None
            for t in spec.get('tests', []):
                for r in t.get('results', []):
                    if details is None:
                        details = _extract_regression_detail(r)
                    msg = (r.get('error') or {}).get('message', '')
                    if msg:
                        log = msg[:2000]
                        break
            if status == 'fail':
                failed += 1
            else:
                passed += 1
            results[str(tid)] = {'status': status, 'duration_ms': int(duration),
                                 'log': log, 'details': details}
    return {'passed': passed, 'failed': failed, 'results': results}


def _extract_regression_detail(result: dict[str, Any]) -> dict[str, Any] | None:
    for stream_name in ('stdout', 'stderr'):
        for entry in result.get(stream_name, []) or []:
            text = entry.get('text', '') if isinstance(entry, dict) else str(entry)
            for line in text.splitlines():
                if not line.startswith('REGRESSION_DETAIL:'):
                    continue
                raw = line.split(':', 1)[1].strip()
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    parsed.setdefault('steps', [])
                    parsed.setdefault('artifacts', [])
                    return parsed
    return None


def _extract_snapshot_metas(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse all REGRESSION_SNAPSHOT: stdout lines from a single Playwright test result."""
    metas = []
    for stream in ('stdout', 'stderr'):
        for entry in result.get(stream, []) or []:
            text = entry.get('text', '') if isinstance(entry, dict) else str(entry)
            for line in text.splitlines():
                if not line.startswith('REGRESSION_SNAPSHOT:'):
                    continue
                raw = line.split(':', 1)[1].strip()
                try:
                    meta = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(meta, dict):
                    metas.append(meta)
    return metas


def collect_snapshots(
    report: dict[str, Any],
    id_by_name: dict[str, int],
    run_id: str,
    artifact_dir: Path,
) -> dict[str, list[dict[str, Any]]]:
    """Find REGRESSION_SNAPSHOT evidence attachments and copy to artifact_dir/snapshots/.

    Returns a dict mapping str(test_id) → list of artifact metadata dicts to merge
    into that test's details.artifacts[].
    """
    all_artifacts: dict[str, list[dict[str, Any]]] = {}
    ts = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    snap_dir = artifact_dir / 'snapshots'

    for suite in report.get('suites', []):
        for spec in _iter_specs(suite):
            tid = id_by_name.get(spec.get('title', ''))
            if tid is None:
                continue
            for test in spec.get('tests', []):
                for result in test.get('results', []):
                    metas = _extract_snapshot_metas(result)
                    if not metas:
                        continue
                    # Build index: attachment filename → attachment dict
                    # Playwright may store PNG as file path OR as base64 body
                    # (when testInfo.attach is called with body: Buffer, not path).
                    att_by_name: dict[str, dict[str, Any]] = {}
                    for att in result.get('attachments', []) or []:
                        if att.get('contentType') == 'image/png':
                            att_by_name[att['name']] = att

                    snap_dir.mkdir(parents=True, exist_ok=True)
                    artifacts = []
                    for i, meta in enumerate(metas):
                        label = meta.get('label', f'snap-{i}')
                        safe = re.sub(r'[^A-Za-z0-9]+', '-', label).strip('-')[:40]
                        canonical = f'case-{tid}-{ts}-{i}-{safe}.png'
                        att = att_by_name.get(meta.get('filename', ''))
                        if att is None:
                            continue
                        dest = snap_dir / canonical
                        src_path = att.get('path', '')
                        body_b64 = att.get('body', '')
                        if src_path and Path(src_path).exists():
                            shutil.copyfile(src_path, dest)
                        elif body_b64:
                            dest.write_bytes(base64.b64decode(body_b64))
                        else:
                            continue
                        artifacts.append({
                            'type': 'snapshot',
                            'id': f'snap-{tid}-{ts}-{i}',
                            'filename': canonical,
                            'url': f'/ai/regression/artifacts/{run_id}/snapshots/{canonical}',
                            'label': label,
                            'step_index': meta.get('step_index', 0),
                            'created_at': ts,
                            'deleted': False,
                        })
                    if artifacts:
                        all_artifacts.setdefault(str(tid), []).extend(artifacts)
    return all_artifacts


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


def _base_url_overrides(base_url: str) -> dict[str, str]:
    """Derive all Playwright URL env vars from the browser origin (e.g. https://host).
    Path conventions (fixed by UAT nginx):
      gantt app       → /altair/           (baseURL = origin)
      live-server API → /altair/live       (nginx → localhost:3000)
      pbs-portal SPA  → /pbs/             (nginx → static files)
      pbs-server API  → /altair/pbs-server/ (nginx proxy_pass adds /api/ prefix,
                        so test files must NOT add /api — default is localhost:3002/api)
    """
    if not base_url:
        return {}
    return {
        'GANTT_BASE_URL': base_url,
        'GANTT_API_URL': f'{base_url}/altair/live',
        'PBS_PORTAL_BASE_URL': f'{base_url}/pbs',
        'PBS_API_URL': f'{base_url}/altair/pbs-server',
    }


def run_playwright(specs: list[str], names: list[str], id_by_name: dict[str, int],
                   artifact_dir: Path | None = None, run_id: str = '', base_url: str = '') -> dict[str, Any]:
    """Execute selected tests; parse report; collect traces and snapshots. Raises on timeout."""
    root = _repo_root()
    e2e = root / 'e2e'
    out_file = Path(tempfile.gettempdir()) / f'pw-regression-{uuid.uuid4().hex}.json'
    # Priority: base_url from request > settings (.env) > os.environ > Playwright defaults
    env = {**os.environ, 'PLAYWRIGHT_JSON_OUTPUT_NAME': str(out_file),
           **_pw_env_overrides(), **_base_url_overrides(base_url)}
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
        if run_id:
            snapshots = collect_snapshots(report, id_by_name, run_id, artifact_dir)
            for tid_str, arts in snapshots.items():
                if tid_str in parsed['results']:
                    d = parsed['results'][tid_str].get('details')
                    if d is None:
                        d = {'summary': '', 'steps': [], 'artifacts': []}
                        parsed['results'][tid_str]['details'] = d
                    d.setdefault('artifacts', []).extend(arts)
    return parsed


def _iter_specs(suite: dict[str, Any]):
    yield from suite.get('specs', [])
    for child in suite.get('suites', []):
        yield from _iter_specs(child)
