# tests/test_crew_transform.py
from f8.crew import (
    _branch_code_from_division,
    _division_from_latest_rank,
    _optional_mysql_datetime,
    _parse_seniority_num,
    _sort_ranks_deck_priority_then_chronology,
    _sync_teams,
    apply_crew_rank_overlap_rules,
    normalize_ranks_for_sync,
    transform_crew_row,
)
from unittest.mock import MagicMock


def _rank(rank: str, eff: str, exp: str = "2199-12-31T00:00:00Z") -> dict:
    return {"rank": rank, "effDt": eff, "expDt": exp}


def test_transform_crew_row_maps_basic_fields():
    raw = {
        "owner": "F8", "crewId": 5510, "firstName": "Peter", "middleName": "",
        "lastName": "Adams", "gender": "Male", "telephone": "647-449-2247",
        "workEmail": "peter.adams@flyflair.com",
        "bases": [], "ranks": [], "fleets": [], "certificates": [], "qualifications": [],
        "teams": [
            {
                "teamId": "EQ737",
                "teamName": "EQ737",
                "effDt": "2021-08-01T00:00:00Z",
                "expDt": "2055-09-16T23:59:59Z",
                "isValid": True,
            }
        ],
    }
    result = transform_crew_row(raw)
    assert result["interface_id"] == 5510
    assert result["first_name"] == "Peter"
    assert result["last_name"] == "Adams"
    assert result["work_email"] == "peter.adams@flyflair.com"
    assert result["teams"][0]["teamId"] == "EQ737"


def test_normalize_ranks_keeps_all_rows_including_expired():
    ranks = [
        _rank("CA", "2018-01-01T00:00:00Z", "2020-01-01T00:00:00Z"),
        _rank("FO", "2019-01-01T00:00:00Z", "2020-01-01T00:00:00Z"),
    ]
    out = normalize_ranks_for_sync(ranks)
    assert len(out) == 2
    assert out[0]["rank"] == "CA"
    assert out[1]["rank"] == "FO"


def test_normalize_ranks_normalizes_cap_to_ca():
    ranks = [_rank("CAP", "2018-01-01T00:00:00Z")]
    out = normalize_ranks_for_sync(ranks)
    assert out[0]["rank"] == "CA"


def test_division_from_latest_rank_single_ca_is_p():
    ranks = normalize_ranks_for_sync([_rank("CA", "2020-01-01T00:00:00Z")])
    assert _division_from_latest_rank(ranks) == "P"
    ranks2 = normalize_ranks_for_sync([{"rank": "fo", "effDt": "2020-01-01T00:00:00Z"}])
    assert _division_from_latest_rank(ranks2) == "P"


def test_division_from_latest_rank_ifd_fa_is_c():
    ranks = normalize_ranks_for_sync([_rank("IFD", "2020-01-01T00:00:00Z")])
    assert _division_from_latest_rank(ranks) == "C"
    ranks2 = normalize_ranks_for_sync([{"rank": "fa", "effDt": "2020-01-01T00:00:00Z"}])
    assert _division_from_latest_rank(ranks2) == "C"


def test_division_max_effdt_batch_deck_wins_over_cabin():
    """Same max effDt: CA/FO and IFD/FA together → P (deck priority)."""
    ranks = normalize_ranks_for_sync(
        [
            _rank("FO", "2020-01-01T00:00:00Z"),
            _rank("FA", "2020-01-01T00:00:00Z"),
        ]
    )
    assert _division_from_latest_rank(ranks) == "P"


def test_division_from_latest_rank_uses_latest_effdt_not_union():
    # FO newer -> P even if older FA exists
    ranks = normalize_ranks_for_sync(
        [
            _rank("FA", "2018-01-01T00:00:00Z"),
            _rank("FO", "2022-01-01T00:00:00Z"),
        ]
    )
    assert _division_from_latest_rank(ranks) == "P"
    # FA newer -> C even if older FO exists
    ranks2 = normalize_ranks_for_sync(
        [
            _rank("FO", "2018-01-01T00:00:00Z"),
            _rank("FA", "2022-01-01T00:00:00Z"),
        ]
    )
    assert _division_from_latest_rank(ranks2) == "C"


def test_overlap_rules_drop_fo_when_interval_overlaps_ca():
    ranks = normalize_ranks_for_sync(
        [
            _rank("CA", "2020-01-01T00:00:00Z", "2025-01-01T00:00:00Z"),
            _rank("FO", "2023-06-01T00:00:00Z", "2024-01-01T00:00:00Z"),
        ]
    )
    out = apply_crew_rank_overlap_rules(ranks)
    assert len(out) == 1 and out[0]["rank"] == "CA"


def test_overlap_rules_keep_fo_when_no_overlap_with_ca():
    ranks = normalize_ranks_for_sync(
        [
            _rank("CA", "2020-01-01T00:00:00Z", "2021-01-01T00:00:00Z"),
            _rank("FO", "2022-01-01T00:00:00Z", "2025-01-01T00:00:00Z"),
        ]
    )
    out = apply_crew_rank_overlap_rules(ranks)
    assert len(out) == 2


