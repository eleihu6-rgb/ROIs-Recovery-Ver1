import time

import src.crewbids.runner as runner


PARAMS = {'bases': ['YVR', 'YYZ'], 'ranks': ['CA'], 'start': '2026-07-01', 'end': '2026-07-31'}


def test_build_fixture_cmd_passes_scope_and_period():
    cmd = runner.build_fixture_cmd(PARAMS, '/tmp/fx.json', '/tmp/rep.json', source='/tmp/in.txt')
    assert cmd[0] == 'node'
    assert cmd[1].endswith('e2e/utils/npbs/generate-fixture.mjs')
    assert cmd[2:5] == ['/tmp/in.txt', '/tmp/fx.json', '/tmp/rep.json']
    assert '--bases' in cmd and cmd[cmd.index('--bases') + 1] == 'YVR,YYZ'
    assert '--ranks' in cmd and cmd[cmd.index('--ranks') + 1] == 'CA'
    assert cmd[cmd.index('--period-start') + 1] == '2026-07-01'
    assert cmd[cmd.index('--period-end') + 1] == '2026-07-31'
    assert cmd[cmd.index('--per-bucket') + 1] == '6'


def test_build_playwright_cmd_is_headed_serial_crewbids_spec():
    cmd = runner.build_playwright_cmd(headed=True)
    assert 'npbs-crew-bids-simulation.spec.ts' in cmd
    assert '--headed' in cmd
    assert '--workers=1' in cmd
    assert '--project=pbs-portal' in cmd
    assert '--no-deps' in cmd


def test_build_playwright_cmd_headless_omits_flag():
    assert '--headed' not in runner.build_playwright_cmd(headed=False)


def test_start_run_registers_and_runs_in_background(monkeypatch):
    captured = {}

    def fake_run(params, run_id, stream=None):
        captured['params'] = params
        captured['run_id'] = run_id
        captured['stream'] = stream
        return {'status': 'done', 'scopedCrew': 3, 'summary': {'crewCount': 3, 'placedTotal': 9}}

    monkeypatch.setattr(runner, 'run_crew_bids', fake_run)
    run_id = runner.start_run(PARAMS)
    assert isinstance(run_id, str) and len(run_id) == 12

    # The run registers a live stream and exposes a watch URL up front.
    started = runner.get_run(run_id)
    assert started['streamId']
    assert started['watchUrl'].startswith('/altair/ai/live/streams/')
    assert 'token=' in started['watchUrl']

    # Worker thread completes; poll the registry until done.
    for _ in range(50):
        run = runner.get_run(run_id)
        if run and run.get('status') == 'done':
            break
        time.sleep(0.02)
    run = runner.get_run(run_id)
    assert run['status'] == 'done'
    assert run['scopedCrew'] == 3
    assert run['watchUrl'].startswith('/altair/ai/live/streams/')  # preserved across the result merge
    assert captured['params'] == PARAMS
    assert captured['run_id'] == run_id
    # The stream (id+token) is threaded through to the simulation.
    assert captured['stream'] and captured['stream']['id'] and captured['stream']['token']


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
    assert run['watchUrl'].startswith('/altair/ai/live/streams/')


def test_start_run_records_worker_exception(monkeypatch):
    def boom(params, run_id, stream=None):
        raise RuntimeError('kaboom')

    monkeypatch.setattr(runner, 'run_crew_bids', boom)
    run_id = runner.start_run(PARAMS)
    for _ in range(50):
        run = runner.get_run(run_id)
        if run and run.get('status') == 'error':
            break
        time.sleep(0.02)
    run = runner.get_run(run_id)
    assert run['status'] == 'error'
    assert 'kaboom' in run['error']


def test_get_run_unknown_returns_none():
    assert runner.get_run('does-not-exist') is None
