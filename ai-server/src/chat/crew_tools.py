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

# ── Duty Swap screen (crew app spec 2026-10-07 §6) ─────────────────────────
# Offered only when the crew is on the Duty Swap screen; the phone sends a
# snapshot of the matrix (its duties + the crews shown) so the model can "see"
# it. The phone runs the portal search itself; nothing here submits a swap.
_SWAP_FIELDS: dict[str, Any] = {
    'type': 'object',
    'description': "Search Pairing fields. Dates YYYY-MM-DD; crd/blh/layoverTime and duration are "
                   "whole numbers (hours / days); brief (report time) and debrief (flight end) are HH:mm. "
                   "Lists are codes from the screen: taskTypeList uses FLY, SBY (standby: HB/FB), "
                   "DO, RDO, ARD, MVP, MVO, XXX, NO_DUTY_DAY; fltFleetList uses '350', '333' etc.",
    'properties': {
        'swapMode': {'type': 'string', 'enum': ['NS', 'FS'], 'description': 'NS=all crew (Target), FS=friends (Handshake).'},
        'startDate': {'type': 'string'}, 'endDate': {'type': 'string'},
        'durationStart': {'type': 'number'}, 'durationEnd': {'type': 'number'},
        'crdStart': {'type': 'number'}, 'crdEnd': {'type': 'number'},
        'blhStart': {'type': 'number'}, 'blhEnd': {'type': 'number'},
        'briefStart': {'type': 'string'}, 'briefEnd': {'type': 'string'},
        'debriefStart': {'type': 'string'}, 'debriefEnd': {'type': 'string'},
        'layoverTimeStart': {'type': 'number'}, 'layoverTimeEnd': {'type': 'number'},
        'taskTypeList': {'type': 'array', 'items': {'type': 'string'}},
        'layoverPortList': {'type': 'array', 'items': {'type': 'string'}},
        'fltNumList': {'type': 'array', 'items': {'type': 'string'}},
        'fltArrList': {'type': 'array', 'items': {'type': 'string'}},
        'fltFleetList': {'type': 'array', 'items': {'type': 'string'}},
        'activeRankList': {'type': 'array', 'items': {'type': 'string'}},
        'filterEmptyDutyCrew': {'type': 'boolean'},
    },
}

SWAP_TOOLS: list[dict[str, Any]] = [
    {
        'name': 'set_swap_search',
        'description': "Change the Duty Swap search (the phone runs it and the crew columns update). Use it "
                       "to find target crew from the crew's words, e.g. 'swap my trip on 08 Oct for a "
                       "standby' -> startDate/endDate = that duty's first/last day from the screen "
                       "snapshot, reset=true, wantKind='standby'. What the crew WANTS in return goes in "
                       "wantKind ('standby' or 'fly'), never in taskTypeList: the portal's Type filter "
                       "also filters the crew's own duties. reset=true clears the optional fields first.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'fields': _SWAP_FIELDS, 'reset': {'type': 'boolean'},
                'wantKind': {'type': 'string', 'enum': ['standby', 'fly']}, 'label': _LABEL,
            },
            'required': ['fields'],
        },
    },
    {
        'name': 'set_swap_crews',
        'description': "Change which crews the matrix shows: only=[ids], add=[ids], remove=[ids], or "
                       "addWhere={search fields} to add the crews a search finds (e.g. 'also someone with "
                       "a DOH layover' -> addWhere {layoverPortList: ['DOH']}). Only use crew ids from "
                       "the snapshot or that the crew typed.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'only': {'type': 'array', 'items': {'type': 'string'}},
                'add': {'type': 'array', 'items': {'type': 'string'}},
                'remove': {'type': 'array', 'items': {'type': 'string'}},
                'addWhere': _SWAP_FIELDS,
                'label': _LABEL,
            },
        },
    },
    {
        'name': 'select_swap_duties',
        'description': "Pick duties in the matrix: give = the crew's own duties to give away, take = "
                       "another crew's duties to take ({crewId, code, date}). Codes and dates must come "
                       "from the snapshot. This never sends the swap; the crew reviews and sends.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'give': {'type': 'array', 'items': {'type': 'object', 'properties': {
                    'date': {'type': 'string'}, 'code': {'type': 'string'}}}},
                'take': {'type': 'array', 'items': {'type': 'object', 'properties': {
                    'crewId': {'type': 'string'}, 'date': {'type': 'string'}, 'code': {'type': 'string'}},
                    'required': ['crewId']}},
                'label': _LABEL,
            },
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


