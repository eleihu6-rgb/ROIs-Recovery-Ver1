"""P1 direct-map reference SectionSpecs. Column maps from mapping research."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

FLEET = SectionSpec(
    name="Fleet", table="fleet", order_by="id",
    cols=[
        Col("id", "id"), Col("acType", "ac_type"), Col("fleetGrp", "fleet_grp"),
        Col("fleet", "fleet"), Col("description", "description"),
        Col("displayOrder", "display_order"), Col("restfacility", "restfacility"),
        Col("body", "body"), Col("marketAcType", "market_ac_type"),
        Col("ccRestFacility", None),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

AIRPORT = SectionSpec(
    name="Airport", table="airport", order_by="id",
    cols=[
        Col("id", "id"), Col("airport", "airport"), Col("airportName", "airport_name"),
        Col("airportNativeName", "airport_native_name"), Col("airportIcao", "airport_icao"),
        Col("country", "country"), Col("airportAbbr", "airport_abbr"), Col("city", "city"),
        Col("category", "category"), Col("dir", "dir"), Col("zoneId", "zone_id"),
        Col("utcStandardOffset", "utc_standard_offset"), Col("dstGrp", "dst_grp"),
        Col("plateauType", "plateau_type"), Col("cats", "cats"), Col("rnp", "rnp"),
        Col("latitude", "latitude"), Col("longitude", "longitude"),
        Col("inPhone", "in_phone"), Col("outPhone", "out_phone"), Col("state", "state"),
        Col("icRoute", "ic_route"), Col("email", "email"), Col("countryName", None),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

BASE = SectionSpec(
    name="Base", table="base", order_by="id",
    cols=[
        Col("id", "id"), Col("filiale", "filiale"), Col("base", "base"), Col("name", "name"),
        Col("displayOrder", "display_order"),
        Col("isPrimeDisplayBase", "is_prime_display_base", fmt="bool01"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

RANK = SectionSpec(
    name="Rank", table="rank", order_by="id",
    cols=[
        Col("id", "id"), Col("rank", "rank"), Col("division", "division"),
        Col("displayOrder", "display_order"), Col("description", "description"),
        Col("isIncludeInFt", "is_include_in_ft", fmt="bool01"),
        Col("isActingRank", "is_acting_rank", fmt="bool01"),
        Col("isCrewRank", "is_crew_rank", fmt="bool01"),
        Col("isMustCrewRank", "is_must_crew_rank", fmt="bool01"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

RANK_ACTING = SectionSpec(
    name="RankActing", table="rank_acting", order_by="id",
    cols=[
        Col("id", "id"), Col("filiale", "filiale"), Col("activeRank", "active_rank"),
        Col("actingRank", "acting_rank"), Col("qual", "qual"), Col("rankId", None),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

RANK_POSITION = SectionSpec(
    name="RankPosition", table="rank_position", order_by="id",
    cols=[
        Col("id", "id"), Col("rankId", None), Col("position", "position"),
        Col("division", "division"), Col("displayOrder", "display_order"),
        Col("description", "description"), Col("rank", "rank"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

COMPOSITION = SectionSpec(
    name="Composition", table="composition", order_by="id",
    cols=[
        Col("id", "id"), Col("filiale", "filiale"), Col("name", "name"),
        Col("nameDesc", "name_desc"), Col("division", "division"),
        Col("displayOrder", "display_order"), Col("hierarchy", "hierarchy"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

COMPOSITION_RANK = SectionSpec(
    name="CompositionRank", table="composition_rank", order_by="id",
    cols=[
        Col("id", "id"), Col("compId", "comp_id"), Col("rankId", None),
        Col("planValue", "plan_value"), Col("planValueExtra", "plan_value_extra"),
        Col("options", "options"), Col("rank", "rank"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

TEAM = SectionSpec(
    name="Team", table="team", order_by="id",
    cols=[
        Col("id", "id"), Col("team", "team"), Col("filiale", "filiale"),
        Col("description", "description"), Col("displayOrder", "display_order"),
        Col("headColor", "head_color"), Col("division", "division"),
        Col("teamGroup", "team_group"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

# SystemParameter is mapped from PG dictionary rows under parent_code='SYS_PARAM'.
_SYS_PARAM_COLS_MY = [
    Col("id", "id"), Col("paramName", "param_name"), Col("paramValues", "param_values"),
    Col("appIds", "app_ids"), Col("paramDesc", "param_desc"),
    Col("lastModified", "last_modified"), Col("modifiedBy", "modified_by"),
]

_DICT_COLS_MY = [
    Col("id", "id"), Col("parentCode", "parent_code"), Col("code", "code"),
    Col("codeValue", "code_value"), Col("name", "name"), Col("idx", "idx"),
    Col("lastModified", "last_modified"), Col("modifiedBy", "modified_by"),
]

# PG `dictionary` rows. SYS_PARAM rows are excluded — those are emitted by the
# SystemParameter section, not Dictionary.
_DICT_COLS_PG = [
    Col("id", "id"), Col("parentCode", "parent_code"), Col("code", "code"),
    Col("codeValue", "code_value"), Col("name", "name"), Col("idx", "idx"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _pg_dict_rows(conn):
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_DICT_COLS_PG)} FROM dictionary "
        "WHERE parent_code IS DISTINCT FROM 'SYS_PARAM' ORDER BY id"
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_DICT_COLS_PG, raw)


def _pg_sys_param_rows(conn):
    # ROIS PG has no `system_parameter` table — system params live in `dictionary`
    # under parent_code='SYS_PARAM' (see root CLAUDE.md). Map to the legacy
    # SystemParameter contract: code→paramName, code_value→paramValues, name→paramDesc.
    cur = conn.cursor()
    cur.execute(
        "SELECT id, code, code_value, NULL, name, updated_at, updated_by "
        "FROM dictionary WHERE parent_code = 'SYS_PARAM' ORDER BY id"
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_SYS_PARAM_COLS_MY, raw)


def _system_parameter(conn, ctx):
    return _pg_sys_param_rows(conn)


def _dictionary(conn, ctx):
    return _pg_dict_rows(conn)


# Headers come from spec.cols legacy names (identical to the golden contract).
SYSTEM_PARAMETER = SectionSpec(
    name="SystemParameter", cols=_SYS_PARAM_COLS_MY, custom=_system_parameter,
)

DICTIONARY = SectionSpec(
    name="Dictionary", cols=_DICT_COLS_MY, custom=_dictionary,
)

ASSIGNMENT = SectionSpec(
    name="Assignment", table="assignment", order_by="id",
    cols=[
        Col("id", "id"), Col("assignment", "assignment"), Col("description", "description"),
        Col("label", "label"), Col("type", "type"), Col("standalone", "standalone"),
        Col("defaultLocation", "default_location"),
        Col("defaultAssignmentGroup", "default_assignment_group"),
        Col("colorHex", "color_hex"), Col("fixedDurationMin", "fixed_duration_min"),
        Col("beforePctDpGapMin", "before_pct_dp_gap_min"),
        Col("fixedStrTm", "fixed_str_tm"), Col("fixedEndTm", "fixed_end_tm"),
        Col("btPct", "bt_pct"), Col("fdpPct", "fdp_pct"),
        Col("dpPct", "dp_pct"), Col("ftPct", "ft_pct"),
        Col("displayLabelWhenAvailable", "display_label_when_available"),
        Col("recaLabel", "reca_label"),
        Col("isAdhoc", "is_adhoc", fmt="bool01"),
        Col("isRecency", "is_recency", fmt="bool01"),
        Col("isQualifier", "is_qualifier", fmt="bool01"),
        Col("wpPct", "wp_pct"), Col("restTime", "rest_time"),
        Col("divideCrewManday", "divide_crew_manday"), Col("orientation", "orientation"),
        Col("pairingLabelColorHex", "pairing_label_color_hex"),
        Col("segmentLabelColorHex", "segment_label_color_hex"), Col("dpGap", "dp_gap"),
        Col("isRest", "is_rest", fmt="bool01"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

ASSIGNMENT_GROUP = SectionSpec(
    name="AssignmentGroup", table="assignment_group", order_by="id",
    cols=[
        Col("id", "id"), Col("assignmentGroup", "assignment_group"), Col("name", "name"),
        Col("optimizerIndicator", "optimizer_indicator"),
        Col("allowOverlap", "allow_overlap"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

ASSIGNMENT_GROUP_MAP = SectionSpec(
    name="AssignmentGroupMap", table="assignment_group_map", order_by="id",
    cols=[
        Col("id", "id"), Col("assignmentGroupId", "assignment_group_id"),
        Col("assignmentId", "assignment_id"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

PANE_HEADER = SectionSpec(
    name="PaneHeader", table="pane_header", order_by="id",
    cols=[
        Col("id", "id"), Col("pane", "pane"), Col("kpi", "kpi"),
        Col("isDisplay", "is_display"), Col("positionIndex", "position_index"),
        Col("expectedFormat", "expected_format"), Col("remark", "remark"),
        Col("width", "width"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

ROSTER_PERIOD = SectionSpec(
    name="RosterPeriod", table="roster_period", order_by="id",
    cols=[
        Col("id", "id"), Col("year", "year"), Col("name", "name"),
        Col("rosterPeriod", "roster_period"), Col("rpStart", "rp_start"),
        Col("rpEnd", "rp_end"),
        Col("rosterPublicationDate", "roster_publication_date"),
        Col("paidDate", "paid_date"), Col("lockStatus", "lock_status"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)


def _airport_client(conn, ctx):
    aps = context.scenario_airports(conn, ctx)
    if not aps:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(AIRPORT.cols)} FROM airport "
        f"WHERE airport = ANY(%s) ORDER BY id",
        (aps,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(AIRPORT.cols, raw)


AIRPORT_CLIENT = SectionSpec(
    name="Airport", variant="Client", cols=AIRPORT.cols, custom=_airport_client,
)

# Scope the full (non-variant) Airport section to the airports actually used by the
# scenario's flights — was a full ~4.5k-row table dump (the single slowest query in
# the build). The solver only needs timezones for airports it sees in the data.
AIRPORT.table = None
AIRPORT.order_by = ""
AIRPORT.custom = _airport_client

ASSIGNMENT_READ = SectionSpec(
    name="Assignment", variant="Read", table="assignment", cols=ASSIGNMENT.cols,
    order_by="id",
)
