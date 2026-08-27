"""Pairing-layer SectionSpecs. Pairing + PairingComposition map to their tables;
Duty/Segment/Node derive from the merged wide pairing_segment table."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_PAIRING_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("ver", "ver"),
    Col("pairingDt", "pairing_dt"), Col("label", "pairing_label"),
    Col("filiale", "filiale"), Col("division", "division"), Col("base", "base"),
    Col("schStrDtUtc", "sch_str_dt_utc"), Col("schEndDtUtc", "sch_end_dt_utc"),
    Col("assignmentGroup", "assignment_group"), Col("assignment", "assignment"),
    Col("attributes", None), Col("tags", "tags"), Col("fleet", "fleet"),
    Col("durationDays", "duration_days"), Col("tafb", "tafb"),
    Col("comments", "comments"), Col("preference", "preference"),
    Col("isDeleted", "is_deleted", fmt="bool01"), Col("createdBy", "created_by"),
    Col("createdDt", "created_at"), Col("rankCombC9aP", None),
    Col("rankCombC9aC", None), Col("rankCombC9aA", None), Col("ggyBlh", "ggy_blh"),
    Col("liveId", "live_id"), Col("interfaceId", "interface_id"),
    Col("actStrDtUtc", "act_str_dt_utc"), Col("actEndDtUtc", "act_end_dt_utc"),
    Col("source", "source"), Col("tagForRequest", None),
    Col("perDiemMins", "per_diem_mins"),
    Col("perDiemMinsAdjustment", "per_diem_mins_adjustment"),
    Col("wpMins", "wp_mins"), Col("wpMinsAdjustment", "wp_mins_adjustment"),
    Col("tagSet", None), Col("manualLabel", None), Col("minAtdo", None),
    Col("minExdo", None), Col("actStartDtUtc", None), Col("actionDtUtc", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_PAIRING_COMP_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("division", "division"), Col("actingRank", "acting_rank"),
    Col("planValue", "plan"), Col("isDeleted", "is_deleted", fmt="bool01"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _pairing(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_PAIRING_COLS)} FROM pairing "
        f"WHERE id = ANY(%s) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_PAIRING_COLS, raw)


def _pairing_composition(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_PAIRING_COMP_COLS)} FROM pairing_composition "
        f"WHERE pairing_id = ANY(%s) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_PAIRING_COMP_COLS, raw)


PAIRING = SectionSpec(name="Pairing", cols=_PAIRING_COLS, custom=_pairing)
PAIRING_COMPOSITION = SectionSpec(
    name="PairingComposition", cols=_PAIRING_COMP_COLS, custom=_pairing_composition,
)

_DUTY_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("dutySeq", "duty_seq"), Col("hotelId", "duty_hotel_id"),
    Col("isDeleted", "is_deleted", fmt="bool01"), Col("assignment", "duty_assignment"),
    Col("fdpDiscretionMin", "duty_fdp_discretion_min"), Col("maxFdpMin", "duty_max_fdp_min"),
    Col("minimalRestMinutes", "duty_sch_rest_min"), Col("actualRestMinutes", "duty_act_rest_min"),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("isManualModify", "duty_is_manual_modify", fmt="bool01"),
    Col("refTz", "duty_ref_tz"), Col("etrTz", "duty_etr_tz"),
    Col("accState", "duty_acc_state"), Col("actStrDtUtc", "duty_act_str_dt_utc"),
    Col("actEndDtUtc", "duty_act_end_dt_utc"), Col("strArp", "duty_str_arp"),
    Col("endArp", "duty_end_arp"), Col("layoverNights", "duty_layover_nits"),
    Col("planFlightMinutes", "duty_sch_flt_min"), Col("planFdpMinutes", "duty_sch_fdp_min"),
    Col("actFlightMinutes", "duty_act_flt_min"), Col("actFdpMinutes", "duty_act_fdp_min"),
    Col("actualDutyMinutes", "duty_act_duty_min"),
    Col("creditedMinutes", "duty_act_credited_minutes"),
    Col("discretionType", "duty_discretion_type"), Col("comments", "duty_comments"),
    Col("trainingAddTime", "duty_training_add_time"), Col("plnWpMin", "duty_sch_wp_min"),
    Col("actWpMin", "duty_act_wp_min"), Col("wpAdjustment", "duty_wp_adjustment"),
    Col("actDpMin", "duty_act_dp_min"), Col("maxFlightMin", None),
    Col("manualFdpDiscretion", None), Col("manualDpDiscretion", None),
    Col("manualFtDiscretion", None), Col("manualRestDiscretion", None),
    Col("manualSectorDiscretion", None), Col("attribute", None),
    Col("isManualMaxFDP", "duty_is_manual_max_fdp", fmt="bool01"),
    Col("actStartDtUtc", None), Col("startAirport", "duty_str_arp"),
    Col("endAirport", "duty_end_arp"), Col("crewId", None),
    Col("actStrDtUtcLocal", None), Col("actEndDtUtcLocal", None), Col("assType", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_SEG_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("pairingDutyId", "min(id) OVER (PARTITION BY pairing_id, duty_seq)"),
    Col("dutySeq", "duty_seq"), Col("segSeq", "seg_seq"), Col("fltId", "flt_id"),
    Col("fltDt", "flt_dt"), Col("assignment", "seg_assignment"),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("rankCombC9aP", None), Col("rankCombC9aC", None), Col("rankCombC9aA", None),
    Col("actStrDtUtc", "act_str_dt_utc"), Col("actEndDtUtc", "act_end_dt_utc"),
    Col("airline", "airline"), Col("fltNum", "flt_num"), Col("depArp", "dep_arp"),
    Col("arvArp", "arv_arp"), Col("fleet", "fleet_seg"),
    Col("isDeleted", "is_deleted", fmt="bool01"),
    Col("isLongTransit", "is_long_transit", fmt="bool01"), Col("wpMins", "wp_mins_seg"),
    Col("actStartDtUtc", None), Col("depStation", "dep_arp"), Col("arvStation", "arv_arp"),
    Col("schStartDtUtc", "sch_str_dt_utc"), Col("schEndDtUtc", "sch_end_dt_utc"),
    Col("schStartDtLocal", None), Col("schEndDtLocal", None),
    Col("actStartDtLocal", None), Col("actEndDtLocal", None),
    Col("dutyCodeType", None), Col("newDutyCode", None), Col("isManual", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _pairing_duty(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT DISTINCT ON (pairing_id, duty_seq) {_reg.select_list(_DUTY_COLS)} "
        f"FROM pairing_segment WHERE pairing_id = ANY(%s) AND is_deleted = 0 "
        f"ORDER BY pairing_id, duty_seq, id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_DUTY_COLS, raw)


def _pairing_duty_segment(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_SEG_COLS)} FROM pairing_segment "
        f"WHERE pairing_id = ANY(%s) AND is_deleted = 0 ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_SEG_COLS, raw)


PAIRING_DUTY = SectionSpec(name="PairingDuty", cols=_DUTY_COLS, custom=_pairing_duty)
PAIRING_DUTY_SEGMENT = SectionSpec(
    name="PairingDutySegment", cols=_SEG_COLS, custom=_pairing_duty_segment,
)

_NODE_HEADERS = [
    "id", "scenarioId", "pairingId", "dutyId", "sequence", "type", "node",
    "fromSegmentId", "toSegmentId", "groupId", "airport", "startUtc", "endUtc",
    "preStartUtc", "crewId", "isManualModify", "schId", "lastModified", "modifiedBy",
]

def _pairing_duty_node(conn, ctx):
    # SUNSET: PairingDutyNode is no longer consumed by the solver — every pairing
    # detail it needs comes from PairingDutySegment. Emit it empty; this drops the
    # heaviest pairing query (a wide pairing_segment scan + per-duty node rebuild).
    return []


PAIRING_DUTY_NODE = SectionSpec(
    name="PairingDutyNode", cols=[Col(h) for h in _NODE_HEADERS], custom=_pairing_duty_node,
)
