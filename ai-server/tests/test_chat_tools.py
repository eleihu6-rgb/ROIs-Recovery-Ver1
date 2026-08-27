from datetime import date

from src.chat.tools import TOOLS, tool_call_to_action, crew_bids_params


def test_all_tools_defined():
    names = {t['name'] for t in TOOLS}
    assert names == {
        'filter_crew', 'filter_pairing', 'filter_flight', 'sort_roster',
        'reset_filters', 'set_date_range', 'create_crew_bids', 'prepare_pa_removal',
        'move_task', 'swap_tasks', 'unassign_task', 'add_ground_task',
    }


def test_filter_crew_maps_to_action():
    action = tool_call_to_action({'name': 'filter_crew', 'input': {'bases': ['BKK'], 'ranks': ['CA']}})
    assert action == {'type': 'filter_crew', 'bases': ['BKK'], 'ranks': ['CA']}


def test_filter_crew_maps_crew_ids():
    # Crew-id lookups ("find crew 10234") map to filter_crew.crewIds. Crew ids are
    # exact employee codes — they are capped but NOT upper-cased like base/rank codes.
    action = tool_call_to_action({'name': 'filter_crew', 'input': {'crewIds': ['10234', 'aBc9']}})
    assert action == {'type': 'filter_crew', 'crewIds': ['10234', 'aBc9']}

    capped = tool_call_to_action({'name': 'filter_crew', 'input': {'crewIds': [str(i) for i in range(60)]}})
    assert len(capped['crewIds']) == 50


def test_filter_crew_advertises_crew_ids():
    crew_tool = next(t for t in TOOLS if t['name'] == 'filter_crew')
    assert 'crewIds' in crew_tool['input_schema']['properties']


def test_filter_pairing_advertises_all_current_pairing_tab_fields():
    tool = next(t for t in TOOLS if t['name'] == 'filter_pairing')
    props = tool['input_schema']['properties']
    assert {'bases', 'fleets', 'divisions', 'depArps', 'assignments', 'coverage', 'label', 'pairingIds'} <= set(props)


def test_filter_pairing_maps_all_current_pairing_tab_fields():
    action = tool_call_to_action({'name': 'filter_pairing', 'input': {
        'bases': ['yvr'],
        'fleets': ['737'],
        'divisions': ['p'],
        'depArps': ['yyz'],
        'assignments': ['f'],
        'coverage': ['Open', 'partial', 'bad'],
        'label': ' 4506 ',
        'pairingIds': ['10234', ' 10567 ', ''],
    }})
    assert action == {
        'type': 'filter_pairing',
        'bases': ['YVR'],
        'fleets': ['737'],
        'divisions': ['P'],
        'depArps': ['YYZ'],
        'assignments': ['F'],
        'coverage': ['open', 'partial'],
        'label': '4506',
        'pairingIds': ['10234', '10567'],
    }


def test_filter_pairing_drops_blank_label_and_invalid_coverage():
    action = tool_call_to_action({'name': 'filter_pairing', 'input': {
        'label': '   ',
        'coverage': ['bad'],
        'pairingIds': [''],
    }})
    assert action == {'type': 'filter_pairing'}


def test_sort_roster_maps_with_defaults():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {'field': 'crewId', 'direction': 'desc'}})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [{'column': 'crewId', 'direction': 'desc'}],
    }


def test_sort_roster_maps_legacy_field_to_criteria():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {'field': 'crew id', 'direction': 'desc'}})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [{'column': 'crewId', 'direction': 'desc'}],
    }


def test_sort_roster_maps_multi_key_criteria_with_aliases():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {
        'criteria': [
            {'field': 'rank'},
            {'field': 'sen', 'direction': 'asc'},
            {'field': 'crew id', 'direction': 'desc'},
        ],
    }})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [
            {'column': 'rank', 'direction': 'asc'},
            {'column': 'seniority', 'direction': 'asc'},
            {'column': 'crewId', 'direction': 'desc'},
        ],
    }


def test_sort_roster_accepts_column_and_long_direction_alias():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {
        'criteria': [
            {'column': 'crew id', 'direction': 'descending'},
            {'column': 'M-Cred'},
        ],
    }})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [
            {'column': 'crewId', 'direction': 'desc'},
            {'column': 'mcred', 'direction': 'asc'},
        ],
    }


