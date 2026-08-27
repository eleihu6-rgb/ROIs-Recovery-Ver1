# Alert Center Rule ID → Rule Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking Alert Center Rule ID navigates to Legality → Rule Templates and focuses that instance.

**Architecture:** `pendingFocus` on rule-instances store; ViolationListDialog Rule ID button stops row click, closes dialog, switches shell module/item, requests focus; RuleInstancesView expands + scrolls.

**Tech Stack:** gantt React/Zustand, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-22-alert-center-rule-id-to-templates-design.md`
- UI English; stopPropagation on Rule ID
- §No-Auto-Commit unless asked

---

### Task 1: pendingFocus + parse helper

**Files:**
- Modify: `gantt/src/stores/rule-instances-store.ts`
- Create: `gantt/src/components/panes/parse-alert-rule-id.ts` + Vitest

- [ ] Parse `8030/001` → `{ functionCode: '8030', instanceCode: '001' }`; bare `8030` → instance null
- [ ] Store: `pendingFocus`, `requestFocus`, `clearPendingFocus`

### Task 2: Wire Alert Center + Templates view

**Files:**
- Modify: `gantt/src/components/panes/violation-list-dialog.tsx`
- Modify: `gantt/src/components/legality/rule-instances-view.tsx`

- [ ] Rule ID button: stopPropagation, close, `setActiveModule('legality')`, `setLegalityItem('rule-instances')`, `requestFocus`
- [ ] View: apply pending → search, expand row, scrollIntoView, clear; toast if not found

### Task 3: Playwright

- [ ] Assert Rule ID click opens Templates with focused row (or search filled)

---

**Self-review:** Spec covered; no placeholders.
