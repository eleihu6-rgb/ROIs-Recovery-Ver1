"""PyO3 wiring for Rule 7508 calendar-day SDFD."""

import rois_rule_engine_rs as rre

DAY = 86_400
H = 3600
LOCAL_NIGHT = (22 * 60 + 30, 9 * 60 + 30, 9 * H)


def _morning(day):
    return day * DAY + 6.75 * H, day * DAY + 13.17 * H


def _engine(enabled, count_layover=True):
    spans = [_morning(d) for d in (0, 2, 3, 4, 5, 6)]
    return rre.Engine(
        pairing_start_utc=[int(s) for s, _ in spans],
        pairing_end_utc=[int(e) for _, e in spans],
        pairing_blk_min=[60] * len(spans),
        crew_fixed_pairings=[list(range(len(spans) - 1))],
        pairing_is_fly=[True] * len(spans),
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        calendar_sdfd_rule_rows=[
            (
                0,
                (["*"], ["*"], ["*"], ["*"]),
                (168, "RH", True, True, 0, 1, count_layover),
            ),
        ],
        checked_window=(0, 7 * DAY),
        enabled_functions=enabled,
    )


def test_7508_enabled_returns_7508_violation():
    out = _engine(["7508"]).check_line(0, [5])
    assert any(row.startswith("7508|") for row in out)
    assert not any(row.startswith("7501|") for row in out)


def test_7508_not_enabled_does_not_run():
    out = _engine(["7501"]).check_line(0, [5])
    assert not any(row.startswith("7508|") for row in out)


def test_7508_count_layover_false_still_wires_and_checks():
    # Each fixed pairing here is a single duty, so Count Layover=N is a no-op
    # merge; the row must still be accepted and evaluated.
    out = _engine(["7508"], count_layover=False).check_line(0, [5])
    assert any(row.startswith("7508|") for row in out)
