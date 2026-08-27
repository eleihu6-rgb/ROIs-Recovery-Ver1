---
name: 101-enrich-plane-desc
description: Use when enriching a Plane work item's description with structured content derived from the codebase and existing docs — goal, to-do, how to test, done acceptance. Triggers when the user asks to "fill in", "enrich", "write up", or "document" a Plane item (PBS-xxx) based on what's actually in the code.
---

# 101-enrich-plane-desc

Write a structured, codebase-grounded description for a Plane work item. The result has four sections: **Overall Goal → Things To-Do → How To Test → Done Acceptance**. All content must be derived from reading the actual code, not from assumptions.

## Steps

1. **Get the current item** via `100-plane-ops` CLI (`get`). Note the title and any existing description.
2. **Explore the codebase** with an `Explore` subagent — scope the search to the feature area implied by the title:
   - Relevant source files / components
   - Existing tests (unit + e2e)
   - Any docs under `docs/` or `CLAUDE.md` rules that apply
   - Gaps: what clearly exists vs. what is missing
3. **Write the four-section TipTap HTML** (see template below).
4. **PATCH via `100-plane-ops`** `set-desc <projectId> <issueId> <file>`.
5. **Verify** by re-fetching the item and confirming the HTML is present.

## Four-section structure

| Section | Guidance |
|---------|----------|
| **Overall Goal** | ≤ 200 words. Synthesise title + existing desc + codebase findings. If info is sparse, keep it general rather than inventing specifics. |
| **Things To-Do** | Numbered list. Each item is a concrete, codebase-grounded action (file path, function name, test file). No vague bullets. |
| **How To Test** | Numbered list. Specific commands (`npx playwright test …`) + manual navigation steps. |
| **Done Acceptance** | Bulleted checklist. Each bullet is binary pass/fail: measurable, verifiable, no "looks good". |

## TipTap HTML template

```html
<h2 class="editor-heading-block" data-id="h2-goal-SLUG">Overall Goal</h2>
<p class="editor-paragraph-block" data-id="p-goal-SLUG">…</p>

<h2 class="editor-heading-block" data-id="h2-todo-SLUG">Things To-Do</h2>
<ol class="list-decimal pl-7 space-y-(--list-spacing-y)" data-id="ol-todo-SLUG">
  <li class="not-prose space-y-2" data-id="li-todo-1">
    <p class="editor-paragraph-block" data-id="p-todo-1"><strong>Action title</strong> — details with file paths.</p>
  </li>
</ol>

<h2 class="editor-heading-block" data-id="h2-test-SLUG">How To Test</h2>
<ol class="list-decimal pl-7 space-y-(--list-spacing-y)" data-id="ol-test-SLUG">
  <li class="not-prose space-y-2" data-id="li-test-1">
    <p class="editor-paragraph-block" data-id="p-test-1">…</p>
  </li>
</ol>

<h2 class="editor-heading-block" data-id="h2-done-SLUG">Done Acceptance</h2>
<ul class="list-disc pl-7 space-y-(--list-spacing-y)" data-id="ul-done-SLUG">
  <li class="not-prose space-y-2" data-id="li-done-1">
    <p class="editor-paragraph-block" data-id="p-done-1">…</p>
  </li>
</ul>
```

Replace `SLUG` with the PBS number (e.g. `pbs107`). All `data-id` values must be unique within the document.

## Gotchas

- Use `Explore` agent for codebase research — it's much faster than reading files manually.
- If the item already has a description, preserve any existing content as context but replace the whole `description_html` with the new structured version.
- `<code>` tags are valid inside TipTap paragraphs — use them for file paths, commands, and UI strings.
- `<strong>` works for bold within `<p>`.
- `data-id` values are arbitrary UUIDs — using short readable names (e.g. `h2-goal-pbs107`) is fine and avoids collisions.
- Always verify with a re-`get` after PATCH — 204 status alone is not proof.

## Verified example

PBS-107 (pbs-portal Help / user manual): enriched from 29-topic help system findings + Award page gap analysis + missing e2e test coverage. Written 2026-06-17. See `project-operations/out/pbs107-desc.html`.
