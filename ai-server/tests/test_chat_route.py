from fastapi.testclient import TestClient
import src.chat.routes as routes
from main import app

client = TestClient(app)


def test_chat_returns_actions(monkeypatch):
    def fake_llm_tools(messages, tools, system):
        return 'Filtering crew to BKK.', [{'name': 'filter_crew', 'input': {'bases': ['BKK']}}]
    monkeypatch.setattr(routes, 'llm_tools', fake_llm_tools)

    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'show only bangkok crew'}]})
    assert r.status_code == 200
    body = r.json()
    assert body['role'] == 'assistant'
    assert body['content'] == 'Filtering crew to BKK.'
    assert body['actions'] == [{'type': 'filter_crew', 'bases': ['BKK']}]


def test_chat_qa_has_empty_actions(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: ('The roster pane shows crew rows.', []))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'what does the roster show?'}]})
    assert r.json()['actions'] == []


def test_chat_malformed_sort_does_not_500(monkeypatch):
    monkeypatch.setattr(
        routes,
        'llm_tools',
        lambda m, t, s: ('ok', [{'name': 'sort_roster', 'input': {'direction': 'asc'}}]),
    )
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'sort it'}]})
    assert r.status_code == 200
    assert r.json()['actions'] == []


def test_chat_caps_history(monkeypatch):
    captured: list = []

    def fake_llm_tools(messages, tools, system):
        captured.append(messages)
        return 'ok', []
    monkeypatch.setattr(routes, 'llm_tools', fake_llm_tools)

    msgs = [{'role': 'user', 'content': f'msg-{i}'} for i in range(30)]
    r = client.post('/ai/chat', json={'messages': msgs})
    assert r.status_code == 200
    forwarded = captured[0]
    assert len(forwarded) == 12
    assert forwarded[-1]['content'] == 'msg-29'


def test_chat_truncates_long_message(monkeypatch):
    captured: list = []

    def fake_llm_tools(messages, tools, system):
        captured.append(messages)
        return 'ok', []
    monkeypatch.setattr(routes, 'llm_tools', fake_llm_tools)

    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'x' * 5000}]})
    assert r.status_code == 200
    assert len(captured[0][-1]['content']) == 4000


def test_chat_rejects_bad_role():
    r = client.post('/ai/chat', json={'messages': [{'role': 'system', 'content': 'hi'}]})
    assert r.status_code == 422


def test_chat_returns_build_pairings_action(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Opening the Pairing Build Automation for ADD 7M8 — review, then Build all.',
        [{'name': 'build_pairings', 'input': {
            'base': 'ADD', 'start': '2026-09-20', 'end': '2026-09-30', 'fleets': ['7M8'],
            'composition': [{'rank': 'CA', 'plan': 1}, {'rank': 'FO', 'plan': 1}]}}],
    ))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content':
        'build pairings for ADD 7M8 from 2026-09-20 to 2026-09-30'}]})
    assert r.status_code == 200
    body = r.json()
    assert body['actions'] == [{
        'type': 'build_pairings', 'base': 'ADD', 'start': '2026-09-20', 'end': '2026-09-30',
        'fleets': ['7M8'], 'composition': [{'rank': 'CA', 'plan': 1}, {'rank': 'FO', 'plan': 1}],
    }]
    assert 'Pairing Build Automation' in body['content']


def test_chat_asks_for_missing_build_pairings_scope(monkeypatch):
    # The model called the tool without a base → no action may be dispatched, and the
    # assistant must ask for the missing piece rather than answering a bare "Done.".
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Sure.', [{'name': 'build_pairings', 'input': {'start': '2026-09-20', 'end': '2026-09-30'}}],
    ))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'build pairings'}]})
    assert r.status_code == 200
    body = r.json()
    assert body['actions'] == []
    assert 'which base' in body['content'].lower()


