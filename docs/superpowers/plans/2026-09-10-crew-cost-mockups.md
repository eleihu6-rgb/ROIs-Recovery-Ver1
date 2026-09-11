# Crew Cost Mockups Implementation Plan

> For agentic workers: use executing-plans to implement sequentially. Ryan requested the mockups after reviewing the design; implementation is authorized.

**Goal:** Deliver three working local HTML cost-library alternatives with configurable calculations and Playwright receipts.

**Architecture:** Shared local data and typed calculation templates, three distinct layouts, one reusable editor. No runtime service or production data access.

**Tech stack:** HTML, CSS, vanilla JavaScript, existing Lucide assets and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-0917-crew-recovery-cost-library-design-Ver1.md`.

## Files

Under `docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/`:
- `catalogue.html`, `workbench.html`, `comparison.html`: directly openable entries.
- `styles.css`: responsive visual layouts.
- `model.js`: synthetic catalogue, validated formula templates and marginal pay.
- `app.js`: shared editor, catalogue, workbench, cases and selection policy.
- `icons.js`: generated from installed Lucide library.
- `verify.cjs`: browser regression and screenshot capture.

## Delivery Tasks

- [x] Implement model and three layouts with search, categories, rate/template editing, test quantities, GH comparison, local save and validated JSON import/export.
- [x] Implement daily-case candidate comparisons and manual/automatic selection; keep simulated legality visible and enforce conditional/rejected states.
- [x] Run `node docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/verify.cjs` with assertions for GH 850/250, over-threshold arithmetic, rate edits, template changes, booking delta, hotel quantity, delay bands, save/import and lowest-cost objective differences. PASS: 24 checks.
- [x] Capture desktop/mobile screenshots for every alternative in that run and visually inspect them. Six final screenshots inspected; no overlapping controls or page-level overflow.
- [x] Run `npm run check:ui` and `git diff --check`; record results and deliver links to the three HTML files. UI gate PASS: zero hard violations, 124 existing warnings.

## Constraints

All money is illustrative USD; no missing rate becomes a zero cost. Model settings are demonstration configuration, not validated airline contracts. No real Rust legality call, booking, payroll or roster mutation. Never imply automatic selection is real deployment. Preserve unrelated working-tree changes. No server is required for these static HTML files.
