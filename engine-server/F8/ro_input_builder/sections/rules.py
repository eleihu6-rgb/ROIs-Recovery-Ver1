"""Rule-config SectionSpecs: RuleSet, Rule (scenario + ALL), RuleParameter
(scenario + ALL).

Rule tables are read from PostgreSQL. There rule.id is a small-int PK and the
composed legacy id is function::text||instance, which rule_set.rule_id stores;
scenario variants are scoped by scenario.ruleset_id rule_set membership.
The emitted header/column contract is identical for both sources.

RuleParameter source (PG path): re-pointed from the `rule_parameter` table
(Model B, being dropped) to `rule.param_json` (Model A — the single source of
truth the RUST solver already reads via pg_rule_params._param_rows). The
`rule_parameter` table was a stale, partial copy (last touched 2026-06-10) and
diverged from param_json for 7501/7502/7503 and was missing 2014/7272/7505/7506
entirely; param_json (last touched 2026-06-23) carries the authoritative,
complete set, so the re-pointed section reflects exactly what the solver runs.
See ``_param_rows_from_param_json`` for the flattening that reproduces the
table's row shape from param_json."""
from __future__ import annotations

import json

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_DEFAULT_RULE_WORKSET_ID = 103

# --- PostgreSQL column mappings (legacy header -> PG source expr) ---
_RULE_SET_COLS = [
    Col("id", "id"), Col("worksetId", "workset_id"), Col("ruleId", "rule_id"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

# rule.id is a small-int PK; the legacy/golden id is the composed function‖instance,
# now stored authoritatively in rule.rule_id (== rule_set.rule_id). Emit rule_id as "id".
_RULE_COLS = [
    Col("id", "rule_id"), Col("function", "function"), Col("instance", "instance"),
    Col("ruleClass", "class"), Col("description", "description"),
    Col("reference", "reference"), Col("category", "category"),
    Col("storeStructure", "store_structure"), Col("source", "source"),
    Col("detail", "detail"), Col("overridability", "overridability"),
    Col("severity", "severity"), Col("filiale", "filiale"),
    Col("division", "division"), Col("owner", "owner"), Col("locked", "locked"),
    Col("ruleApplicability", None), Col("severityColor", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_RULE_PARAM_COLS = [
    Col("id", "id"), Col("ruleId", "rule_id"), Col("phaseId", "phase_id"),
    Col("paramNames", "param_names"), Col("paramValues", "param_values"),
    Col("paramExtra", "param_extra"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

def _pg_rows(conn, cols, table, where=""):
    cur = conn.cursor()
    sql = f"SELECT {_reg.select_list(cols)} FROM {table}"
    if where:
        sql += f" WHERE {where}"
    sql += " ORDER BY id"
    cur.execute(sql)
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(cols, raw)


def _param_rows_from_param_json(rule_id, param_json, seq_start: int):
    """Flatten one rule's ``param_json`` into RuleParameter rows.

    Reproduces the exact row shape the dropped ``rule_parameter`` table held
    (verified against workset 103): one `*Row*` row per table row plus one
    `*Header` row per table, ``param_values`` = comma-joined cells.

    Labels follow the table's own convention:
      - single-table rule -> ``tableRow{r}`` ... then ``tableHeader``
      - multi-table rule  -> ``table{t}Row{r}`` ... then ``table{t}Header`` (t 1-based)
    Emit order within a rule = all rows (table, then row index), then all headers
    — matching how the table laid these out.

    Columns map to ``_RULE_PARAM_COLS`` = (id, rule_id, phase_id, param_names,
    param_values, param_extra, lastModified, modifiedBy):
      - ``id``: param_json carries no per-row id; the old table's id was an
        insertion-order artifact (and the PG path ordered by it). We assign a
        stable running sequence so the column stays populated and unique.
      - ``phase_id``: param_json has no phase; default 1 (the only value the
        table ever held for workset 103).
      - ``param_extra``: param_json has no extra; emit empty (matches the table,
        whose param_extra was always blank for these rules).
      - ``lastModified`` / ``modifiedBy``: blank, mirroring the legacy contract
        (RuleParameter leaves these empty; see _RULE_PARAM_COLS_MY).

    Returns ``(rows, next_seq)``.
    """
    if isinstance(param_json, str):
        param_json = json.loads(param_json)
    tables = (param_json or {}).get("tables", []) if param_json else []
    multi = len(tables) > 1
    rid = str(rule_id)
    seq = seq_start
    body: list[list] = []
    headers: list[list] = []
    for ti, table in enumerate(tables, start=1):
        label = f"table{ti}" if multi else "table"
        header = table.get("header", [])
        for ri, row in enumerate(table.get("rows", []), start=1):
            body.append([rid, rid, 1, f"{label}Row{ri}",
                         ",".join(str(c) for c in row), "", "", ""])
        headers.append([rid, rid, 1, f"{label}Header",
                        ",".join(str(h) for h in header), "", "", ""])
    rows = body + headers
    for r in rows:
        r[0] = seq  # stable running id (param_json has none)
        seq += 1
    return rows, seq


def _pg_param_rows_from_json(conn, where=""):
    """Build RuleParameter rows from rule.param_json (PG path).

    Replaces the old `_pg_rows(..., "rule_parameter", ...)`. Emit order:
    rule membership order (rule_set.id for the SCEN variant, rule_id for ALL),
    then param index within each rule (see _param_rows_from_param_json)."""
    cur = conn.cursor()
    if where:
        # SCEN: scope + order by rule_set membership.
        sql = (
            "SELECT r.rule_id, r.param_json FROM rule r "
            f"WHERE r.rule_id::text IN (SELECT rule_id::text FROM rule_set WHERE {where}) "
            "ORDER BY (SELECT min(rs.id) FROM rule_set rs "
            "          WHERE rs.rule_id::text = r.rule_id::text)"
        )
    else:
        # ALL: every rule, ordered by rule_id for a stable emit order.
        sql = "SELECT r.rule_id, r.param_json FROM rule r ORDER BY r.rule_id::text"
    cur.execute(sql)
    fetched = cur.fetchall()
    cur.close()
    out: list[list] = []
    seq = 1
    for rule_id, param_json in fetched:
        rows, seq = _param_rows_from_param_json(rule_id, param_json, seq)
        out.extend(rows)
    return out


def _ctx_workset_id(conn, ctx) -> int:
    try:
        if conn is not None and ctx is not None:
            resolved = context.scenario_ruleset_id(conn, ctx)
            if resolved is not None:
                return int(resolved)
    except Exception:  # noqa: BLE001 - keep env fallback for legacy/fake callers.
        pass
    return _DEFAULT_RULE_WORKSET_ID


def _ruleset(conn, ctx):
    wid = _ctx_workset_id(conn, ctx)
    return _pg_rows(conn, _RULE_SET_COLS, "rule_set", where=f"workset_id = {wid}")


def _rule_all(conn, ctx):
    return _pg_rows(conn, _RULE_COLS, "rule")


def _rule_param_all(conn, ctx):
    return _pg_param_rows_from_json(conn)


def _rule_scen(conn, ctx):
    wid = _ctx_workset_id(conn, ctx)
    # PG: associate rule ↔ rule_set on rule.rule_id (the composed id, now populated)
    # rather than rebuilding function::text || instance on the fly.
    return _pg_rows(conn, _RULE_COLS, "rule",
                    where=f"rule_id IN (SELECT rule_id FROM rule_set WHERE workset_id = {wid})")


def _rule_param_scen(conn, ctx):
    wid = _ctx_workset_id(conn, ctx)
    return _pg_param_rows_from_json(conn, where=f"workset_id = {wid}")


# Headers come from spec.cols (PG col list); legacy header names are identical
# across both sources, so the same spec.cols drive the emitted header line.
RULE_SET = SectionSpec(name="RuleSet", cols=_RULE_SET_COLS, custom=_ruleset)
RULE_ALL = SectionSpec(name="Rule", variant="ALL", cols=_RULE_COLS, custom=_rule_all)
RULE_PARAM_ALL = SectionSpec(name="RuleParameter", variant="ALL", cols=_RULE_PARAM_COLS, custom=_rule_param_all)
RULE_SCEN = SectionSpec(name="Rule", cols=_RULE_COLS, custom=_rule_scen)
RULE_PARAM_SCEN = SectionSpec(name="RuleParameter", cols=_RULE_PARAM_COLS, custom=_rule_param_scen)

# Cqf and CqfParameter: tables are empty in the current seeding (data gap),
# but sections are emitted with 0 rows; header validates the column contract.
# cqf.id is also a composed legacy id (function::text || instance) per golden.
_CQF_COLS = [
    Col("id", "function::text || instance"), Col("function", "function"), Col("instance", "instance"),
    Col("cqfClass", "class"), Col("description", "description"),
    Col("reference", "reference"), Col("category", "category"),
    Col("storeStructure", "store_structure"), Col("source", "source"),
    Col("detailDisplay", "detail_display"), Col("filiale", "filiale"),
    Col("division", "division"), Col("owner", "owner"), Col("locked", "locked"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CQF_PARAM_COLS = [
    Col("id", "id"), Col("cqfId", "cqf_id"), Col("phaseId", "phase_id"),
    Col("paramNames", "param_names"), Col("paramValues", "param_values"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

CQF = SectionSpec(name="Cqf", table="cqf", cols=_CQF_COLS, order_by="id")
CQF_PARAMETER = SectionSpec(
    name="CqfParameter", table="cqf_parameter", cols=_CQF_PARAM_COLS, order_by="id",
)