def test_sort_roster_drops_invalid_fields_and_caps_criteria():
    action = tool_call_to_action({'name': 'sort_roster', 'input': {
        'criteria': [
            {'field': 'rank'},
            {'field': 'unknown'},
            {'field': 'base'},
            {'field': 'mcred'},
            {'field': 'mdo'},
            {'field': 'crew'},
            {'field': 'seniority'},
        ],
    }})
    assert action == {
        'type': 'sort_roster',
        'paneId': 'roster',
        'criteria': [
            {'column': 'rank', 'direction': 'asc'},
            {'column': 'base', 'direction': 'asc'},
            {'column': 'mcred', 'direction': 'asc'},
            {'column': 'mdo', 'direction': 'asc'},
            {'column': 'crewId', 'direction': 'asc'},
        ],
    }


def test_sort_roster_all_invalid_returns_none():
    assert tool_call_to_action({'name': 'sort_roster', 'input': {
        'criteria': [{'field': 'banana'}, {'field': ''}],
    }}) is None


def test_sort_roster_missing_field_returns_none():
    assert tool_call_to_action({'name': 'sort_roster', 'input': {'direction': 'asc'}}) is None


def test_reset_filters_maps():
    assert tool_call_to_action({'name': 'reset_filters', 'input': {}}) == {'type': 'reset_filters'}


def test_unknown_tool_returns_none():
    assert tool_call_to_action({'name': 'nope', 'input': {}}) is None


def test_filter_crew_normalizes_and_caps():
    action = tool_call_to_action({'name': 'filter_crew', 'input': {'bases': ['bkk', 'sin'], 'ranks': ['ca']}})
    assert action['bases'] == ['BKK', 'SIN']
    assert action['ranks'] == ['CA']

    capped = tool_call_to_action({'name': 'filter_crew', 'input': {'bases': [f'b{i}' for i in range(60)]}})
    assert len(capped['bases']) == 50


def test_set_date_range_maps():
    action = tool_call_to_action({'name': 'set_date_range', 'input': {'start': '2026-07-01', 'end': '2026-07-15'}})
    assert action == {'type': 'set_date_range', 'start': '2026-07-01', 'end': '2026-07-15'}


def test_set_date_range_swaps_reversed_dates():
    action = tool_call_to_action({'name': 'set_date_range', 'input': {'start': '2026-07-15', 'end': '2026-07-01'}})
    assert action == {'type': 'set_date_range', 'start': '2026-07-01', 'end': '2026-07-15'}


def test_set_date_range_rejects_bad_input():
    assert tool_call_to_action({'name': 'set_date_range', 'input': {'start': '2026-07-01'}}) is None
    assert tool_call_to_action({'name': 'set_date_range', 'input': {'start': 'July 1', 'end': '2026-07-15'}}) is None
    assert tool_call_to_action({'name': 'set_date_range', 'input': {'start': '2026-02-30', 'end': '2026-07-15'}}) is None
    assert tool_call_to_action({'name': 'set_date_range', 'input': {'start': '2026-07-01T00:00:00', 'end': '2026-07-15'}}) is None


# ── create_crew_bids: server-resolved (NOT a client board action) ──────────

def test_create_crew_bids_is_not_a_client_action():
    # It launches a headed browser server-side; it must not become an AiAction.
    assert tool_call_to_action({'name': 'create_crew_bids',
                                'input': {'bases': ['YVR'], 'ranks': ['CA'],
                                          'start': '2026-07-01', 'end': '2026-07-31'}}) is None


def test_create_crew_bids_advertised_with_required_scope_and_dates():
    tool = next(t for t in TOOLS if t['name'] == 'create_crew_bids')
    assert set(tool['input_schema']['required']) == {'bases', 'ranks'}


def test_create_crew_bids_advertises_month_base_rank_prompting():
    tool = next(t for t in TOOLS if t['name'] == 'create_crew_bids')
    assert 'simulate crew bids to portal' in tool['description']
    assert 'crew bids to portal' in tool['description']
    assert 'ask' in tool['description'].lower()
    assert 'rank' in tool['description'].lower()
    props = tool['input_schema']['properties']
    assert 'month' in props
    assert 'year' in props


def test_crew_bids_params_complete_normalizes_scope():
    params = crew_bids_params({'name': 'create_crew_bids',
                               'input': {'bases': ['yvr', 'yyz'], 'ranks': ['ca'],
                                         'start': '2026-07-01', 'end': '2026-07-31'}})
    assert params == {'bases': ['YVR', 'YYZ'], 'ranks': ['CA'],
                      'start': '2026-07-01', 'end': '2026-07-31'}


