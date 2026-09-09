import rois_rule_engine_rs as rre

HOUR = 3600


def _engine(max_limits="1", min_limits="0", planned_by_rank="CA:1|FO:1"):
    return rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[2 * HOUR],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[], []],
        pairing_is_fly=[True],
        pairing_label=["P1"],
        pairing_assignment_group=["FLY"],
        pairing_assignment=["FLT"],
        crew_rank_quals=[[("CA", 0, 999999)], [("FO", 0, 999999)]],
        crew_fleet_quals=[[("737", 0, 999999)], [("737", 0, 999999)]],
        crew_qualification_sets=[["FC-GREEN"], ["FC-GREEN"]],
        crew_nationality=["CA", "CA"],
        pairing_8072_segments=[
            {
                "segment_id": "9001",
                "pairing_idx": "0",
                "duty_seq": "1",
                "seg_seq": "1",
                "flight_id": "3001",
                "flight_number": "F8001",
                "flight_date": "2026-06-01",
                "start_utc": "0",
                "end_utc": str(2 * HOUR),
                "fleet": "737",
                "dep": "YYZ",
                "arr": "YVR",
                "assignment": "FLT",
                "assignment_group": "FLY",
                "composition": "STD",
                "attributes": "*",
                "destination_country": "CA",
                "planned_by_rank": planned_by_rank,
                "filled_by_rank": "CA:0|FO:0",
            }
        ],
        min_qual_rule_rows=[
            {
                "Flight Fleets": "*",
                "Flight Assignment Groups": "FLY",
                "Crew Teams": "*",
                "Crew Nationality": "*",
                "Destination Countries": "*",
                "Acting Ranks": "*",
                "Flight Compositions": "*",
                "Required Qualifications": "FC-GREEN",
                "Attributes": "*",
                "Dep": "*",
                "Arr": "*",
                "Min Limits": min_limits,
                "Max Limits": max_limits,
            }
        ],
        enabled_functions=["8072"],
    )


def test_8072_rejects_second_qualified_crew_when_max_is_one():
    eng = _engine(max_limits="1")
    assert eng.can_add_pairing_8072(0, 0) == []
    eng.commit_pairing_8072(0, 0)

    out = eng.can_add_pairing_8072(1, 0)
    assert out == ["8072|segment=9001|qualified=2|planned=2|filled=2|min=0|max=1|over=true"]


def test_8072_allows_under_min_when_open_slot_can_still_satisfy():
    eng = _engine(max_limits="9", min_limits="2", planned_by_rank="CA:1|FO:1")

    assert eng.can_add_pairing_8072(0, 0) == []


def test_8072_rejects_under_min_when_no_open_slot_can_satisfy():
    eng = _engine(max_limits="9", min_limits="2", planned_by_rank="CA:1")

    out = eng.can_add_pairing_8072(0, 0)
    assert out == ["8072|segment=9001|qualified=1|planned=1|filled=1|min=2|max=9|over=false"]
