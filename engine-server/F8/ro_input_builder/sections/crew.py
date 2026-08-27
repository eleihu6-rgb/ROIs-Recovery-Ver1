"""Crew-domain SectionSpecs (scenario + COF variants), filtered by crew-id set."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_CREW_COLS = [
    Col("crewId", "crew_id"), Col("employeeNo", "employee_no"), Col("id", "id"),
    Col("interfaceCrewId", "interface_crew_id"), Col("firstName", "first_name"),
    Col("middleName", "middle_name"), Col("lastName", "last_name"),
    Col("preferredName", "preferred_name"), Col("birthday", "birthday"),
    Col("gender", "gender"), Col("division", "division"), Col("emplDt", "empl_dt"),
    Col("retireDt", "retire_dt"), Col("termDt", "term_dt"),
    Col("seniorityNum", "seniority_num"), Col("nationality", "nationality"),
    Col("nationalId", "national_id"), Col("spouseCrewId", "spouse_crew_id"),
    Col("passportFirstName", "passport_first_name"),
    Col("passportMiddleName", "passport_middle_name"),
    Col("passportLastName", "passport_last_name"), Col("remarks", "remarks"),
    Col("filiale", "filiale"), Col("grade", "grade"), Col("status", "status"),
    Col("branchCode", "branch_code"), Col("visaType", "visa_type"),
    Col("birthCountry", "birth_country"), Col("birthPlace", "birth_place"),
    Col("birthPlaceEn", "birth_place_en"), Col("nation", "nation"),
    Col("politics", "politics"), Col("contractType", "contract_type"),
    Col("avatar", "avatar"), Col("telCountryCode", None), Col("tel", "tel"),
    Col("idCard", "id_card"), Col("emailAddr", "email_addr"),
    Col("homeAddress", "home_address"), Col("cityOfResidence", None),
    Col("countryOfResidence", None), Col("postalCode", None),
    Col("stateOfResidence", None), Col("bankAccount", None), Col("tmpName", None),
    Col("crewName", None), Col("crewDivision", None), Col("role", None),
    Col("userDepartment", None), Col("lastPublishDate", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

# The new schema split rank (crew_rank) and aircraft/fleet (crew_fleet) into separate
# tables, but the legacy CrewRank section (and the optimizer's crew-qualification
# filter, which keys on CrewRank.acType) expects the fleet on the rank row. Source
# acType/fleetGrp from the crew's crew_fleet when crew_rank's own columns are null.
_CREW_FLEET_GRP_SUBQ = (
    "(SELECT cf.fleet_grp FROM crew_fleet cf WHERE cf.crew_id = crew_rank.crew_id "
    "AND cf.fleet_grp IS NOT NULL ORDER BY cf.eff_dt DESC NULLS LAST LIMIT 1)"
)

_CREW_RANK_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"),
    Col("interfaceCrewRankId", "interface_crew_rank_id"),
    Col("acType", f"COALESCE(ac_type, {_CREW_FLEET_GRP_SUBQ})"),
    Col("fleetGrp", f"COALESCE(fleet_grp, {_CREW_FLEET_GRP_SUBQ})"),
    Col("rank", "rank"),
    Col("probationEndDt", "probation_end_dt"), Col("effDt", "eff_dt"),
    Col("expDt", "exp_dt"), Col("position", "position"),
    Col("preCumulatedExpDays", "pre_cumulated_exp_days"), Col("division", "division"),
    Col("companyRank", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_BASE_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("base", "base"),
    Col("effDt", "eff_dt"), Col("expDt", "exp_dt"),
    Col("isPrimeBase", "is_prime_base", fmt="bool01"),
    Col("interfaceCrewBaseId", "interface_crew_base_id"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_FLEET_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("fleetSpecific", "fleet_specific"),
    Col("effDt", "eff_dt"), Col("expDt", "exp_dt"), Col("acType", "ac_type"),
    Col("fleetGrp", "fleet_grp"), Col("interfaceCrewFleetId", "interface_crew_fleet_id"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_QUAL_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"),
    Col("interfaceCrewQualId", "interface_crew_qual_id"),
    Col("interfaceQualificationId", "interface_qualification_id"),
    Col("qualification", "qualification"), Col("effDt", "eff_dt"),
    Col("renewedDt", "renewed_dt"), Col("expDt", "exp_dt"),
    Col("fleetSpecific", "fleet_specific"), Col("acType", "ac_type"),
    Col("rank", "rank"), Col("position", "position"),
    Col("isValid", "is_valid", fmt="bool01"), Col("remarks", "remarks"),
    Col("displayFlag", "display_flag", fmt="bool01"),
    Col("remarkDetails", "remark_details"), Col("airport", "airport"),
    Col("trainingStatus", None), Col("projectDate", "project_date"),
    Col("recordStatus", "record_status"), Col("qualificationChangeLabel", None),
    Col("baseMonth", "base_month"), Col("qualificationGroup", None),
    Col("status", "status"), Col("remainDays", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_STATUS_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("description", "description"),
    Col("reason", "reason"), Col("status", "status"), Col("effDt", "eff_dt"),
    Col("expDt", "exp_dt"), Col("disable", "disable", fmt="bool01"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_CERT_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"),
    Col("interfaceCrewCertId", "interface_crew_cert_id"),
    Col("certificate", "certificate"), Col("certificateNo", "certificate_no"),
    Col("effDt", "eff_dt"), Col("invalidDt", "invalid_dt"), Col("expDt", "exp_dt"),
    Col("tmpIssueCountry", "tmp_issue_country"),
    Col("tmpIssueAuthority", "tmp_issue_authority"),
    Col("referenceNo", "reference_no"), Col("referenceId", "reference_id"),
    Col("isValid", "is_valid", fmt="bool01"), Col("remarks", "remarks"),
    Col("firstName", "first_name"), Col("middleName", "middle_name"),
    Col("lastName", "last_name"), Col("isPrimary", "is_primary", fmt="bool01"),
    Col("nationality", "nationality"), Col("surname", "surname"),
    Col("titleName", "title_name"), Col("givenName", "given_name"),
    Col("isCtaSend", None), Col("isMclSend", None), Col("abbr", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _id_set(kind):
    return context.scenario_crew_ids if kind == "scenario" else context.cof_crew_ids


def _make(name, table, cols, kind, variant, dated=False):
    """Build a SectionSpec that fetches all rows for the crew-id set.

    dated=True adds eff_dt/exp_dt window filtering (same semantics as the
    crew selection query in context.scenario_crew_ids): only records whose
    effective period overlaps the scenario window are exported. Use this for
    tables like crew_rank and crew_base where future or expired records must
    not appear in the solver input for the current scenario.
    """
    def _custom(conn, ctx):
        ids = _id_set(kind)(conn, ctx)
        if not ids:
            return []
        cur = conn.cursor()
        if dated:
            sc = context.get_scenario(conn, ctx)
            cur.execute(
                f"SELECT {_reg.select_list(cols)} FROM {table} "
                f"WHERE crew_id = ANY(%s)"
                f"  AND (eff_dt IS NULL OR eff_dt <= %s)"
                f"  AND (exp_dt IS NULL OR exp_dt >= %s)"
                f" ORDER BY id",
                (ids, sc["end"], sc["start"]),
            )
        else:
            cur.execute(
                f"SELECT {_reg.select_list(cols)} FROM {table} "
                f"WHERE crew_id = ANY(%s) ORDER BY id",
                (ids,),
            )
        raw = cur.fetchall()
        cur.close()
        return _reg.apply_formats(cols, raw)
    return SectionSpec(name=name, cols=cols, variant=variant, custom=_custom)


CREW_SCEN = _make("Crew", "crew", _CREW_COLS, "scenario", None)
CREW_COF = _make("Crew", "crew", _CREW_COLS, "cof", "COF")
CREW_RANK_SCEN = _make("CrewRank", "crew_rank", _CREW_RANK_COLS, "scenario", None, dated=True)
CREW_RANK_COF  = _make("CrewRank", "crew_rank", _CREW_RANK_COLS, "cof", "COF",  dated=True)
CREW_BASE_SCEN = _make("CrewBase", "crew_base", _CREW_BASE_COLS, "scenario", None, dated=True)
CREW_BASE_COF  = _make("CrewBase", "crew_base", _CREW_BASE_COLS, "cof", "COF",  dated=True)
CREW_FLEET_SCEN = _make("CrewFleet", "crew_fleet", _CREW_FLEET_COLS, "scenario", None)
CREW_FLEET_COF = _make("CrewFleet", "crew_fleet", _CREW_FLEET_COLS, "cof", "COF")
CREW_QUAL_SCEN = _make("CrewQualification", "crew_qualification", _CREW_QUAL_COLS, "scenario", None)
CREW_QUAL_COF = _make("CrewQualification", "crew_qualification", _CREW_QUAL_COLS, "cof", "COF")
CREW_STATUS_SCEN = _make("CrewStatus", "crew_status", _CREW_STATUS_COLS, "scenario", None)
CREW_STATUS_COF = _make("CrewStatus", "crew_status", _CREW_STATUS_COLS, "cof", "COF")
def _make_cert(kind, variant):
    """CrewCertificate, dropping certs that expired before the scenario start —
    a cert whose exp_dt is in the past is irrelevant to legality during the
    scenario window and only bloats the over-WAN transfer (this section is the
    single largest one). exp_dt IS NULL (no expiry) is always kept."""
    def _custom(conn, ctx):
        ids = _id_set(kind)(conn, ctx)
        if not ids:
            return []
        start = context.get_scenario(conn, ctx)["start"]
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_reg.select_list(_CREW_CERT_COLS)} FROM crew_certificate "
            f"WHERE crew_id = ANY(%s) AND (exp_dt IS NULL OR exp_dt >= %s) ORDER BY id",
            (ids, start),
        )
        raw = cur.fetchall()
        cur.close()
        return _reg.apply_formats(_CREW_CERT_COLS, raw)
    return SectionSpec(name="CrewCertificate", cols=_CREW_CERT_COLS,
                       variant=variant, custom=_custom)


CREW_CERT_SCEN = _make_cert("scenario", None)
CREW_CERT_COF = _make_cert("cof", "COF")

_CREW_TEAM_COLS = [
    Col("crewId", "crew_id"), Col("team", "team"),
    Col("effDt", "eff_dt"), Col("expDt", "exp_dt"),
    Col("isValid", "is_valid", fmt="bool01"),
    Col("id", "id"), Col("remarks", "remarks"), Col("source", "source"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

CREW_TEAM_SCEN = _make("CrewTeam", "crew_team", _CREW_TEAM_COLS, "scenario", None, dated=True)
CREW_TEAM_COF  = _make("CrewTeam", "crew_team", _CREW_TEAM_COLS, "cof", "COF",  dated=True)

_CREW_ON_FLIGHT_COLS = [
    Col("id", "id"), Col("fltId", "flt_id"), Col("crewId", "crew_id"),
    Col("actingRank", "flight_acting_rank"), Col("pairingId", "pairing_id"),
    Col("primeActivity", None), Col("assignment", "assignment"), Col("role", "role"),
    Col("subRole", "sub_role"), Col("seqOrder", "seq_order"), Col("source", "source"),
    Col("scenarioId", "scenario_id"), Col("dutyId", "duty_seq"), Col("rosterId", None),
    Col("fltDt", "flt_dt"), Col("division", "division"),
    Col("activeRank", "active_rank"), Col("position", "position"),
    Col("checkType", "check_type"), Col("tsFlag", "ts_flag"),
    Col("resourceCode", "resource_code"), Col("groupId", "group_id"),
    Col("tmProgramCourseId", "tm_program_course_id"),
    Col("parentTmProgramCourseId", "parent_tm_program_course_id"),
    Col("courseCode", "course_code"), Col("subGroupId", "sub_group_id"),
    Col("subTmProgramCourseId", "sub_tm_program_course_id"),
    Col("subParentTmProgramCourseId", "sub_parent_tm_program_id"),
    Col("subCourseCode", "sub_course_code"), Col("displayOrder", None),
    Col("isExtraCourse", "is_extra_course", fmt="bool01"), Col("remark", None),
    Col("inFlightDuty", None), Col("orderCIC", None), Col("emQuiz", None),
    Col("gender", None), Col("checkingTm", None), Col("isFirstSeg", None),
]


def _crew_on_flight(conn, ctx):
    pool = context.flight_pool_ids(conn, ctx)
    if not pool:
        return []
    # Always export P+C on the flight pool: 8030/8072 need the full physical-flight team
    # even when the scenario optimizes only one division.
    cur = conn.cursor()
    q = (f"SELECT {_reg.select_list(_CREW_ON_FLIGHT_COLS)} FROM roster_flight "
         f"WHERE scenario_id = 0 AND pairing_id IS NOT NULL AND is_deleted = 0 "
         f"AND assignment_group = 'FLY' "
         f"AND flt_id = ANY(%s) "
         f"ORDER BY id")
    cur.execute(q, [pool])
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_CREW_ON_FLIGHT_COLS, raw)


CREW_ON_FLIGHT = SectionSpec(
    name="CrewOnFlight", cols=_CREW_ON_FLIGHT_COLS, custom=_crew_on_flight,
)
