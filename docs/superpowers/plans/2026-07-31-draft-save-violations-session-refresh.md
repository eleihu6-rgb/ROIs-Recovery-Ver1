# Draft Save Violations Session Refresh — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement in-session with TDD).  
> **Spec:** `docs/superpowers/specs/2026-07-31-draft-save-violations-session-refresh-design.md`

**Goal:** After successful Live draft Save, clear session violations and refetch persisted violations (immediate + 4s delay) so crew-bell / Alert Center show post-recheck text without hard refresh.

**Files:**
- `gantt/src/stores/draft-store.ts` — call refresh helper at end of successful `commit()`
- `gantt/src/stores/__tests__/draft-store-commit-violations-refresh.test.ts` — unit coverage

## Task 1: Failing unit test

Assert successful `commit()` with locks:
1. calls `clearSessionViolations`
2. dispatches `violations:updated` with `groupCode` (ruleGroupCode || `'103'`)
3. with fake timers, advances 4s → second dispatch

## Task 2: Implement helper + wire into `commit()`

Extract `refreshViolationsAfterDraftCommit` in `draft-store.ts`; invoke after roster/manday refresh, before `return true`.

## Task 3: Verify

`npx vitest run src/stores/__tests__/draft-store-commit-violations-refresh.test.ts`
