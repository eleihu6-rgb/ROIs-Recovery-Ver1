import calendar
from datetime import date
from typing import Any

TOOLS: list[dict[str, Any]] = [
    {
        'name': 'filter_crew',
        'description': "Filter the roster/crew panes. Provide any subset of divisions "
                       "('P' cockpit, 'C' cabin), bases (airport codes), ranks (e.g. CA, FO), fleets, "
                       "or specific crew ids (employee codes, e.g. 'find crew 10234').",
        'input_schema': {
            'type': 'object',
            'properties': {
                'divisions': {'type': 'array', 'items': {'type': 'string', 'enum': ['P', 'C']}},
                'bases': {'type': 'array', 'items': {'type': 'string'}},
                'ranks': {'type': 'array', 'items': {'type': 'string'}},
                'fleets': {'type': 'array', 'items': {'type': 'string'}},
                'crewIds': {'type': 'array', 'items': {'type': 'string'}},
            },
        },
    },
    {
        'name': 'filter_pairing',
        'description': 'Filter the pairing pane using the same criteria as the Gantt Pairing filter tab: '
                       'pairing label, pairing ids, bases, fleets, divisions, departure/origin airports '
                       '(depArps), assignment/type codes, or coverage states (open, partial, full, over).',
        'input_schema': {
            'type': 'object',
            'properties': {
                'bases': {'type': 'array', 'items': {'type': 'string'}},
                'fleets': {'type': 'array', 'items': {'type': 'string'}},
                'divisions': {'type': 'array', 'items': {'type': 'string', 'enum': ['P', 'C']}},
                'depArps': {'type': 'array', 'items': {'type': 'string'}},
                'assignments': {'type': 'array', 'items': {'type': 'string'}},
                'coverage': {'type': 'array', 'items': {'type': 'string', 'enum': ['open', 'partial', 'full', 'over']}},
                'label': {'type': 'string'},
                'pairingIds': {'type': 'array', 'items': {'type': 'string'}},
            },
        },
    },
    {
        'name': 'filter_flight',
        'description': 'Filter the flight pane by departure airports (depArps), arrival airports (arvArps), '
                       'flight numbers (fltNums), fleets, or statuses.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'depArps': {'type': 'array', 'items': {'type': 'string'}},
                'arvArps': {'type': 'array', 'items': {'type': 'string'}},
                'fltNums': {'type': 'array', 'items': {'type': 'string'}},
                'fleets': {'type': 'array', 'items': {'type': 'string'}},
                'statuses': {'type': 'array', 'items': {'type': 'string'}},
            },
        },
    },
    {
        'name': 'sort_roster',
        'description': "Sort the Live main roster pane by one or more fields in priority order. "
                       "Field examples: crew id, seniority, rank, base, mcred, mdo. "
                       "Use criteria for multi-key sorts such as rank asc then crew id desc. "
                       "paneId defaults to 'roster' (the main roster pane).",
        'input_schema': {
            'type': 'object',
            'properties': {
                'paneId': {'type': 'string'},
                'field': {'type': 'string'},
                'direction': {'type': 'string', 'enum': ['asc', 'desc']},
                'criteria': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'field': {'type': 'string'},
                            'column': {'type': 'string'},
                            'direction': {'type': 'string', 'enum': ['asc', 'desc']},
                        },
                    },
                },
            },
        },
    },
    {
        'name': 'reset_filters',
        'description': 'Clear all active filters on every pane, returning to defaults.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'save_changes',
        'description': "Use when the user asks to save / commit / apply the unsaved roster changes. It does "
                       "NOT save by itself: it shows a plan card listing every pending change and the "
                       "legality result; the change is saved only when the user presses 'Yes, save' on "
                       "the card. Never tell the user the changes are saved.",
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'recover_violation',
        'description': "Open the LIVE gantt's Recovery dialog for recoverable legality alerts — rule 8004 "
                       "(aircraft qualification), 1001 (assignment overlap) or 3007 (published delay / FDP). "
                       "Use for 'recover', 'fix the violation', 'fix crew X's 8004', 'resolve the overlap'. "
                       "Optionally scope to a crew id, a rule code and/or a pairing. It only OPENS the dialog: "
                       "the planner picks a recovery option and presses Apply (staged draft), then Save.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'crewId': {'type': 'string', 'description': 'Crew employee code, e.g. T2004'},
                'ruleCode': {'type': 'string', 'enum': ['8004', '1001', '3007']},
                'pairing': {'type': 'string', 'description': 'Pairing label (e.g. ET137/ET136) or numeric id'},
                'date': {'type': 'string', 'description': 'Pairing date YYYY-MM-DD when the label repeats'},
            },
        },
    },
    {
        'name': 'recover_open_pairing',
        'description': "Open the LIVE gantt's 'Recovery — open seats' dialog for ONE pairing that still has an "
                       "open position, to staff it (reserve / standby callout options with cost). Use for "
                       "'staff pairing X', 'fill the open seat on X', 'recovery for open pairing X'. Needs the "
                       "pairing label or id; if the label runs on several days, also the date. Only opens the "
                       "dialog — the planner picks an option and Applies, then Saves.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'pairing': {'type': 'string', 'description': 'Pairing label (e.g. ET137/ET136) or numeric id'},
                'date': {'type': 'string', 'description': 'Pairing date YYYY-MM-DD'},
            },
            'required': ['pairing'],
        },
    },
    {
        'name': 'best_fit_crew',
        'description': "Open the LIVE gantt's 'Best-fit crew' dialog, which ranks legal crew for pairings with "
                       "open positions. Use for 'who can fly X', 'best crew for X', 'find crew for the open "
                       "pairings'. Pass pairing labels/ids the user named; pass an EMPTY list for 'the open "
                       "pairings in view / here / these'. Optional ranks limits to open CA/FO/... slots. Only "
                       "opens the dialog — the planner reviews and Applies, then Saves.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'pairings': {'type': 'array', 'items': {'type': 'string'},
                             'description': 'Pairing labels or ids; [] = open pairings in the current view'},
                'date': {'type': 'string', 'description': 'Pairing date YYYY-MM-DD when a label repeats'},
                'ranks': {'type': 'array', 'items': {'type': 'string'}, 'description': "e.g. ['CA']"},
            },
            'required': ['pairings'],
        },
    },
    {
        'name': 'undo_changes',
        'description': "Undo the last N unsaved roster changes (draft only). Use for 'undo', 'undo that', "
                       "'take back the last 2 changes'. Default 1.",
        'input_schema': {
            'type': 'object',
            'properties': {'count': {'type': 'integer', 'description': 'How many changes to undo, 1-20'}},
        },
    },
    {
        'name': 'set_date_range',
        'description': "Change the board's planning date range. Both start and end are required, "
                       "format YYYY-MM-DD (e.g. 2026-07-01). Resolve relative phrases like "
                       "'next week' or 'July' against today's date before calling.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'start': {'type': 'string', 'description': 'Range start date, YYYY-MM-DD'},
                'end': {'type': 'string', 'description': 'Range end date, YYYY-MM-DD'},
            },
            'required': ['start', 'end'],
        },
    },
    {
        'name': 'create_crew_bids',
        'description': "Simulate crew ADDING/CREATING/ENTERING bids in the crew portal: launches a "
                       "headed browser that logs in as each crew, submits their bids on the "
                       "days-off, pairing and line pages, then logs out and moves to the next. "
                       "Use when the user says 'simulate crew bids to portal', 'crew bids to portal', "
                       "'enter crew bids', 'create crew bids', 'add bids', or 'simulate crew adding bids'. Extract "
                       "base airport codes and month words like June from the user request. "
                       "REQUIRES at least one base AND at least one rank. If rank is missing, "
                       "ask which rank to use and DO NOT call this tool. Provide either start/end "
                       "dates or month/year. Bases are airport codes (e.g. YUL, YVR, YYZ); ranks "
                       "are codes (CA, FO, IFD, FA).",
        'input_schema': {
            'type': 'object',
            'properties': {
                'bases': {'type': 'array', 'items': {'type': 'string'},
                          'description': 'Crew bases, airport codes e.g. ["YVR","YYZ"]'},
                'ranks': {'type': 'array', 'items': {'type': 'string'},
                          'description': 'Crew ranks, e.g. ["CA","FO"]'},
                'start': {'type': 'string', 'description': 'Bidding period start, YYYY-MM-DD'},
                'end': {'type': 'string', 'description': 'Bidding period end, YYYY-MM-DD'},
                'month': {'type': ['string', 'integer'],
                          'description': 'Target bidding month, e.g. "June", "Jun", or 6'},
                'year': {'type': ['string', 'integer'],
                         'description': 'Target bidding year, defaults to current year if omitted'},
            },
            'required': ['bases', 'ranks'],
        },
    },
    {
        'name': 'prepare_pa_removal',
        'description': "Remove pre-assignment (PA) for the PBS solver: VISUALIZE which crew duties "
                       "would be de-assigned (flying pairings + days off) to make room for the "
                       "solver, by writing a memo note icon onto each affected duty in the live "
                       "gantt. This is READ-ONLY analysis — it does NOT actually de-assign anything; "
                       "the planner reviews the note icons, corrects them, then gives a separate "
                       "explicit order to execute. Use when the user says 'remove pre-assignment', "
                       "'remove PA for solver', 'prepare PA removal', or 'mark to-be-de-assigned "
                       "duties'. Scope by bases (airport codes) and ranks (CA, FO) and/or specific "
                       "crewIds, plus a date range (start, end YYYY-MM-DD). If no scope and no date "
                       "range can be determined, ask the user first.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'bases': {'type': 'array', 'items': {'type': 'string'},
                          'description': 'Crew bases, airport codes e.g. ["YVR"]'},
                'ranks': {'type': 'array', 'items': {'type': 'string'},
                          'description': 'Crew ranks, e.g. ["CA","FO"]'},
                'crewIds': {'type': 'array', 'items': {'type': 'string'},
                            'description': 'Specific crew employee codes, e.g. ["113","535"]'},
                'start': {'type': 'string', 'description': 'Target month start, YYYY-MM-DD'},
                'end': {'type': 'string', 'description': 'Target month end, YYYY-MM-DD'},
            },
            'required': ['start', 'end'],
        },
    },
    {
        'name': 'auto_assign_pairings',
        'description': "Open the LIVE gantt's 'Auto-assign open pairings' dialog for specific crew over a "
                       "month or date range. Use when the user says 'auto assign pairings', 'auto assign "
                       "open pairings to <crew>', 'fill <crew>'s roster', 'assign open pairings for "
                       "<month>', or names crew ids to roster. The dialog shows the no-commit decision "
                       "trace (filter → consider → skip-on-rule → assign) and the planner presses 'Apply "
                       "to gantt' and then Save, so the assignment is staged in the draft — never "
                       "committed by the assistant. Needs at least one crew id AND a month or a start/end "
                       "date range; if either is missing, ask for it and do NOT call the tool.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'crewIds': {'type': 'array', 'items': {'type': 'string'},
                            'description': "Crew employee codes, e.g. ['T2004','T2005']"},
                'start': {'type': 'string', 'description': 'Target window start, YYYY-MM-DD'},
                'end': {'type': 'string', 'description': 'Target window end, YYYY-MM-DD'},
                'month': {'type': ['string', 'integer'],
                          'description': 'Target month, e.g. "September", "Sep", or 9'},
                'year': {'type': ['string', 'integer'],
                         'description': 'Target year, defaults to current year if omitted'},
            },
            'required': ['crewIds'],
        },
    },
    {
        'name': 'build_pairings',
        'description': "Open the LIVE gantt's 'Pairing Build Automation' dialog pre-filled with the "
                       "user's requested pairing-build scope, then run 'Find open flights' for them. "
                       "Use when the user says 'build pairings', 'build pairing for <base> <fleet>', "
                       "'automate the pairing build', 'create pairings from open flights', or gives a "
                       "pairing-build order with a date range. It prepares the build — it does NOT "
                       "commit: the planner reviews the scope and presses 'Build all'. Needs a pairing "
                       "base (airport code) AND a date range (start/end YYYY-MM-DD, or a month). "
                       "Optional: fleets (omit for all fleets), crew composition per rank, and build "
                       "rule overrides. If the base or the date range is missing, ask for it and do "
                       "NOT call the tool.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'base': {'type': 'string', 'description': "Pairing base airport code, e.g. 'ADD'"},
                'start': {'type': 'string', 'description': 'Build window start, YYYY-MM-DD'},
                'end': {'type': 'string', 'description': 'Build window end, YYYY-MM-DD'},
                'month': {'type': ['string', 'integer'],
                          'description': 'Target build month, e.g. "September", "Sep", or 9'},
                'year': {'type': ['string', 'integer'],
                         'description': 'Target build year, defaults to current year if omitted'},
                'fleets': {'type': 'array', 'items': {'type': 'string'},
                           'description': "Fleet codes to build from, e.g. ['7M8']; omit for all fleets"},
                'composition': {
                    'type': 'array',
                    'description': "Crew per rank, e.g. [{'rank':'CA','plan':1},{'rank':'FO','plan':1}]; "
                                   'omit for the default composition',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'rank': {'type': 'string', 'description': 'Rank code, e.g. CA, FO'},
                            'plan': {'type': 'integer', 'description': 'How many crew of this rank'},
                        },
                        'required': ['rank', 'plan'],
                    },
                },
                'restMin': {'type': 'integer', 'description': 'Minimum rest override, minutes'},
                'maxDutyBlockMin': {'type': 'integer', 'description': 'Multi-leg duty block cap override, minutes'},
                'checkinMin': {'type': 'integer', 'description': 'Check-in override, minutes'},
                'debriefMin': {'type': 'integer', 'description': 'Debrief override, minutes'},
                'singleLegExemption': {'type': 'boolean',
                                       'description': 'Exempt single-leg long-haul duties from the block cap'},
            },
            'required': ['base'],
        },
    },
    {
        'name': 'move_task',
        'description': "Move ONE crew member's duty (pairing or ground task) to a different crew "
                       "member on the LIVE main roster. Stages the change as a pending draft edit — "
                       "it does NOT save/commit; a human must click Save. Identify the duty being "
                       "moved with pairingLabel (e.g. 'CX1234') and/or date (YYYY-MM-DD) when the "
                       "crew has more than one duty loaded; if neither disambiguates and the crew "
                       "has multiple duties loaded, ask which one.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'crewId': {'type': 'string', 'description': "The crew whose duty is being moved, e.g. '10234'"},
                'toCrewId': {'type': 'string', 'description': 'The crew receiving the duty'},
                'pairingLabel': {'type': 'string', 'description': "Pairing label to disambiguate, e.g. 'CX1234'"},
                'date': {'type': 'string', 'description': 'Calendar date to disambiguate, YYYY-MM-DD'},
            },
            'required': ['crewId', 'toCrewId'],
        },
    },
    {
        'name': 'swap_tasks',
        'description': "Swap the duties of TWO crew members on a given day on the LIVE main roster "
                       "(each keeps their own duty otherwise, only that day's assignment trades places). "
                       "Stages as a pending draft edit — does NOT save/commit. Only supports single, "
                       "non-multi-segment duties; use pairingLabelA/pairingLabelB to disambiguate if "
                       "either crew has more than one duty loaded that day.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'crewIdA': {'type': 'string'},
                'crewIdB': {'type': 'string'},
                'date': {'type': 'string', 'description': 'Calendar date both duties fall on, YYYY-MM-DD'},
                'pairingLabelA': {'type': 'string'},
                'pairingLabelB': {'type': 'string'},
            },
            'required': ['crewIdA', 'crewIdB'],
        },
    },
    {
        'name': 'unassign_task',
        'description': "Remove/unassign a crew member from a duty (pairing or ground task) on the "
                       "LIVE main roster — take them off it, does not delete the pairing itself. "
                       "Stages as a pending draft edit — does NOT save/commit. Identify the duty with "
                       "pairingLabel and/or date when the crew has more than one duty loaded.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'crewId': {'type': 'string'},
                'pairingLabel': {'type': 'string'},
                'date': {'type': 'string', 'description': 'Calendar date to disambiguate, YYYY-MM-DD'},
            },
            'required': ['crewId'],
        },
    },
    {
        'name': 'add_ground_task',
        'description': "Create a ground task (e.g. day off, training, standby, sick) for one or more "
                       "crew members on the LIVE main roster over a date range. Stages as a pending "
                       "draft edit — does NOT save/commit. 'assignment' is free text naming the ground "
                       "task type (e.g. 'day off', 'training') — it is validated against the airline's "
                       "actual assignment dictionary, do not guess a code. Departure/arrival airport "
                       "defaults to the crew's home base. If no time is given, the task spans the whole "
                       "day(s). Resolve relative dates ('next Monday') before calling.",
        'input_schema': {
            'type': 'object',
            'properties': {
                'crewIds': {'type': 'array', 'items': {'type': 'string'}},
                'assignment': {'type': 'string', 'description': "Ground task type, e.g. 'day off', 'training'"},
                'date': {'type': 'string', 'description': 'Start date, YYYY-MM-DD'},
                'endDate': {'type': 'string', 'description': 'End date if it spans multiple days, YYYY-MM-DD; defaults to date'},
                'startTime': {'type': 'string', 'description': 'Start time HH:MM (24h) if specified; defaults to start of day'},
                'endTime': {'type': 'string', 'description': 'End time HH:MM (24h) if specified; defaults to end of day'},
                'comments': {'type': 'string'},
            },
            'required': ['crewIds', 'assignment', 'date'],
        },
    },
]

