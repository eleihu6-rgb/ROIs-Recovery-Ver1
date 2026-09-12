"""R'Bot (crew app) tools.

The crew app's assistant has a different job from the Gantt board assistant: it
drives a crew member's phone — opening screens, preparing an absence request,
setting alarms, changing settings — so it gets its own tool set and its own
route (`/ai/crew/chat`) instead of a branch inside `/ai/chat`.

Everything here is *semantic*: the model names what it means ("route_map") and
the phone resolves it against live state. The model never sees route names,
trip ids or list indexes, so a wrong guess is a no-op rather than a wrong screen.

Contract: docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md 3.3
"""
import re
from datetime import date
from typing import Any

# Navigation targets the crew app can resolve (features/rbot/types.ts mirrors it).
NAV_TARGETS = [
    'home', 'schedule', 'roster_calendar', 'route_map', 'timeline', 'next_trip',
    'trip_details', 'explore', 'alerts', 'upcoming_alarms', 'alarm_settings',
    'absence', 'time_zone', 'preferences', 'appearance', 'personal_info', 'help',
    'global', 'profile',
]

ALARM_ACTIONS = ['enable', 'disable', 'set_offsets', 'set_agenda_filter']
AGENDA_FILTERS = ['all', 'work', 'personal']
SETTING_KEYS = ['time_zone_mode', 'theme', 'avatar', 'explore_interests']

_LABEL = {
    'type': 'string',
    'description': "Short past-tense confirmation shown to the crew under your reply, "
                   "e.g. 'Opened your route map'. Keep it under 8 words.",
}

CREW_TOOLS: list[dict[str, Any]] = [
    {
        'name': 'navigate',
        'description': "Open a screen in the crew app. Pick the target from the crew's own words: "
                       "their roster/calendar ('roster_calendar'), their flown routes ('route_map'), "
                       "the plain duty list ('schedule' or 'timeline'), their next trip ('next_trip' or "
                       "'trip_details'), destination ideas ('explore'), alerts ('alerts'), alarms "
                       "('upcoming_alarms' or 'alarm_settings'), an absence request ('absence'), time "
                       "zone ('time_zone'), preferences ('preferences'), appearance/theme ('appearance'), "
                       "personal information ('personal_info'), help ('help'), the placeholder global "
                       "tab ('global'), or the crew profile ('profile'). Pass 'month' as YYYY-MM when the "
                       "crew asked for a specific month's roster or route map, and 'tripId' only when the "
                       "crew is looking at a trip you were given an id for.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'target': {'type': 'string', 'enum': NAV_TARGETS},
                'month': {'type': 'string', 'description': 'YYYY-MM, when a month was named.'},
                'tripId': {'type': 'string', 'description': 'Only when an id is known.'},
                'label': _LABEL,
            },
            'required': ['target'],
        },
    },
    {
        'name': 'request_absence',
        'description': "Prepare a sick-leave absence request and open the crew app's Absence form with "
                       "the dates filled in. This does NOT submit anything: the crew reviews the form "
                       "and presses Submit. Use it only when the crew is reporting their own sickness "
                       "or absence. Resolve every relative date ('tomorrow', 'next Monday') to an "
                       "absolute YYYY-MM-DD against today's date before calling, and never invent a date "
                       "the crew did not imply.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'fromDate': {'type': 'string', 'description': 'YYYY-MM-DD (crew-base local), inclusive.'},
                'toDate': {'type': 'string', 'description': 'YYYY-MM-DD (crew-base local), inclusive.'},
                'note': {'type': 'string', 'description': 'Optional note for Crew Control.'},
                'label': _LABEL,
            },
            'required': ['fromDate', 'toDate'],
        },
    },
    {
        'name': 'set_alarm',
        'description': "Control the crew's duty alarms. action='enable' or 'disable' switches the alarm "
                       "set on or off; action='set_offsets' changes how long before a duty the wake-up "
                       "and leave-home alarms fire (wakeUpHours / leaveHomeHours, hours before "
                       "departure); action='set_agenda_filter' limits alarms to work events, personal "
                       "events or everything (filter). Only include the values the crew actually asked "
                       "for: an omitted offset keeps its current value.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'action': {'type': 'string', 'enum': ALARM_ACTIONS},
                'wakeUpHours': {'type': 'number', 'description': 'Hours before departure.'},
                'leaveHomeHours': {'type': 'number', 'description': 'Hours before departure.'},
                'filter': {'type': 'string', 'enum': AGENDA_FILTERS},
                'label': _LABEL,
            },
            'required': ['action'],
        },
    },
    {
        'name': 'change_setting',
        'description': "Change a crew app setting. setting='time_zone_mode' with value 'airport' "
                       "(each airport's own local time), 'base' (the crew's base time), 'utc', or "
                       "'device' (this phone's time zone). setting='theme' with one of 'sia', 'thai', "
                       "'emerald', 'graphite'. setting='avatar' with a character name such as 'robot', "
                       "'cat', 'fox'. setting='explore_interests' with a list of interest keys.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'setting': {'type': 'string', 'enum': SETTING_KEYS},
                'value': {
                    'description': 'The new value for the setting.',
                    'anyOf': [
                        {'type': 'string'},
                        {'type': 'number'},
                        {'type': 'array', 'items': {'type': 'string'}},
                    ],
                },
                'label': _LABEL,
            },
            'required': ['setting', 'value'],
        },
    },
]

_ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_YEAR_MONTH = re.compile(r'^\d{4}-\d{2}$')


def is_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or not _ISO_DATE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _number(value: Any) -> float | int | None:
    """Accepts a real number or a numeric string ('4' -> 4)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError:
            return None
        return int(parsed) if parsed.is_integer() else parsed
    return None


def _label(data: dict[str, Any]) -> dict[str, str]:
    label = data.get('label')
    return {'label': label} if isinstance(label, str) and label.strip() else {}


def crew_tool_call_to_action(call: dict[str, Any]) -> dict[str, Any] | None:
    """Normalizes one LLM tool call into a CrewAction, or None when the call is
    unusable (unknown tool, unknown enum value, malformed date, empty value).

    Returning None is deliberate: the assistant's text still reaches the crew,
    and a malformed action never becomes a wrong screen or a bad request.
    """
    name = call.get('name')
    data = call.get('input') or {}
    if not isinstance(data, dict):
        return None

    if name == 'navigate':
        target = data.get('target')
        if target not in NAV_TARGETS:
            return None
        action: dict[str, Any] = {'type': 'navigate', 'target': target}
        month = data.get('month')
        if isinstance(month, str) and _YEAR_MONTH.match(month):
            action['month'] = month
        trip_id = data.get('tripId')
        if isinstance(trip_id, str) and trip_id.strip():
            action['tripId'] = trip_id
        return {**action, **_label(data)}

    if name == 'request_absence':
        start, end = data.get('fromDate'), data.get('toDate')
        if not (is_iso_date(start) and is_iso_date(end)):
            return None
        if start > end:  # ISO dates compare lexicographically
            start, end = end, start
        absence: dict[str, Any] = {'type': 'request_absence', 'fromDate': start, 'toDate': end}
        note = data.get('note')
        if isinstance(note, str) and note.strip():
            absence['note'] = note
        return {**absence, **_label(data)}

    if name == 'set_alarm':
        kind = data.get('action')
        if kind not in ALARM_ACTIONS:
            return None
        alarm: dict[str, Any] = {'type': 'set_alarm', 'action': kind}
        for key in ('wakeUpHours', 'leaveHomeHours'):
            value = _number(data.get(key))
            if value is not None:
                alarm[key] = value
        if data.get('filter') in AGENDA_FILTERS:
            alarm['filter'] = data['filter']
        # An offsets call with no offsets (or a filter call with no filter) has
        # nothing to apply — drop it so the assistant's question stands.
        if kind == 'set_offsets' and 'wakeUpHours' not in alarm and 'leaveHomeHours' not in alarm:
            return None
        if kind == 'set_agenda_filter' and 'filter' not in alarm:
            return None
        return {**alarm, **_label(data)}

    if name == 'change_setting':
        setting = data.get('setting')
        if setting not in SETTING_KEYS:
            return None
        value = data.get('value')
        if isinstance(value, bool):
            return None
        if isinstance(value, str):
            if not value.strip():
                return None
        elif isinstance(value, (int, float)):
            pass
        elif isinstance(value, list) and value and all(isinstance(v, str) and v.strip() for v in value):
            value = [v.strip() for v in value]
        else:
            return None
        return {'type': 'change_setting', 'setting': setting, 'value': value, **_label(data)}

    return None
