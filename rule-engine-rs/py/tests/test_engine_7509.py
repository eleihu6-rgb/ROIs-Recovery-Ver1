"""Rule 7509 incremental complement: forbidden crew pairs on one physical flight."""

import rois_rule_engine_rs as rre

DAY = 86_400
PAIRING_START = 1_785_600_000  # 2026-08-01 00:00:00 UTC


def _segment(pairing_idx: int, flight_id: int, segment_id: int) -> dict[str, str]:
    return {
        "pairing_idx": str(pairing_idx),
        "segment_id": str(segment_id),
        "duty_seq": "1",
        "seg_seq": "1",
        "flight_id": str(flight_id),
        "flight_number": "F7509",
        "flight_date": "2026-08-01",
        "start_utc": str(PAIRING_START),
        "end_utc": str(PAIRING_START + 3600),
        "fleet": "737",
        "dep": "YVR",
        "arr": "YYZ",
        "assignment": "FLY",
        "assignment_group": "FLY",
        "composition": "*",
        "attributes": "*",
        "destination_country": "CA",
        "planned_by_rank": "",
        "filled_by_rank": "",
    }


def _engine(*, fixed: list[list[int]] | None = None, enabled: list[str] | None = None):
    return rre.Engine(
        pairing_start_utc=[PAIRING_START, PAIRING_START],
        pairing_end_utc=[PAIRING_START + 6 * 3600] * 2,
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=fixed or [[], []],
        crew_ids=["1001", "2002"],
        pairing_8072_segments=[_segment(0, 7509, 1), _segment(1, 7509, 2)],
        rule7509_rows=[("1001", "2002", "2026-08-01", "2026-08-31")],
        enabled_functions=enabled or ["7509"],
    )


def test_7509_candidate_sees_committed_member_on_same_physical_flight():
    eng = _engine()
    assert eng.can_add_pairing_7509(0, 0) == []
    eng.commit_pairing_7509(0, 0)

    out = eng.can_add_pairing_7509(1, 1)
    assert len(out) == 1
    assert all(value.startswith("7509|") for value in out)
    assert any(
        "crew=2002" in value and "paired_crew=1001" in value
        for value in out
    )


def test_7509_rollback_removes_committed_member():
    eng = _engine()
    eng.commit_pairing_7509(0, 0)
    assert eng.can_add_pairing_7509(1, 1)
    eng.rollback_pairing_7509(0, 0)
    assert eng.can_add_pairing_7509(1, 1) == []


def test_7509_fixed_member_is_pa_but_candidate_still_violates():
    eng = _engine(fixed=[[0], []])
    out = eng.can_add_pairing_7509(1, 1)
    assert len(out) == 1


def test_7509_can_be_disabled_by_rule_gate():
    eng = _engine(enabled=["8030"])
    assert eng.can_add_pairing_7509(0, 0) == []