def test_crew_bids_params_accepts_month_and_year():
    params = crew_bids_params({'name': 'create_crew_bids', 'input': {
        'bases': ['yul'], 'ranks': ['ca'], 'month': 'June', 'year': 2026,
    }}, today=date(2026, 6, 24))
    assert params == {
        'bases': ['YUL'], 'ranks': ['CA'],
        'start': '2026-06-01', 'end': '2026-06-30',
    }


def test_crew_bids_params_month_defaults_to_current_year():
    params = crew_bids_params({'name': 'create_crew_bids', 'input': {
        'bases': ['YUL'], 'ranks': ['FO'], 'month': 'July',
    }}, today=date(2026, 6, 24))
    assert params['start'] == '2026-07-01'
    assert params['end'] == '2026-07-31'


def test_crew_bids_params_swaps_reversed_dates():
    params = crew_bids_params({'name': 'create_crew_bids',
                               'input': {'bases': ['YVR'], 'ranks': ['CA'],
                                         'start': '2026-07-31', 'end': '2026-07-01'}})
    assert params['start'] == '2026-07-01' and params['end'] == '2026-07-31'


def test_crew_bids_params_requires_base_rank_and_valid_period():
    base = {'bases': ['YVR'], 'ranks': ['CA'], 'start': '2026-07-01', 'end': '2026-07-31'}
    # missing rank
    assert crew_bids_params({'name': 'create_crew_bids', 'input': {**base, 'ranks': []}}) is None
    # missing base
    assert crew_bids_params({'name': 'create_crew_bids', 'input': {**base, 'bases': []}}) is None
    # missing/blank dates
    assert crew_bids_params({'name': 'create_crew_bids', 'input': {**base, 'end': ''}}) is None
    assert crew_bids_params({'name': 'create_crew_bids', 'input': {**base, 'start': 'July 1'}}) is None
    # wrong tool name
    assert crew_bids_params({'name': 'filter_crew', 'input': base}) is None


def test_crew_bids_params_month_still_requires_rank():
    assert crew_bids_params({'name': 'create_crew_bids', 'input': {
        'bases': ['YUL'], 'ranks': [], 'month': 'June', 'year': 2026,
    }}, today=date(2026, 6, 24)) is None


def test_crew_bids_params_caps_scope():
    params = crew_bids_params({'name': 'create_crew_bids',
                               'input': {'bases': [f'B{i}' for i in range(20)], 'ranks': ['CA'],
                                         'start': '2026-07-01', 'end': '2026-07-31'}})
    assert len(params['bases']) == 10


def test_prepare_pa_removal_maps_with_scope():
    action = tool_call_to_action({'name': 'prepare_pa_removal', 'input': {
        'bases': ['yvr'], 'ranks': ['ca', 'fo'], 'crewIds': ['113', '535'],
        'start': '2026-06-01', 'end': '2026-06-30',
    }})
    assert action == {
        'type': 'prepare_pa_removal', 'start': '2026-06-01', 'end': '2026-06-30',
        'bases': ['YVR'], 'ranks': ['CA', 'FO'], 'crewIds': ['113', '535'],
    }


def test_prepare_pa_removal_requires_valid_dates():
    assert tool_call_to_action({'name': 'prepare_pa_removal', 'input': {'bases': ['YVR']}}) is None
    assert tool_call_to_action({'name': 'prepare_pa_removal', 'input': {
        'start': 'June', 'end': '2026-06-30'}}) is None


def test_prepare_pa_removal_swaps_reversed_dates():
    action = tool_call_to_action({'name': 'prepare_pa_removal', 'input': {
        'start': '2026-06-30', 'end': '2026-06-01', 'crewIds': ['113']}})
    assert action['start'] == '2026-06-01' and action['end'] == '2026-06-30'


# ── Phase 1 Live Roster mutations ───────────────────────────────────────────

def test_move_task_maps_minimal():
    action = tool_call_to_action({'name': 'move_task', 'input': {'crewId': '10234', 'toCrewId': '88812'}})
    assert action == {'type': 'move_task', 'crewId': '10234', 'toCrewId': '88812'}


def test_move_task_maps_with_disambiguation():
    action = tool_call_to_action({'name': 'move_task', 'input': {
        'crewId': '10234', 'toCrewId': '88812', 'pairingLabel': ' cx1234 ', 'date': '2026-08-30',
    }})
    assert action == {
        'type': 'move_task', 'crewId': '10234', 'toCrewId': '88812',
        'pairingLabel': 'cx1234', 'date': '2026-08-30',
    }


