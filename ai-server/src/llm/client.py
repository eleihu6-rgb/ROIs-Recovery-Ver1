"""LLM helpers. Two entry points:
   - llm_text(system, user, max_tokens) -> str         (regression generation)
   - llm_tools(messages, tools, system) -> (text, tool_calls)  (chat)
Tool calls are normalized to: [{'name': str, 'input': dict}]."""
import json
from typing import Any

import httpx

from .config import resolve_provider
from src.config.settings import settings


def _env_from_settings() -> dict[str, str]:
    """Provider env built from pydantic-settings (which loads ai-server/.env).
    The runtime keys live in settings, NOT os.environ — resolve_provider must
    read from here or it sees no credentials."""
    return {
        'AI_PROVIDER': settings.ai_provider,
        'ANTHROPIC_API_KEY': settings.anthropic_api_key,
        'ANTHROPIC_MODEL': settings.anthropic_model,
        'DEEPSEEK_API_KEY': settings.deepseek_api_key,
        'DEEPSEEK_MODEL': settings.deepseek_model,
        'DEEPSEEK_BASE_URL': settings.deepseek_base_url,
        'DASHSCOPE_API_KEY': settings.dashscope_api_key,
        'QWEN_MODEL': settings.qwen_model,
        'DASHSCOPE_BASE_URL': settings.dashscope_base_url,
    }


def _anthropic_client(api_key: str):
    import anthropic
    return anthropic.Anthropic(api_key=api_key)


def _chat_completions_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _openai_compatible_chat(cfg: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
    headers = {
        'Authorization': f"Bearer {cfg['api_key']}",
        'Content-Type': 'application/json',
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(_chat_completions_url(cfg['base_url']), headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()


def llm_text(system: str, user: str, max_tokens: int = 1024) -> str:
    cfg = resolve_provider(_env_from_settings())
    if cfg['provider'] == 'anthropic':
        client = _anthropic_client(cfg['api_key'])
        resp = client.messages.create(
            model=cfg['model'], max_tokens=max_tokens, system=system,
            messages=[{'role': 'user', 'content': user}],
        )
        return ''.join(b.text for b in resp.content if getattr(b, 'type', '') == 'text')
    data = _openai_compatible_chat(cfg, {
        'model': cfg['model'],
        'max_tokens': max_tokens,
        'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
    })
    return data['choices'][0].get('message', {}).get('content') or ''


def llm_tools(messages: list[dict[str, Any]], tools: list[dict[str, Any]], system: str,
              max_iterations: int = 10) -> tuple[str, list[dict[str, Any]]]:
    """Returns (assistant_text, collected_tool_calls). Runs a tool loop but since our
    tools have no server-side result to feed back (frontend applies them), we collect
    tool calls and stop. Anthropic and OpenAI tool formats are handled separately."""
    cfg = resolve_provider(_env_from_settings())
    if cfg['provider'] == 'anthropic':
        return _anthropic_tools(cfg, messages, tools, system)
    return _openai_tools(cfg, messages, tools, system)


def _anthropic_tools(cfg, messages, tools, system):
    client = _anthropic_client(cfg['api_key'])
    resp = client.messages.create(
        model=cfg['model'], max_tokens=1024, system=system,
        messages=messages, tools=tools,
    )
    text_parts, calls = [], []
    for block in resp.content:
        if getattr(block, 'type', '') == 'text':
            text_parts.append(block.text)
        elif getattr(block, 'type', '') == 'tool_use':
            calls.append({'name': block.name, 'input': dict(block.input)})
    return ''.join(text_parts), calls


def _openai_tools(cfg, messages, tools, system):
    oai_tools = [{'type': 'function', 'function': {
        'name': t['name'], 'description': t['description'], 'parameters': t['input_schema'],
    }} for t in tools]
    data = _openai_compatible_chat(cfg, {
        'model': cfg['model'],
        'max_tokens': 1024,
        'messages': [{'role': 'system', 'content': system}, *messages],
        'tools': oai_tools,
    })
    msg = data['choices'][0].get('message', {})
    calls = []
    for tc in (msg.get('tool_calls') or []):
        fn = tc.get('function') or {}
        calls.append({'name': fn.get('name', ''), 'input': json.loads(fn.get('arguments') or '{}')})
    return (msg.get('content') or ''), calls
