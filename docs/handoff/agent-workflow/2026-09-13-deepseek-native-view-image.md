# Handoff — native `view_image` for DeepSeek (Codex sessions)

**Date:** 2026-09-13
**Author:** Codex (deepseek-flash), with Ryan
**Scope:** Local Headroom proxy extension + Codex model catalog + repo screenshot-review tooling.
**Status:** ✅ Implemented and verified from the shell. ⏳ **Not yet verified from a fresh interactive session** — that is the one open item, and the reason for this handoff.

---

## 1. TL;DR — what to verify in the new session

A Codex session on `deepseek-flash` used to answer *"I can't see the image"* for any
screenshot, while Claude/GPT sessions could read them. That is now fixed by a **vision
bridge** in the local Headroom proxy. This session was started before the change, so it
still shows the old behaviour — **open a NEW session and confirm `view_image` works.**

**The single acceptance test:**

> In a new Codex session on `deepseek-flash`, ask:
> *"Use the view_image tool on `docs/assets/screenshots/gantt/rule-3007-dxb-delay-alert-center-Ver1.png` and tell me the count next to rule 3007/001 and the badge colour."*
>
> **PASS** = it returns something like *"4"* and *"orange/yellow / pale gold"*.
> **FAIL** = *"not allowed because you do not support image inputs"* (catalog not picked up)
> or *"I can't see the image / content was omitted"* (bridge not running).

Known-good reference answer (verified three independent ways — see §4):
**count = 4**, **badge = amber/gold (`rgb(240,177,0)`)**.

---

## 2. Why it did not work before (root cause)

Not a permission, file, or agent problem — a **model capability** gate:

1. Codex reads each model's declared capability from the catalog
   (`~/.codex/config.toml` → `model_catalog_json` → `~/.codex/headroom-models.json`).
2. `deepseek-flash` declared `input_modalities: ["text"]`, so Codex **stripped the image
   client-side** before the request was even sent.
3. Underlying reason: **`api.deepseek.com` is a text-only endpoint.** It cannot receive
   pixels. Claude/GPT models have a vision encoder; DeepSeek's do not.

So "give DeepSeek native `view_image`" can only mean: let the client attach the image, and
have the gateway **transcribe it to text** before forwarding. That is the bridge.

---

## 3. What was changed (all local, no vendor files patched)

### 3.1 Catalog — declare the capability

`~/.codex/headroom-models.json`, entry `deepseek-flash`:

```diff
- "supports_image_detail_original": false,
+ "supports_image_detail_original": true,
  "input_modalities": [
-   "text"
+   "text",
+   "image"
  ],
```

Nothing else in the file changed (all 5 GPT entries byte-identical).

### 3.2 Vision bridge — the transcoder

`~/.headroom/extensions/codex-deepseek/codex_deepseek_router.py` (editable install;
`headroom_local_codex_deepseek-0.1.0`, entry point `codex_deepseek`):

- `describe_image(url)` — decodes the base64 data URL to a temp `.png`, then calls
  `codex exec -i` with a multimodal model (`gpt-5.6-luna` by default) in a **throwaway
  read-only sandbox** to read it. Never raises; failures become a visible placeholder.
- `transcode_images(payload, describe, budget)` — walks the whole request body and replaces
  every image part with an equivalent `input_text` part. Covers message content, nested
  lists, and **`function_call_output`** (the `view_image` tool path).
- Wired into the `deepseek-flash` branch, **after** the key/state checks, running via
  `asyncio.to_thread` so a slow image read cannot stall other in-flight requests.
- GPT requests are untouched: images are only transcoded on the DeepSeek branch.

| Env var | Default | Purpose |
| --- | --- | --- |
| `HEADROOM_VISION_BRIDGE` | `1` | `0` = disable transcoding entirely (kill switch). |
| `HEADROOM_VISION_MODEL` | `gpt-5.6-luna` | Model that reads the image. |
| `HEADROOM_VISION_TIMEOUT` | `180` | Seconds per image. |
| `HEADROOM_VISION_MAX_IMAGES` | `4` | Images described per request; extras → placeholder. |

### 3.3 Repo tooling (independent of the bridge — still useful)

`scripts/screenshot-review/` — deterministic screenshot inspection for the §PW-Snapshot
gate: native macOS Vision OCR + pixel stats + `-Ver<N>` diffing, with `.txt`/`.json`
sidecars and CI-usable exit codes. `vision.mjs` also does an on-demand visual read.
`CLAUDE.md` §PW-Snapshot and `AGENTS.md` were updated with the fallback procedure.

**These repo files are NOT committed** — review then commit if wanted:

```
scripts/screenshot-review/{README.md,ocr.swift,review.mjs,vision.mjs,assertions.mjs}
scripts/__tests__/screenshot-review.test.mjs
M CLAUDE.md  M AGENTS.md  M .gitignore  M package.json
```