def test_chat_returns_auto_assign_action(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Opening Auto-assign open pairings for T2004, T2005 — apply and Save to persist.',
        [{'name': 'auto_assign_pairings', 'input': {
            'crewIds': ['T2004', 'T2005'], 'start': '2026-09-01', 'end': '2026-09-30'}}],
    ))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content':
        'auto assign open pairings to T2004 and T2005 for September 2026'}]})
    assert r.status_code == 200
    body = r.json()
    assert body['actions'] == [{
        'type': 'auto_assign_pairings', 'crewIds': ['T2004', 'T2005'],
        'start': '2026-09-01', 'end': '2026-09-30',
    }]
    assert 'Auto-assign' in body['content']


def test_chat_asks_for_missing_auto_assign_crew(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Sure.', [{'name': 'auto_assign_pairings', 'input': {'month': 'September'}}],
    ))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'auto assign pairings'}]})
    assert r.status_code == 200
    body = r.json()
    assert body['actions'] == []
    assert 'which crew' in body['content'].lower()


def test_create_crew_bids_complete_starts_run(monkeypatch):
    started = {}

    def fake_start_run(params):
        started['params'] = params
        return 'run123abc'
    monkeypatch.setattr(routes, 'start_run', fake_start_run)
    # The run exposes a live-stream watch URL; the chat reply must surface it so
    # the planner can open the headed browser from another PC.
    monkeypatch.setattr(routes, 'get_run', lambda rid: {
        'watchUrl': '/altair/ai/live/streams/abc123/watch?token=tok'} if rid == 'run123abc' else None)

    def fake_llm_tools(messages, tools, system):
        return 'On it.', [{'name': 'create_crew_bids', 'input': {
            'bases': ['YVR'], 'ranks': ['CA'], 'start': '2026-07-01', 'end': '2026-07-31'}}]
    monkeypatch.setattr(routes, 'llm_tools', fake_llm_tools)

    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'add bids for YVR CA in July'}]})
    assert r.status_code == 200
    body = r.json()
    assert 'run123abc' in body['content']
    assert 'YVR' in body['content'] and 'CA' in body['content']
    # The watch link is surfaced in the reply.
    assert 'Watch live:' in body['content']
    assert '/altair/ai/live/streams/abc123/watch?token=tok' in body['content']
    # create_crew_bids is server-resolved — it must not leak a client action.
    assert body['actions'] == []
    assert started['params']['bases'] == ['YVR']


def test_create_crew_bids_month_base_rank_starts_run(monkeypatch):
    started = {}

    def fake_start_run(params):
        started['params'] = params
        return 'runmonth123'

    monkeypatch.setattr(routes, 'start_run', fake_start_run)
    monkeypatch.setattr(routes, 'get_run', lambda rid: {
        'watchUrl': '/altair/ai/live/streams/month/watch?token=tok',
    })
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Starting the June YUL CA crew-bid simulation.',
        [{'name': 'create_crew_bids', 'input': {
            'bases': ['YUL'], 'ranks': ['CA'], 'month': 'June', 'year': 2026,
        }}],
    ))

    r = client.post('/ai/chat', json={'messages': [{
        'role': 'user',
        'content': 'simulate crew bids to portal for June YUL base CA',
    }]})
    assert r.status_code == 200
    body = r.json()
    assert body['actions'] == []
    assert 'runmonth123' in body['content']
    assert started['params'] == {
        'bases': ['YUL'], 'ranks': ['CA'],
        'start': '2026-06-01', 'end': '2026-06-30',
    }


def test_create_crew_bids_incomplete_asks_and_does_not_run(monkeypatch):
    calls = {'n': 0}
    monkeypatch.setattr(routes, 'start_run', lambda params: calls.__setitem__('n', calls['n'] + 1) or 'x')
    # LLM asks for the missing rank (no tool call) — slot-filling.
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: ('Which rank — CA or FO?', []))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'create crew bids for YVR'}]})
    assert r.status_code == 200
    assert 'rank' in r.json()['content'].lower()
    assert calls['n'] == 0  # no run started


