# RBot temporary provider failures

The OpenAI-compatible client currently surfaces the first DeepSeek HTTP 503 as a raw
exception. Retry HTTP 500/502/503/504 in the shared client, with configurable delays
defaulting to 1 and 2 seconds (three attempts total). Keep the selected provider and
request payload unchanged. Do not retry authentication, validation, transport, or
parsing failures. Tool execution remains outside the retry loop.

After retry exhaustion, chat returns a clear temporary-unavailability message and
an empty actions list. Other failures return a generic message without raw exception
URLs or response details. The existing per-attempt timeout remains 60 seconds;
repeated slow server failures can therefore take longer than one request.

Scope: ai-server LLM client, settings, chat error handling, and regression tests.
No provider failover or frontend redesign. Verify transient recovery, retry limits,
non-retryable errors, unchanged tool output, and safe chat errors with pytest.
Drive the actual Gantt chat UI against an isolated instance of the real backend
with only the provider transport simulated; check failure then recovery, and save
versioned screenshots under docs/assets/screenshots/gantt/.

## Verification receipt

- PASS (113 tests), from `ai-server/`:
  `.venv/bin/python -m pytest tests/test_llm_retry.py tests/test_llm_config.py tests/test_chat_route.py tests/test_chat_tools.py -q`
- PASS (2 tests including authentication), from `e2e/`:
  `GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 PBS_PORTAL_BASE_URL=http://localhost:3030/pbs/ npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/rbot-provider-retry.spec.ts --reporter=list`
  The initial invocation used `/fpqe/pbs/`, which returned 404 and prevented the
  configured web-server check from completing. Corrected to this machine's `/pbs/`.
- UI target: the existing Gantt server on port 5567, verified to run from this
  checkout. Chat requests were forwarded to an isolated instance of the real AI
  backend. Only outbound provider HTTP was simulated. Each prompt made exactly
  three provider attempts; failure returned no actions and recovery rendered the reply.
- Both captures were visually inspected:
  `docs/assets/screenshots/gantt/rbot-provider-unavailable-Ver1.png` and
  `docs/assets/screenshots/gantt/rbot-provider-recovered-Ver1.png`.
- PASS: `git diff --check`.
- PASS: real DeepSeek connectivity using `llm_text` with a harmless OK-only prompt.
- Local AI service restarted with the project's virtual environment to load the fix.
  PASS: `curl --max-time 5 -s -w '\nHTTP %{http_code}\n' http://127.0.0.1:3005/ai/health`
  returned HTTP 200 and `{"status":"ok"}`.

No frontend style changes or PBS business changes. A sustained provider outage
can still exhaust retries; this fix cannot restore the external provider itself.