---

## 4. Evidence already captured (before the new-session test)

| # | Check | Command | Result |
| --- | --- | --- | --- |
| 1 | Baseline failure | `codex exec -m deepseek-flash -i <png> ...` (pre-change) | ❌ "I can't see the image — its content was omitted" |
| 2 | Attached-image read | `codex exec -m deepseek-flash -i <png> ...` | ✅ "4" / "Orange/yellow (rule-summary square)" |
| 3 | **`view_image` tool path** | `codex exec -m deepseek-flash 'Use the view_image tool on <png> ...'` | ✅ "4" / "pale gold"; log: `Vision bridge: transcoded 1 image part(s)` |
| 4 | Cross-check (OCR) | `node scripts/screenshot-review/review.mjs <png> --expect "3007/001"` | ✅ 4 crew rows: K1003, K1004, K1023, K1024 |
| 5 | Cross-check (pixels) | PIL sample at the rule badge | ✅ `rgb(240,177,0)` amber |
| 6 | Router unit tests | `headroom-venv/bin/python -m unittest -v test_router` | ✅ 16/16 |
| 7 | Repo tool tests | `npm run test:screenshot-review` | ✅ 12/12 (incl. opt-in live vision) |
| 8 | Regression: text turn | `codex exec -m deepseek-flash '…LIVE_FLASH_OK…'` | ✅ `LIVE_FLASH_OK` |
| 9 | Regression: GPT path | `codex exec -m gpt-6-astra '…LIVE_GPT_OK…'` | ✅ `LIVE_GPT_OK` |
| 10 | Service health | `curl 127.0.0.1:8787/readyz` | ✅ 200 (proxy restarted, PID 1836 → 89961) |

**Log line that proves the bridge fired:**

```sh
grep "Vision bridge" ~/.headroom/deploy/init-user/runner.log
# Vision bridge: transcoded 1 image part(s) for deepseek-flash
```

---

## 5. Restart / rollback / kill switch

```sh
# Restart the proxy (needed after editing the extension; ~3s downtime)
kill -TERM $(lsof -nP -iTCP:8787 -sTCP:LISTEN -t) $(ps -o ppid= -p $(lsof -nP -iTCP:8787 -sTCP:LISTEN -t) | tr -d ' ')
~/.local/bin/headroom install agent ensure --profile init-user
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/readyz   # expect 200
```

- **Kill switch (no rollback):** set `HEADROOM_VISION_BRIDGE=0` for the proxy and restart.
- **Full rollback:** restore
  `~/.headroom/extensions/codex-deepseek/backups/20260913-vision-bridge/codex_deepseek_router.py`
  and `~/.codex/headroom-models.json.bak-20260913-101435`, then restart as above.
- **A session already running keeps the old catalog** — the catalog is read at process start.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `view_image is not allowed because you do not support image inputs` | Session started before the catalog change | Start a new session / reopen the app |
| `I can't see the image — content was omitted` | Catalog has `image` but the bridge did not run | Check `runner.log` for `Vision bridge`; confirm the proxy restarted after the code edit |
| Answer says `[image could not be described: …]` | Vision model call failed (CLI missing, timeout, gateway down) | Read the placeholder text; check `codex` is on `PATH` and port 8787 is healthy |
| Image read is slow (5–15s) | One extra multimodal call per image | Expected. Lower `HEADROOM_VISION_TIMEOUT` or point `HEADROOM_VISION_MODEL` at a faster model |
| GPT sessions behave oddly | Not expected — GPT path is untouched; verify with check #9 | — |

---

## 7. Open items / decisions for Ryan

1. **Interactive-session confirmation** — run the §1 acceptance test in a fresh session (this handoff's purpose).
2. **Version control for the extension** — `~/.headroom/extensions/codex-deepseek/` is *not* a git repo. The router + 16 tests live only on this machine. Worth moving under version control?
3. **Commit the repo tooling?** — `scripts/screenshot-review/` and the `CLAUDE.md` / `AGENTS.md` edits are uncommitted in the worktree.
4. **Cost trade-off** — the bridge spends one vision call per image. If that matters, the cheaper deterministic path (`review.mjs --expect/--diff`, no model call) is still the right tool for regression evidence.
5. **Exactness** — the bridge gives DeepSeek a *description*, not raw pixels. For claims that must be exact (counts, pixel colours), pair it with `--expect` assertions or pixel sampling, as done in §4 rows 4–5.

---

**Related:** `~/.headroom/extensions/codex-deepseek/README.md` §"Vision bridge";
`scripts/screenshot-review/README.md` §"Relationship to native view_image";
`CLAUDE.md` §PW-Snapshot; `AGENTS.md` Delivery Checks.