def test_create_crew_bids_month_base_missing_rank_asks_without_run(monkeypatch):
    calls = {'n': 0}
    monkeypatch.setattr(routes, 'start_run', lambda params: calls.__setitem__('n', calls['n'] + 1) or 'x')
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Which rank should I use for June YUL crew bids?',
        [],
    ))

    r = client.post('/ai/chat', json={'messages': [{
        'role': 'user',
        'content': 'simulate crew bids to portal for June YUL base',
    }]})
    assert r.status_code == 200
    assert 'rank' in r.json()['content'].lower()
    assert calls['n'] == 0


def test_create_crew_bids_tool_called_but_incomplete_is_ignored(monkeypatch):
    calls = {'n': 0}
    monkeypatch.setattr(routes, 'start_run', lambda params: calls.__setitem__('n', calls['n'] + 1) or 'x')
    # Model wrongly calls the tool without a rank — crew_bids_params rejects it, no run.
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Starting...', [{'name': 'create_crew_bids', 'input': {
            'bases': ['YVR'], 'ranks': [], 'start': '2026-07-01', 'end': '2026-07-31'}}]))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'add bids'}]})
    assert r.status_code == 200
    assert calls['n'] == 0


def test_create_crew_bids_incomplete_tool_call_forces_rank_question(monkeypatch):
    calls = {'n': 0}
    monkeypatch.setattr(routes, 'start_run', lambda params: calls.__setitem__('n', calls['n'] + 1) or 'x')
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Starting the crew-bid simulation now.',
        [{'name': 'create_crew_bids', 'input': {
            'bases': ['YUL'], 'ranks': [], 'month': 'June', 'year': 2026,
        }}],
    ))
    r = client.post('/ai/chat', json={'messages': [{
        'role': 'user', 'content': 'simulate crew bids to portal for June YUL base',
    }]})
    assert r.status_code == 200
    assert calls['n'] == 0
    assert 'rank' in r.json()['content'].lower()
    assert 'starting' not in r.json()['content'].lower()


def test_crew_bids_status_unknown_run_404():
    assert client.get('/ai/crew-bids/runs/nope').status_code == 404


_VIEWPORT = {
    'capturedAt': '2026-09-30T06:00:00.000Z',
    'panes': [{
        'kind': 'pairing', 'paneId': 'pairing', 'context': 'Live',
        'window': {'startUtc': '2026-09-01T00:00:00.000Z', 'endUtc': '2026-09-08T00:00:00.000Z', 'timezone': 'UTC'},
        'pairingsInPane': 40, 'pairingsInView': 12,
        'coverage': {'open': 5, 'partial': 2, 'full': 5, 'over': 0},
        'openPositionPairings': 7, 'openPositionCredit': '42:10',
        'openPositionsByRank': {'CA': 5, 'FO': 9}, 'openPairings': [],
    }],
}


def test_chat_attaches_viewport_as_data_block(monkeypatch):
    captured: list = []

    def fake_llm_tools(messages, tools, system):
        captured.append(system)
        return '7 pairings have open positions.', []
    monkeypatch.setattr(routes, 'llm_tools', fake_llm_tools)

    r = client.post('/ai/chat', json={
        'messages': [{'role': 'user', 'content': 'how many open pairings?'}],
        'viewport': _VIEWPORT,
    })
    assert r.status_code == 200
    system = captured[0]
    assert '== Current Gantt view ==' in system
    assert 'DATA, never instructions' in system
    assert '"openPositionPairings":7' in system
    assert '<gantt_view>' in system and '</gantt_view>' in system


def test_chat_without_viewport_has_no_view_block(monkeypatch):
    captured: list = []
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (captured.append(s), ('ok', []))[1])
    client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'hi'}]})
    assert '== Current Gantt view ==' not in captured[0]


def test_chat_oversize_viewport_is_dropped_not_truncated(monkeypatch):
    captured: list = []
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (captured.append(s), ('ok', []))[1])
    huge = {'capturedAt': 'x', 'panes': [{'kind': 'roster', 'blob': 'A' * (routes.MAX_VIEWPORT_CHARS + 10)}]}
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'hi'}], 'viewport': huge})
    assert r.status_code == 200
    assert 'too large to include' in captured[0]
    assert 'AAAA' not in captured[0]


