from src.llm.config import resolve_provider


def test_explicit_override_wins():
    env = {'AI_PROVIDER': 'anthropic', 'DEEPSEEK_API_KEY': 'x'}
    assert resolve_provider(env)['provider'] == 'anthropic'


def test_deepseek_detected_first_when_no_override():
    env = {'DEEPSEEK_API_KEY': 'x', 'ANTHROPIC_API_KEY': 'y'}
    assert resolve_provider(env)['provider'] == 'deepseek'


def test_qwen_detected_before_anthropic():
    env = {'DASHSCOPE_API_KEY': 'x', 'ANTHROPIC_API_KEY': 'y'}
    assert resolve_provider(env)['provider'] == 'qwen'


def test_anthropic_detected_when_only_key():
    env = {'ANTHROPIC_API_KEY': 'y'}
    cfg = resolve_provider(env)
    assert cfg['provider'] == 'anthropic'
    assert cfg['model'] == 'claude-sonnet-4-6'


def test_fallback_to_deepseek_when_nothing():
    assert resolve_provider({})['provider'] == 'deepseek'
