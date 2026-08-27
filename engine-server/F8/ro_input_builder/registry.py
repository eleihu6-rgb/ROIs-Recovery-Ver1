"""SectionSpec registry + SQL builder for the ro_input builder."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from . import emitter


@dataclass
class Col:
    legacy: str                 # output header name (camelCase legacy)
    db: Optional[str] = None    # source snake_case column; None => emit empty
    fmt: Optional[str] = None   # 'bool01' or None


@dataclass
class SectionSpec:
    name: str
    cols: list[Col]
    table: Optional[str] = None
    where: str = ""
    order_by: str = ""
    variant: Optional[str] = None
    custom: Optional[Callable] = None   # custom(conn, ctx) -> list[list]; overrides table


def select_list(cols: list[Col]) -> str:
    return ", ".join(c.db if c.db else "NULL" for c in cols)


def build_query(spec: SectionSpec) -> str:
    q = f"SELECT {select_list(spec.cols)} FROM {spec.table}"
    if spec.where:
        q += f" WHERE {spec.where}"
    if spec.order_by:
        q += f" ORDER BY {spec.order_by}"
    return q


def apply_formats(cols: list[Col], raw_rows) -> list[list]:
    """Apply per-column formatting.

    When a Col has no fmt and the value is a plain Python int or float,
    the value is returned as-is (not coerced to str).  All other types —
    datetime, date, Decimal, None, str — and any column with an explicit
    fmt are processed by emitter.format_value.
    """
    from datetime import datetime, date
    from decimal import Decimal

    out = []
    for row in raw_rows:
        formatted = []
        for v, c in zip(row, cols):
            if c.fmt is None and isinstance(v, (int, float)) and not isinstance(v, bool):
                formatted.append(v)
            else:
                formatted.append(emitter.format_value(v, c.fmt))
        out.append(formatted)
    return out


def run_section(conn, spec: SectionSpec, ctx=None) -> str:
    """Execute a spec against the DB and return its emitted section text."""
    headers = [c.legacy for c in spec.cols]
    if spec.custom is not None:
        rows = spec.custom(conn, ctx)
        return emitter.emit_section(spec.name, spec.variant, headers, rows)
    cur = conn.cursor()
    cur.execute(build_query(spec))
    raw = cur.fetchall()
    cur.close()
    rows = apply_formats(spec.cols, raw)
    return emitter.emit_section(spec.name, spec.variant, headers, rows)


def _snapshot_cols(section_name: str) -> list[str]:
    from .sections import passthrough as pt
    from . import golden
    secs = golden.parse_file(pt._SNAPSHOT)
    return secs[section_name].columns


def p1_registry() -> list[SectionSpec]:
    """Ordered P1 sections: clean-map + static-passthrough. Order is provisional;
    full golden order is fixed in P8 assembly."""
    from .sections import reference as ref
    from .sections import passthrough as pt
    clean = [
        ref.AIRPORT, ref.FLEET, ref.BASE, ref.RANK, ref.RANK_ACTING, ref.RANK_POSITION,
        ref.COMPOSITION, ref.COMPOSITION_RANK, ref.TEAM, ref.DICTIONARY,
        ref.SYSTEM_PARAMETER, ref.ASSIGNMENT, ref.ASSIGNMENT_GROUP,
        ref.ASSIGNMENT_GROUP_MAP, ref.PANE_HEADER, ref.ROSTER_PERIOD,
    ]
    passthru = [
        SectionSpec(name=n, cols=[Col(c) for c in _snapshot_cols(n)],
                    custom=pt.make_custom(n))
        for n in pt.PASSTHROUGH_SECTIONS
    ]
    return clean + passthru


def p2_registry() -> list[SectionSpec]:
    """P1 sections plus the P2 crew domain (scenario + COF variants + CrewOnFlight).
    Order is provisional; full golden order is fixed in P8 assembly."""
    from .sections import crew as cw
    crew_specs = [
        cw.CREW_SCEN, cw.CREW_RANK_SCEN, cw.CREW_BASE_SCEN, cw.CREW_FLEET_SCEN,
        cw.CREW_QUAL_SCEN, cw.CREW_STATUS_SCEN, cw.CREW_CERT_SCEN, cw.CREW_TEAM_SCEN, cw.CREW_ON_FLIGHT,
        cw.CREW_COF, cw.CREW_RANK_COF, cw.CREW_BASE_COF, cw.CREW_FLEET_COF,
        cw.CREW_QUAL_COF, cw.CREW_STATUS_COF, cw.CREW_CERT_COF, cw.CREW_TEAM_COF,
    ]
    return p1_registry() + crew_specs


def p3_registry() -> list[SectionSpec]:
    """P2 sections plus Flight + FlightComposition. Order provisional (P8 fixes it)."""
    from .sections import flight as fl
    return p2_registry() + [fl.FLIGHT, fl.FLIGHT_COMPOSITION]


def p4_registry() -> list[SectionSpec]:
    """P3 sections plus rule config (RuleSet, Rule scenario+ALL, RuleParameter
    scenario+ALL, Cqf, CqfParameter). Order provisional (P8 fixes it)."""
    from .sections import rules as ru
    return p3_registry() + [
        ru.RULE_SET, ru.RULE_SCEN, ru.RULE_ALL, ru.RULE_PARAM_SCEN,
        ru.RULE_PARAM_ALL, ru.CQF, ru.CQF_PARAMETER,
    ]


def p5_registry() -> list[SectionSpec]:
    """P4 sections plus the pairing layer. Order provisional (P8 fixes it)."""
    from .sections import pairing as pa
    return p4_registry() + [
        pa.PAIRING, pa.PAIRING_COMPOSITION, pa.PAIRING_DUTY,
        pa.PAIRING_DUTY_SEGMENT, pa.PAIRING_DUTY_NODE,
    ]


def p6_registry() -> list[SectionSpec]:
    """P5 sections plus the roster layer. Order provisional (P8 fixes it)."""
    from .sections import roster as ro
    return p5_registry() + [ro.ROSTER_FLIGHT, ro.ROSTER_GROUND, ro.ROSTER]


def p7_registry() -> list[SectionSpec]:
    """P6 sections plus manday + scenario meta. Order provisional (P8 fixes it)."""
    from .sections import manday as md
    from .sections import meta as mt
    return p6_registry() + [
        md.CREW_MANDAY_FD, md.CREW_MONTH_MANDAY, md.FATIGUE_RESULT,
        mt.WORKSET, mt.SCENARIO,
    ]


def _passthrough_spec(name: str) -> SectionSpec:
    from .sections import passthrough as pt
    return SectionSpec(name=name, cols=[Col(c) for c in _snapshot_cols(name)],
                       custom=pt.make_custom(name))


def full_registry() -> list[SectionSpec]:
    """All 61 sections in exact golden order (the production assembly)."""
    from .sections import reference as ref, crew as cw, flight as fl
    from .sections import rules as ru, pairing as pa, roster as ro
    from .sections import manday as md, meta as mt
    return [
        mt.WORKSET, md.CREW_MANDAY_FD, md.CREW_MONTH_MANDAY, fl.FLIGHT,
        fl.FLIGHT_COMPOSITION, mt.SCENARIO,
        cw.CREW_SCEN, cw.CREW_RANK_SCEN, cw.CREW_BASE_SCEN, cw.CREW_FLEET_SCEN,
        cw.CREW_QUAL_SCEN, cw.CREW_STATUS_SCEN, cw.CREW_CERT_SCEN, cw.CREW_TEAM_SCEN, cw.CREW_ON_FLIGHT,
        ref.ROSTER_PERIOD,
        cw.CREW_COF, cw.CREW_RANK_COF, cw.CREW_BASE_COF, cw.CREW_FLEET_COF,
        cw.CREW_QUAL_COF, cw.CREW_STATUS_COF, cw.CREW_CERT_COF, cw.CREW_TEAM_COF,
        ro.ROSTER_GROUND, pa.PAIRING, pa.PAIRING_COMPOSITION, pa.PAIRING_DUTY,
        pa.PAIRING_DUTY_SEGMENT, pa.PAIRING_DUTY_NODE,
        ref.AIRPORT_CLIENT, _passthrough_spec("City"), ref.AIRPORT,
        ref.ASSIGNMENT_GROUP, ref.ASSIGNMENT, ref.ASSIGNMENT_READ,
        ref.ASSIGNMENT_GROUP_MAP, _passthrough_spec("AssignmentOverlappable"),
        _passthrough_spec("GuaranteeFlyHours"), _passthrough_spec("CalculationManday"),
        ref.FLEET, ref.BASE, ref.COMPOSITION, ref.COMPOSITION_RANK, ref.RANK,
        ref.RANK_ACTING, _passthrough_spec("RankCombinationCriteria"),
        _passthrough_spec("RankCombination"), ref.SYSTEM_PARAMETER, ref.DICTIONARY,
        ru.RULE_SET, ru.RULE_SCEN, ru.CQF, ru.CQF_PARAMETER, ru.RULE_PARAM_SCEN,
        ru.RULE_ALL, ru.RULE_PARAM_ALL,
        ref.PANE_HEADER, ref.TEAM, ro.ROSTER_FLIGHT, ro.ROSTER, md.FATIGUE_RESULT,
        ref.RANK_POSITION,
    ]
