"""Workset + Scenario meta sections (1 row each)."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg

_WORKSET_COLS = [
    Col("id", "id"), Col("name", "name"), Col("type", "type"),
    Col("category", "category"), Col("division", "division"),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("filiale", "filiale"), Col("lastModified", "updated_at"),
    Col("modifiedBy", "updated_by"),
]

# Scenario header has NO `id` column; starts at worksetId.
# worksetId is keyed by scenario.id (NOT scenario.workset_id): the workset table's
# id is only the association key linking a workset to its scenario — a scenario owns
# its workset 1:1 — so Workset.id == Scenario.worksetId == scenario.id.
_SCENARIO_COLS = [
    Col("worksetId", "id"), Col("version", "version"), Col("status", "status"),
    Col("processId", "process_id"), Col("strDtLoc", "str_dt_loc"),
    Col("endDtLoc", "end_dt_loc"), Col("pairingBaseIds", None),
    Col("crewMainBaseIds", None), Col("pairingRankIds", None), Col("actingRankId", None),
    Col("pairingFleetIds", None), Col("runModeIds", None), Col("fltSchId", None),
    Col("ferryId", None), Col("ruleSetId", "ruleset_id"), Col("cqfSetId", "cqfset_id"),
    Col("assignmentGroupIds", None), Col("pairingScenarioId", "pairing_scenario_id"),
    Col("paIds", None), Col("qualificationIds", None), Col("languageIds", None),
    Col("isPublic", "is_public", fmt="bool01"), Col("isFavorite", "is_favorite", fmt="bool01"),
    Col("action", "action"), Col("filterCrewCountry", None), Col("filterCrewQual", None),
    Col("filterCrewPosition", None), Col("filterCrewTeam", None),
    Col("leadInLive", "leadin_live", fmt="bool01"), Col("crewAssistantBaseIds", None),
    Col("crewRankIds", None), Col("crewFleetIds", None), Col("crewCountryIds", None),
    Col("crewSex", None), Col("crewAge", None), Col("crewTeamIds", None),
    Col("crewPositionIds", None), Col("crewBaseRelation", None), Col("crewFirstQualIds", None),
    Col("crewSecondQualIds", None), Col("crewThirdQualIds", None), Col("crewQualRelation", None),
    Col("tagIds", None), Col("rankCross", "rank_cross"), Col("comments", "comments"),
    Col("optimizedCount", "optimized_count"), Col("loadType", None), Col("division", None),
    Col("name", "(SELECT w.name FROM workset w WHERE w.id = scenario.workset_id)"), Col("category", None), Col("type", "file_type"),
    Col("inParent", None), Col("live", None), Col("jsonLive", "filter_params::text"),
    Col("isSnapShot", None), Col("isMapping", None), Col("isMappingRefresh", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _workset(conn, ctx):
    cur = conn.cursor()
    cur.execute("SELECT workset_id FROM scenario WHERE id = %s", (ctx["scenario"],))
    row = cur.fetchone()
    if not row or row[0] is None:
        cur.close()
        return []
    cur.execute(
        f"SELECT {_reg.select_list(_WORKSET_COLS)} FROM workset WHERE id = %s ORDER BY id",
        (row[0],),
    )
    raw = cur.fetchall()
    cur.close()
    rows = _reg.apply_formats(_WORKSET_COLS, raw)
    # Workset.id in ro_input is keyed by scenario.id, not workset.id — workset.id
    # only links the workset to its scenario (a scenario owns its workset 1:1), so
    # Workset.id == Scenario.worksetId == scenario.id.
    for r in rows:
        r[0] = ctx["scenario"]
    return rows


def _scenario(conn, ctx):
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_SCENARIO_COLS)} FROM scenario WHERE id = %s",
        (ctx["scenario"],),
    )
    raw = cur.fetchall()
    cur.close()
    # ruleset_id is now read directly from the scenario row (scenario.ruleset_id = workset.id).
    return _reg.apply_formats(_SCENARIO_COLS, raw)


WORKSET = SectionSpec(name="Workset", cols=_WORKSET_COLS, custom=_workset)
SCENARIO = SectionSpec(name="Scenario", cols=_SCENARIO_COLS, custom=_scenario)
