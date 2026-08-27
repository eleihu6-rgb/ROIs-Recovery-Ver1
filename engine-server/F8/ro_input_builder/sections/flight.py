"""Flight + FlightComposition SectionSpecs, scoped to the scenario flight window."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_FLIGHT_COLS = [
    Col("id", "id"), Col("schId", "sch_id"), Col("fltDt", "flt_dt"),
    Col("fltDtUtc", "flt_dt_utc"), Col("airline", "airline"), Col("fltNum", "flt_num"),
    Col("suffix", "suffix"), Col("depArp", "dep_arp"),
    Col("schDepDtUtc", "sch_dep_dt_utc"), Col("arvArp", "arv_arp"),
    Col("schArvDtUtc", "sch_arv_dt_utc"), Col("price", "price"),
    Col("blkMin", "blk_min"), Col("fleet", "fleet"),
    Col("onwardFltNum", "onward_flt_num"), Col("register", "register"),
    Col("acOwner", "ac_owner"), Col("pilotOwner", "pilot_owner"),
    Col("cabinOwner", "cabin_owner"), Col("airmarshalOwner", "airmarshal_owner"),
    Col("flightFlag", "flight_flag"), Col("serviceType", "service_type"),
    Col("flightAssignment", "flight_assignment"), Col("commuteId", "commute_id"),
    Col("segType", "seg_type"), Col("fltType", "flt_type"), Col("fltSts", "flt_sts"),
    Col("fltVr", "flt_vr"), Col("estDepDtUtc", "est_dep_dt_utc"),
    Col("estArvDtUtc", "est_arv_dt_utc"), Col("actTaxiOutUtc", "act_taxi_out_utc"),
    Col("actTakeOffUtc", "act_take_off_utc"), Col("actTouchDownUtc", "act_touch_down_utc"),
    Col("actTaxiInUtc", "act_taxi_in_utc"), Col("actDepArp", "act_dep_arp"),
    Col("actDepDtUtc", "act_dep_dt_utc"), Col("actArvArp", "act_arv_arp"),
    Col("actArvDtUtc", "act_arv_dt_utc"),
    Col("voyageStatus", "voyage_status", fmt="bool01"),
    Col("isLocked", "is_locked", fmt="bool01"),
    Col("interfaceFltId", "interface_flt_id"), Col("createdBy", "created_by"),
    Col("createdDt", "created_at"), Col("vrAdd", "vr_add"), Col("liveId", "live_id"),
    Col("etdChgTm", "etd_chg_tm"), Col("fltDelayNotifyUtc", "flt_delay_notify_utc"),
    Col("fltLastDelayEtdUtc", "flt_last_delay_etd_utc"), Col("courseCode", "course_code"),
    Col("deviceCode", "device_code"), Col("flightKey", "flight_key"),
    Col("payFlyHours", "pay_fly_hours"), Col("actDoorClosedUtc", "act_door_closed_utc"),
    Col("actDoorOpenUtc", "act_door_open_utc"), Col("originFltDtUtc", "origin_flt_dt_utc"),
    Col("originInterfaceFltId", "origin_interface_flt_id"), Col("remark", "remark"),
    Col("subFleet", "sub_fleet"), Col("legNo", "leg_no"), Col("reserveSeq", None),
    Col("apisStage", "apis_stage"), Col("source", None),
    Col("isDeleted", "is_deleted", fmt="bool01"), Col("initialInterfaceFltId", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _flight(conn, ctx):
    ids = context.flight_section_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_FLIGHT_COLS)} FROM flight "
        f"WHERE id IN (SELECT unnest(%s::bigint[])) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_FLIGHT_COLS, raw)


FLIGHT = SectionSpec(name="Flight", cols=_FLIGHT_COLS, custom=_flight)


_FLIGHT_COMP_COLS = [
    Col("id", "id"), Col("pairingScenarioId", "scenario_id"), Col("fltId", "flt_id"),
    Col("division", "division"), Col("actingRank", "acting_rank"),
    Col("planValue", "plan"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _flight_composition(conn, ctx):
    ids = context.flight_section_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_FLIGHT_COMP_COLS)} FROM flight_composition "
        f"WHERE flt_id = ANY(%s) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_FLIGHT_COMP_COLS, raw)


FLIGHT_COMPOSITION = SectionSpec(
    name="FlightComposition", cols=_FLIGHT_COMP_COLS, custom=_flight_composition,
)
