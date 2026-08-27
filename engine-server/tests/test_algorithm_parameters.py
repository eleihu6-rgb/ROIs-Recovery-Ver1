from F8.ro_input_builder import cli


class _Cursor:
    def __init__(self, rows):
        self._rows = rows

    def execute(self, *_args):
        return None

    def fetchall(self):
        return self._rows

    def close(self):
        return None


class _Conn:
    def __init__(self, rows):
        self._rows = rows

    def cursor(self):
        return _Cursor(self._rows)

    def close(self):
        return None


class _StubConn:
    """db.connect stub for resolve_team_rules_for_solver: only close() is used."""

    def close(self):
        return None


def test_scenario_algorithm_parameters_builds_report_style_payload(monkeypatch):
    rows = [
        (0, "floor_rescue_rules", {
            "defaultValue": {
                "reserve_single_days": False,
                "reserve_day_balance": True,
                "avoid_pairing_bids": True,
                "requested_days_off": True,
                "avoid_reserve_bids": True,
                "avoid_reserve_line_rules": True,
                "award_reserve_and_commuter_blocks": True,
                "min_base_layover_bids": True,
            },
        }),
        (42, "credit_range", {"value": {"max": {"CA": 90}, "min": {"IFD": 78.5}}}),
        (42, "reserve_weekday_priority", {
            "value": {"mon": 3, "tue": 1, "wed": 1, "thu": 3, "fri": 2, "sat": 2, "sun": 2},
        }),
        (42, "min_reserve_covered_pct", {"value": {"pct": 60}}),
        (42, "day_pressure_spread", {"value": {"enabled": True}}),
        (42, "crew_bids", {"value": {"enabled": False}}),
    ]
    monkeypatch.setattr(cli.db, "connect", lambda *_args, **_kwargs: _Conn(rows))

    payload = cli.scenario_algorithm_parameters("f8", 42)

    assert payload["meta"]["credit_max"] == {"CA": 90.0, "FO": 85.0, "IFD": 85.0, "FA": 85.0}
    assert payload["meta"]["credit_min"] == {"CA": 75.0, "FO": 80.0, "IFD": 78.5, "FA": 80.0}
    assert "++solver.rank_groups.pilot.credit_targets.CA.max=90.0" in payload["hydra_args"]
    assert "++solver.rank_groups.cabin.credit_targets.IFD.min=78.5" in payload["hydra_args"]
    assert "++solver.min_reserve_covered_percentage=60.0" in payload["hydra_args"]
    assert "++solver.reserve_weekday_priority.tue=1" in payload["hydra_args"]
    assert "++solver.day_pressure_spread=true" in payload["hydra_args"]
    assert payload["meta"]["include_crew_bids"] is False


def test_scenario_algorithm_parameters_trims_credit_ranks_by_division(monkeypatch):
    rows = [
        (0, "credit_range", {"defaultValue": {
            "max": {"CA": 92, "FO": 85, "IFD": 85, "FA": 85},
            "min": {"CA": 75, "FO": 80, "IFD": 80, "FA": 80},
        }}),
        (0, "min_reserve_covered_pct", {"defaultValue": {}}),
    ]
    monkeypatch.setattr(cli.db, "connect", lambda *_args, **_kwargs: _Conn(rows))

    pilot = cli.scenario_algorithm_parameters("f8", 42, division="P")
    cabin = cli.scenario_algorithm_parameters("f8", 42, division="C")

    assert set(pilot["meta"]["credit_min"]) == {"CA", "FO"}
    assert set(pilot["meta"]["credit_max"]) == {"CA", "FO"}
    assert all(".IFD." not in arg and ".FA." not in arg for arg in pilot["hydra_args"])
    assert set(cabin["meta"]["credit_min"]) == {"IFD", "FA"}
    assert set(cabin["meta"]["credit_max"]) == {"IFD", "FA"}
    assert all(".CA." not in arg and ".FO." not in arg for arg in cabin["hydra_args"])
    assert "++solver.min_reserve_covered_percentage=0.0" in pilot["hydra_args"]
    assert pilot["meta"]["include_crew_bids"] is True


