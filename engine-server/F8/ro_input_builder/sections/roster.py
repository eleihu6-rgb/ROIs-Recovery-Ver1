"""Roster-layer SectionSpecs. All derive from roster_flight, scoped to the
scenario crew set + window. RosterFlight = pairing rows; RosterGround = ground
rows; Roster = reconstructed pairing-level via GROUP BY (crew_id, pairing_id)."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_PAIRING_START_SUBQ = "(SELECT sch_str_dt_utc FROM pairing WHERE id = roster_flight.pairing_id)"

_RF_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("dutyId", None), Col("rosterId", None), Col("fltId", "flt_id"),
    Col("fltDt", "flt_dt"), Col("division", "division"), Col("crewId", "crew_id"),
    Col("actingRank", "flight_acting_rank"), Col("activeRank", "active_rank"),
    Col("position", "position"), Col("assignment", "assignment"),
    Col("seqOrder", "seq_order"), Col("checkType", "check_type"),
    Col("tsFlag", "ts_flag"), Col("sendFlag", "send_flag"), Col("source", "'PA'"),
    Col("createdDt", "created_at"), Col("createdBy", "created_by"),
    Col("resourceCode", "resource_code"), Col("role", "role"),
    Col("groupId", "group_id"), Col("tmProgramCourseId", "tm_program_course_id"),
    Col("parentTmProgramCourseId", "parent_tm_program_course_id"),
    Col("courseCode", "course_code"), Col("subRole", "sub_role"),
    Col("subGroupId", "sub_group_id"),
    Col("subTmProgramCourseId", "sub_tm_program_course_id"),
    Col("subParentTmProgramCourseId", "sub_parent_tm_program_id"),
    Col("subCourseCode", "sub_course_code"),
    Col("isExtraCourse", "is_extra_course", fmt="bool01"), Col("tagSet", "tag_set"),
    Col("pairingStartUtc", _PAIRING_START_SUBQ), Col("requestSource", "request_source"),
    Col("requestId", "request_id"), Col("isPublish", "is_publish"),
    Col("isAgreeWork", None), Col("exceptionCode", "exception_code"),
    Col("actionDtUtc", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _roster_flight(conn, ctx):
    ids = [int(x) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_RF_COLS)} FROM roster_flight "
        f"WHERE scenario_id = 0 AND pairing_id IS NOT NULL AND is_deleted = 0 "
        f"AND crew_id = ANY(%(ids)s) "
        f"AND flt_dt >= %(lo)s AND flt_dt < %(hi)s ORDER BY id",
        {"ids": [str(i) for i in ids], "lo": lo.isoformat(), "hi": hi.isoformat()},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_RF_COLS, raw)


ROSTER_FLIGHT = SectionSpec(name="RosterFlight", cols=_RF_COLS, custom=_roster_flight)

_RG_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("scenarioId", "scenario_id"),
    Col("assignmentGroup", "assignment_group"), Col("assignment", "assignment"),
    # Ground location: flight-linked ground tasks have dep_arp; VAC/DO/SBY at the
    # crew's base have dep_arp NULL but base populated → fall back to base.
    Col("location", "COALESCE(dep_arp, base)"), Col("strDtUtc", "sch_str_dt_utc"),
    Col("endDtUtc", "sch_end_dt_utc"), Col("isLocked", None),
    Col("sendFlag", "send_flag"), Col("restEndDtUtc", None),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("remarks", None), Col("isRequested", "is_requested", fmt="bool01"),
    Col("isSwapped", "is_swapped", fmt="bool01"), Col("source", "'PA'"),
    Col("filiale", None), Col("division", "division"), Col("isVolunteer", None),
    Col("comments", "comments"), Col("label", "label"),
    Col("resourceCode", "resource_code"), Col("role", "role"),
    Col("groupId", "group_id"), Col("tmProgramCourseId", "tm_program_course_id"),
    Col("parentTmProgramCourseId", "parent_tm_program_course_id"),
    Col("courseCode", "course_code"), Col("subRole", "sub_role"),
    Col("subGroupId", "sub_group_id"),
    Col("subTmProgramCourseId", "sub_tm_program_course_id"),
    Col("subParentTmProgramCourseId", "sub_parent_tm_program_id"),
    Col("subCourseCode", "sub_course_code"),
    Col("isExtraCourse", "is_extra_course", fmt="bool01"),
    Col("requestSource", "request_source"), Col("requestId", "request_id"),
    Col("isPublish", "is_publish"), Col("tagSet", "tag_set"), Col("isPush", None),
    Col("transactionId", None), Col("notificationTime", None),
    Col("notificationRemark", None), Col("callOutRosterId", None),
    Col("isAcknowledged", None), Col("callOutDtUtc", None),
    Col("dpMin", "act_credited_minutes"),
    Col("creditedMinutes", "act_credited_minutes"),
    Col("isAgreeWork", None),
    Col("exceptionCode", "exception_code"), Col("autoLabel", None),
    Col("actionDtUtc", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _roster_ground(conn, ctx):
    ids = [int(x) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_RG_COLS)} FROM roster_flight "
        f"WHERE scenario_id = 0 AND pairing_id IS NULL AND is_deleted = 0 "
        f"AND crew_id = ANY(%(ids)s) "
        f"AND sch_str_dt_utc >= %(lo)s AND sch_str_dt_utc < %(hi)s ORDER BY id",
        {"ids": [str(i) for i in ids], "lo": lo, "hi": hi},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_RG_COLS, raw)


ROSTER_GROUND = SectionSpec(name="RosterGround", cols=_RG_COLS, custom=_roster_ground)

# Reconstructed Roster: group roster_flight by (crew_id, pairing_id). Group keys
# (crew_id, pairing_id) are bare; everything else is an aggregate.
_ROSTER_COLS = [
    Col("id", "MIN(id)"), Col("scenarioId", "MIN(scenario_id)"), Col("ver", "MIN(ver)"),
    Col("crewId", "crew_id"), Col("label", "MIN(label)"), Col("pairingId", "pairing_id"),
    Col("assignmentGroup", "MIN(assignment_group)"), Col("assignment", "MIN(assignment)"),
    Col("actingRank", "MIN(flight_acting_rank)"), Col("position", "MIN(position)"),
    Col("role", "MIN(role)"), Col("subRole", "MIN(sub_role)"), Col("source", "'PA'"),
    Col("isRequested", "MIN(is_requested::int)", fmt="bool01"),
    Col("isDeleted", "MIN(is_deleted::int)", fmt="bool01"),
    Col("isSwapped", "MIN(is_swapped::int)", fmt="bool01"),
    Col("preference", "MIN(preference)"), Col("comments", "MIN(comments)"),
    Col("score", "MIN(score)"), Col("createdBy", "MIN(created_by)"),
    Col("createdDt", "MIN(created_at)"), Col("liveId", None),
    Col("callOutRosterId", None), Col("isAcknowledged", None), Col("callOutDtUtc", None),
    Col("notificationTime", None), Col("notificationRemark", None),
    Col("actStrDtUtc", "MIN(act_str_dt_utc)"), Col("actEndDtUtc", "MAX(act_end_dt_utc)"),
    Col("actRestStrDtUtc", None), Col("location", None), Col("actStartDtUtc", None),
    Col("actionDtUtc", None), Col("lastModified", "MAX(updated_at)"),
    Col("modifiedBy", "MIN(updated_by)"),
]


def _roster(conn, ctx):
    ids = [int(x) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_ROSTER_COLS)} FROM roster_flight "
        f"WHERE scenario_id = 0 AND pairing_id IS NOT NULL AND is_deleted = 0 "
        f"AND crew_id = ANY(%(ids)s) "
        f"AND flt_dt >= %(lo)s AND flt_dt < %(hi)s "
        f"GROUP BY crew_id, pairing_id ORDER BY MIN(id)",
        {"ids": [str(i) for i in ids], "lo": lo.isoformat(), "hi": hi.isoformat()},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_ROSTER_COLS, raw)


ROSTER = SectionSpec(name="Roster", cols=_ROSTER_COLS, custom=_roster)
