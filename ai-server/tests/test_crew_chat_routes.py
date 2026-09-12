"""POST /ai/crew/chat - the crew app's R'Bot route.

`llm_tools` is always monkeypatched: these tests cover the contract (bounds,
normalization, never-500), not the model.
"""
from fastapi.testclient import TestClient

import src.chat.crew_routes as crew_routes
from main import app

client = TestClient(app)

CONTEXT = {
    'airline': 'TG',
    'crewId': '35459',
    'crewName': 'Kim',
    'today': '2026-09-11',
    'screen': 'Home',
}


def test_chat_returns_the_action_for_a_navigation_order(monkeypatch):
    monkeypatch.setattr(
        crew_routes,
        'llm_tools',
        lambda m, t, s: ('Opening your route map.', [{'name': 'navigate', 'input': {'target': 'route_map'}}]),
    )
    r = client.post('/ai/crew/chat', json={
        'messages': [{'role': 'user', 'content': 'show me my route map'}],
        'context': CONTEXT,
    })
    assert r.status_code == 200
    body = r.json()
    assert body['role'] == 'assistant'
    assert body['content'] == 'Opening your route map.'
    assert body['actions'] == [{'type': 'navigate', 'target': 'route_map'}]


def test_chat_without_context_still_answers(monkeypatch):
    captured: list[str] = []

    def fake_llm(messages, tools, system):
        captured.append(system)
        return 'Today is fine.', []

    monkeypatch.setattr(crew_routes, 'llm_tools', fake_llm)
    r = client.post('/ai/crew/chat', json={'messages': [{'role': 'user', 'content': 'hello'}]})
    assert r.status_code == 200
    assert r.json()['actions'] == []
    assert 'Today is' in captured[0]


def test_chat_passes_the_crew_context_and_today_into_the_prompt(monkeypatch):
    captured: list[str] = []

    def fake_llm(messages, tools, system):
        captured.append(system)
        return 'ok', []

    monkeypatch.setattr(crew_routes, 'llm_tools', fake_llm)
    client.post('/ai/crew/chat', json={
        'messages': [{'role': 'user', 'content': 'hi'}],
        'context': CONTEXT,
    })
    system = captured[0]
    assert '2026-09-11' in system
    assert 'Kim' in system
    assert '35459' in system
    assert 'TG' in system
    # The persona is R'Bot, and the crew-facing framing is in the prompt.
    assert "R'Bot" in system
    assert 'request_absence' in system


def test_chat_uses_the_crew_tool_set_not_the_board_tool_set(monkeypatch):
    captured: list = []

    def fake_llm(messages, tools, system):
        captured.append(tools)
        return 'ok', []

    monkeypatch.setattr(crew_routes, 'llm_tools', fake_llm)
    client.post('/ai/crew/chat', json={'messages': [{'role': 'user', 'content': 'hi'}]})
    names = [t['name'] for t in captured[0]]
    assert names == ['navigate', 'request_absence', 'set_alarm', 'change_setting']
    # The Gantt-only tools must never leak onto a crew's phone.
    assert 'build_pairings' not in names
    assert 'move_task' not in names


def test_chat_drops_an_unusable_action_without_500(monkeypatch):
    monkeypatch.setattr(
        crew_routes,
        'llm_tools',
        lambda m, t, s: ('Hmm.', [{'name': 'navigate', 'input': {'target': 'nonsense'}}]),
    )
    r = client.post('/ai/crew/chat', json={'messages': [{'role': 'user', 'content': 'go somewhere'}]})
    assert r.status_code == 200
    assert r.json()['actions'] == []


def test_chat_never_500s_when_the_llm_fails(monkeypatch):
    def boom(messages, tools, system):
        raise RuntimeError('provider down')

    monkeypatch.setattr(crew_routes, 'llm_tools', boom)
    r = client.post('/ai/crew/chat', json={'messages': [{'role': 'user', 'content': 'hi'}]})
    assert r.status_code == 200
    body = r.json()
    assert body['actions'] == []
    assert 'provider down' in body['content']


def test_chat_caps_history_and_truncates_a_long_message(monkeypatch):
    captured: list = []

    def fake_llm(messages, tools, system):
        captured.extend(messages)
        return 'ok', []

    monkeypatch.setattr(crew_routes, 'llm_tools', fake_llm)
    history = [{'role': 'user', 'content': f'm{i}'} for i in range(20)]
    history[-1]['content'] = 'x' * 5000
    client.post('/ai/crew/chat', json={'messages': history})

    assert len(captured) == crew_routes.MAX_HISTORY_MESSAGES
    assert captured[0]['content'] == 'm8'
    assert len(captured[-1]['content']) == crew_routes.MAX_MESSAGE_CHARS


def test_chat_rejects_a_malformed_body():
    r = client.post('/ai/crew/chat', json={'messages': [{'role': 'robot', 'content': 'hi'}]})
    assert r.status_code == 422
