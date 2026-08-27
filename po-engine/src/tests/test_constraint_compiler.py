import pytest
from src.constraints.fdp_table import lookup_fdp_limit, _in_time_window
from src.constraints.compiler import ConstraintCompiler
from src.models.rule_config import RuleConfig, RuleGroup, ResolvedRule


def _make_rule_config(extra_rules: list[dict] | None = None) -> RuleConfig:
    rules = [
        ResolvedRule(
            template_code="fdp_calculator", instance_code="FDP_STD", name="FDP",
            category="FDP", check_type="CALC", severity="ERROR", overridable=False,
            constraint_type="TABLE",
            params={"fdp_table": [
                {"minSegments": 1, "maxSegments": 1, "windows": [
                    {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 780},
                    {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 660},
                ]},
                {"minSegments": 2, "maxSegments": 2, "windows": [
                    {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 750},
                ]},
            ]}
        ),
        ResolvedRule(
            template_code="rest_calculator", instance_code="REST_STD", name="REST",
            category="REST", check_type="CALC", severity="ERROR", overridable=False,
            constraint_type="LINEAR", params={"minRestMinutes": 600}
        ),
        ResolvedRule(
            template_code="duty_time_calculator", instance_code="DUTY_STD", name="DUTY",
            category="DUTY", check_type="CALC", severity="ERROR", overridable=False,
            constraint_type="LINEAR",
            params={"maxDutyMinutes": 840, "maxConsecutiveDutyDays": 7}
        ),
        ResolvedRule(
            template_code="flight_time_calculator", instance_code="FLT_STD", name="FLT",
            category="FLIGHT_TIME", check_type="CALC", severity="ERROR", overridable=False,
            constraint_type="LINEAR",
            params={"maxFlightTimePerDutyMinutes": 600, "cumulativeLimits": {"7": 2400, "28": 6000}}
        ),
    ]
    if extra_rules:
        rules.extend(extra_rules)
    return RuleConfig(
        group=RuleGroup(id=1, group_code="CAAC_FTL", name="CAAC FTL",
                        usage="PO", filiale="F8", division="P", is_default=True),
        rules=rules,
    )


# FDP table tests
def test_fdp_lookup_day_window():
    table = [{"minSegments": 1, "maxSegments": 1, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 780}
    ]}]
    assert lookup_fdp_limit(table, 1, "07:00") == 780


def test_fdp_lookup_crossmidnight():
    table = [{"minSegments": 1, "maxSegments": 1, "windows": [
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 660}
    ]}]
    assert lookup_fdp_limit(table, 1, "23:30") == 660
    assert lookup_fdp_limit(table, 1, "04:00") == 660


def test_fdp_lookup_fallback_for_unknown_sector():
    table = [{"minSegments": 1, "maxSegments": 1, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 780}
    ]}]
    # 5 sectors not in table → conservative fallback 660
    assert lookup_fdp_limit(table, 5, "08:00") == 660


def test_in_time_window_normal():
    assert _in_time_window(8 * 60, 6 * 60, 14 * 60 - 1) is True
    assert _in_time_window(5 * 60, 6 * 60, 14 * 60 - 1) is False


def test_in_time_window_crossmidnight():
    # 22:00–05:59
    assert _in_time_window(23 * 60, 22 * 60, 5 * 60 + 59) is True
    assert _in_time_window(3 * 60, 22 * 60, 5 * 60 + 59) is True
    assert _in_time_window(10 * 60, 22 * 60, 5 * 60 + 59) is False


# Compiler tests
def test_compiler_produces_constraints():
    cc = ConstraintCompiler().compile(_make_rule_config(), ["PEK", "SHA"])
    assert cc.min_rest_minutes == 600
    assert cc.max_duty_minutes == 840
    assert cc.max_consecutive_duty_days == 7
    assert cc.max_flt_per_duty_minutes == 600
    assert cc.cumulative_flt_limits[7] == 2400
    assert "PEK" in cc.base_airports


def test_compiler_fdp_func_callable():
    cc = ConstraintCompiler().compile(_make_rule_config(), ["PEK"])
    # 1 sector, report at 08:00 → should get 780
    assert cc.fdp_limit_func(1, "08:00") == 780


def test_compiler_fdp_func_2_sectors():
    cc = ConstraintCompiler().compile(_make_rule_config(), ["PEK"])
    assert cc.fdp_limit_func(2, "08:00") == 750


def test_compiler_defaults_when_no_rule_config():
    """Without any rule, compiler falls back to CCAR-121 defaults."""
    empty_config = RuleConfig(
        group=RuleGroup(id=1, group_code="CAAC_FTL", name="CAAC FTL",
                        usage="PO", filiale="F8", division="P", is_default=True),
        rules=[],
    )
    cc = ConstraintCompiler().compile(empty_config, ["PEK"])
    assert cc.min_rest_minutes == 600
    assert cc.max_duty_minutes == 840
    # Default FDP table should still return a valid limit
    assert cc.fdp_limit_func(1, "08:00") > 0
