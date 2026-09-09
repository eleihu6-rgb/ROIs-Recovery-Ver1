import rois_rule_engine_rs as rre

HOUR = 3600

_DOMO_KIN_RULE = {
    "Bases": "*",
    "Ranks": "*",
    "Fleets": "*",
    "Crew Teams": "DOMO",
    "Labels": "*",
    "Attributes": "*",
    "Override Duty Attributes": "*",
    "Assignment Groups": "FLY",
    "Assignments": "*",
    "Qualifiers": "*",
    "Flights": "*",
    "Destinations": "ATW|CUN|FLL|GDL|GOH|KIN|MEX",
    "Countries": "",
    "Positions": "*",
    "Period": "1",
    "Unit": "RP",
    "Max Times": "0",
    "Min Times": "0",
    "Check Mode": "*",
}

_KIN_SEGMENT = {
    "pairing_idx": "0",
    "segment_id": "1",
    "duty_seq": "3",
    "seg_seq": "1",
    "flight_id": "15931",
    "flight_number": "2650",
    "flight_date": "1970-01-01",
    "start_utc": "0",
    "end_utc": str(4 * HOUR),
    "fleet": "7M8",
    "dep": "YYZ",
    "arr": "KIN",
    "assignment": "FLY",
    "assignment_group": "FLY",
    "composition": "*",
    "attributes": "*",
    "destination_country": "",
    "planned_by_rank": "",
    "filled_by_rank": "",
}


def _engine_with_segment(*, destinations: str, arr: str) -> rre.Engine:
    segment = {**_KIN_SEGMENT, "arr": arr}
    rule = {**_DOMO_KIN_RULE, "Destinations": destinations}
    return rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[4 * HOUR],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_label=["C4131"],
        pairing_assignment_group=["FLY"],
        pairing_airport=[""],
        crew_teams=[["DOMO"]],
        roster_periods=[(0, 30 * 86400 - 1)],
        checked_window=(0, 30 * 86400 - 1),
        pairing_8072_segments=[segment],
        roster_property_rule_rows=[rule],
        enabled_functions=["8071"],
    )


def _engine_with_countries(*, countries: str, segments: list[dict[str, str]]) -> rre.Engine:
    rule = {**_DOMO_KIN_RULE, "Countries": countries}
    return rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[4 * HOUR],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True],
        pairing_label=["C4131"],
        pairing_assignment_group=["FLY"],
        pairing_airport=[""],
        crew_teams=[["DOMO"]],
        roster_periods=[(0, 30 * 86400 - 1)],
        checked_window=(0, 30 * 86400 - 1),
        pairing_8072_segments=segments,
        roster_property_rule_rows=[rule],
        enabled_functions=["8071"],
    )