def test_resolve_team_rules_intersects_ids_and_drops_disabled_or_orphaned(monkeypatch):
    """Stored ids outside the actual ro_input crew/pairing scope are dropped;
    disabled rules and rules naming a missing team never reach the solver."""
    team_rules = {
        "teams": [
            {"id": "t1", "name": "TEAM-A", "crew_ids": ["1", "2", "3", "stale-crew"]},
        ],
        "rules": [
            # only enabled rule: kept, ids intersected
            {"id": "r1", "name": "R1", "team_id": "t1", "mode": "only_do",
             "pairing_ids": ["100", "200", "999-stale-pairing"], "enabled": True},
            # disabled → never written
            {"id": "r2", "name": "R2", "team_id": "t1", "mode": "not_do",
             "pairing_ids": ["100"], "enabled": False},
            # team_id missing from teams → dropped
            {"id": "r3", "name": "R3", "team_id": "ghost", "mode": "not_do",
             "pairing_ids": ["100"], "enabled": True},
            # invalid mode → dropped
            {"id": "r4", "name": "R4", "team_id": "t1", "mode": "banana",
             "pairing_ids": ["100"], "enabled": True},
        ],
    }
    monkeypatch.setattr(cli.db, "connect", lambda *_a, **_k: _StubConn())
    monkeypatch.setattr(cli.context, "scenario_crew_ids", lambda *_a, **_k: ["1", "2", "3"])
    monkeypatch.setattr(cli.context, "pairing_ids", lambda *_a, **_k: [100, 200])

    rules = cli.resolve_team_rules_for_solver("f8", 42, team_rules)

    assert rules == [
        {
            "id": "r1",
            "name": "R1",
            "mode": "only_do",
            "team": {"id": "t1", "name": "TEAM-A"},
            "crew_ids": ["1", "2", "3"],
            "pairing_ids": ["100", "200"],
        },
    ]


def test_resolve_team_rules_empty_or_malformed_returns_empty(monkeypatch):
    monkeypatch.setattr(cli.db, "connect", lambda *_a, **_k: _StubConn())
    monkeypatch.setattr(cli.context, "scenario_crew_ids", lambda *_a, **_k: ["1"])
    monkeypatch.setattr(cli.context, "pairing_ids", lambda *_a, **_k: [100])

    assert cli.resolve_team_rules_for_solver("f8", 42, None) == []
    assert cli.resolve_team_rules_for_solver("f8", 42, {}) == []
    assert cli.resolve_team_rules_for_solver("f8", 42, {"teams": [], "rules": []}) == []
    assert cli.resolve_team_rules_for_solver("f8", 42, "garbage") == []


def test_resolve_team_rules_fails_when_intersection_query_fails(monkeypatch):
    """A failed run-scope intersection must be explicit so Live blocks publish."""
    import pytest

    team_rules = {
        "teams": [{"id": "t1", "name": "TEAM-A", "crew_ids": ["1"]}],
        "rules": [{"id": "r1", "name": "R1", "team_id": "t1", "mode": "not_do",
                   "pairing_ids": ["100"], "enabled": True}],
    }

    def boom(*_a, **_k):
        raise RuntimeError("pg down")

    monkeypatch.setattr(cli.context, "scenario_crew_ids", boom)

    with pytest.raises(RuntimeError, match="pg down"):
        cli.resolve_team_rules_for_solver("f8", 42, team_rules)


