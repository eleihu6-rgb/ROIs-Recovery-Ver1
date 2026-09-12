"""R'Bot crew-app tools: the LLM's tool call -> the action the phone performs.

The normalizer is the safety boundary: an unknown enum value, a malformed date
or an empty value must come back as None (no action) rather than a plausible but
wrong action, because the phone would happily execute whatever it receives.
"""
from src.chat.crew_tools import (
    AGENDA_FILTERS,
    ALARM_ACTIONS,
    CREW_TOOLS,
    NAV_TARGETS,
    SETTING_KEYS,
    crew_tool_call_to_action,
    is_iso_date,
)


def test_every_tool_declares_a_name_and_schema():
    names = [t['name'] for t in CREW_TOOLS]
    assert names == ['navigate', 'request_absence', 'set_alarm', 'change_setting']
    for tool in CREW_TOOLS:
        assert tool['description'].strip()
        assert tool['input_schema']['type'] == 'object'


def test_navigate_keeps_known_target_and_drops_unknown():
    assert crew_tool_call_to_action(
        {'name': 'navigate', 'input': {'target': 'route_map'}}
    ) == {'type': 'navigate', 'target': 'route_map'}
    assert crew_tool_call_to_action(
        {'name': 'navigate', 'input': {'target': 'open_the_thing'}}
    ) is None
    assert crew_tool_call_to_action({'name': 'navigate', 'input': {}}) is None
    # Every advertised target must survive the normalizer.
    for target in NAV_TARGETS:
        assert crew_tool_call_to_action({'name': 'navigate', 'input': {'target': target}})


def test_navigate_keeps_a_valid_month_and_drops_a_word_month():
    action = crew_tool_call_to_action(
        {'name': 'navigate', 'input': {'target': 'roster_calendar', 'month': '2026-09', 'label': 'Opened your calendar'}}
    )
    assert action == {
        'type': 'navigate', 'target': 'roster_calendar', 'month': '2026-09', 'label': 'Opened your calendar',
    }
    dropped = crew_tool_call_to_action(
        {'name': 'navigate', 'input': {'target': 'roster_calendar', 'month': 'September'}}
    )
    assert dropped == {'type': 'navigate', 'target': 'roster_calendar'}


def test_request_absence_orders_the_range_and_keeps_a_note():
    assert crew_tool_call_to_action({'name': 'request_absence', 'input': {
        'fromDate': '2026-09-14', 'toDate': '2026-09-16', 'note': 'flu',
    }}) == {
        'type': 'request_absence', 'fromDate': '2026-09-14', 'toDate': '2026-09-16', 'note': 'flu',
    }
    # Reversed range is normalized, not rejected: the crew said the same thing.
    assert crew_tool_call_to_action({'name': 'request_absence', 'input': {
        'fromDate': '2026-09-16', 'toDate': '2026-09-14',
    }}) == {'type': 'request_absence', 'fromDate': '2026-09-14', 'toDate': '2026-09-16'}


def test_request_absence_rejects_a_malformed_or_impossible_date():
    for bad in ('14/09/2026', '2026-9-4', 'tomorrow', '', None):
        assert crew_tool_call_to_action(
            {'name': 'request_absence', 'input': {'fromDate': bad, 'toDate': '2026-09-16'}}
        ) is None
    # '2026-02-30' matches the shape but is not a real date.
    assert is_iso_date('2026-02-30') is False
    assert crew_tool_call_to_action(
        {'name': 'request_absence', 'input': {'fromDate': '2026-02-30', 'toDate': '2026-03-02'}}
    ) is None


def test_set_alarm_enable_and_disable():
    for kind in ('enable', 'disable'):
        assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {'action': kind}}) == {
            'type': 'set_alarm', 'action': kind,
        }


def test_set_alarm_offsets_coerces_numbers_and_requires_at_least_one():
    assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {
        'action': 'set_offsets', 'wakeUpHours': '4', 'leaveHomeHours': 2,
    }}) == {'type': 'set_alarm', 'action': 'set_offsets', 'wakeUpHours': 4, 'leaveHomeHours': 2}
    # Nothing to apply -> no action, so the assistant's question stands.
    assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {'action': 'set_offsets'}}) is None
    assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {
        'action': 'set_offsets', 'wakeUpHours': 'soon',
    }}) is None


def test_set_alarm_agenda_filter():
    assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {
        'action': 'set_agenda_filter', 'filter': 'work',
    }}) == {'type': 'set_alarm', 'action': 'set_agenda_filter', 'filter': 'work'}
    assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {
        'action': 'set_agenda_filter',
    }}) is None
    assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {
        'action': 'set_agenda_filter', 'filter': 'weekends',
    }}) is None


def test_set_alarm_rejects_an_unknown_action():
    assert crew_tool_call_to_action({'name': 'set_alarm', 'input': {'action': 'snooze'}}) is None
    assert len(set(ALARM_ACTIONS)) == len(ALARM_ACTIONS)


def test_change_setting_accepts_string_number_and_list():
    assert crew_tool_call_to_action({'name': 'change_setting', 'input': {
        'setting': 'theme', 'value': 'graphite',
    }}) == {'type': 'change_setting', 'setting': 'theme', 'value': 'graphite'}
    assert crew_tool_call_to_action({'name': 'change_setting', 'input': {
        'setting': 'avatar', 'value': 6,
    }}) == {'type': 'change_setting', 'setting': 'avatar', 'value': 6}
    assert crew_tool_call_to_action({'name': 'change_setting', 'input': {
        'setting': 'explore_interests', 'value': ['Food', 'Beach'],
    }}) == {'type': 'change_setting', 'setting': 'explore_interests', 'value': ['Food', 'Beach']}


def test_change_setting_rejects_unknown_key_empty_or_boolean_value():
    assert crew_tool_call_to_action(
        {'name': 'change_setting', 'input': {'setting': 'password', 'value': 'x'}}
    ) is None
    assert crew_tool_call_to_action(
        {'name': 'change_setting', 'input': {'setting': 'theme', 'value': '   '}}
    ) is None
    assert crew_tool_call_to_action(
        {'name': 'change_setting', 'input': {'setting': 'explore_interests', 'value': []}}
    ) is None
    assert crew_tool_call_to_action(
        {'name': 'change_setting', 'input': {'setting': 'theme', 'value': True}}
    ) is None
    assert len(set(SETTING_KEYS)) == len(SETTING_KEYS)


def test_unknown_tool_and_broken_input_are_dropped():
    assert crew_tool_call_to_action({'name': 'launch_rocket', 'input': {}}) is None
    assert crew_tool_call_to_action({'name': 'navigate'}) is None
    assert crew_tool_call_to_action({'name': 'navigate', 'input': 'route_map'}) is None
    assert crew_tool_call_to_action({}) is None
    assert len(set(AGENDA_FILTERS)) == len(AGENDA_FILTERS)
