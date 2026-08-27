import json
from fastapi.testclient import TestClient
import src.regression.routes as rroutes
from main import app

client = TestClient(app)


def test_create_then_list():
    r = client.post('/ai/regression/tests', json={'title': 'Filter BKK', 'category': 'Roster Filter', 'priority': 'High', 'description': 'chip appears'})
    assert r.status_code == 200
    tid = r.json()['id']
    listed = client.get('/ai/regression/tests').json()
    assert any(t['id'] == tid for t in listed['tests'])


def test_update_story_endpoint():
    created = client.post('/ai/regression/tests', json={'title': 'Story case', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    tid = created['id']
    assert created['story'] == ''
    r = client.put(f'/ai/regression/tests/{tid}/story', json={'story': 'Open filter, pick rank, apply.'})
    assert r.status_code == 200
    assert r.json()['story'] == 'Open filter, pick rank, apply.'
    listed = client.get('/ai/regression/tests').json()['tests']
    assert next(t for t in listed if t['id'] == tid)['story'] == 'Open filter, pick rank, apply.'


def test_update_story_404():
    r = client.put('/ai/regression/tests/99999999/story', json={'story': 'x'})
    assert r.status_code == 404


def test_generate_returns_questions(monkeypatch):
    monkeypatch.setattr(rroutes, 'llm_text', lambda system, user, max_tokens=1024: json.dumps({'questions': ['Which pane?']}))
    r = client.post('/ai/regression/generate-playwright', json={'title': 'x', 'description': '', 'category': 'c'})
    assert r.json()['questions'] == ['Which pane?']


def test_generate_returns_code(monkeypatch):
    code = "test('filters BKK', async ({ page }) => { await loginAndSeed(page); });"
    monkeypatch.setattr(rroutes, 'llm_text', lambda system, user, max_tokens=1024: json.dumps({'code': code}))
    r = client.post('/ai/regression/generate-playwright', json={'title': 'x', 'description': 'detailed', 'category': 'c'})
    assert r.json()['code'] == code


def test_apply_generated_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes.settings, 'repo_root', str(tmp_path))
    created = client.post('/ai/regression/tests', json={'title': 'Idem', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    tid = created['id']
    code_v1 = "test('idem v1', async ({ page }) => { await first(); await expect(x).toHaveCount(1); });"
    code_v2 = "test('idem v2', async ({ page }) => { await second(); await expect(x).toHaveCount(2); });"
    r1 = client.post(f'/ai/regression/tests/{tid}/apply-generated', json={'code': code_v1})
    assert r1.status_code == 200
    r2 = client.post(f'/ai/regression/tests/{tid}/apply-generated', json={'code': code_v2})
    assert r2.status_code == 200
    assert r2.json()['spec_file'] == 'gantt/user-tests.spec.ts'
    # apply-generated writes generated Gantt specs under e2e/tests/gantt/.
    spec = (tmp_path / 'e2e' / 'tests' / 'gantt' / 'user-tests.spec.ts').read_text()
    assert spec.count(f'// user-test-{tid}-start') == 1
    assert 'second()' in spec
    assert 'first()' not in spec


def test_generate_includes_quality_issues(monkeypatch):
    code = "test('x', async ({ page }) => { await page.waitForTimeout(500); await expect(x).toHaveCount(1); });"
    monkeypatch.setattr(rroutes, 'llm_text', lambda system, user, max_tokens=1024: json.dumps({'code': code}))
    r = client.post('/ai/regression/generate-playwright', json={'title': 'x', 'description': 'd', 'category': 'c'})
    body = r.json()
    assert body['code'] == code
    assert body['issues']
    assert any('waitForTimeout' in i for i in body['issues'])


def test_apply_rejects_low_quality(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes.settings, 'repo_root', str(tmp_path))
    created = client.post('/ai/regression/tests', json={'title': 'LowQ', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    tid = created['id']
    bad = "test('bad', async ({ page }) => { await page.waitForTimeout(500); });"
    r = client.post(f'/ai/regression/tests/{tid}/apply-generated', json={'code': bad})
    assert r.status_code == 422
    detail = r.json()['detail']
    assert detail['issues']
    # apply-generated writes generated Gantt specs under e2e/tests/gantt/.
    spec = tmp_path / 'e2e' / 'tests' / 'gantt' / 'user-tests.spec.ts'
    assert not spec.exists()


def test_runs_failing_first_order(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes.settings, 'repo_root', str(tmp_path))
    ids = []
    for i in range(3):
        c = client.post('/ai/regression/tests', json={'title': f'T{i}', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
        ids.append(c['id'])
        code = f"test('name{i}', async ({{ page }}) => {{ await expect(x).toHaveCount({i}); }});"
        ar = client.post(f"/ai/regression/tests/{c['id']}/apply-generated", json={'code': code})
        assert ar.status_code == 200
    # ids[0] -> 0 fails, ids[1] -> 3 fails, ids[2] -> 1 fail
    for _ in range(3):
        rroutes.store.record_run(ids[1], status='fail', duration_ms=1, log='')
    rroutes.store.record_run(ids[2], status='fail', duration_ms=1, log='')

    captured = {}

    def fake_run(specs, names, id_by_name, artifact_dir=None):
        captured['names'] = names
        return {'passed': 0, 'failed': len(names), 'results': {}}

    monkeypatch.setattr(rroutes, 'run_playwright', fake_run)
    r = client.post('/ai/regression/runs', json={'test_ids': ids, 'order': 'failing-first'})
    assert r.status_code == 200
    run_id = r.json()['run_id']
    import time
    for _ in range(50):
        if client.get(f'/ai/regression/runs/{run_id}').json()['status'] != 'running':
            break
        time.sleep(0.05)
    assert captured['names'] == ['name1', 'name2', 'name0']


def test_runs_scope_related(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes.settings, 'repo_root', str(tmp_path))
    a = client.post('/ai/regression/tests', json={'title': 'A', 'category': 'shared', 'priority': 'Low', 'description': ''}).json()
    b = client.post('/ai/regression/tests', json={'title': 'B', 'category': 'shared', 'priority': 'Low', 'description': ''}).json()
    for t, nm in ((a, 'aname'), (b, 'bname')):
        code = f"test('{nm}', async ({{ page }}) => {{ await expect(x).toHaveCount(1); }});"
        client.post(f"/ai/regression/tests/{t['id']}/apply-generated", json={'code': code})

    captured = {}

    def fake_run(specs, names, id_by_name, artifact_dir=None):
        captured['names'] = names
        return {'passed': 0, 'failed': len(names), 'results': {}}

    monkeypatch.setattr(rroutes, 'run_playwright', fake_run)
    r = client.post('/ai/regression/runs', json={'test_ids': [a['id']], 'scope': 'related'})
    assert r.status_code == 200
    run_id = r.json()['run_id']
    import time
    for _ in range(50):
        if client.get(f'/ai/regression/runs/{run_id}').json()['status'] != 'running':
            break
        time.sleep(0.05)
    assert set(captured['names']) == {'aname', 'bname'}


def test_runs_rejects_bad_scope():
    r = client.post('/ai/regression/runs', json={'test_ids': [], 'scope': 'realted'})
    assert r.status_code == 422


def test_run_parses_reporter(monkeypatch):
    created = client.post('/ai/regression/tests', json={'title': 'R', 'category': 'c', 'priority': 'Low', 'description': ''}).json()
    fake = {'passed': 1, 'failed': 0, 'results': {str(created['id']): {'status': 'pass', 'duration_ms': 50, 'log': ''}}}
    monkeypatch.setattr(rroutes, 'run_playwright', lambda specs, names, id_by_name, artifact_dir=None: fake)
    r = client.post('/ai/regression/runs', json={'test_ids': [created['id']]})
    run_id = r.json()['run_id']
    import time
    for _ in range(50):
        body = client.get(f'/ai/regression/runs/{run_id}').json()
        if body['status'] != 'running':
            break
        time.sleep(0.05)
    assert body['status'] == 'done'
    assert body['passed'] == 1


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
    spec_dir = tmp_path / 'e2e' / 'tests'
    (spec_dir / 'gantt').mkdir(parents=True)
    (spec_dir / 'pbs-portal').mkdir()
    (spec_dir / 'gantt' / 'auth.spec.ts').write_text("test('logs in cleanly', async ({ page }) => {})")
    (spec_dir / 'pbs-portal' / 'auth.spec.ts').write_text("test('portal logs in', async ({ page }) => {})")
    monkeypatch.setattr(rroutes, '_e2e_tests_dir', lambda: spec_dir)
    r = client.post('/ai/regression/import-specs')
    assert r.json() == {'imported': 2, 'skipped': 0}
    tests = client.get('/ai/regression/tests').json()['tests']
    assert any(t['spec_file'] == 'pbs-portal/auth.spec.ts' and t['category'] == 'PBS Portal' for t in tests)
    assert client.post('/ai/regression/import-specs').json() == {'imported': 0, 'skipped': 2}


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


def test_run_records_round_details(monkeypatch):
    tid = _mk_test('detail run case')
    details = {
        'summary': 'Switch date range and jump pairing',
        'steps': [{'action': 'click_pairing_jump', 'pairing_id': 'TG123', 'direction': '>>'}],
        'artifacts': [],
    }

    def fake_run(specs, names, id_by_name, artifact_dir=None):
        return {'passed': 1, 'failed': 0,
                'results': {str(tid): {'status': 'pass', 'duration_ms': 88, 'log': '',
                                        'details': details, 'has_trace': True}}}

    monkeypatch.setattr(rroutes, 'run_playwright', fake_run)
    r = client.post('/ai/regression/runs', json={'test_ids': [tid], 'scope': 'selected'})
    run_id = r.json()['run_id']
    for _ in range(50):
        body = client.get(f'/ai/regression/runs/{run_id}').json()
        if body['status'] != 'running':
            break
        time.sleep(0.05)
    test = rroutes.store.get_test(tid)
    round_entry = test['versions'][-1]['rounds'][-1]
    assert round_entry['run_id'] == run_id
    assert round_entry['has_trace'] is True
    assert round_entry['details']['steps'][0]['pairing_id'] == 'TG123'


def test_manual_round_endpoint_records_selected_version():
    tid = _mk_test('manual round case')
    rroutes.store.update_test(tid, title='manual round case v2')
    details = {
        'summary': 'Manual retest: pairing jump moved date range',
        'steps': [{'action': 'set_date_range', 'from': '2026-06-01', 'to': '2026-06-15'}],
        'artifacts': [],
    }
    r = client.post(f'/ai/regression/tests/{tid}/versions/1/rounds', json={
        'status': 'fail',
        'duration_ms': 0,
        'log': 'jump stayed on old range',
        'details': details,
    })
    assert r.status_code == 200
    body = r.json()
    assert body['round'] == 1
    assert body['details']['summary'].startswith('Manual retest')
    test = rroutes.store.get_test(tid)
    assert test['versions'][0]['rounds'][0]['status'] == 'fail'
    assert test['versions'][1]['rounds'] == []
    assert client.post(f'/ai/regression/tests/{tid}/versions/99/rounds',
                       json={'status': 'pass'}).status_code == 404


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


def test_trace_endpoint_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(rroutes, '_ARTIFACT_ROOT', tmp_path / 'artifacts')
    (tmp_path / 'artifacts').mkdir()
    # Place the "secret" file one level above the artifacts root
    (tmp_path / '5.zip').write_bytes(b'PK-secret')
    # Attempt traversal via run_id='..' with a valid int test_id=5
    r = client.get('/ai/regression/runs/%2E%2E/trace/5')
    assert r.status_code in (400, 404)


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
