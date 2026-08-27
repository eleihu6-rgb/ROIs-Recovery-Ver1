import os


def resolve_provider(env: dict[str, str] | None = None) -> dict[str, str]:
    """Port of EVACC _llm_config(): pick provider + model + base_url from env."""
    e = env if env is not None else os.environ
    provider = (e.get('AI_PROVIDER') or '').lower().strip()
    if not provider:
        if e.get('DEEPSEEK_API_KEY'):
            provider = 'deepseek'
        elif e.get('DASHSCOPE_API_KEY'):
            provider = 'qwen'
        elif e.get('ANTHROPIC_API_KEY'):
            provider = 'anthropic'
        else:
            provider = 'deepseek'

    if provider == 'anthropic':
        return {
            'provider': 'anthropic',
            'api_key': e.get('ANTHROPIC_API_KEY', ''),
            'model': e.get('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
            'base_url': '',
        }
    if provider == 'qwen':
        return {
            'provider': 'qwen',
            'api_key': e.get('DASHSCOPE_API_KEY', ''),
            'model': e.get('QWEN_MODEL', 'qwen-plus'),
            'base_url': e.get('DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
        }
    return {
        'provider': 'deepseek',
        'api_key': e.get('DEEPSEEK_API_KEY', ''),
        'model': e.get('DEEPSEEK_MODEL', 'deepseek-chat'),
        'base_url': e.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    }