_HHMM = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
_CREW_ID = re.compile(r'^[A-Za-z0-9]{2,10}$')
_SWAP_NUM = ('durationStart', 'durationEnd', 'crdStart', 'crdEnd', 'blhStart', 'blhEnd',
             'layoverTimeStart', 'layoverTimeEnd')
_SWAP_TIME = ('briefStart', 'briefEnd', 'debriefStart', 'debriefEnd')
_SWAP_LIST = ('taskTypeList', 'layoverPortList', 'fltNumList', 'fltArrList', 'fltFleetList', 'activeRankList')


def swap_fields(data: Any) -> dict[str, Any]:
    """Keeps only valid Search Pairing fields (the phone validates again)."""
    if not isinstance(data, dict):
        return {}
    out: dict[str, Any] = {}
    if data.get('swapMode') in ('NS', 'FS'):
        out['swapMode'] = data['swapMode']
    for key in ('startDate', 'endDate'):
        if is_iso_date(data.get(key)):
            out[key] = data[key]
    for key in _SWAP_NUM:
        value = _number(data.get(key))
        if value is not None and value >= 0:
            out[key] = int(value)
    for key in _SWAP_TIME:
        if isinstance(data.get(key), str) and _HHMM.match(data[key]):
            out[key] = data[key]
    for key in _SWAP_LIST:
        items = data.get(key)
        if isinstance(items, list):
            clean = [str(v).strip().upper() for v in items if isinstance(v, (str, int)) and str(v).strip()]
            if clean:
                out[key] = clean
    if isinstance(data.get('filterEmptyDutyCrew'), bool):
        out['filterEmptyDutyCrew'] = data['filterEmptyDutyCrew']
    if 'startDate' in out and 'endDate' in out and out['startDate'] > out['endDate']:
        out['startDate'], out['endDate'] = out['endDate'], out['startDate']
    return out


def _crew_ids(value: Any) -> list[str]:
    return [v for v in value if isinstance(v, str) and _CREW_ID.match(v)] if isinstance(value, list) else []


def _swap_action(name: str, data: dict[str, Any]) -> dict[str, Any] | None:
    if name == 'set_swap_search':
        fields = swap_fields(data.get('fields'))
        reset = data.get('reset') is True
        if not fields and not reset:
            return None
        want = data.get('wantKind') if data.get('wantKind') in ('standby', 'fly') else None
        return {'type': 'set_swap_search', 'fields': fields, **({'reset': True} if reset else {}),
                **({'wantKind': want} if want else {}), **_label(data)}
    if name == 'set_swap_crews':
        action: dict[str, Any] = {'type': 'set_swap_crews'}
        for key in ('only', 'add', 'remove'):
            ids = _crew_ids(data.get(key))
            if ids:
                action[key] = ids
        where = swap_fields(data.get('addWhere'))
        if where:
            action['addWhere'] = where
        return {**action, **_label(data)} if len(action) > 1 else None
    if name == 'select_swap_duties':
        def picks(items: Any, need_crew: bool) -> list[dict[str, str]]:
            out = []
            for item in items if isinstance(items, list) else []:
                if not isinstance(item, dict):
                    continue
                pick: dict[str, str] = {}
                if is_iso_date(item.get('date')):
                    pick['date'] = item['date']
                if isinstance(item.get('code'), str) and item['code'].strip():
                    pick['code'] = item['code'].strip().upper()
                if need_crew:
                    if not (isinstance(item.get('crewId'), str) and _CREW_ID.match(item['crewId'])):
                        continue
                    pick['crewId'] = item['crewId']
                if 'date' in pick or 'code' in pick:
                    out.append(pick)
            return out
        give, take = picks(data.get('give'), False), picks(data.get('take'), True)
        if not give and not take:
            return None
        return {'type': 'select_swap_duties', **({'give': give} if give else {}), **({'take': take} if take else {}), **_label(data)}
    return None


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

    if name in ('set_swap_search', 'set_swap_crews', 'select_swap_duties'):
        return _swap_action(name, data)

    return None
