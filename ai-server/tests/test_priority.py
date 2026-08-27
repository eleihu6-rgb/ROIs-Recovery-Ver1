from src.regression.priority import prioritize


def test_prioritize_orders_failing_first():
    tests = [
        {'id': 1, 'fail_count': 0, 'flakiness_score': 0.0, 'last_status': 'pass', 'last_run_at': '2026-01-01'},
        {'id': 2, 'fail_count': 5, 'flakiness_score': 0.5, 'last_status': 'fail', 'last_run_at': '2026-01-02'},
        {'id': 3, 'fail_count': 2, 'flakiness_score': 0.2, 'last_status': 'fail', 'last_run_at': '2026-01-03'},
        {'id': 4, 'fail_count': 0, 'flakiness_score': 0.0, 'last_status': None, 'last_run_at': None},
    ]
    ordered = prioritize(tests)
    assert [t['id'] for t in ordered] == [2, 3, 4, 1]


def test_prioritize_is_stable_for_equal_keys():
    tests = [
        {'id': 10, 'fail_count': 1, 'flakiness_score': 0.1, 'last_status': 'fail', 'last_run_at': 'x'},
        {'id': 11, 'fail_count': 1, 'flakiness_score': 0.1, 'last_status': 'fail', 'last_run_at': 'x'},
    ]
    ordered = prioritize(tests)
    assert [t['id'] for t in ordered] == [10, 11]


def test_prioritize_never_run_sorts_before_old_run():
    tests = [
        {'id': 20, 'fail_count': 0, 'flakiness_score': 0.0, 'last_status': 'pass', 'last_run_at': '2026-01-05'},
        {'id': 21, 'fail_count': 0, 'flakiness_score': 0.0, 'last_status': 'pass', 'last_run_at': None},
    ]
    ordered = prioritize(tests)
    assert [t['id'] for t in ordered] == [21, 20]
