from src.constraints.compiler import FTLCompiler, CompiledFTL
from src.models.rule_config import RuleConfig, RuleGroup, ResolvedRule


def _make_rule_config(**param_overrides) -> RuleConfig:
    group = RuleGroup(
        id=1, group_code="CAAC_FTL", name="CAAC", usage="RO",
        filiale="F8", division="P", is_default=True,
    )
    defaults = {
        "fdp_calculator": {"fdpTable": {"1": 720, "2": 660, "3": 600, "4": 570}},
        "rest_calculator": {"minRestMinutes": 600},
        "duty_time_calculator": {"maxDutyMinutes": 840, "maxConsecutiveDutyDays": 7},
        "flight_time_calculator": {
            "maxFlightTimePerDutyMinutes": 480,
            "cumulativeLimits": {"28": 6000, "90": 16200, "365": 60000},
        },
    }
    defaults.update(param_overrides)

    # fdp_calculator uses category="FDP" so get_fdp_limit_minutes can find it
    category_map = {
        "fdp_calculator": "FDP",
        "rest_calculator": "REST",
        "duty_time_calculator": "DUTY",
        "flight_time_calculator": "FLIGHT_TIME",
    }

    rules = [
        ResolvedRule(
            template_code=tc, instance_code=tc, name=tc,
            category=category_map.get(tc, "FLIGHT_TIME"),
            check_type="CHECK", severity="ERROR", overridable=False, params=p,
        )
        for tc, p in defaults.items()
    ]
    return RuleConfig(group=group, rules=rules)


def test_compile_returns_compiled_ftl():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {})
    assert isinstance(ftl, CompiledFTL)


def test_min_rest_compiled():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {})
    assert ftl.min_rest_minutes == 600


def test_max_month_flt():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {})
    assert ftl.max_month_flt_min == 6000


def test_max_quarter_flt():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {})
    assert ftl.max_quarter_flt_min == 16200


def test_max_year_flt():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {})
    assert ftl.max_year_flt_min == 60000


def test_max_consecutive_duty_days():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {})
    assert ftl.max_consecutive_duty_days == 7


def test_fdp_limit_func():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {})
    assert ftl.fdp_limit_func(1) == 720
    assert ftl.fdp_limit_func(4) == 570


def test_tafb_from_job_params():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {"max_tafb_hours": "96"})
    assert ftl.max_tafb_minutes == 96 * 60


def test_fairness_target_from_job_params():
    rc = _make_rule_config()
    ftl = FTLCompiler().compile(rc, {"fairness_target_hours": "75.0"})
    assert ftl.fairness_target_hours == 75.0
