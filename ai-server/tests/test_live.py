"""Relay tests: registry + WS ingest/fanout + viewer page gating.

Uses FastAPI's TestClient WebSocket. The ingest connection stores state/last-frame
synchronously on publish, so a viewer opened afterwards deterministically receives
the stored frame without needing true concurrency."""

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from src.live import registry


@pytest.fixture(autouse=True)
def _reset_streams():
    registry._reset_for_tests()
    yield
    registry._reset_for_tests()


client = TestClient(app)


def _register(kind='crewbids', title='YYC · CA'):
    r = client.post('/ai/live/streams', json={'kind': kind, 'title': title})
    assert r.status_code == 200
    body = r.json()
    assert body['id'] and body['token']
    return body['id'], body['token']


def test_register_issues_id_and_token():
    a, _ = _register()
    b, _ = _register()
    assert a != b  # ids are unique


def test_list_streams_reflects_registration():
    sid, _ = _register(title='YYC · CA/FO')
    r = client.get('/ai/live/streams')
    assert r.status_code == 200
    streams = r.json()['streams']
    assert any(s['id'] == sid and s['title'] == 'YYC · CA/FO' and s['status'] == 'live' for s in streams)


def test_watch_page_404_403_200():
    sid, token = _register()
    assert client.get('/ai/live/streams/nope/watch').status_code == 404
    assert client.get(f'/ai/live/streams/{sid}/watch?token=wrong').status_code == 403
    ok = client.get(f'/ai/live/streams/{sid}/watch?token={token}')
    assert ok.status_code == 200
    assert 'data-testid="live-status"' in ok.text  # the viewer page


def test_viewer_rejected_without_token():
    sid, _ = _register()
    with pytest.raises(Exception):
        with client.websocket_connect(f'/ai/live/streams/{sid}/stream?token=wrong'):
            pass


def test_late_joiner_gets_last_frame_and_meta():
    sid, token = _register(title='late')
    frame = json.dumps({'type': 'frame', 'data': 'QUJD'})  # base64 "ABC"
    with client.websocket_connect(f'/ai/live/streams/{sid}/ingest') as producer:
        producer.send_text(json.dumps({'type': 'meta', 'kind': 'crewbids', 'title': 'late'}))
        producer.send_text(json.dumps({'type': 'page', 'title': '/pairing'}))
        producer.send_text(frame)
        # Viewer joins AFTER the frame was published -> must receive stored state.
        with client.websocket_connect(f'/ai/live/streams/{sid}/stream?token={token}') as viewer:
            meta = json.loads(viewer.receive_text())
            assert meta['type'] == 'meta'
            assert meta['title'] == 'late'
            assert meta['currentPage'] == '/pairing'
            got = json.loads(viewer.receive_text())
            assert got['type'] == 'frame' and got['data'] == 'QUJD'


def test_live_fanout_to_connected_viewer():
    sid, token = _register()
    with client.websocket_connect(f'/ai/live/streams/{sid}/stream?token={token}') as viewer:
        assert json.loads(viewer.receive_text())['type'] == 'meta'  # initial meta
        with client.websocket_connect(f'/ai/live/streams/{sid}/ingest') as producer:
            producer.send_text(json.dumps({'type': 'frame', 'data': 'WFla'}))  # "XYZ"
            got = json.loads(viewer.receive_text())
            assert got['type'] == 'frame' and got['data'] == 'WFla'


def test_unknown_ingest_closes():
    with pytest.raises(Exception):
        with client.websocket_connect('/ai/live/streams/missing/ingest'):
            pass
