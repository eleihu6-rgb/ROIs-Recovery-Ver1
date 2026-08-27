"""Regression: the runtime resolves the LLM provider from pydantic-settings
(which loads ai-server/.env), NOT os.environ. The original bug called
resolve_provider() with no arg → read os.environ → saw no key → empty
credentials → 'Missing credentials' at the SDK call. These tests assert the
key actually flows from settings into the resolved config."""
import src.llm.client as client
from src.llm.config import resolve_provider


def test_env_from_settings_carries_deepseek_key(monkeypatch):
    monkeypatch.setattr(client.settings, 'ai_provider', '')
    monkeypatch.setattr(client.settings, 'deepseek_api_key', 'dkey')
    monkeypatch.setattr(client.settings, 'anthropic_api_key', '')
    monkeypatch.setattr(client.settings, 'dashscope_api_key', '')

    cfg = resolve_provider(client._env_from_settings())
    assert cfg['provider'] == 'deepseek'
    # The bug: this was '' because os.environ was read instead of settings.
    assert cfg['api_key'] == 'dkey'


def test_env_from_settings_honors_anthropic_override(monkeypatch):
    monkeypatch.setattr(client.settings, 'ai_provider', 'anthropic')
    monkeypatch.setattr(client.settings, 'anthropic_api_key', 'akey')
    monkeypatch.setattr(client.settings, 'anthropic_model', 'claude-sonnet-4-6')

    cfg = resolve_provider(client._env_from_settings())
    assert cfg['provider'] == 'anthropic'
    assert cfg['api_key'] == 'akey'
    assert cfg['model'] == 'claude-sonnet-4-6'