def test_overlap_rules_drop_fa_when_interval_overlaps_ifd():
    ranks = normalize_ranks_for_sync(
        [
            _rank("IFD", "2019-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
            _rank("FA", "2020-06-01T00:00:00Z", "2022-06-01T00:00:00Z"),
        ]
    )
    out = apply_crew_rank_overlap_rules(ranks)
    assert len(out) == 1 and out[0]["rank"] == "IFD"


def test_overlap_rules_keep_fa_when_no_overlap_with_ifd():
    ranks = normalize_ranks_for_sync(
        [
            _rank("IFD", "2019-01-01T00:00:00Z", "2020-01-01T00:00:00Z"),
            _rank("FA", "2021-06-01T00:00:00Z", "2022-06-01T00:00:00Z"),
        ]
    )
    out = apply_crew_rank_overlap_rules(ranks)
    assert len(out) == 2


def test_sort_ranks_deck_before_cabin_same_eff():
    ranks = normalize_ranks_for_sync(
        [
            _rank("FA", "2020-01-01T00:00:00Z"),
            _rank("FO", "2020-01-01T00:00:00Z"),
        ]
    )
    ordered = _sort_ranks_deck_priority_then_chronology(ranks)
    assert [x["rank"] for x in ordered] == ["FO", "FA"]


def test_branch_code_from_division_p_c():
    assert _branch_code_from_division("P") == "F801"
    assert _branch_code_from_division("C") == "F802"
    assert _branch_code_from_division(" ") is None
    assert _branch_code_from_division("") is None


def test_branch_code_matches_division_from_latest_rank():
    r = normalize_ranks_for_sync([_rank("CA", "2021-01-01T00:00:00Z")])
    assert _branch_code_from_division(_division_from_latest_rank(r)) == "F801"
    r2 = normalize_ranks_for_sync([_rank("FA", "2021-01-01T00:00:00Z")])
    assert _branch_code_from_division(_division_from_latest_rank(r2)) == "F802"


def test_parse_seniority_num():
    assert _parse_seniority_num(None) is None
    assert _parse_seniority_num("") is None
    assert _parse_seniority_num(42) == 42
    assert _parse_seniority_num("3.0") == 3
    assert _parse_seniority_num("bad") is None
    assert _parse_seniority_num(200000) == 99999


def test_optional_mysql_datetime():
    assert _optional_mysql_datetime(None) is None
    assert _optional_mysql_datetime("") is None
    dt = _optional_mysql_datetime("1990-06-15T00:00:00Z")
    assert dt is not None
    assert dt.year == 1990 and dt.month == 6 and dt.day == 15


def test_transform_crew_row_maps_profile_fields():
    raw = {
        "owner": "F8",
        "crewId": 99,
        "firstName": "A",
        "middleName": "",
        "lastName": "B",
        "gender": "M",
        "telephone": "",
        "workEmail": "",
        "nickName": "Abi",
        "birthday": "1991-03-02T00:00:00Z",
        "seniorityNum": 120,
        "homeAddress": "1 Main St",
        "cityOfResidence": "Calgary",
        "stateOfResidence": "AB",
        "countryOfResidence": "CA",
        "postalCode": "T1T1T1",
        "bases": [],
        "ranks": [],
        "fleets": [],
        "certificates": [],
        "qualifications": [],
    }
    result = transform_crew_row(raw)
    assert result["preferred_name"] == "Abi"
    assert result["seniority_num"] == 120
    assert result["home_address"] == "1 Main St"
    assert result["city_of_residence"] == "Calgary"
    assert result["state_of_residence"] == "AB"
    assert result["country_of_residence"] == "CA"
    assert result["postal_code"] == "T1T1T1"
    assert result["birthday"] is not None
    assert result["birthday"].year == 1991


def test_transform_crew_row_imports_all_certificates():
    raw = {
        "owner": "F8", "crewId": 1, "firstName": "A", "middleName": "", "lastName": "B",
        "gender": "", "telephone": "", "workEmail": "",
        "bases": [], "ranks": [], "fleets": [],
        "certificates": [
            {"certificate": "RHS", "isValid": True, "expDt": "2026-11-30T00:00:00Z"},
            {"certificate": "OLD", "isValid": False, "expDt": "2025-01-01T00:00:00Z"},
        ],
        "qualifications": [],
    }
    result = transform_crew_row(raw)
    assert len(result["certificates"]) == 2
    assert result["certificates"][0]["certificate"] == "RHS"
    assert result["certificates"][1]["certificate"] == "OLD"


def test_sync_teams_writes_upstream_team_code_and_name(monkeypatch):
    cur = MagicMock()
    monkeypatch.setattr("f8.crew.batch_nextval", lambda _seq, count, _cursor: list(range(100, 100 + count)))

    _sync_teams(
        cur,
        "296",
        [
            {
                "teamId": "EQ737",
                "teamName": "Equipment 737",
                "effDt": "2021-08-01T00:00:00Z",
                "expDt": "2055-09-16T23:59:59Z",
                "isValid": True,
            }
        ],
    )

    delete_call, insert_call = cur.execute.call_args_list
    assert delete_call.args[0] == "DELETE FROM crew_team WHERE crew_id = %s"
    assert "INSERT INTO crew_team (id, crew_id, team, eff_dt, exp_dt, is_valid, remarks, source)" in insert_call.args[0]
    assert insert_call.args[1][0:3] == (100, "296", "EQ737")
    assert insert_call.args[1][5:] == (1, "Equipment 737")
