"""Manday accounting + FatigueResult sections."""
from __future__ import annotations

from datetime import timedelta

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_MANDAY_FD_COLS = [
    Col("scenarioId", "scenario_id"), Col("crewId", "crew_id"),
    Col("crewBaseDt", "crew_base_dt"), Col("ft", "ft"), Col("augumentFt", "augument_ft"),
    Col("doubleFt", "double_ft"), Col("blh", "blh"), Col("augumentBlh", "augument_blh"),
    Col("doubleBlh", "double_blh"), Col("fdp", "fdp"), Col("dp", "dp"),
    Col("nightDp", "night_dp"), Col("travel", "travel"), Col("credit", "credit"),
    Col("fatigue", "fatigue"), Col("isLeave", "is_leave"), Col("isDayOff", "is_day_off"),
    Col("standby", "standby"), Col("actTakeOffs", "act_take_offs"),
    Col("actLandings", "act_landings"), Col("ground", "ground"),
    Col("actingRank", "acting_rank"), Col("fleet", "fleet"), Col("id", "id"),
    Col("perDiem", "per_diem"), Col("normalWp", "normal_wp"), Col("extendWp", "extend_wp"),
    Col("csb", "csb"), Col("hsb", "hsb"), Col("asb", "asb"), Col("isAl", "is_al"),
    Col("updowns", "updowns"), Col("cat2Updowns", "cat2_updowns"), Col("expBlh", "exp_blh"),
    Col("quarantine", "quarantine"), Col("custData1", "cust_data1"),
    Col("custData2", "cust_data2"), Col("highPlateau", "high_plateau"),
    Col("operatingFleets", "operating_fleets"), Col("operatingAirports", "operating_airports"),
    Col("takeoff", "takeoff"), Col("landing", "landing"), Col("isPosition", "is_position"),
    Col("workingHour", "working_hour"), Col("fleetTakeoff", "fleet_takeoff"),
    Col("fleetLanding", "fleet_landing"), Col("nightTakeoff", "night_takeoff"),
    Col("nightLanding", "night_landing"), Col("attributes", "attributes"),
    Col("intBlh", "int_blh"), Col("fltNum", "flt_num"), Col("radiationDose", None),
    Col("crossTzDutyCount", "cross_tz_duty_count"), Col("layoverTimes", "layover_times"),
    Col("layoverDuration", "layover_duration"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_MONTH_MANDAY_COLS = [
    Col("crewId", "crew_id"), Col("period", "roster_period"), Col("blh", "blh"),
    Col("fdp", "fdp"), Col("dp", "dp"), Col("highPlateau", "high_plateau"),
]

_FATIGUE_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("dutyStart", "duty_start"),
    Col("dutyEnd", "duty_end"), Col("fatigueIndex", "fatigue_index"),
    Col("rosterId", "roster_id"), Col("dutyId", "duty_id"), Col("maxSp", "max_sp"),
    Col("maxTod", "max_tod"), Col("risk", "risk"),
    Col("firstSleepStart", "first_sleep_start"), Col("firstSleepEnd", "first_sleep_end"),
    Col("secondSleepStart", "second_sleep_start"), Col("secondSleepEnd", "second_sleep_end"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _crew_manday_fd(conn, ctx):
    ids = [str(int(x)) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    history_lo = lo - timedelta(days=365)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_MANDAY_FD_COLS)} FROM crew_manday_fd_daily "
        f"WHERE scenario_id = 0 AND crew_id = ANY(%(ids)s) "
        f"AND crew_base_dt >= %(lo)s AND crew_base_dt < %(hi)s ORDER BY crew_id, crew_base_dt",
        {"ids": ids, "lo": history_lo, "hi": hi},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_MANDAY_FD_COLS, raw)


def _crew_month_manday(conn, ctx):
    ids = [str(int(x)) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_MONTH_MANDAY_COLS)} FROM crew_manday_fd_period "
        f"WHERE scenario_id = 0 AND crew_id = ANY(%(ids)s) "
        f"AND rp_start <= %(hi)s AND rp_end >= %(lo)s ORDER BY crew_id, roster_period",
        {"ids": ids, "lo": lo, "hi": hi},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_MONTH_MANDAY_COLS, raw)


CREW_MANDAY_FD = SectionSpec(name="CrewMandayFd", cols=_MANDAY_FD_COLS, custom=_crew_manday_fd)
CREW_MONTH_MANDAY = SectionSpec(
    name="CrewMonthManday", cols=_MONTH_MANDAY_COLS, custom=_crew_month_manday,
)
FATIGUE_RESULT = SectionSpec(
    name="FatigueResult", table="fatigue_result", cols=_FATIGUE_COLS, order_by="id",
)
