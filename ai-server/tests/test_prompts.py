from src.regression.prompts import PW_GEN_SYSTEM


def test_prompt_forbids_hard_sleeps_and_requires_polling():
    assert 'waitForTimeout' in PW_GEN_SYSTEM
    assert 'expect.poll' in PW_GEN_SYSTEM


def test_prompt_requires_measured_assertions_and_keeps_app_context():
    assert 'toHaveCount' in PW_GEN_SYSTEM
    assert 'toBeVisible' in PW_GEN_SYSTEM
    # performance budget guidance
    assert 'budget' in PW_GEN_SYSTEM.lower() or 'ms' in PW_GEN_SYSTEM
    # app context preserved
    assert '/altair/' in PW_GEN_SYSTEM
    assert '__ganttTest' in PW_GEN_SYSTEM
