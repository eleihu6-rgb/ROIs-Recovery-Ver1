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
