"""Crew-bid simulation execution for R'Bot's create_crew_bids tool.

Two stages, both spawned from <repo> / <repo>/e2e:
  1. node generate-fixture.mjs  -> a scoped, date-shifted fixture for the requested
     base×rank scope and bidding period.
  2. npx playwright test (HEADED, --workers=1) -> per crew: login → days-off / pairing
     / line → logout → next crew.

The cmd builders are pure (unit-testable); start_run drives them on a background
thread and records progress in an in-memory registry (process-local, like the
regression runner). We never edit product code to force a bid (project rule #7);
per-crew blockers are recorded by the spec to e2e/results/npbs-issues/.
"""

import json
import os
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.config.settings import settings
from src.live.registry import register_stream

# Pages each crew submits on for this feature (reserve intentionally skipped).
CREWBIDS_PAGES = 'days-off,pairing,line'
PER_BUCKET = 6
# Headed serial run over the slow remote demo DB is long; bound generously.
FIXTURE_TIMEOUT_S = 120
PLAYWRIGHT_TIMEOUT_S = 3600


def _repo_root() -> Path:
    if settings.repo_root:
        return Path(settings.repo_root)
    # ai-server/src/crewbids/runner.py -> repo root is 3 parents up from ai-server/
    return Path(__file__).resolve().parents[3]


def build_fixture_cmd(params: dict[str, Any], fixture_out: str, report_out: str,
                      source: str | None = None) -> list[str]:
    """Build the `node generate-fixture.mjs` command. Pure — unit-testable."""
    root = _repo_root()
    src = source or str(root / 'docs/test-cases/CLASS-BidsReport_March2026.txt')
    return [
        'node', str(root / 'e2e/utils/npbs/generate-fixture.mjs'),
        src, fixture_out, report_out,
        '--bases', ','.join(params['bases']),
        '--ranks', ','.join(params['ranks']),
        '--period-start', params['start'],
        '--period-end', params['end'],
        '--per-bucket', str(PER_BUCKET),
    ]


def build_playwright_cmd(headed: bool = True) -> list[str]:
    """Build the headed crew-bid Playwright command (cwd: <repo>/e2e). Pure."""
    cmd = ['npx', 'playwright', 'test', '--config=config/playwright.config.ts',
           '--project=pbs-portal', '--no-deps',
           'npbs-crew-bids-simulation.spec.ts', '--workers=1', '--reporter=json']
    if headed:
        cmd.append('--headed')
    return cmd


def _collect_summary(issues_dir: Path) -> dict[str, Any]:
    """Aggregate the per-crew issue JSONs the spec wrote into a run summary."""
    crews: list[dict[str, Any]] = []
    placed_total = 0
    if issues_dir.is_dir():
        for f in sorted(issues_dir.glob('*.json')):
            try:
                data = json.loads(f.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            placed = data.get('placed', 0) or 0
            placed_total += placed
            crews.append({
                'employeeId': data.get('employeeId'),
                'category': data.get('category'),
                'placed': placed,
                'total': data.get('totalProperties', 0),
                'blocker': data.get('blocker'),
                'issues': len(data.get('issues', []) or []),
            })
    return {'crewCount': len(crews), 'placedTotal': placed_total, 'crews': crews}


def _scope(params: dict[str, Any]) -> str:
    return (f"{'/'.join(params['bases'])} · {'/'.join(params['ranks'])} · "
            f"{params['start']}→{params['end']}")


def run_crew_bids(params: dict[str, Any], run_id: str,
                  stream: dict[str, str] | None = None) -> dict[str, Any]:
    """Generate the scoped fixture then run the headed simulation. Returns a result dict.

    When ``stream`` (id+token from the live relay) is given, the headed browser is
    live-streamed so a planner can watch it from another PC. Streaming is
    best-effort and never affects whether bids are placed (see the producer lib)."""
    root = _repo_root()
    e2e = root / 'e2e'
    out_dir = e2e / 'results' / 'crewbids' / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    fixture_out = str(out_dir / 'fixture.json')
    report_out = str(out_dir / 'unmapped-report.json')

    fixture_cmd = build_fixture_cmd(params, fixture_out, report_out)
    gen = subprocess.run(fixture_cmd, cwd=root, capture_output=True, text=True,
                         timeout=FIXTURE_TIMEOUT_S)
    if gen.returncode != 0:
        return {'status': 'error',
                'error': (gen.stderr or gen.stdout or 'fixture generation failed')[-1000:]}

    try:
        fixture = json.loads(Path(fixture_out).read_text())
        crew_n = len(fixture.get('crew', []))
    except (OSError, json.JSONDecodeError):
        crew_n = 0

    env = {**os.environ,
           'CREWBIDS_FIXTURE': fixture_out,
           'CREWBIDS_PAGES': CREWBIDS_PAGES}
    if stream:
        env['PW_STREAM_URL'] = f"ws://127.0.0.1:{settings.port}/ai/live/streams/{stream['id']}/ingest"
        env['PW_STREAM_KIND'] = 'crewbids'
        env['PW_STREAM_TITLE'] = _scope(params)
    pw_cmd = build_playwright_cmd(headed=True)
    proc = subprocess.run(pw_cmd, cwd=e2e, capture_output=True, text=True,
                          env=env, timeout=PLAYWRIGHT_TIMEOUT_S)
    summary = _collect_summary(e2e / 'results' / 'npbs-issues')
    return {
        'status': 'done',
        'scopedCrew': crew_n,
        'exitCode': proc.returncode,
        'summary': summary,
        'log': (proc.stdout or proc.stderr or '')[-2000:],
    }


# ── In-memory run registry (poll target; process-local, mirrors regression) ──
_runs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_run(params: dict[str, Any]) -> str:
    """Start a crew-bid run on a background thread; return its run id.

    Also registers a live stream so the headed browser can be watched from another
    PC; the run record carries ``watchUrl`` (surfaced by the chat reply / status)."""
    run_id = uuid.uuid4().hex[:12]
    stream = register_stream('crewbids', _scope(params))
    watch_url = f"{settings.public_ai_prefix}/live/streams/{stream['id']}/watch?token={stream['token']}"
    with _lock:
        _runs[run_id] = {'status': 'running', 'params': params, 'startedAt': _now(),
                         'streamId': stream['id'], 'watchUrl': watch_url}

    def _worker() -> None:
        try:
            result = run_crew_bids(params, run_id, stream)
        except subprocess.TimeoutExpired:
            result = {'status': 'error', 'error': 'crew-bid run timed out'}
        except Exception as exc:  # noqa: BLE001 — never crash the worker thread
            result = {'status': 'error', 'error': str(exc)[-1000:]}
        with _lock:
            _runs[run_id] = {**_runs.get(run_id, {}), **result, 'finishedAt': _now()}

    threading.Thread(target=_worker, daemon=True).start()
    return run_id


def get_run(run_id: str) -> dict[str, Any] | None:
    with _lock:
        run = _runs.get(run_id)
        return dict(run) if run is not None else None
