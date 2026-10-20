"""Isolated real AI app; only outbound provider HTTP is simulated for the UI test."""
import json
import socket
import sys
from pathlib import Path

import httpx
import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'ai-server'))

from main import app
import src.llm.client as llm

original_client = httpx.Client
attempts = {}
llm.settings.ai_provider = 'deepseek'
llm.settings.deepseek_api_key = 'test-only'
llm.settings.deepseek_base_url = 'https://provider.invalid'


def respond(request):
    payload = json.loads(request.content)
    prompt = payload['messages'][-1]['content']
    attempts[prompt] = attempts.get(prompt, 0) + 1
    # First UI request exhausts all retries; the next recovers on its third attempt.
    failed = 'unavailable' in prompt or attempts[prompt] < 3
    return httpx.Response(503 if failed else 200, json={
        'choices': [{'message': {'content': 'The roster pane shows crew rows and their assigned duties.'}}],
    })


llm.httpx.Client = lambda **kw: original_client(transport=httpx.MockTransport(respond), **kw)


@app.get('/test/provider-attempts')
def provider_attempts():
    return attempts


sock = socket.socket()
sock.bind(('127.0.0.1', 0))
print(f'PORT={sock.getsockname()[1]}', flush=True)
uvicorn.Server(uvicorn.Config(app, log_level='error')).run(sockets=[sock])
