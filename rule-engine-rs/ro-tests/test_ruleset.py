"""RuleSet-driven ro_check — unit tests (ro-tests/ro_input.txt only)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from ro_check import (  # noqa: E402
    extract_engine_params,
    parse_active_ruleset,
    parse_ro,
)

RO_INPUT = HERE / "ro_input.txt"


@unittest.skipUnless(RO_INPUT.exists(), "ro-tests/ro_input.txt required")
class RuleSetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sections = parse_ro(RO_INPUT)
        scen = cls.sections.get("Scenario", {}).get("rows", [])
        assert scen, "Scenario section missing"
        cls.rp_start = date.fromisoformat(scen[0].get("strDtLoc", "")[:10])
        cls.rp_end = date.fromisoformat(scen[0].get("endDtLoc", "")[:10])
        cls.active = parse_active_ruleset(cls.sections)
        cls.ep = extract_engine_params(cls.sections, cls.rp_start, cls.rp_end, cls.active)

    def test_7500_daily_adjustment_params(self) -> None:
        self.assertEqual(self.ep.get("acc_stay_per_min"), 1440)
        self.assertEqual(self.ep.get("acc_adjust_min"), 60)

    def test_carried_pairing_keeps_flight_segments_for_svg(self) -> None:
        from ro_check import (
            _new_round_entry,
            _parse_pairing_segments,
            parse_airport_zones,
        )

        pairing_segments = _parse_pairing_segments(self.sections)
        self.assertGreater(len(pairing_segments["15461"]), 1)

        entry = _new_round_entry(
            "1331",
            "CA",
            "YYC",
            1,
            crew_fixed_pids={},
            pairing_info={
                "15461": {
                    "label": "C4121",
                    "group": "FLY",
                    "start": "2026-08-08T00:25:00",
                    "duty_end": "2026-08-11T23:40:00",
                    "dep": "YYC",
                    "arv": "YYC",
                },
            },
            ground_tasks={},
            carried_pids=["15461"],
            pairing_segments=pairing_segments,
            airport_zones=parse_airport_zones(self.sections),
        )

        self.assertEqual(len(entry["carried"]), 1)
        self.assertGreater(len(entry["carried"][0].get("segs", [])), 1)

    def test_check_row_flight_view_uses_segment_bars(self) -> None:
        from ro_check import (
            _build_pairing_display_segs,
            _parse_pairing_segments,
            _write_svg_report,
            parse_airport_zones,
        )

        airport_zones = parse_airport_zones(self.sections)
        pairing_segments = _parse_pairing_segments(self.sections)
        segs = _build_pairing_display_segs(
            pairing_segments["15461"],
            "YYC",
            "YYC",
            airport_zones,
        )
        self.assertGreater(len(segs), 1)

        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "results.svg"
            _write_svg_report(
                [{
                    "crew_id": "1331",
                    "rank": "CA",
                    "base": "YYC",
                    "round_no": 1,
                    "fixed": [],
                    "carried": [],
                    "ground": [],
                    "checks": [{
                        "step": 1,
                        "pid": "15461",
                        "label": "C4121",
                        "base": "YYC",
                        "group": "FLY",
                        "start_utc": segs[0]["start_utc"],
                        "end_utc": segs[-1]["end_utc"],
                        "dep": "YYC",
                        "arv": "YYC",
                        "ok": False,
                        "violations": ["8002001|test"],
                        "prior": [],
                        "skipped": False,
                        "segs": segs,
                    }],
                }],
                date(2026, 8, 1),
                date(2026, 8, 31),
                out_path,
                airport_zones,
            )
            svg = out_path.read_text()

        flight_group = svg.split('<g id="flight-bars" display="none">', 1)[1].split(
            '<g id="panel-overlay">',
            1,
        )[0]
        self.assertNotIn("PairingID: 15461", flight_group)
        self.assertIn(">624<", flight_group)
        self.assertIn(">611<", flight_group)
        self.assertIn(">625<", flight_group)

    def test_svg_day_headers_show_zero_blk(self) -> None:
        from ro_check import _write_svg_report

        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "results.svg"
            _write_svg_report(
                [{
                    "crew_id": "1331",
                    "rank": "CA",
                    "base": "YYC",
                    "round_no": 1,
                    "fixed": [],
                    "carried": [],
                    "ground": [],
                    "checks": [],
                    "blk_by_day": {date(2026, 8, 1): 90.0},
                }],
                date(2026, 8, 1),
                date(2026, 8, 31),
                out_path,
                {"YYC": "UTC"},
            )
            svg = out_path.read_text()

        self.assertEqual(svg.count('class="day-tip"'), 31)
        self.assertEqual(svg.count(">BLK 1:30<"), 1)
        self.assertEqual(svg.count(">BLK 0:00<"), 30)

    def test_spacing_rules_populated_when_8056_active(self) -> None:
        self.assertIn("8056", self.active.enforced_functions)
        spacing_rules = self.ep.get("spacing_rules", [])
        self.assertGreater(len(spacing_rules), 0)


if __name__ == "__main__":
    unittest.main()