def test_move_task_requires_both_crew_ids():
    assert tool_call_to_action({'name': 'move_task', 'input': {'crewId': '10234'}}) is None
    assert tool_call_to_action({'name': 'move_task', 'input': {'toCrewId': '88812'}}) is None
    assert tool_call_to_action({'name': 'move_task', 'input': {'crewId': '  ', 'toCrewId': '88812'}}) is None


def test_move_task_drops_invalid_date():
    action = tool_call_to_action({'name': 'move_task', 'input': {
        'crewId': '10234', 'toCrewId': '88812', 'date': 'next Monday',
    }})
    assert action == {'type': 'move_task', 'crewId': '10234', 'toCrewId': '88812'}


def test_swap_tasks_maps():
    action = tool_call_to_action({'name': 'swap_tasks', 'input': {
        'crewIdA': '10234', 'crewIdB': '88812', 'date': '2026-09-01',
    }})
    assert action == {'type': 'swap_tasks', 'crewIdA': '10234', 'crewIdB': '88812', 'date': '2026-09-01'}


def test_swap_tasks_maps_pairing_labels():
    action = tool_call_to_action({'name': 'swap_tasks', 'input': {
        'crewIdA': '10234', 'crewIdB': '88812',
        'pairingLabelA': 'CX1234', 'pairingLabelB': 'CX5678',
    }})
    assert action == {
        'type': 'swap_tasks', 'crewIdA': '10234', 'crewIdB': '88812',
        'pairingLabelA': 'CX1234', 'pairingLabelB': 'CX5678',
    }


def test_swap_tasks_requires_both_crew_ids():
    assert tool_call_to_action({'name': 'swap_tasks', 'input': {'crewIdA': '10234'}}) is None


def test_unassign_task_maps():
    action = tool_call_to_action({'name': 'unassign_task', 'input': {'crewId': '10234', 'pairingLabel': 'CX1234'}})
    assert action == {'type': 'unassign_task', 'crewId': '10234', 'pairingLabel': 'CX1234'}


def test_unassign_task_requires_crew_id():
    assert tool_call_to_action({'name': 'unassign_task', 'input': {}}) is None


def test_add_ground_task_maps_minimal():
    action = tool_call_to_action({'name': 'add_ground_task', 'input': {
        'crewIds': ['10234'], 'assignment': 'day off', 'date': '2026-09-05',
    }})
    assert action == {
        'type': 'add_ground_task', 'crewIds': ['10234'], 'assignment': 'day off', 'date': '2026-09-05',
    }


def test_add_ground_task_maps_full():
    action = tool_call_to_action({'name': 'add_ground_task', 'input': {
        'crewIds': ['10234', ' 88812 ', ''], 'assignment': ' training ', 'date': '2026-09-05',
        'endDate': '2026-09-07', 'startTime': '08:00', 'endTime': '17:30', 'comments': 'sim recurrent',
    }})
    assert action == {
        'type': 'add_ground_task', 'crewIds': ['10234', '88812'], 'assignment': 'training',
        'date': '2026-09-05', 'endDate': '2026-09-07', 'startTime': '08:00', 'endTime': '17:30',
        'comments': 'sim recurrent',
    }


def test_add_ground_task_requires_crew_assignment_and_date():
    assert tool_call_to_action({'name': 'add_ground_task', 'input': {
        'assignment': 'day off', 'date': '2026-09-05'}}) is None
    assert tool_call_to_action({'name': 'add_ground_task', 'input': {
        'crewIds': ['10234'], 'date': '2026-09-05'}}) is None
    assert tool_call_to_action({'name': 'add_ground_task', 'input': {
        'crewIds': ['10234'], 'assignment': 'day off'}}) is None
    assert tool_call_to_action({'name': 'add_ground_task', 'input': {
        'crewIds': [], 'assignment': 'day off', 'date': '2026-09-05'}}) is None


def test_add_ground_task_drops_invalid_time():
    action = tool_call_to_action({'name': 'add_ground_task', 'input': {
        'crewIds': ['10234'], 'assignment': 'day off', 'date': '2026-09-05', 'startTime': '25:99',
    }})
    assert action == {
        'type': 'add_ground_task', 'crewIds': ['10234'], 'assignment': 'day off', 'date': '2026-09-05',
    }
