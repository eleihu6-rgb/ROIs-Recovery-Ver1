# Project Operations — Memo

> Workspace for managing ROIS project operations on the roiscloud PM portal via Playwright.

## Target system

- **Tool**: **Plane** (open-source PM, Jira/Linear-style). The `/fpqe/` path is NOT the Plane workspace.
- **Login URL**: https://crew-f8-usva-tst.roiscloud.com/  (email-first → password)
- **Workspace slug**: `flair`  → projects live at `/flair/projects/<id>/issues/`
- **Login**: ryan@rois.us  (credential stored in `.auth` only, never commit plaintext elsewhere)
- **Projects**: `Flair PBS` (`11e7c19c-…`), **PBS Dev Team** (`badd48f1-a48b-4457-95e0-e2cbf2941cb2`).

## Plane API (used with cached cookies via in-page fetch)

- List items: `GET /api/workspaces/flair/projects/<projectId>/issues/?per_page=200`
- Rename item: `PATCH /api/workspaces/flair/projects/<projectId>/issues/<issueId>/` body `{"name":"…"}`,
  header `x-csrftoken` from the `csrftoken` cookie, `credentials: same-origin`. Returns **204** on success.
- Item description: list API omits it; `GET …/issues/<id>/` returns `description_html` (TipTap HTML
  with `data-id` + classes). To translate, rebuild the SAME element structure (keep every `data-id`/class),
  put English then `<br>` then original Chinese per block, and `PATCH {"description_html": "…"}` (204).
  Verified it persists and renders in the editor (not overwritten by the collab binary). See
  `scripts/translate-desc-pbs33.mjs` as the template.

## Gotchas

- `import.meta.url` `.pathname` is URL-encoded (spaces → `%20`); use `fileURLToPath()` for fs paths,
  or scripts write to a literal `%20` directory.
- Playwright is CommonJS here: `import pw from '…/playwright/index.js'; const { chromium } = pw`.

## Reusable skill

Packaged as the **`plane-project-ops`** skill (`~/.claude/skills/plane-project-ops/`) with a
generalized CLI `scripts/plane.mjs` (login / projects / list / get / rename / set-desc). Prefer that
CLI over the one-off scripts in `scripts/` below (kept for reference / this session's record).

## How we drive it

- Playwright (repo has v1.60 + chromium under `e2e/`).
- Scripts live in `project-operations/scripts/`.
- Login session is cached in `project-operations/.auth/state.json` (gitignored) so we don't re-login each run.
- Screenshots / page dumps land in `project-operations/out/` (gitignored).

## Tasks log

| Date | Task | Status |
|------|------|--------|
| 2026-06-17 | Set up ops folder + Playwright login (session cached) | done |
| 2026-06-17 | Read PBS Dev Team items (100 total) | done |
| 2026-06-17 | Rename 44 Chinese titles → `English (原中文)` on live board | done (44/44, verified 0 Chinese-only left) |

## Notes

- (filled in as we learn the portal structure)