_FILTER_KEYS = {
    'filter_crew': ('divisions', 'bases', 'ranks', 'fleets', 'crewIds'),
    'filter_pairing': ('bases', 'fleets', 'divisions', 'depArps', 'assignments', 'coverage', 'label', 'pairingIds'),
    'filter_flight': ('depArps', 'arvArps', 'fltNums', 'fleets', 'statuses'),
}

# Bound how many filter values a single AI tool call may inject.
MAX_FILTER_ITEMS = 50
MAX_SORT_CRITERIA = 5

SORT_FIELD_ALIASES = {
    'crewid': 'crewId',
    'crew id': 'crewId',
    'crew': 'crewId',
    'employee id': 'crewId',
    'emp id': 'crewId',
    'seniority': 'seniority',
    'sen': 'seniority',
    'seniority number': 'seniority',
    'rank': 'rank',
    'position': 'rank',
    'base': 'base',
    'crew base': 'base',
    'mcred': 'mcred',
    'm cred': 'mcred',
    'monthly credit': 'mcred',
    'credit': 'mcred',
    'mdo': 'mdo',
    'm do': 'mdo',
    'monthly days off': 'mdo',
    'days off': 'mdo',
}

# String-code arrays are case-folded to upper for stable matching against
# board data; non-string array keys (e.g. isFull bool) are left untouched.
_NORMALIZE_KEYS = {'bases', 'ranks', 'fleets', 'depArps', 'arvArps', 'fltNums', 'divisions', 'assignments'}
_COVERAGE_STATES = {'open', 'partial', 'full', 'over'}