def test_materialize_algorithm_parameters_writes_team_rules_json(tmp_path, monkeypatch):
    """The solver-only handoff file TEAM_RULES.json is materialized into the working
    dir (== solver pref_dir) whenever team_rules are configured."""
    import json
    import os

    from src.tasks.task_manager import Task

    task = Task(
        task_id="test-team-rules-001",
        airline="F8",
        optimizer_type="LegacyRO",
        parameters={"scenarioId": "42"},
        url="http://mock",
        token="t",
    )
    task.working_dir = str(tmp_path)  # isolate from the configured workspace

    payload = {
        "meta": {"include_crew_bids": True, "team_rules": {"teams": [], "rules": []}},
        "floor_rescue_rules": {"reserve_single_days": False},
        "hydra_args": ["++solver.min_reserve_covered_percentage=50.0"],
    }
    resolved = [{
        "id": "r1", "name": "R1", "mode": "not_do",
        "team": {"id": "t1", "name": "TEAM-A"},
        "crew_ids": ["1"], "pairing_ids": ["100"],
    }]

    class FakeCli:
        @staticmethod
        def scenario_algorithm_parameters(*_a, **_k):
            return payload

        @staticmethod
        def scenario_workset_id(*_a, **_k):
            return None

        @staticmethod
        def resolve_team_rules_for_solver(*_a, **_k):
            return resolved

    task._materialize_algorithm_parameters(FakeCli, 42, db_url=None, division="P")

    rules_path = os.path.join(str(tmp_path), "TEAM_RULES.json")
    assert os.path.exists(rules_path)
    with open(rules_path, encoding="utf-8") as f:
        assert json.load(f) == {"rules": resolved}
    assert not os.path.exists(os.path.join(str(tmp_path), "TEAM_RULES_RESOLUTION.json"))
    # sibling files still materialized alongside
    assert os.path.exists(os.path.join(str(tmp_path), "algorithm_meta.json"))
    assert os.path.exists(os.path.join(str(tmp_path), "algorithm_args.txt"))
    assert os.path.exists(os.path.join(str(tmp_path), "FLOOR_RESCUE_RULES.json"))


def test_materialize_algorithm_parameters_no_file_without_team_rules(tmp_path):
    """No team_rules configured → no TEAM_RULES.json (and no stale one is left)."""
    import json
    import os

    from src.tasks.task_manager import Task

    task = Task(
        task_id="test-team-rules-002",
        airline="F8",
        optimizer_type="LegacyRO",
        parameters={"scenarioId": "43"},
        url="http://mock",
        token="t",
    )
    task.working_dir = str(tmp_path)

    payload = {
        "meta": {"include_crew_bids": True},  # no team_rules key
        "floor_rescue_rules": {},
        "hydra_args": [],
    }

    class FakeCli:
        @staticmethod
        def scenario_algorithm_parameters(*_a, **_k):
            return payload

        @staticmethod
        def scenario_workset_id(*_a, **_k):
            return None

    task._materialize_algorithm_parameters(FakeCli, 43, db_url=None, division="P")

    assert not os.path.exists(os.path.join(str(tmp_path), "TEAM_RULES.json"))
    assert not os.path.exists(os.path.join(str(tmp_path), "TEAM_RULES_RESOLUTION.json"))


def test_materialize_algorithm_parameters_omits_team_rule_resolution_manifest_on_failure(tmp_path):
    """Solver handoff may fail, but publish no longer consumes a Team Rule resolution manifest."""
    import json
    import os

    from src.tasks.task_manager import Task

    task = Task(
        task_id="test-team-rules-003",
        airline="F8",
        optimizer_type="LegacyRO",
        parameters={"scenarioId": "44"},
        url="http://mock",
        token="t",
    )
    task.working_dir = str(tmp_path)

    class FakeCli:
        @staticmethod
        def scenario_algorithm_parameters(*_a, **_k):
            return {
                "meta": {"include_crew_bids": True, "team_rules": {"teams": [{}], "rules": [{}]}},
                "floor_rescue_rules": {},
                "hydra_args": [],
            }

        @staticmethod
        def scenario_workset_id(*_a, **_k):
            return None

        @staticmethod
        def resolve_team_rules_for_solver(*_a, **_k):
            raise RuntimeError("resolution failed")

    task._materialize_algorithm_parameters(FakeCli, 44, db_url=None, division="P")

    assert not os.path.exists(os.path.join(str(tmp_path), "TEAM_RULES.json"))
    assert not os.path.exists(os.path.join(str(tmp_path), "TEAM_RULES_RESOLUTION.json"))