def test_8071_check_line_rejects_candidate_that_exceeds_roster_property_max():
    eng = rre.Engine(
        pairing_start_utc=[0, 10 * HOUR],
        pairing_end_utc=[2 * HOUR, 12 * HOUR],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_label=["A", "B"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_assignment=["FLT", "FLT"],
        crew_base_quals=[[("YYZ", 0, 999999)]],
        crew_rank_quals=[[("CA", 0, 999999)]],
        crew_fleet_quals=[[("737", 0, 999999)]],
        roster_periods=[(0, 30 * 86400 - 1)],
        checked_window=(0, 30 * 86400 - 1),
        roster_property_rule_rows=[
            {
                "Bases": "*",
                "Ranks": "*",
                "Fleets": "*",
                "Crew Teams": "*",
                "Labels": "*",
                "Attributes": "*",
                "Override Duty Attributes": "*",
                "Assignment Groups": "FLY",
                "Assignments": "*",
                "Qualifiers": "*",
                "Flights": "*",
                "Destinations": "*",
                "Positions": "*",
                "Period": "31",
                "Unit": "CD",
                "Max Times": "1",
                "Min Times": "0",
                "Check Mode": "R",
            }
        ],
        enabled_functions=["8071"],
    )

    out = eng.check_line(0, [1])
    assert out == ["8071|period=31|unit=CD|actual=2|max=1|min=0|mode=R|over=true"]


def test_8071_assignments_filter_matches_pairing_assignment_independently_from_group():
    eng = rre.Engine(
        pairing_start_utc=[0, 10 * HOUR],
        pairing_end_utc=[2 * HOUR, 12 * HOUR],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_label=["A", "B"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_assignment=["FLT", "DHD"],
        roster_periods=[(0, 30 * 86400 - 1)],
        checked_window=(0, 30 * 86400 - 1),
        roster_property_rule_rows=[
            {
                "Bases": "*",
                "Ranks": "*",
                "Fleets": "*",
                "Crew Teams": "*",
                "Labels": "*",
                "Attributes": "*",
                "Override Duty Attributes": "*",
                "Assignment Groups": "FLY",
                "Assignments": "FLT",
                "Qualifiers": "*",
                "Flights": "*",
                "Destinations": "*",
                "Positions": "*",
                "Period": "31",
                "Unit": "CD",
                "Max Times": "1",
                "Min Times": "0",
                "Check Mode": "R",
            }
        ],
        enabled_functions=["8071"],
    )

    assert eng.check_line(0, [1]) == []


def test_8071_matches_destination_from_segment_arr_not_empty_pairing_airport():
    eng = _engine_with_segment(
        destinations="ATW|CUN|FLL|GDL|GOH|KIN|MEX",
        arr="KIN",
    )
    out = eng.check_line(0, [0])
    assert out == ["8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true"]


def test_8071_does_not_match_when_segment_arr_outside_dest_list():
    eng = _engine_with_segment(destinations="MEX", arr="KIN")
    assert eng.check_line(0, [0]) == []


def test_8071_dest_wildcard_still_matches_empty_segment_arr():
    eng = _engine_with_segment(destinations="*", arr="")
    out = eng.check_line(0, [0])
    assert out == ["8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true"]


def test_8071_countries_positive_matches_when_any_segment_country_hits():
    segs = [
        {**_KIN_SEGMENT, "segment_id": "1", "pairing_idx": "0", "destination_country": "MX"},
        {**_KIN_SEGMENT, "segment_id": "2", "pairing_idx": "0", "destination_country": "CA"},
    ]
    eng = _engine_with_countries(countries="CA|US", segments=segs)
    out = eng.check_line(0, [0])
    assert out == ["8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true"]


def test_8071_countries_negative_matches_when_any_segment_country_is_outside_whitelist():
    segs = [
        {**_KIN_SEGMENT, "segment_id": "1", "pairing_idx": "0", "destination_country": "CA"},
        {**_KIN_SEGMENT, "segment_id": "2", "pairing_idx": "0", "destination_country": "MX"},
    ]
    eng = _engine_with_countries(countries="!(CA+US)", segments=segs)
    out = eng.check_line(0, [0])
    assert out == ["8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true"]


def test_8071_country_filter_matches_any_arrival_country_in_pairing():
    segment = {**_KIN_SEGMENT, "arr": "KIN", "destination_country": "US"}
    eng = rre.Engine(
        pairing_start_utc=[0], pairing_end_utc=[4 * HOUR], pairing_blk_min=[60],
        crew_fixed_pairings=[[]], pairing_is_fly=[True], pairing_label=["C4131"],
        pairing_assignment_group=["FLY"], pairing_airport=[""], crew_teams=[["DOMO"]],
        roster_periods=[(0, 30 * 86400 - 1)], checked_window=(0, 30 * 86400 - 1),
        pairing_8072_segments=[segment],
        roster_property_rule_rows=[{**_DOMO_KIN_RULE, "Destinations": "KIN", "Countries": "US"}],
        enabled_functions=["8071"],
    )
    assert eng.check_line(0, [0]) == ["8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true"]


def test_8071_reverse_country_filter_accepts_non_excluded_arrival_country():
    segment = {**_KIN_SEGMENT, "destination_country": "MX"}
    eng = rre.Engine(
        pairing_start_utc=[0], pairing_end_utc=[4 * HOUR], pairing_blk_min=[60],
        crew_fixed_pairings=[[]], pairing_is_fly=[True], pairing_label=["C4131"],
        pairing_assignment_group=["FLY"], pairing_airport=[""], crew_teams=[["DOMO"]],
        roster_periods=[(0, 30 * 86400 - 1)], checked_window=(0, 30 * 86400 - 1),
        pairing_8072_segments=[segment],
        roster_property_rule_rows=[{**_DOMO_KIN_RULE, "Destinations": "KIN", "Countries": "!(CA+US)"}],
        enabled_functions=["8071"],
    )
    assert eng.check_line(0, [0]) == ["8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true"]


def test_8071_invalid_country_syntax_disables_filter_and_warns():
    eng = _engine_with_segment(destinations="KIN", arr="KIN")
    eng = rre.Engine(
        pairing_start_utc=[0], pairing_end_utc=[4 * HOUR], pairing_blk_min=[60],
        crew_fixed_pairings=[[]], pairing_is_fly=[True], pairing_label=["C4131"],
        pairing_assignment_group=["FLY"], pairing_airport=[""], crew_teams=[["DOMO"]],
        roster_periods=[(0, 30 * 86400 - 1)], checked_window=(0, 30 * 86400 - 1),
        pairing_8072_segments=[_KIN_SEGMENT],
        roster_property_rule_rows=[{**_DOMO_KIN_RULE, "Destinations": "KIN", "Countries": "CA+US"}],
        enabled_functions=["8071"],
    )
    assert any("8071" in warning and "Countries" in warning for warning in eng.warnings())


def test_8071_narrowed_country_rule_emits_one_finding_per_matching_pairing():
    """A narrowed (countries=!(CA)) rule over two candidate pairings (note: pairing
    index 0 is a real pairing, not a ground sentinel) must emit two findings (one
    per pairing) instead of one anchor=max-pairing_id finding."""
    rule = {**_DOMO_KIN_RULE, "Countries": "!(CA)"}
    segs = [
        {**_KIN_SEGMENT, "segment_id": "1", "pairing_idx": "0", "destination_country": "US"},
        {**_KIN_SEGMENT, "segment_id": "2", "pairing_idx": "1", "destination_country": "MX"},
    ]
    eng = rre.Engine(
        pairing_start_utc=[0, 4 * HOUR],
        pairing_end_utc=[4 * HOUR, 8 * HOUR],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[]],
        pairing_is_fly=[True, True],
        pairing_label=["C4131", "B3132"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_airport=["", ""],
        crew_teams=[["DOMO"]],
        roster_periods=[(0, 30 * 86400 - 1)],
        checked_window=(0, 30 * 86400 - 1),
        pairing_8072_segments=segs,
        roster_property_rule_rows=[rule],
        enabled_functions=["8071"],
    )
    assert eng.check_line(0, [0, 1]) == [
        "8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true",
        "8071|period=1|unit=RP|actual=1|max=0|min=0|mode=R|over=true",
    ]