def _normalize_filter_value(key: str, value: Any) -> Any:
    if key == 'label':
        return value.strip()[:100] if isinstance(value, str) and value.strip() else None
    if not isinstance(value, list):
        return value
    capped = value[:MAX_FILTER_ITEMS]
    if key == 'coverage':
        return [
            normalized
            for v in capped
            if isinstance(v, str) and (normalized := v.strip().lower()) in _COVERAGE_STATES
        ]
    if key == 'pairingIds':
        return [v.strip() for v in capped if isinstance(v, str) and v.strip()]
    if key in _NORMALIZE_KEYS:
        return [v.upper() if isinstance(v, str) else v for v in capped]
    return capped


def _normalize_sort_field(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    compact = raw.replace('-', ' ').replace('_', ' ').lower()
    return SORT_FIELD_ALIASES.get(compact)


def _normalize_sort_direction(value: Any) -> str:
    if not isinstance(value, str):
        return 'asc'
    compact = value.strip().lower()
    return 'desc' if compact in {'desc', 'descending'} else 'asc'


def _sort_criteria_from_input(data: dict[str, Any]) -> list[dict[str, str]]:
    raw_criteria = data.get('criteria')
    source = raw_criteria if isinstance(raw_criteria, list) and raw_criteria else [
        {'field': data.get('field'), 'direction': data.get('direction')},
    ]
    criteria: list[dict[str, str]] = []
    for raw in source:
        if not isinstance(raw, dict):
            continue
        column = _normalize_sort_field(raw.get('field') or raw.get('column'))
        if column is None:
            continue
        criteria.append({'column': column, 'direction': _normalize_sort_direction(raw.get('direction'))})
        if len(criteria) >= MAX_SORT_CRITERIA:
            break
    return criteria


def tool_call_to_action(call: dict[str, Any]) -> dict[str, Any] | None:
    name = call.get('name')
    data = call.get('input') or {}
    if name in _FILTER_KEYS:
        action: dict[str, Any] = {'type': name}
        for key in _FILTER_KEYS[name]:
            if key in data and data[key] is not None:
                normalized = _normalize_filter_value(key, data[key])
                if normalized is not None and not (key in {'coverage', 'pairingIds'} and normalized == []):
                    action[key] = normalized
        return action
    if name == 'sort_roster':
        criteria = _sort_criteria_from_input(data)
        if not criteria:
            return None
        return {
            'type': 'sort_roster',
            'paneId': data.get('paneId', 'roster'),
            'criteria': criteria,
        }
    if name == 'reset_filters':
        return {'type': 'reset_filters'}
    if name == 'save_changes':
        return {'type': 'save_changes'}
    if name in ('recover_violation', 'recover_open_pairing', 'best_fit_crew'):
        return _recovery_action(name, data)
    if name == 'undo_changes':
        raw = data.get('count', 1)
        count = raw if isinstance(raw, int) and not isinstance(raw, bool) else 1
        return {'type': 'undo_changes', 'count': max(1, min(count, 20))}
    if name == 'set_date_range':
        start, end = data.get('start'), data.get('end')
        if not (_is_iso_date(start) and _is_iso_date(end)):
            return None
        if start > end:  # ISO dates compare lexicographically
            start, end = end, start
        return {'type': 'set_date_range', 'start': start, 'end': end}
    if name == 'prepare_pa_removal':
        start, end = data.get('start'), data.get('end')
        if not (_is_iso_date(start) and _is_iso_date(end)):
            return None
        if start > end:
            start, end = end, start
        action: dict[str, Any] = {'type': 'prepare_pa_removal', 'start': start, 'end': end}
        for key in ('bases', 'ranks', 'crewIds'):
            val = data.get(key)
            if isinstance(val, list):
                capped = [v.upper() if key != 'crewIds' and isinstance(v, str) else v
                          for v in val[:MAX_SCOPE_ITEMS] if isinstance(v, str) and v.strip()]
                if capped:
                    action[key] = capped
        return action
    if name == 'build_pairings':
        # Opens the client's Pairing Build Automation dialog. Incomplete orders are
        # dropped here so the assistant's "which base/period?" text stands.
        params = build_pairings_params(call)
        if params is None:
            return None
        return {'type': 'build_pairings', **params}
    if name == 'auto_assign_pairings':
        # Opens the client's Auto-assign open pairings dialog (stages a draft; the
        # planner applies and saves). Incomplete orders are dropped so the
        # assistant's "which crew/period?" text stands.
        params = auto_assign_params(call)
        if params is None:
            return None
        return {'type': 'auto_assign_pairings', **params}
    if name == 'move_task':
        crew_id, to_crew_id = data.get('crewId'), data.get('toCrewId')
        if not (_non_blank_str(crew_id) and _non_blank_str(to_crew_id)):
            return None
        action: dict[str, Any] = {'type': 'move_task', 'crewId': crew_id.strip(), 'toCrewId': to_crew_id.strip()}
        if _non_blank_str(data.get('pairingLabel')):
            action['pairingLabel'] = data['pairingLabel'].strip()
        if _is_iso_date(data.get('date')):
            action['date'] = data['date']
        return action
    if name == 'swap_tasks':
        crew_id_a, crew_id_b = data.get('crewIdA'), data.get('crewIdB')
        if not (_non_blank_str(crew_id_a) and _non_blank_str(crew_id_b)):
            return None
        action = {'type': 'swap_tasks', 'crewIdA': crew_id_a.strip(), 'crewIdB': crew_id_b.strip()}
        if _is_iso_date(data.get('date')):
            action['date'] = data['date']
        for key in ('pairingLabelA', 'pairingLabelB'):
            if _non_blank_str(data.get(key)):
                action[key] = data[key].strip()
        return action
    if name == 'unassign_task':
        crew_id = data.get('crewId')
        if not _non_blank_str(crew_id):
            return None
        action = {'type': 'unassign_task', 'crewId': crew_id.strip()}
        if _non_blank_str(data.get('pairingLabel')):
            action['pairingLabel'] = data['pairingLabel'].strip()
        if _is_iso_date(data.get('date')):
            action['date'] = data['date']
        return action
    if name == 'add_ground_task':
        crew_ids_raw = data.get('crewIds')
        assignment = data.get('assignment')
        if not isinstance(crew_ids_raw, list) or not _non_blank_str(assignment) or not _is_iso_date(data.get('date')):
            return None
        crew_ids = [c.strip() for c in crew_ids_raw if isinstance(c, str) and c.strip()][:MAX_SCOPE_ITEMS]
        if not crew_ids:
            return None
        action = {
            'type': 'add_ground_task', 'crewIds': crew_ids, 'assignment': assignment.strip(),
            'date': data['date'],
        }
        if _is_iso_date(data.get('endDate')):
            action['endDate'] = data['endDate']
        for key in ('startTime', 'endTime'):
            if _is_hhmm(data.get(key)):
                action[key] = data[key]
        if _non_blank_str(data.get('comments')):
            action['comments'] = data['comments'].strip()
        return action
    return None


def _non_blank_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_hhmm(value: Any) -> bool:
    """True when value is a 24h HH:MM time string."""
    if not isinstance(value, str) or len(value) != 5 or value[2] != ':':
        return False
    hour, _, minute = value.partition(':')
    return hour.isdigit() and minute.isdigit() and 0 <= int(hour) <= 23 and 0 <= int(minute) <= 59


def _is_iso_date(value: Any) -> bool:
    """True when value is a YYYY-MM-DD calendar date (rejects datetimes/garbage)."""
    if not isinstance(value, str) or len(value) != 10:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


# Cap how many bases/ranks a single crew-bid run may scope (keeps the headed run
# bounded — base×rank buckets × 6 crew each).
MAX_SCOPE_ITEMS = 10

MONTH_NAME_TO_NUMBER = {name.lower(): index for index, name in enumerate(calendar.month_name) if name}
MONTH_NAME_TO_NUMBER.update({
    name.lower(): index for index, name in enumerate(calendar.month_abbr) if name
})


def month_range_from_input(data: dict[str, Any], today: date) -> tuple[str, str] | None:
    month_value = data.get('month')
    if month_value is None:
        return None
    if isinstance(month_value, int):
        month_num = month_value
    elif isinstance(month_value, str):
        stripped = month_value.strip()
        if stripped.isdigit():
            month_num = int(stripped)
        else:
            month_num = MONTH_NAME_TO_NUMBER.get(stripped.lower())
    else:
        return None
    if not isinstance(month_num, int) or month_num < 1 or month_num > 12:
        return None
    year_value = data.get('year', today.year)
    if isinstance(year_value, str) and year_value.strip().isdigit():
        year = int(year_value.strip())
    elif isinstance(year_value, int):
        year = year_value
    else:
        return None
    if year < 2000 or year > 2100:
        return None
    last_day = calendar.monthrange(year, month_num)[1]
    return f'{year:04d}-{month_num:02d}-01', f'{year:04d}-{month_num:02d}-{last_day:02d}'


def crew_bids_params(call: dict[str, Any], today: date | None = None) -> dict[str, Any] | None:
    """Validate a create_crew_bids tool call into a normalized run spec.

    Returns {'bases','ranks','start','end'} only when the scope is complete
    (>=1 base AND >=1 rank) and either dates are valid YYYY-MM-DD or a valid
    month/year can be resolved; otherwise None, so no run is started.
    """
    if call.get('name') != 'create_crew_bids':
        return None
    data = call.get('input') or {}
    bases = data.get('bases')
    ranks = data.get('ranks')
    start = data.get('start')
    end = data.get('end')
    if not isinstance(bases, list) or not isinstance(ranks, list):
        return None
    bases = [b.upper() for b in bases if isinstance(b, str) and b.strip()][:MAX_SCOPE_ITEMS]
    ranks = [r.upper() for r in ranks if isinstance(r, str) and r.strip()][:MAX_SCOPE_ITEMS]
    if not bases or not ranks:
        return None
    if not (_is_iso_date(start) and _is_iso_date(end)):
        resolved = month_range_from_input(data, today or date.today())
        if resolved is None:
            return None
        start, end = resolved
    if start > end:
        start, end = end, start
    return {'bases': bases, 'ranks': ranks, 'start': start, 'end': end}


# Pairing-build rule overrides the dialog accepts. Bounds keep a model-supplied
# number from producing a nonsense build (e.g. a 10-minute rest floor).
BUILD_RULE_BOUNDS = {
    'restMin': (0, 2880),
    'maxDutyBlockMin': (0, 2880),
    'checkinMin': (0, 480),
    'debriefMin': (0, 480),
}
MAX_COMPOSITION_ITEMS = 6
MAX_COMPOSITION_PLAN = 20


def _build_pairing_composition(value: Any) -> list[dict[str, Any]]:
    """Normalize the optional crew-composition list into unique rank/plan slots."""
    if not isinstance(value, list):
        return []
    slots: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, dict):
            continue
        rank = raw.get('rank')
        plan = raw.get('plan')
        if not isinstance(rank, str) or not rank.strip():
            continue
        if isinstance(plan, bool) or not isinstance(plan, int):
            continue
        code = rank.strip().upper()
        if code in seen or not 1 <= plan <= MAX_COMPOSITION_PLAN:
            continue
        seen.add(code)
        slots.append({'rank': code, 'plan': plan})
        if len(slots) >= MAX_COMPOSITION_ITEMS:
            break
    return slots


