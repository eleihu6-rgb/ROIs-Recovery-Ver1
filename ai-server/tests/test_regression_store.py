from pathlib import Path
from src.regression.store import RegressionStore


def test_create_and_list(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='Filter BKK', category='Roster Filter', priority='High', description='base chip appears')
    assert t['id'] == 1001
    assert t['source'] == 'User'
    assert t['spec_file'] == 'manual'
    assert t['active_version'] == 1
    assert t['versions'][0]['rounds'] == []
    assert store.list_tests()[0]['title'] == 'Filter BKK'


def test_persists_across_instances(tmp_path):
    path = tmp_path / 'r.json'
    RegressionStore(path).create_test(title='A', category='c', priority='Low', description='')
    assert len(RegressionStore(path).list_tests()) == 1


def test_record_run_updates_stats(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='A', category='c', priority='Low', description='')
    store.record_run(t['id'], status='pass', duration_ms=120, log='ok')
    updated = store.get_test(t['id'])
    assert updated['run_count'] == 1
    assert updated['pass_count'] == 1
    assert updated['last_status'] == 'pass'
    assert updated['flakiness_score'] == 0.0
    assert updated['versions'][-1]['rounds'][-1]['status'] == 'pass'


def test_record_run_sets_last_run_at(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='A', category='c', priority='Low', description='')
    store.record_run(t['id'], status='pass', duration_ms=10, log='', run_at='2026-06-03T00:00:00Z')
    assert store.get_test(t['id'])['last_run_at'] == '2026-06-03T00:00:00Z'


def test_record_run_saves_once(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='A', category='c', priority='Low', description='')

    counter = {'n': 0}
    real_save = store._save

    def counting_save():
        counter['n'] += 1
        real_save()
    store._save = counting_save

    store.record_run(t['id'], status='fail', duration_ms=50, log='boom', run_at='2026-06-03T00:00:00Z')
    assert counter['n'] == 1

    updated = store.get_test(t['id'])
    assert updated['run_count'] == 1
    assert updated['fail_count'] == 1
    assert updated['last_status'] == 'fail'
    # Runs are now recorded as rounds under the active case version.
    assert len(updated['versions']) == 1
    assert updated['versions'][-1]['rounds'][-1]['status'] == 'fail'
    assert updated['versions'][-1]['rounds'][-1]['log'] == 'boom'


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
    assert t['active_version'] == 1
    assert t['versions'][0]['rounds'] == []


def test_load_migrates_legacy_run_versions_to_rounds(tmp_path):
    p = tmp_path / 'reg.json'
    p.write_text('{"next_id": 1002, "tests": [{"id": 1001, "title": "old", "spec_file": "a.spec.ts", '
                 '"test_name": "old", "category": "Smoke", "source": "User", "priority": "High", '
                 '"description": "", "created_at": "", "updated_at": "", "last_status": "fail", '
                 '"last_run_at": "2026-06-03T00:00:00Z", "last_duration_ms": 25, "last_log": "boom", '
                 '"run_count": 1, "pass_count": 0, "fail_count": 1, "total_duration_ms": 25, '
                 '"flakiness_score": 1.0, "versions": ['
                 '{"version": 1, "timestamp": "", "trigger": "created", "title": "old", "code": "", '
                 '"status": "", "log": "", "run_at": "", "duration_ms": 0},'
                 '{"version": 2, "timestamp": "", "trigger": "run", "title": "old", "code": "", '
                 '"status": "fail", "log": "boom", "run_at": "2026-06-03T00:00:00Z", "duration_ms": 25}'
                 ']}]}')
    s = RegressionStore(p)
    t = s.get_test(1001)
    assert len(t['versions']) == 1
    assert t['versions'][0]['rounds'][0]['status'] == 'fail'
    assert t['versions'][0]['rounds'][0]['log'] == 'boom'


def test_update_test_creates_new_case_version(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    s.record_run(tid, status='fail', duration_ms=5, log='v1 failed')
    s.update_test(tid, title='t1 fixed')
    t = s.get_test(tid)
    assert t['active_version'] == 2
    assert len(t['versions']) == 2
    assert t['versions'][0]['rounds'][0]['status'] == 'fail'
    assert t['versions'][1]['title'] == 't1 fixed'
    assert t['versions'][1]['rounds'] == []


def test_record_run_attaches_structured_details_to_active_version(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    s.update_test(tid, title='t1 v2')
    details = {
        'summary': 'Pairing jump moved range',
        'steps': [{'action': 'click_pairing_jump', 'pairing_id': 'TG123', 'direction': '>>'}],
        'artifacts': [],
    }
    s.record_run(tid, status='pass', duration_ms=40, log='ok', run_id='run-9',
                 details=details, has_trace=True)
    t = s.get_test(tid)
    assert t['versions'][0]['rounds'] == []
    round_entry = t['versions'][1]['rounds'][0]
    assert round_entry['run_id'] == 'run-9'
    assert round_entry['has_trace'] is True
    assert round_entry['details']['steps'][0]['pairing_id'] == 'TG123'


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
    assert not any(v['trigger'] == 'quarantine-release' for v in t['versions'])


def test_update_test_accepts_quarantined_flag(tmp_path):
    s = _mk_store(tmp_path)
    tid = s.list_tests()[0]['id']
    s.update_test(tid, quarantined=True)
    assert s.get_test(tid)['quarantined'] is True
    s.update_test(tid, quarantined=False)
    assert s.get_test(tid)['quarantined'] is False


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


def test_delete_snapshot_marks_artifact_deleted(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    artifact = {
        'type': 'snapshot', 'id': 'snap-1', 'filename': 'case-1001-ts-0-lbl.png',
        'url': '/ai/regression/artifacts/run-5/snapshots/case-1001-ts-0-lbl.png',
        'label': 'lbl', 'step_index': 0, 'created_at': '20260606T120000Z', 'deleted': False,
    }
    store.record_run(t['id'], status='pass', duration_ms=100, log='', run_id='run-5',
                     details={'summary': 'ok', 'steps': [], 'artifacts': [artifact]})
    changed = store.delete_snapshot('run-5', 'case-1001-ts-0-lbl.png')
    assert changed is True
    rounds = store.get_test(t['id'])['versions'][-1]['rounds']
    art = rounds[-1]['details']['artifacts'][0]
    assert art['deleted'] is True


def test_delete_snapshot_returns_false_for_unknown_run(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    store.record_run(t['id'], status='pass', duration_ms=100, log='', run_id='run-A')
    changed = store.delete_snapshot('run-NOPE', 'any.png')
    assert changed is False


def test_delete_snapshot_idempotent(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    t = store.create_test(title='x', category='c', priority='Low', description='')
    artifact = {
        'type': 'snapshot', 'id': 'snap-2', 'filename': 'f.png',
        'url': '/ai/regression/artifacts/run-6/snapshots/f.png',
        'label': 'l', 'step_index': 0, 'created_at': '20260606T120000Z', 'deleted': False,
    }
    store.record_run(t['id'], status='pass', duration_ms=100, log='', run_id='run-6',
                     details={'summary': '', 'steps': [], 'artifacts': [artifact]})
    assert store.delete_snapshot('run-6', 'f.png') is True
    assert store.delete_snapshot('run-6', 'f.png') is False  # already deleted
