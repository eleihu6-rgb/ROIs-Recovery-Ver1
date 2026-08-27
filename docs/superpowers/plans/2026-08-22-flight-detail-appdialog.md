# Flight Detail AppDialog Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate Flight Detail shell to `AppDialog` so it is draggable like Crew Info.

**Architecture:** Keep LoadedDetail body/CSS; replace custom overlay+modal with AppDialog title/body/footer wiring from `FlightDetailDialog`.

**Tech Stack:** React, `@rois/ui` AppDialog, existing flight-detail CSS, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-22-flight-detail-appdialog-design.md`

## Global Constraints

- Preserve data load, Base column, Crew ID → Crew Info, compact spacing
- English UI; `data-testid="flight-detail-dialog"` retained
- Do not commit unless asked

## File map

| File | Change |
|------|--------|
| `flight-detail-dialog.tsx` | AppDialog shell; LoadedDetail as body-only (+ footer props) |
| `flight-detail-dialog.css` | Drop/adapt overlay+modal positioning that AppDialog owns |
| `scenario-detail-dialogs.spec.ts` / `flight-pane.spec.ts` | Adjust if close/backdrop selectors change |

---

### Task 1: Migrate shell to AppDialog

- [x] Refactor `FlightDetailDialog` to render `AppDialog` with Plane icon, title node, footer, `z-[1100]`, `footerClassName="py-1"`
- [x] Split LoadedDetail: body content vs footer meta/actions
- [x] Remove custom overlay, Escape listener, fixed `.modal` positioning CSS that fights AppDialog
- [x] Keep `flight-detail-dialog-root` on body wrapper for existing CSS

### Task 2: E2E verify

- [x] Run Scen-2020; fix selectors if needed
- [x] Paste PASS; stop for user commit
