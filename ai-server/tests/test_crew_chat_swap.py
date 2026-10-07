"""R'Bot on the crew app's Duty Swap screen (crew-app spec 2026-10-07 §6).

`llm_tools` is monkeypatched: these cover the contract — swap tools are offered
only on the Duty Swap screen, the screen snapshot reaches the prompt, and tool
calls are normalized (or dropped) before they reach the phone.
"""
from fastapi.testclient import TestClient

import src.chat.crew_routes as crew_routes
from src.chat.crew_tools import crew_tool_call_to_action, swap_fields
from main import app

client = TestClient(app)

SNAPSHOT = {
    'window': {'start': '2026-10-07', 'end': '2026-11-02'},
    'me': {'crewId': '392923', 'duties': [{'start': '2026-10-08T20:50', 'end': '2026-10-11T04:30', 'code': 'PR124/PR125', 'kind': 'fly'}]},
    'crews': [{'crewId': '421051', 'duties': [{'start': '2026-10-09T00:00', 'end': '2026-10-09T11:59', 'code': '1HB', 'kind': 'standby'}]}],
}
SWAP_CONTEXT = {'airline': 'PR', 'crewId': '392923', 'today': '2026-10-08', 'screen': 'duty_swap', 'swap': SNAPSHOT}


def test_swap_tools_and_snapshot_only_on_the_duty_swap_screen(monkeypatch):
    seen: dict = {}

    def fake(messages, tools, system):
        seen['tools'] = [t['name'] for t in tools]
        seen['system'] = system
        return ('Found 2 crew with standby on 08–11 Oct.', [
            {'name': 'set_swap_search', 'input': {'fields': {'startDate': '2026-10-08', 'endDate': '2026-10-11'}, 'reset': True, 'wantKind': 'standby'}},
            {'name': 'select_swap_duties', 'input': {'give': [{'date': '2026-10-08', 'code': 'PR124/PR125'}]}},
        ])

    monkeypatch.setattr(crew_routes, 'llm_tools', fake)
    r = client.post('/ai/crew/chat', json={'messages': [{'role': 'user', 'content': 'Swap my trip on 08 Oct for a standby'}], 'context': SWAP_CONTEXT})
    assert r.status_code == 200
    assert {'set_swap_search', 'set_swap_crews', 'select_swap_duties'} <= set(seen['tools'])
    assert '"code":"PR124/PR125"' in seen['system'] and 'DUTY SWAP screen' in seen['system']
    assert r.json()['actions'] == [
        {'type': 'set_swap_search', 'fields': {'startDate': '2026-10-08', 'endDate': '2026-10-11'}, 'reset': True, 'wantKind': 'standby'},
        {'type': 'select_swap_duties', 'give': [{'date': '2026-10-08', 'code': 'PR124/PR125'}]},
    ]

    client.post('/ai/crew/chat', json={'messages': [{'role': 'user', 'content': 'hi'}], 'context': {**SWAP_CONTEXT, 'screen': 'Home'}})
    assert 'set_swap_search' not in seen['tools'] and 'Duty Swap' not in seen['system']


def test_swap_fields_keep_only_valid_values():
    assert swap_fields({'startDate': '2026-10-11', 'endDate': '2026-10-08', 'crdStart': '20', 'briefStart': '25:00',
                        'debriefEnd': '17:05', 'fltFleetList': [350, ''], 'swapMode': 'XX', 'filterEmptyDutyCrew': True}) == {
        'startDate': '2026-10-08', 'endDate': '2026-10-11', 'crdStart': 20, 'debriefEnd': '17:05', 'fltFleetList': ['350'], 'filterEmptyDutyCrew': True}


def test_swap_crews_and_picks_are_validated():
    assert crew_tool_call_to_action({'name': 'set_swap_crews', 'input': {'add': ['450673', 'bad id!'], 'addWhere': {'layoverPortList': ['doh']}}}) == {
        'type': 'set_swap_crews', 'add': ['450673'], 'addWhere': {'layoverPortList': ['DOH']}}
    assert crew_tool_call_to_action({'name': 'set_swap_crews', 'input': {}}) is None
    assert crew_tool_call_to_action({'name': 'select_swap_duties', 'input': {'take': [{'crewId': '421051', 'code': '1hb'}, {'code': '4FB'}]}}) == {
        'type': 'select_swap_duties', 'take': [{'code': '1HB', 'crewId': '421051'}]}
    assert crew_tool_call_to_action({'name': 'set_swap_search', 'input': {'fields': {'startDate': 'tomorrow'}}}) is None
