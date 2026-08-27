---
name: portal-help-writing
description: Write or update the PBS Portal in-app Help Center in pbs-portal/src/features/help, including Help topics, screenshots, navigation, E2E content tests, and manual QA docs. Use when the user mentions Portal Help pages, Help topics/articles, operation manuals, Help screenshots, or documenting Dashboard, Days Off, Pairing, Line, Reserve, or Tier behavior in pbs-portal.
---

# Portal Help Writing

## Overview

PBS Portal Help is a user-facing operating manual. Its content must match the current Portal UI and code, and it must not document unfinished features such as Standing Bid until those pages exist.

## Workflow

1. Read the user request and identify the Portal feature being documented.
2. Open the implementation files for that feature before writing content. The code is the source of truth for UI text, controls, and behavior.
3. Update the Help registry and topic map together:
   - `pbs-portal/src/features/help/help-data.ts`
   - `pbs-portal/src/features/help/components/help-view.tsx`
   - `pbs-portal/src/features/help/topics/<area>/<slug>.tsx`
4. Match exact Portal UI labels such as `ADD DAYS OFF PROPERTIES`, `ADD PAIRING PROPERTIES`, `ADD LINE PROPERTIES`, `ADD RESERVE BID`, `BID SUMMARY`, `T1-T7`, and `Search Current Rules`.
5. Do not use older `Layer` terminology in Portal Help. Portal bidding groups are `Tier` / `T1-T7`.
6. Do not write Standing Bid operation instructions until the Standing Bid route is implemented.
7. Add or update screenshots under `pbs-portal/public/help/screenshots/` only after capturing real Portal UI.
8. Add Playwright content regression tests under `e2e/tests/pbs-portal/help/`.
9. Update manual QA docs under `docs/test-cases/pbs/help/` when the Help scope changes.

## Screenshot Rules

- Use `e2e/scripts/capture-pbs-portal-help-screenshots.ts` to regenerate Overview screenshots.
- Capture real page elements, not mocked placeholder panels.
- Each `HelpScreenshot src` must have a corresponding PNG in `pbs-portal/public/help/screenshots/`.
- After capture, open or test the PNGs so broken images are caught before handoff.

## Test Rules

- Add exact text assertions for corrected or newly documented UI labels.
- Keep screenshot tests strict: exact image count per article plus `naturalWidth` / `naturalHeight` guards.
- Use mocked `/api/auth/session` for static Help E2E tests so they do not depend on PBS backend data.
- Run focused tests when possible:

```bash
cd e2e
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```
