"""Rule 8002 full parameter forwarding PyO3 regressions."""

import rois_rule_engine_rs as rre


def test_8002_cum_rules_use_crew_teams_scope():
    eng = rre.Engine(
        enabled_functions=["8002"],
        application="editor",
        crew_teams=[["TEAM1"], ["TEAM2"]],
        crew_offset_min=[0, 0],
        checked_window=(1780272000, 1782864000),
        scenario_window=(1780272000, 1782864000),
        crew_fixed_pairings=[[], []],
        crew_daily_metrics=[
            [(20614, [3600.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])],
            [(20614, [3600.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])],
        ],
        cum_rules=[
            (
                (["*"], ["*"], ["*"], ["TEAM1"]),
                (1, "CD", 3000, 0, "BH"),
                (-1, -1, -1, -1, -1, -1),
                -1,
                0,
            ),
        ],
    )

    out_c1 = [v for v in eng.check_line(0, []) if v.startswith("8002")]
    out_c2 = [v for v in eng.check_line(1, []) if v.startswith("8002")]
    assert out_c1
    assert out_c2 == []
