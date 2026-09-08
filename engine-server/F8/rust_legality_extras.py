"""F8 Rust legality Engine extras (manday / duty / segment / ground is_rest / 3007).

Shared by:
  - engine-server/F8/ro_solver_wrapper.py  (formal scenario RO)
  - rule-engine-rs/ro-tests/ro_check.py    (legality replay / debug)

Injected via rois_rule_engine_rs.set_next_engine_extras(**extras) before
RustRuleChecker / Engine construction. PyO3 fills only empty constructor fields.

Rule 3007 (FDP) is not an Engine constructor kwarg — call ``apply_fdp_3007``
after bind so ``Engine.set_fdp_3007(tsv)`` sees the dense pairing array.

Does not live in pbs-engine: solver keeps base (rules.rust); this module is
the outer complement.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any


def _tz_offset_min(iata: str, at_utc: int) -> int:
    try:
        from ColumnModelSolver_python.rules.checker import get_base_tz

        tz = get_base_tz(iata)
        at = datetime.fromtimestamp(int(at_utc), tz=timezone.utc)
        off = tz.utcoffset(at.replace(tzinfo=None))
        return int(off.total_seconds() // 60) if off is not None else 0
    except Exception:
        return 0


def _per_crew_offsets(crew_bases: list[str], timestamps: list[int]) -> list[list[int]]:
    return [[_tz_offset_min(b, ts) for ts in timestamps] for b in crew_bases]


def _assignment_bt_pct(sections: dict) -> dict[str, float]:
    result: dict[str, float] = {}
    for section_name in ("Assignment", "Assignment(Read)"):
        frame = sections.get(section_name)
        if frame is None or frame.empty:
            continue
        for _, row in frame.iterrows():
            code = str(row.get("assignment") or "").strip().upper()
            if not code:
                continue
            raw = str(row.get("btPct") or "").strip()
            if not raw:
                continue
            try:
                ratio = float(raw)
            except (TypeError, ValueError):
                continue
            if 0 <= ratio <= 1:
                result[code] = ratio
    return result


def _segment_blk_minutes(
    assignment: Any,
    pairing_assignment: Any,
    std_utc: int,
    sta_utc: int,
    assignment_bt_pct: dict[str, float],
) -> int:
    code = str(assignment or pairing_assignment or "").strip().upper()
    ratio = assignment_bt_pct.get(code)
    if ratio is None:
        return 0
    return int(max(0, sta_utc - std_utc) * ratio / 60 + 0.5)


def make_segment_params(pairings, sections: dict, crew_bases: list[str]) -> dict:
    """PairingDutySegment → segment arrays for rule 8002 manday SPAN."""
    import pandas as pd

    seg_df = sections.get("PairingDutySegment")
    if seg_df is None or seg_df.empty or "pairingId" not in seg_df.columns:
        return {}
    df = seg_df.copy()
    if "isDeleted" in df.columns:
        df = df[df["isDeleted"].astype(str).str.lower() != "true"]
    sc = "actStrDtUtc" if "actStrDtUtc" in df.columns else "actStartDtUtc"
    if sc not in df.columns or "actEndDtUtc" not in df.columns:
        return {}
    df[sc] = pd.to_datetime(df[sc], errors="coerce", utc=True)
    df["actEndDtUtc"] = pd.to_datetime(df["actEndDtUtc"], errors="coerce", utc=True)
    df = df.dropna(subset=[sc, "actEndDtUtc"])
    if df.empty:
        return {}
    assignment_bt_pct = _assignment_bt_pct(sections)
    pairing_assignments = {
        str(getattr(pairing, "original_pairing_id", None) or pairing.id): str(
            getattr(pairing, "assignment", "") or ""
        )
        for pairing in pairings
    }
    asg_col = "assignment" if "assignment" in df.columns else None
    by_pid: dict = {}
    for _, row in df.iterrows():
        pid = str(row["pairingId"])
        std = int(row[sc].timestamp())
        sta = int(row["actEndDtUtc"].timestamp())
        asg = row.get(asg_col) if asg_col else ""
        blk = _segment_blk_minutes(
            asg,
            pairing_assignments.get(pid, ""),
            std,
            sta,
            assignment_bt_pct,
        )
        ds = int(row.get("dutySeq", 0) or 0)
        ss = int(row.get("segSeq", 0) or 0)
        by_pid.setdefault(pid, []).append((ds, ss, std, sta, blk))
    by_pid_sorted = {
        pid: [(r[2], r[3], r[4]) for r in sorted(v, key=lambda x: (x[0], x[1]))]
        for pid, v in by_pid.items()
    }
    offsets = [0]
    stds: list[int] = []
    stas: list[int] = []
    blks: list[int] = []
    for p in pairings:
        pid = str(getattr(p, "original_pairing_id", None) or p.id)
        for std, sta, blk in by_pid_sorted.get(pid, []):
            stds.append(std)
            stas.append(sta)
            blks.append(blk)
        offsets.append(len(stds))
    return {
        "pairing_seg_offsets": offsets,
        "pairing_seg_std_utc": stds,
        "pairing_seg_sta_utc": stas,
        "pairing_seg_blk_min": blks,
        "pairing_seg_crew_offset_min": _per_crew_offsets(crew_bases, stds) if stds else [],
        "pairing_seg_crew_sta_offset_min": _per_crew_offsets(crew_bases, stas) if stas else [],
    }


def make_manday_params(crews, sections: dict) -> dict:
    """CrewMandayFd → crew_daily_baseline / crew_daily_metrics for rule 8002."""
    import pandas as pd

    mdf = sections.get("CrewMandayFd")
    if mdf is None or mdf.empty or "crewId" not in mdf.columns:
        return {}
    epoch = pd.Timestamp("1970-01-01", tz="UTC")

    def _num(row, key) -> float:
        try:
            return float(row.get(key) or 0)
        except (ValueError, TypeError):
            return 0.0

    baseline: dict = {}
    metrics: dict = {}
    for _, row in mdf.iterrows():
        cid = str(row.get("crewId", ""))
        if not cid:
            continue
        ts = pd.to_datetime(str(row.get("crewBaseDt", "")), errors="coerce")
        if pd.isna(ts):
            continue
        ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
        day_ord = int((ts.normalize() - epoch).days)
        blh = _num(row, "blh")
        if blh != 0.0:
            baseline.setdefault(cid, []).append((day_ord, blh))
        sby = 1.0 if str(row.get("standby") or "").strip().lower() in ("true", "1") else 0.0
        vals = [
            blh,
            _num(row, "ft"),
            _num(row, "dp"),
            _num(row, "credit"),
            sby,
            _num(row, "intBlh"),
            _num(row, "augumentBlh"),
            _num(row, "custData1"),
            _num(row, "crossTzDutyCount"),
        ]
        if any(v != 0.0 for v in vals):
            metrics.setdefault(cid, []).append((day_ord, vals))
    return {
        "crew_daily_baseline": [baseline.get(str(c.id), []) for c in crews],
        "crew_daily_metrics": [metrics.get(str(c.id), []) for c in crews],
    }


def make_duty_params(pairings, sections: dict, crew_bases: list[str]) -> dict:
    """PairingDuty → duty arrays for 7501/7503/7504 and 8002 CH blk/dp."""
    import pandas as pd

    pdf = sections.get("PairingDuty")
    if pdf is None or pdf.empty or "pairingId" not in pdf.columns:
        return {}
    df = pdf.copy()
    if "isDeleted" in df.columns:
        df = df[df["isDeleted"].astype(str).str.lower() != "true"]
    sc = "actStrDtUtc" if "actStrDtUtc" in df.columns else "actStartDtUtc"
    if sc not in df.columns or "actEndDtUtc" not in df.columns:
        return {}
    df[sc] = pd.to_datetime(df[sc], errors="coerce", utc=True)
    df["actEndDtUtc"] = pd.to_datetime(df["actEndDtUtc"], errors="coerce", utc=True)
    df = df.dropna(subset=[sc, "actEndDtUtc"])
    if df.empty:
        return {}
    dep_col = next((c for c in ["strArp", "startAirport"] if c in df.columns), None)
    arv_col = next((c for c in ["endArp", "endAirport"] if c in df.columns), None)
    by_pid: dict = {}
    for _, row in df.iterrows():
        pid = str(row["pairingId"])
        st = int(row[sc].timestamp())
        en = int(row["actEndDtUtc"].timestamp())
        if en <= st:
            continue
        dep = str(row.get(dep_col) if dep_col else "") or ""
        arv = str(row.get(arv_col) if arv_col else "") or ""
        try:
            dp = int(row.get("actualDutyMinutes") or 0)
        except (ValueError, TypeError):
            dp = 0
        try:
            credit = int(row.get("creditedMinutes") or 0)
        except (ValueError, TypeError):
            credit = 0
        try:
            blk = int(row.get("actFlightMinutes") or 0)
        except (ValueError, TypeError):
            blk = 0
        try:
            seq = int(row.get("dutySeq") or 0)
        except (ValueError, TypeError):
            seq = 0
        by_pid.setdefault(pid, []).append((seq, st, en, dep, arv, dp, credit, blk))
    by_pid_sorted = {
        pid: [(r[1], r[2], r[3], r[4], r[5], r[6], r[7]) for r in sorted(v, key=lambda x: x[0])]
        for pid, v in by_pid.items()
    }
    offsets = [0]
    starts: list[int] = []
    ends: list[int] = []
    dep_tz: list[int] = []
    arr_tz: list[int] = []
    dp_min: list[int] = []
    credit_min: list[int] = []
    blk_min: list[int] = []
    for p in pairings:
        pid = str(getattr(p, "original_pairing_id", None) or p.id)
        for st, en, dep, arv, dp, credit, blk in by_pid_sorted.get(pid, []):
            starts.append(st)
            ends.append(en)
            dep_tz.append(_tz_offset_min(dep, st))
            arr_tz.append(_tz_offset_min(arv, en))
            dp_min.append(dp)
            credit_min.append(credit)
            blk_min.append(blk)
        offsets.append(len(starts))
    return {
        "pairing_duty_offsets": offsets,
        "pairing_duty_start_utc": starts,
        "pairing_duty_end_utc": ends,
        "pairing_duty_dep_tz_min": dep_tz,
        "pairing_duty_arr_tz_min": arr_tz,
        "pairing_duty_dp_min": dp_min,
        "pairing_duty_blk_min": blk_min,
        "pairing_duty_credit_min": credit_min,
        "pairing_duty_crew_offset_min": _per_crew_offsets(crew_bases, starts) if starts else [],
    }


def make_ground_is_rest_params(crews, sections: dict) -> dict:
    """crew.preassign_tasks[j].assignment → is_rest (rule 7501 SDFD).

    Walks crew.preassign_tasks in the same order as rust_checker / loader.
    Authoritative: Assignment.isRest; legacy fallback: type in {L, O}.
    """
    rest_map: dict = {}
    adf = sections.get("Assignment")
    if adf is not None and not getattr(adf, "empty", True):
        code_col = (
            "assignment"
            if "assignment" in adf.columns
            else ("code" if "code" in adf.columns else None)
        )
        if code_col is not None:
            has_is_rest = "isRest" in adf.columns
            for _, row in adf.iterrows():
                code = str(row.get(code_col) or "").strip()
                if not code:
                    continue
                if has_is_rest:
                    rest_map[code] = str(row.get("isRest") or "").strip().lower() in (
                        "true",
                        "1",
                    )
                else:
                    rest_map[code] = str(row.get("type") or "").strip().upper() in (
                        "L",
                        "O",
                    )

    is_rest = []
    for crew in crews:
        tasks = getattr(crew, "preassign_tasks", None) or []
        is_rest.append(
            [
                rest_map.get(str(getattr(t, "assignment", "") or ""), False)
                for t in tasks
            ]
        )
    return {"crew_ground_is_rest": is_rest}


def _id_str(val: Any) -> str:
    if val is None:
        return ""
    try:
        import pandas as pd

        if pd.isna(val):
            return ""
    except Exception:
        pass
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    text = str(val).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def _cell(val: Any) -> str:
    return _id_str(val).replace("\t", " ").replace("\n", " ")


def _header_index(header: list[str], *names: str) -> int:
    upper = [h.strip().upper() for h in header]
    for name in names:
        needle = name.strip().upper()
        if needle in upper:
            return upper.index(needle)
    return -1


def _active_rule_ids(sections: dict) -> set[str]:
    frame = sections.get("RuleSet")
    if frame is None or getattr(frame, "empty", True) or "ruleId" not in getattr(frame, "columns", []):
        return set()
    return {_id_str(val) for val in frame["ruleId"] if _id_str(val)}


def _rule_ids_for_function(sections: dict, function: str) -> list[str]:
    frame = sections.get("Rule")
    if frame is None or getattr(frame, "empty", True):
        return []
    if "id" not in frame.columns or "function" not in frame.columns:
        return []
    wanted = str(function).strip()
    ids: list[str] = []
    for _, row in frame.iterrows():
        fn = _id_str(row.get("function"))
        if fn != wanted:
            continue
        rid = _id_str(row.get("id"))
        if rid:
            ids.append(rid)
    active = _active_rule_ids(sections)
    if active:
        ids = [rid for rid in ids if rid in active]
    return ids


def _param_table(sections: dict, rule_id: str) -> tuple[list[str], list[list[str]]]:
    frame = sections.get("RuleParameter")
    if frame is None or getattr(frame, "empty", True):
        return [], []
    if "ruleId" not in frame.columns:
        return [], []
    header: list[str] = []
    indexed: list[tuple[int, list[str]]] = []
    for _, row in frame.iterrows():
        if _id_str(row.get("ruleId")) != rule_id:
            continue
        pname = str(row.get("paramNames") or "").strip()
        pvals = [part.strip() for part in str(row.get("paramValues") or "").split(",")]
        if pname.endswith("Header"):
            header = pvals
        elif "Row" in pname:
            match = re.search(r"Row(\d+)$", pname)
            idx = int(match.group(1)) if match else len(indexed) + 1
            indexed.append((idx, pvals))
    indexed.sort(key=lambda item: item[0])
    return header, [vals for _, vals in indexed]


def _utc_secs(val: Any) -> int | None:
    if val is None or val == "":
        return None
    try:
        import pandas as pd

        ts = pd.to_datetime(val, errors="coerce", utc=True)
        if pd.isna(ts):
            return None
        return int(ts.timestamp())
    except Exception:
        return None


def _fdp_cell(val: Any) -> str:
    if val is None or val == "":
        return ""
    try:
        import pandas as pd

        if pd.isna(val):
            return ""
    except Exception:
        pass
    try:
        return str(int(float(val)))
    except (TypeError, ValueError):
        return ""


def _is_yes(val: Any) -> bool:
    return str(val or "").strip().lower() in ("1", "true", "y", "yes")


def _field(header: list[str], row: list[str], name: str, default: str = "") -> str:
    idx = _header_index(header, name)
    if idx < 0 or idx >= len(row):
        return default
    text = row[idx].strip()
    return text if text else default


def make_fdp_3007_tsv(pairings, sections: dict) -> str:
    """Tagged TSV for ``Engine.set_fdp_3007``. ``D.pairing_id`` = Engine dense index.

    Empty string when the active RuleSet has no 3007 param rows (do not enable 3007).
    """
    headers_rows: list[tuple[list[str], list[list[str]]]] = []
    for rid in _rule_ids_for_function(sections, "3007"):
        header, rows = _param_table(sections, rid)
        if header and _header_index(header, "MAX FDP") >= 0 and rows:
            headers_rows.append((header, rows))
    if not headers_rows:
        return ""

    lines: list[str] = [
        "B\tINCLUDE CHECK IN\tY",
        "B\tINCLUDE CHECK OUT\tN",
    ]
    for rid in _rule_ids_for_function(sections, "2107"):
        header, rows = _param_table(sections, rid)
        def_i = _header_index(header, "DEFINITION")
        val_i = _header_index(header, "VALUE")
        if def_i < 0 or val_i < 0:
            continue
        for row in rows:
            definition = row[def_i].strip() if def_i < len(row) else ""
            value = row[val_i].strip() if val_i < len(row) else ""
            if definition:
                lines.append(f"B\t{_cell(definition)}\t{_cell(value)}")

    cio = False
    for rid in _rule_ids_for_function(sections, "3010"):
        header, rows = _param_table(sections, rid)
        if not rows:
            continue
        brief = _field(header, rows[0], "BRIEF", "60")
        debrief = _field(header, rows[0], "DEBRIEF", "15")
        lines.append(f"C\t{_cell(brief)}\t{_cell(debrief)}")
        cio = True
        break
    if not cio:
        lines.append("C\t60\t15")

    for rid in _rule_ids_for_function(sections, "2102"):
        header, rows = _param_table(sections, rid)
        for row in rows:
            lines.append(
                "\t".join(
                    [
                        "T",
                        _cell(_field(header, row, "INBOUND", "*")),
                        _cell(_field(header, row, "OUTBOUND", "*")),
                        _cell(_field(header, row, "AIRPORT", "*")),
                        _cell(_field(header, row, "FLEETS", "*")),
                        _cell(_field(header, row, "MAX TURNTIME", "02:00")),
                        _cell(_field(header, row, "PSEUDO BRIEF", "00:20")),
                        _cell(_field(header, row, "PSEUDO DEBRIEF", "00:15")),
                        _cell(_field(header, row, "PSEUDO PICK UP", "00:00")),
                        _cell(_field(header, row, "PSEUDO DROP OFF", "00:00")),
                        _cell(_field(header, row, "IS SPLIT DUTY", "Y")),
                    ]
                )
            )

    asg_codes: set[str] = set()
    for section_name in ("Assignment", "Assignment(Read)"):
        frame = sections.get(section_name)
        if frame is None or getattr(frame, "empty", True):
            continue
        code_col = "assignment" if "assignment" in frame.columns else None
        pct_col = "fdpPct" if "fdpPct" in frame.columns else None
        if not code_col or not pct_col:
            continue
        for _, row in frame.iterrows():
            code = str(row.get(code_col) or "").strip().upper()
            raw = str(row.get(pct_col) or "").strip()
            if not code or not raw:
                continue
            try:
                pct = float(raw)
            except (TypeError, ValueError):
                continue
            asg_codes.add(code)
            lines.append(f"A\t{_cell(code)}\t{pct}\t{_cell(code)}")
    if "FLY" not in asg_codes:
        lines.append("A\tFLY\t1.0\tFLY")

    for header, rows in headers_rows:
        lines.append("\t".join(["H", *(_cell(h) for h in header)]))
        for row_index, row in enumerate(rows):
            lines.append("\t".join(["R", str(row_index), *(_cell(v) for v in row)]))

    pairing_idx = {
        str(getattr(pairing, "original_pairing_id", None) or pairing.id): i
        for i, pairing in enumerate(pairings)
    }
    pairing_group = {
        str(getattr(pairing, "original_pairing_id", None) or pairing.id): str(
            getattr(pairing, "assignment_group", None)
            or getattr(pairing, "assignment", "")
            or "FLY"
        ).strip()
        or "FLY"
        for pairing in pairings
    }

    duty_df = sections.get("PairingDuty")
    seg_df = sections.get("PairingDutySegment")
    if (
        duty_df is None
        or getattr(duty_df, "empty", True)
        or "pairingId" not in duty_df.columns
        or seg_df is None
        or getattr(seg_df, "empty", True)
        or "pairingId" not in seg_df.columns
    ):
        return "\n".join(lines) + "\n"

    duties = duty_df.copy()
    segs = seg_df.copy()
    if "isDeleted" in duties.columns:
        duties = duties[duties["isDeleted"].astype(str).str.lower() != "true"]
    if "isDeleted" in segs.columns:
        segs = segs[segs["isDeleted"].astype(str).str.lower() != "true"]

    segs_by_duty: dict[tuple[str, int], list] = {}
    for _, row in segs.iterrows():
        pid = _id_str(row.get("pairingId"))
        try:
            duty_seq = int(row.get("dutySeq") or 0)
            seg_seq = int(row.get("segSeq") or 0)
        except (TypeError, ValueError):
            continue
        if not pid or duty_seq <= 0:
            continue
        segs_by_duty.setdefault((pid, duty_seq), []).append((seg_seq, row))

    for _, row in duties.iterrows():
        pid = _id_str(row.get("pairingId"))
        idx = pairing_idx.get(pid)
        if idx is None:
            continue
        try:
            duty_seq = int(row.get("dutySeq") or 0)
        except (TypeError, ValueError):
            continue
        duty_segs = [item[1] for item in sorted(segs_by_duty.get((pid, duty_seq), []), key=lambda x: x[0])]
        if not duty_segs:
            continue
        first = duty_segs[0]
        last = duty_segs[-1]
        start_act = _utc_secs(first.get("actStrDtUtc") if "actStrDtUtc" in first.index else first.get("actStartDtUtc"))
        end_act = _utc_secs(last.get("actEndDtUtc"))
        if start_act is None or end_act is None:
            continue
        group = str(row.get("assignment") or "").strip().upper()
        if group not in ("FLY", "RES", "GRD"):
            group = pairing_group.get(pid, "FLY")
        key = f"{idx}:{duty_seq}"
        lines.append(
            "\t".join(
                [
                    "D",
                    key,
                    "",
                    str(idx),
                    str(duty_seq),
                    group or "FLY",
                    _fdp_cell(row.get("planFdpMinutes")),
                    "0",
                    "",
                    "",
                    str(start_act),
                    str(start_act),
                    str(start_act),
                    str(end_act),
                    "Y" if _is_yes(row.get("isManualModify")) else "N",
                    _fdp_cell(row.get("fdpDiscretionMin")) or "0",
                ]
            )
        )
        for seg in duty_segs:
            seg_start = _utc_secs(seg.get("actStrDtUtc") if "actStrDtUtc" in seg.index else seg.get("actStartDtUtc"))
            seg_end = _utc_secs(seg.get("actEndDtUtc"))
            if seg_start is None or seg_end is None:
                continue
            sch_start = _utc_secs(seg.get("schStartDtUtc")) or seg_start
            sch_end = _utc_secs(seg.get("schEndDtUtc")) or seg_end
            asg = str(seg.get("assignment") or "FLY").strip() or "FLY"
            lines.append(
                "\t".join(
                    [
                        "S",
                        key,
                        _cell(seg.get("fltId") or 0),
                        _cell(asg),
                        str(seg_start),
                        str(seg_end),
                        str(sch_start),
                        str(sch_end),
                        "0",
                        "Y",
                        "",
                        _cell(seg.get("depArp") or seg.get("depStation") or ""),
                        _cell(seg.get("arvArp") or seg.get("arvStation") or ""),
                        _cell(seg.get("fleet") or ""),
                        "",
                        "*",
                    ]
                )
            )

    return "\n".join(lines) + "\n"


def apply_fdp_3007(engine, tsv: str) -> None:
    """Load 3007 after Engine construction. No-op when TSV is empty."""
    if not (tsv or "").strip():
        return
    if engine is None:
        raise RuntimeError("set_fdp_3007: Engine missing after bind_problem")
    setter = getattr(engine, "set_fdp_3007", None)
    if setter is None:
        raise AttributeError(
            "rois_rule_engine_rs.Engine.set_fdp_3007 is missing; rebuild the PyO3 wheel"
        )
    setter(tsv)


def _engine_from_checker(checker):
    return getattr(checker, "_engine", None) or getattr(checker, "engine", None)


def align_store_for_rust_checker(problem, ro_input_path) -> tuple[list, list, list[str]]:
    """Return (crews, pairings, crew_bases) for extras in Engine dense-index order.

    Important: ``problem.pairings`` is composition-expanded (e.g. ``10014_CA`` /
    ``10014_FO`` → many rows sharing one ``original_pairing_id``). Legality
    Engine + PairingDuty/Segment use **unique original pairing ids** (full
    legal universe), not the expanded optimizer slots.

    Example on F8 ro_input: len(problem.pairings)=1736, unique originals=411,
    Engine n=411. Building duty offsets by iterating the expanded list yields
    length 1737 (wrong duplicates); Engine requires offsets length n+1=412.

    This helper does **not** shrink to an "open for optimization" subset — it
    dedupes to the full original-pairing universe and order that
    ``RustRuleChecker._build_engine`` uses.
    """
    from pathlib import Path
    from types import SimpleNamespace

    try:
        from ColumnModelSolver_python.rules.rust.checker import parse_ro_input
        from ColumnModelSolver_python.rules.rust.engine_builder import (
            _extract_crew_info,
            _extract_rosters,
            extract_assignment_types,
            extract_pairing_data,
        )
    except ModuleNotFoundError:  # pragma: no cover - compatibility with older SIT pbs-engine deploys
        from ColumnModelSolver_python.rules.rust_checker import (
            _extract_assignment_types as extract_assignment_types,
            _extract_crew_info,
            _extract_pairing_data as extract_pairing_data,
            _extract_rosters,
            _parse_ro_input as parse_ro_input,
        )

    sections = parse_ro_input(Path(ro_input_path))
    assignment_types = extract_assignment_types(sections)
    pairing_info, _, _ = extract_pairing_data(sections, assignment_types)
    crew_info = _extract_crew_info(sections)
    crew_fixed_pids = _extract_rosters(sections)

    active_crew_ids = [str(c.id) for c in problem.crews if str(c.id) in crew_info]
    if not active_crew_ids:
        active_crew_ids = [str(c.id) for c in problem.crews]
    crew_by_id = {str(c.id): c for c in problem.crews}
    crews = [crew_by_id[cid] for cid in active_crew_ids if cid in crew_by_id]

    # Unique original pairing ids (full legal universe), including Roster PA.
    active_pairing_ids = {
        str(getattr(p, "original_pairing_id", "") or p.id) for p in problem.pairings
    }
    all_pairing_ids = set(active_pairing_ids)
    for crew_id in active_crew_ids:
        all_pairing_ids.update(crew_fixed_pids.get(crew_id, []))
    valid_pairing_ids = sorted(
        pid
        for pid in all_pairing_ids
        if pid in pairing_info and pairing_info[pid]["start"] and pairing_info[pid]["end"]
    )
    pairings = [
        SimpleNamespace(id=pid, original_pairing_id=pid) for pid in valid_pairing_ids
    ]
    crew_bases = [str(getattr(c, "base", "") or "") for c in crews]
    return crews, pairings, crew_bases


def build_engine_extras(
    crews,
    pairings,
    sections: dict,
    crew_bases: list[str] | None = None,
) -> dict[str, Any]:
    """Merge all F8 RO extras for set_next_engine_extras."""
    if crew_bases is None:
        crew_bases = [str(getattr(c, "base", "") or "") for c in crews]
    return {
        **make_segment_params(pairings, sections, crew_bases),
        **make_manday_params(crews, sections),
        **make_duty_params(pairings, sections, crew_bases),
        **make_ground_is_rest_params(crews, sections),
    }
