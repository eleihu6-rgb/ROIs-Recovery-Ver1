import json

import httpx
import pytest

import src.llm.client as llm
from main import app
from fastapi.testclient import TestClient


@pytest.fixture
def provider(monkeypatch):
    original_client = httpx.Client
    requests, sleeps = [], []
    monkeypatch.setattr(llm.settings, 'llm_retry_delays', (1, 2))
    monkeypatch.setattr(llm.time, 'sleep', sleeps.append)
    monkeypatch.setattr(llm, 'resolve_provider', lambda _: {
        'provider': 'deepseek', 'api_key': 'test-only', 'model': 'deepseek-chat',
        'base_url': 'https://provider.invalid',
    })

    def install(statuses, message=None):
        remaining = iter(statuses)

        def respond(request):
            requests.append(json.loads(request.content))
            return httpx.Response(next(remaining), json={
                'choices': [{'message': message or {'content': 'The roster shows crew duties.'}}],
            })

        transport = httpx.MockTransport(respond)
        monkeypatch.setattr(llm.httpx, 'Client', lambda **kw: original_client(transport=transport, **kw))
        return requests, sleeps

    return install


@pytest.mark.parametrize('status', [500, 502, 503, 504])
def test_transient_failure_retries_same_payload_and_preserves_tools(provider, status):
    requests, sleeps = provider([status, status, 200], {
        'content': 'Cleared all filters.',
        'tool_calls': [{'function': {'name': 'reset_filters', 'arguments': '{}'}}],
    })
    text, calls = llm.llm_tools([{'role': 'user', 'content': 'clear all filters'}], [], 'system')
    assert text == 'Cleared all filters.'
    assert calls == [{'name': 'reset_filters', 'input': {}}]
    assert len(requests) == 3
    assert requests[0] == requests[1] == requests[2]
    assert sleeps == [1, 2]


@pytest.mark.parametrize('status', [400, 401, 403, 404, 429])
def test_non_transient_status_is_not_retried(provider, status):
    requests, sleeps = provider([status])
    with pytest.raises(httpx.HTTPStatusError):
        llm.llm_text('system', 'hello')
    assert len(requests) == 1
    assert sleeps == []


def test_success_does_not_retry(provider):
    requests, sleeps = provider([200])
    assert llm.llm_text('system', 'hello') == 'The roster shows crew duties.'
    assert len(requests) == 1
    assert sleeps == []


def test_exhaustion_is_friendly_and_has_no_actions(provider):
    requests, sleeps = provider([503, 503, 503])
    with TestClient(app) as client:
        response = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'clear filters'}]})
    assert response.status_code == 200
    assert response.json() == {
        'role': 'assistant',
        'content': 'The AI service is temporarily unavailable after retrying. Please try again shortly.',
        'actions': [],
    }
    assert len(requests) == 3
    assert sleeps == [1, 2]


def test_chat_recovers_without_exposing_intermediate_errors(provider):
    requests, sleeps = provider([503, 200])
    with TestClient(app) as client:
        response = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'what does the roster show?'}]})
    assert response.json()['content'] == 'The roster shows crew duties.'
    assert response.json()['actions'] == []
    assert len(requests) == 2
    assert sleeps == [1]


def test_retries_can_be_disabled(provider, monkeypatch):
    requests, sleeps = provider([503])
    monkeypatch.setattr(llm.settings, 'llm_retry_delays', ())
    with pytest.raises(httpx.HTTPStatusError):
        llm.llm_text('system', 'hello')
    assert len(requests) == 1
    assert sleeps == []


def test_chat_does_not_leak_unexpected_exception(monkeypatch):
    import src.chat.routes as routes

    def fail(*args):
        raise ValueError('sensitive provider details')

    monkeypatch.setattr(routes, 'llm_tools', fail)
    with TestClient(app) as client:
        response = client.post('/ai/chat', json={'messages': [{'role': 'user', 'content': 'hello'}]})
    assert response.json() == {
        'role': 'assistant', 'content': 'The AI request could not be completed. Please try again.',
        'actions': [],
    }
