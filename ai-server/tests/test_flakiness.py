from src.regression.flakiness import instability, should_suggest_quarantine, should_release


def test_instability_empty_and_single():
    assert instability([]) == 0.0
    assert instability(['pass']) == 0.0


def test_instability_stable_pass_is_zero():
    assert instability(['pass'] * 10) == 0.0


def test_instability_alternating_is_one():
    # pass/fail/pass/fail -> 3 transitions / 3 = 1.0 (capped)
    assert instability(['pass', 'fail', 'pass', 'fail']) == 1.0


def test_instability_counts_transitions_not_ratio():
    # 5 fails then 5 passes: 1 transition / 9 — low instability even at 50% fail ratio.
    recent = ['fail'] * 5 + ['pass'] * 5
    assert instability(recent) == round(1 / 9, 3)


def test_instability_flaky_outcomes_add_weight():
    # one flaky among passes: 2 transitions/4 = 0.5, + 0.15 * 1/5 = 0.53
    recent = ['pass', 'pass', 'flaky', 'pass', 'pass']
    assert instability(recent) == round(2 / 4 + 0.15 * 1 / 5, 3)


def test_instability_capped_at_one():
    recent = ['pass', 'flaky'] * 10
    assert instability(recent) == 1.0


def test_suggest_quarantine_needs_five_runs_and_threshold():
    assert not should_suggest_quarantine(['pass', 'fail', 'pass'], quarantined=False)  # <5 runs
    assert should_suggest_quarantine(['pass', 'fail', 'pass', 'fail', 'pass'], quarantined=False)
    assert not should_suggest_quarantine(['pass'] * 8, quarantined=False)  # stable
    assert not should_suggest_quarantine(['pass', 'fail'] * 4, quarantined=True)  # already quarantined


def test_release_after_five_consecutive_passes():
    assert should_release(['fail', 'pass', 'pass', 'pass', 'pass', 'pass'], quarantined=True)
    assert not should_release(['pass', 'pass', 'pass', 'pass'], quarantined=True)  # only 4
    assert not should_release(['fail', 'pass', 'pass', 'pass', 'flaky', 'pass'], quarantined=True)
    assert not should_release(['pass'] * 6, quarantined=False)  # not quarantined