def _build_pairing_rules(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize the optional build-rule overrides; unknown/out-of-range values are dropped."""
    rules: dict[str, Any] = {}
    for key, (low, high) in BUILD_RULE_BOUNDS.items():
        value = data.get(key)
        if isinstance(value, bool) or not isinstance(value, int):
            continue
        if low <= value <= high:
            rules[key] = value
    exemption = data.get('singleLegExemption')
    if isinstance(exemption, bool):
        rules['singleLegExemption'] = exemption
    return rules


def build_pairings_params(call: dict[str, Any], today: date | None = None) -> dict[str, Any] | None:
    """Validate a build_pairings tool call into a normalized Pairing Build Automation scope.

    Returns {'base','start','end'} plus any supplied fleets/composition/rules only
    when the order is actionable (a base AND either valid dates or a resolvable
    month); otherwise None, so the assistant asks for the missing piece instead of
    opening the dialog on an empty scope.
    """
    if call.get('name') != 'build_pairings':
        return None
    data = call.get('input') or {}
    base = data.get('base')
    if not isinstance(base, str):
        return None
    base = base.strip().upper()
    if not base or len(base) > 4 or not base.isalnum():
        return None
    start, end = data.get('start'), data.get('end')
    if not (_is_iso_date(start) and _is_iso_date(end)):
        resolved = month_range_from_input(data, today or date.today())
        if resolved is None:
            return None
        start, end = resolved
    if start > end:
        start, end = end, start
    params: dict[str, Any] = {'base': base, 'start': start, 'end': end}
    raw_fleets = data.get('fleets')
    if isinstance(raw_fleets, list):
        fleets = [f.strip().upper() for f in raw_fleets if isinstance(f, str) and f.strip()][:MAX_SCOPE_ITEMS]
        if fleets and 'ALL' not in fleets:
            params['fleets'] = fleets
    composition = _build_pairing_composition(data.get('composition'))
    if composition:
        params['composition'] = composition
    rules = _build_pairing_rules(data)
    if rules:
        params['rules'] = rules
    return params


def build_pairings_missing_message(call: dict[str, Any]) -> str | None:
    """Message asking for the piece that stops a build_pairings order from running, else None."""
    if call.get('name') != 'build_pairings':
        return None
    if build_pairings_params(call) is not None:
        return None
    data = call.get('input') or {}
    base = data.get('base')
    has_base = isinstance(base, str) and bool(base.strip())
    has_period = (_is_iso_date(data.get('start')) and _is_iso_date(data.get('end'))) or \
        month_range_from_input(data, date.today()) is not None
    period_text = str(data.get('month') or data.get('start') or 'that period')
    if not has_base and not has_period:
        return 'Which base, and which date range or month, should I build pairings for?'
    if not has_base:
        return f'Which base should I build pairings for in {period_text}?'
    return 'Which date range or month should I build pairings for?'


def auto_assign_params(call: dict[str, Any], today: date | None = None) -> dict[str, Any] | None:
    """Validate an auto_assign_pairings tool call into a normalized auto-assign scope.

    Returns {'crewIds','start','end'} only when the order is actionable (>=1 crew id AND
    either valid dates or a resolvable month); otherwise None, so the assistant asks for
    the missing piece instead of opening the dialog on an empty scope.
    """
    if call.get('name') != 'auto_assign_pairings':
        return None
    data = call.get('input') or {}
    raw_crew = data.get('crewIds')
    if not isinstance(raw_crew, list):
        return None
    crew_ids = [c.strip() for c in raw_crew if isinstance(c, str) and c.strip()][:MAX_SCOPE_ITEMS]
    if not crew_ids:
        return None
    start, end = data.get('start'), data.get('end')
    if not (_is_iso_date(start) and _is_iso_date(end)):
        resolved = month_range_from_input(data, today or date.today())
        if resolved is None:
            return None
        start, end = resolved
    if start > end:
        start, end = end, start
    return {'crewIds': crew_ids, 'start': start, 'end': end}


def auto_assign_missing_message(call: dict[str, Any]) -> str | None:
    """Message asking for the piece that stops an auto_assign_pairings order, else None."""
    if call.get('name') != 'auto_assign_pairings':
        return None
    if auto_assign_params(call) is not None:
        return None
    data = call.get('input') or {}
    raw_crew = data.get('crewIds')
    has_crew = isinstance(raw_crew, list) and any(isinstance(c, str) and c.strip() for c in raw_crew)
    has_period = (_is_iso_date(data.get('start')) and _is_iso_date(data.get('end'))) or \
        month_range_from_input(data, date.today()) is not None
    if not has_crew and not has_period:
        return 'Which crew, and which month or date range, should I auto-assign open pairings for?'
    if not has_crew:
        return 'Which crew should I auto-assign open pairings to?'
    return 'Which month or date range should I auto-assign open pairings for?'


# ── R'Bot "for this view" defaults ────────────────────────────────────────────
# Registry: which tool fields may be filled from the user's last View Gantt read
# (viewport.viewDefaults, computed by the gantt from what is on screen). A new
# view-aware feature is added here, not in the prompt. 'period' = start/end.
VIEW_DEFAULT_FIELDS: dict[str, tuple[str, ...]] = {
    'build_pairings': ('base', 'fleets', 'period'),
    'auto_assign_pairings': ('crewIds', 'period'),
}


def _nonblank(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ''


def apply_view_defaults(call: dict[str, Any], viewport: dict[str, Any] | None) -> tuple[dict[str, Any], list[str]]:
    """Fill a tool call's missing scope from viewDefaults; return (call, used-descriptions).

    Only fills what the user left out — explicit values always win. Fleets are taken from
    the view only when the base also came from the view (an explicit "build ADD" keeps its
    all-fleets meaning). Crew are filled only when the view shows few enough to act on.
    """
    fields = VIEW_DEFAULT_FIELDS.get(call.get('name') or '')
    vd = (viewport or {}).get('viewDefaults')
    if not fields or not isinstance(vd, dict):
        return call, []
    data = dict(call.get('input') or {})
    used: list[str] = []

    base_from_view = False
    if 'base' in fields and not _nonblank(data.get('base')) and _nonblank(vd.get('base')):
        data['base'] = vd['base'].strip().upper()
        base_from_view = True
        used.append(f"base {data['base']}")
    if 'fleets' in fields and base_from_view and not data.get('fleets'):
        fleets = vd.get('fleets')
        if isinstance(fleets, list) and fleets and all(_nonblank(f) for f in fleets):
            data['fleets'] = fleets
            used.append(f"fleet {'/'.join(fleets)}")
    if 'crewIds' in fields and not data.get('crewIds'):
        crew = vd.get('crewIds')
        if isinstance(crew, list) and 0 < len(crew) <= MAX_SCOPE_ITEMS and all(_nonblank(c) for c in crew):
            data['crewIds'] = crew
            used.append(f"{len(crew)} crew on screen ({', '.join(crew[:5])}{'…' if len(crew) > 5 else ''})")
    if 'period' in fields:
        has_period = (_is_iso_date(data.get('start')) and _is_iso_date(data.get('end'))) or data.get('month') not in (None, '')
        if not has_period and _is_iso_date(vd.get('start')) and _is_iso_date(vd.get('end')):
            data['start'], data['end'] = vd['start'], vd['end']
            used.append(f"{vd['start']} – {vd['end']}")

    if not used:
        return call, []
    return {**call, 'input': data}, used


def view_defaults_note(used: list[str]) -> str:
    return f"Using {', '.join(used)} from your Gantt view."


_RECOVERY_RULES = {'8004', '1001', '3007'}


def _recovery_action(name: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize the Recovery / Best-fit opener tools; None when unusable (assistant asks)."""
    def text(key: str) -> str | None:
        v = data.get(key)
        return v.strip() if isinstance(v, str) and v.strip() else None

    date_value = text('date')
    date_out = {'date': date_value} if date_value and _is_iso_date(date_value) else {}
    if name == 'recover_violation':
        action: dict[str, Any] = {'type': name}
        if text('crewId'):
            action['crewId'] = text('crewId').upper()
        rule = text('ruleCode')
        if rule in _RECOVERY_RULES:
            action['ruleCode'] = rule
        if text('pairing'):
            action['pairing'] = text('pairing')
            action.update(date_out)
        return action
    if name == 'recover_open_pairing':
        if not text('pairing'):
            return None
        return {'type': name, 'pairing': text('pairing'), **date_out}
    raw = data.get('pairings')
    pairings = [p.strip() for p in raw if isinstance(p, str) and p.strip()][:MAX_SCOPE_ITEMS] if isinstance(raw, list) else []
    ranks_raw = data.get('ranks')
    ranks = [r.strip().upper() for r in ranks_raw if isinstance(r, str) and r.strip()] if isinstance(ranks_raw, list) else []
    action = {'type': name, 'pairings': pairings, **date_out}
    if ranks:
        action['ranks'] = ranks
    return action
