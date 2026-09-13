# screenshot-review

Deterministic screenshot inspection, plus delegated visual reading, for agent sessions whose
model **cannot accept image input**.

## The problem

`CLAUDE.md` §PW-Snapshot requires the agent to *inspect* the PNG captured by the Playwright
run before reporting done. But `view_image` is hard-blocked when the model in the session
does not advertise image input:

```
view_image is not allowed because you do not support image inputs
```

That is a **model capability gate**, not a file/permission problem and not an agent defect —
the screenshot is a perfectly valid PNG.

### Why Claude/Codex sessions can read images and DeepSeek sessions cannot

| | Multimodal model (GPT-5.x, Claude) | Text-only model (DeepSeek) |
| --- | --- | --- |
| Architecture | Has a vision encoder; images become embeddings next to text tokens | Text-only transformer; no vision tower |
| Catalog declaration | `input_modalities: ["text","image"]` | `input_modalities: ["text"]` |
| Result | `view_image` returns the picture | `view_image` is refused by the runtime |

The Codex runtime reads that declaration from the active model catalog (`~/.codex/config.toml`
→ `model_catalog_json`, e.g. `~/.codex/headroom-models.json`) and refuses to attach an image to
a model that cannot consume one. Nothing in this repo, and no permission change, can alter it —
**only the choice of model can.** So the fix is to keep a text-only session but route the
*reading* step to a model that has eyes.

## The fix

### 1. `vision.mjs` — borrow a multimodal model's eyes (real visual reading)

```bash
node scripts/screenshot-review/vision.mjs <png> [question]
```

This calls `codex exec -i <png>` against a vision-capable model on the **same local gateway**
this session already uses, then returns the model's plain-language description of the image.
It auto-selects the model from the catalog (first entry declaring `image` input), so it keeps
working when model names change. Override with `--model`, or list candidates with
`--list-models`.

Safety: the call runs in a throwaway temp directory, `--ephemeral`, with a `read-only`
sandbox, so the vision model can neither read nor modify this repo.

### 2. `review.mjs` — deterministic OCR + pixel evidence (offline, no model call)

Turn the pixels into text that any runtime can read, using only what macOS already ships
(Vision + CoreGraphics via `swiftc`) — **no Homebrew, no npm packages, no network.**

```
node scripts/screenshot-review/review.mjs <png> [options]
```

| Option | Meaning |
| --- | --- |
| `--expect "text"` | Assert the string appears in the OCR text (repeatable). `/regex/flags` also works. |
| `--expect-not "text"` | Assert the string does **not** appear (repeatable). |
| `--diff prev.png` | Compare against a prior `-Ver<N>` capture; reports % pixels changed + changed bbox. |
| `--min-ink 0.005` | Minimum non-background pixel fraction; guards against blank/"white page" captures. |
| `--allow-blank` | Skip the blank-image guard. |
| `--vision` | Also perform a real visual read via `vision.mjs` (see above). |
| `--ask "question"` | Question for the vision model; defaults to a general QA inspection prompt. |
| `--vision-model M` | Force a specific vision model. |
| `--quiet` | Print nothing on PASS (still writes sidecars). |

Each run writes two sidecars next to the PNG:

- `<png>.review.txt` — human-readable report (stats, assertions, full OCR text, visual read).
- `<png>.review.json` — the same data plus every OCR word with its bounding box.
- `<png>.vision.txt` / `.vision.json` — the multimodal model's answer, when `--vision` was used.

The `.txt` sidecars are small, human-readable proof and belong in the delivery report (and are
safe to commit). The `.json` sidecars are bulky and regenerable; they are git-ignored.

Exit codes: `0` pass, `1` assertion failed, `2` tool/build error — so it also works as a CI gate.

## Examples

```bash
# The full proof: deterministic assertions + a real visual read, in one command
node scripts/screenshot-review/review.mjs \
  docs/assets/screenshots/gantt/rule-3007-dxb-delay-alert-center-Ver1.png \
  --expect "Alert Center" --expect "3007/001" --expect "DXB" \
  --vision --ask "How many rows does rule 3007/001 show, and what colour is its badge?"

# Prove a design iteration actually changed pixels, and where
node scripts/screenshot-review/review.mjs \
  docs/assets/screenshots/gantt/feature-Ver2.png \
  --diff docs/assets/screenshots/gantt/feature-Ver1.png
```

## What this is and is not

- **Is**: an OCR+pixel layer that catches "the element exists but is hidden, overlapped,
  off-screen, or clipped" — which DOM assertions miss — plus, via `--vision`, an actual
  multimodal model's reading of colour, layout, and rendering defects.
- **Is not**: a replacement for the model's own vision when the session model already has it.
  If `view_image` works in your session, use it; this tool exists for when it does not.
- **Caveat**: the vision model is a second opinion, not ground truth. Pair it with `--expect`
  assertions (deterministic) or pixel sampling when a claim matters.

## Requirements

- `review.mjs` OCR/stats/diff: macOS + Xcode command line tools (`xcode-select --install`).
  The native helper `ocr.swift` is compiled once into `./.bin/rois-ocr` and cached; it rebuilds
  automatically when `ocr.swift` changes.
- `--vision` / `vision.mjs`: the `codex` CLI on `PATH` and a model catalog containing at least
  one image-capable model. It needs no API keys of its own — it reuses the Codex session's
  existing auth and gateway.

## Relationship to native `view_image`

The local Headroom gateway now carries a **vision bridge** for `deepseek-flash`
(`~/.headroom/extensions/codex-deepseek/`, 2026-09-13), so a text-only session gets native
`view_image` too — the client attaches the image and the proxy transcribes it with a
multimodal model before forwarding. Prefer that when it is available.

This tool remains the right choice when you want **deterministic, reproducible evidence
without a model call**: `--expect` assertions, pixel diffs between `-Ver<N>` captures, and
blank-capture guards, which run identically in CI and on any machine. `view_image` cannot
give you a diff or a pass/fail exit code.

## Tests

```bash
node --test scripts/__tests__/screenshot-review.test.mjs
# include the live vision round-trip (costs one model call):
SCREENSHOT_REVIEW_E2E_VISION=1 node --test scripts/__tests__/screenshot-review.test.mjs
```