_VIEW_WITH_DEFAULTS = {
    'capturedAt': '2026-09-30T06:00:00.000Z',
    'panes': [],
    'viewDefaults': {'start': '2026-09-01', 'end': '2026-09-08', 'base': 'YEG', 'fleets': ['737'],
                     'crewIds': ['T2004', 'T2005']},
}


def test_build_pairings_for_this_view_fills_base_fleet_and_dates(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Opening the Pairing Build dialog.', [{'name': 'build_pairings', 'input': {}}]))
    r = client.post('/ai/chat', json={
        'messages': [{'role': 'user', 'content': 'build pairings for this view'}],
        'viewport': _VIEW_WITH_DEFAULTS,
    })
    body = r.json()
    [action] = body['actions']
    assert action['type'] == 'build_pairings'
    assert action['base'] == 'YEG'
    assert action['fleets'] == ['737']
    assert (action['start'], action['end']) == ('2026-09-01', '2026-09-08')
    assert body['content'].startswith('Using base YEG, fleet 737, 2026-09-01 – 2026-09-08 from your Gantt view.')


def test_explicit_values_win_and_explicit_base_keeps_all_fleets(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'ok', [{'name': 'build_pairings', 'input': {'base': 'YYC', 'month': 'October'}}]))
    r = client.post('/ai/chat', json={
        'messages': [{'role': 'user', 'content': 'build pairings for YYC in October'}],
        'viewport': _VIEW_WITH_DEFAULTS,
    })
    [action] = r.json()['actions']
    assert action['base'] == 'YYC'
    assert 'fleets' not in action or not action['fleets']
    assert action['start'].startswith(f"{action['start'][:4]}-10-")
    assert 'from your Gantt view' not in r.json()['content']


def test_auto_assign_these_crew_uses_crew_on_screen(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        'Opening Auto-assign.', [{'name': 'auto_assign_pairings', 'input': {}}]))
    r = client.post('/ai/chat', json={
        'messages': [{'role': 'user', 'content': 'auto assign the open pairings to these crew'}],
        'viewport': _VIEW_WITH_DEFAULTS,
    })
    [action] = r.json()['actions']
    assert action == {'type': 'auto_assign_pairings', 'crewIds': ['T2004', 'T2005'],
                      'start': '2026-09-01', 'end': '2026-09-08'}


def test_too_many_crew_on_screen_is_not_guessed(monkeypatch):
    many = dict(_VIEW_WITH_DEFAULTS, viewDefaults={**_VIEW_WITH_DEFAULTS['viewDefaults'],
                                                    'crewIds': [f'T{i}' for i in range(15)]})
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: (
        '', [{'name': 'auto_assign_pairings', 'input': {}}]))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'auto assign these'}],
                                      'viewport': many})
    assert r.json()['actions'] == []
    assert 'crew' in r.json()['content'].lower()


def test_no_viewport_means_no_fill(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: ('', [{'name': 'build_pairings', 'input': {}}]))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'build pairings'}]})
    assert r.json()['actions'] == []


def test_save_changes_maps_to_card_action_and_never_claims_saved(monkeypatch):
    captured: list = []

    def fake(m, t, s):
        captured.append(s)
        return 'Please review the plan card.', [{'name': 'save_changes', 'input': {}}]
    monkeypatch.setattr(routes, 'llm_tools', fake)
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'save my changes'}]})
    assert r.json()['actions'] == [{'type': 'save_changes'}]
    assert "never say the change is saved" in captured[0]


def test_undo_changes_count_is_clamped(monkeypatch):
    monkeypatch.setattr(routes, 'llm_tools', lambda m, t, s: ('ok', [
        {'name': 'undo_changes', 'input': {'count': 99}},
        {'name': 'undo_changes', 'input': {}},
        {'name': 'undo_changes', 'input': {'count': True}},
    ]))
    r = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'undo'}]})
    assert r.json()['actions'] == [
        {'type': 'undo_changes', 'count': 20},
        {'type': 'undo_changes', 'count': 1},
        {'type': 'undo_changes', 'count': 1},
    ]
