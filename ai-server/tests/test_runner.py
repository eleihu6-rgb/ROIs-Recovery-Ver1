# ai-server/tests/test_runner.py
import json
from pathlib import Path

from src.regression.runner import (
    _base_url_overrides,
    build_cmd,
    collect_snapshots,
    collect_traces,
    parse_report,
)


def test_build_cmd_uses_e2e_config_project_retries_trace():
    cmd = build_cmd(['user-tests.spec.ts'], ['adds a chip'])
    assert cmd[:3] == ['npx', 'playwright', 'test']
    assert '--config=config/playwright.config.ts' in cmd
    assert 'tests/gantt/user-tests.spec.ts' in cmd
    assert '--retries=1' in cmd
    assert '--trace=on-first-retry' in cmd
    assert cmd[cmd.index('--grep') + 1] == 'adds\\ a\\ chip'


def test_build_cmd_keeps_relative_e2e_test_paths():
    cmd = build_cmd(['gantt/query-filter.spec.ts', 'pbs-portal/auth.spec.ts'], ['logs in'])
    assert 'tests/gantt/query-filter.spec.ts' in cmd
    assert 'tests/pbs-portal/auth.spec.ts' in cmd


def test_build_cmd_escapes_regex_metachars_in_grep():
    cmd = build_cmd(['a.spec.ts'], ['runs (all) tests'])
    assert cmd[cmd.index('--grep') + 1] == 'runs\\ \\(all\\)\\ tests'


def test_base_url_overrides_use_altair_public_prefixes():
    overrides = _base_url_overrides('https://crew-f8-usva-uat.roiscloud.com')
    assert overrides['GANTT_BASE_URL'] == 'https://crew-f8-usva-uat.roiscloud.com'
    assert overrides['GANTT_API_URL'] == 'https://crew-f8-usva-uat.roiscloud.com/altair/live'
    assert overrides['PBS_PORTAL_BASE_URL'] == 'https://crew-f8-usva-uat.roiscloud.com/pbs'
    assert overrides['PBS_API_URL'] == 'https://crew-f8-usva-uat.roiscloud.com/altair/pbs-server'


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


def test_parse_report_extracts_regression_detail_from_stdout():
    detail = {
        'summary': 'Pairing jump moved date range',
        'steps': [{'action': 'click_pairing_jump', 'pairing_id': 'TG123'}],
    }
    report = {'suites': [{'specs': [{
        'title': 'jump case',
        'tests': [{
            'status': 'expected',
            'results': [{
                'status': 'passed',
                'duration': 20,
                'stdout': [{'text': f"REGRESSION_DETAIL: {json.dumps(detail)}\n"}],
            }],
        }],
    }], 'suites': []}]}
    out = parse_report(report, {'jump case': 7})
    assert out['results']['7']['details']['summary'] == 'Pairing jump moved date range'
    assert out['results']['7']['details']['steps'][0]['pairing_id'] == 'TG123'


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


# collect_snapshots tests

def _snap_report(title: str, snap_label: str, snap_file: str, att_path: str) -> dict:
    return {'suites': [{'specs': [{
        'title': title,
        'tests': [{'results': [{
            'status': 'passed',
            'duration': 100,
            'stdout': [{'text': f'REGRESSION_SNAPSHOT: {json.dumps({"label": snap_label, "step_index": 0, "filename": snap_file, "details": {}})}\n'}],
            'attachments': [{'name': snap_file, 'contentType': 'image/png', 'path': att_path}],
        }]},
        ]}],
        'suites': [],
    }]}


def test_collect_snapshots_copies_file_and_returns_artifact(tmp_path):
    src_png = tmp_path / 'src' / 'reg-snap-test.png'
    src_png.parent.mkdir()
    src_png.write_bytes(b'\x89PNG')

    report = _snap_report('jump case', 'pairing-jump-after-click', src_png.name, str(src_png))
    artifact_dir = tmp_path / 'artifacts' / 'run-9'
    result = collect_snapshots(report, {'jump case': 42}, 'run-9', artifact_dir)

    assert '42' in result
    arts = result['42']
    assert len(arts) == 1
    art = arts[0]
    assert art['type'] == 'snapshot'
    assert art['label'] == 'pairing-jump-after-click'
    assert art['step_index'] == 0
    assert art['deleted'] is False
    assert art['url'].startswith('/ai/regression/artifacts/run-9/snapshots/')
    assert art['filename'] in art['url']

    snap_file = artifact_dir / 'snapshots' / art['filename']
    assert snap_file.exists()
    assert snap_file.read_bytes() == b'\x89PNG'


def test_collect_snapshots_skips_missing_attachment(tmp_path):
    report = _snap_report('x', 'lbl', 'noexist.png', str(tmp_path / 'noexist.png'))
    result = collect_snapshots(report, {'x': 1}, 'run-1', tmp_path / 'art')
    assert result == {}


def test_collect_snapshots_ignores_unknown_test_title(tmp_path):
    src = tmp_path / 'a.png'
    src.write_bytes(b'\x89PNG')
    report = _snap_report('mystery', 'lbl', src.name, str(src))
    result = collect_snapshots(report, {'known': 9}, 'run-1', tmp_path / 'art')
    assert result == {}


def test_collect_snapshots_decodes_base64_body(tmp_path):
    import base64
    png_bytes = b'\x89PNG\r\n\x1a\n' + b'\x00' * 8
    b64 = base64.b64encode(png_bytes).decode()
    snap_file = 'reg-snap-inline.png'
    report = {'suites': [{'specs': [{
        'title': 'inline case',
        'tests': [{'results': [{
            'status': 'passed',
            'duration': 100,
            'stdout': [{'text': f'REGRESSION_SNAPSHOT: {json.dumps({"label": "inline-lbl", "step_index": 0, "filename": snap_file, "details": {}})}\n'}],
            'attachments': [{'name': snap_file, 'contentType': 'image/png', 'body': b64}],
        }]}],
    }], 'suites': []}]}
    artifact_dir = tmp_path / 'artifacts' / 'run-b64'
    result = collect_snapshots(report, {'inline case': 99}, 'run-b64', artifact_dir)
    assert '99' in result
    art = result['99'][0]
    snap_file_path = artifact_dir / 'snapshots' / art['filename']
    assert snap_file_path.exists()
    assert snap_file_path.read_bytes() == png_bytes
