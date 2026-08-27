---
name: 100-plane-ops
description: Use when reading or editing items in the team's Plane project-management portal on roiscloud (workspace "flair", e.g. project "PBS Dev Team") via Playwright — listing work items, bulk-renaming titles, reading/updating descriptions, or translating Chinese titles/descriptions to "English + original Chinese".
---

# Plane Project Ops (roiscloud)

Drive the team's **Plane** PM portal (open-source, Jira/Linear-style) with Playwright + the Plane REST API. Reads via API; writes (rename, description) PATCH the API with the CSRF cookie. Session is cached so you log in once.

## Key facts (verified)

- Portal is **Plane**. The `/fpqe/` path is the Gantt app, **NOT** the Plane workspace → "Workspace not found".
- Login URL `https://crew-f8-usva-tst.roiscloud.com/` is **email-first**: fill email → Continue → password appears → submit.
- Workspace slug: **`flair`**. Projects at `/flair/projects/<projectId>/issues/`.
  Known projects: `Flair PBS`, **PBS Dev Team** = `badd48f1-a48b-4457-95e0-e2cbf2941cb2`.
- API (in-page `fetch` so cookies apply): list `GET /api/workspaces/flair/projects/<pid>/issues/?per_page=300`;
  detail/rename/desc `…/issues/<id>/`. **PATCH** `{name}` or `{description_html}` with header
  `x-csrftoken` (from `csrftoken` cookie), `credentials:'same-origin'` → returns **204**.

## Quick reference

```bash
# Credentials only needed for the one-time login.
export PLANE_EMAIL=ryan@rois.us PLANE_PASSWORD='R@iscrew2027'
node scripts/plane.mjs login
node scripts/plane.mjs projects
node scripts/plane.mjs list <projectId>                 # -> PBS-<seq> <id> <name>, saves .plane/items.json
node scripts/plane.mjs get <projectId> <issueId>        # name + description_html
node scripts/plane.mjs rename <projectId> <issueId> "English title (原中文)"
node scripts/plane.mjs set-desc <projectId> <issueId> new-desc.html
# Create a new issue (POST), returns PBS-<seq> id=<uuid>
node scripts/plane.mjs create <projectId> "Title" --desc desc.html --start 2026-06-09 --end 2026-06-20
```

Override `PLANE_BASE` / `PLANE_SLUG` for other instances; `PLANE_PW` if the playwright module is elsewhere.

## Bilingual translation pattern ("English + original Chinese")

- **Titles**: `English (原中文)`. Preserve leading tags like `[UI]`/`[Rule]`. Skip an item only if its title is *already* bilingual — match on the full target, not a 12-char prefix (titles that start with English words like "Pairing Filter失效" get falsely skipped otherwise).
- **Descriptions**: `description_html` is TipTap HTML with `data-id` + classes. Rebuild the **same element structure** (keep every `data-id`/class), put English then `<br>` then the original per block, save to a file, `set-desc`. Quote the original verbatim (keep its typos). Verified to persist and render in the editor.

## Gotchas (cost real time)

| Gotcha | Fix |
|--------|-----|
| Playwright here is CommonJS | `const { chromium } = (await import(pwPath)).default` |
| `import.meta.url`.pathname is URL-encoded (`%20`) | use `fileURLToPath()` for fs paths, else files land in a literal `%20` dir |
| `/fpqe/` shows "Workspace not found" | that's the Gantt app; go to `/` then `/flair/` |
| Login looks single-step | it's email-first, password appears after Continue |
| `plane.mjs` is not in `scripts/` | script lives at `~/.claude/skills/100-plane-ops/scripts/plane.mjs`; invoke with `node /Users/kimi/.claude/skills/100-plane-ops/scripts/plane.mjs` |
| After login, `list` returns 0 items (401 API) | session state only holds `csrftoken` cookie — the auth token is session-based. Run `login` again with correct `PLANE_PASSWORD='R@iscrew2027'`; the `Our2027` password is the gantt admin, not Plane |

## Verify before claiming done

Re-`get`/`list` after writing and confirm the new text is present (PATCH 204 ≠ proof). For bulk renames, re-list and assert 0 items remain in the old (e.g. Chinese-only) state.
