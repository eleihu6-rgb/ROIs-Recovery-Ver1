# 7305 Crew Puck Window Paint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Crew-targeted legality violations with a paint window only mark overlapping roster pucks (fix scenario 740 / crew 13645 whole-month “!” for 7305).

**Architecture:** Reuse `pairingTasksOverlapViolationWindow` in Live + Scenario violation→puck maps and puck-hover tooltip; crew bell / Alert Center unchanged.

**Tech Stack:** TypeScript, Vitest (`gantt`), existing `violation-puck-window.ts` helpers.

**Spec:** `docs/superpowers/specs/2026-08-14-7305-crew-puck-window-paint-design.md`

---

## File map

| File | Role |
|------|------|
| `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts` | RED/GREEN for Live+Scenario crew-window paint |
| `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts` | RED/GREEN puck tooltip window filter |
| `gantt/src/components/gantt/source/scenario-gantt-source.ts` | `buildViolationMap` crew branch |
| `gantt/src/components/gantt/source/live-gantt-source.ts` | `buildLiveViolationMap` crew branch |
| `gantt/src/components/gantt/violation-tooltip.tsx` | Live + Scenario puck hover crew match + window |

---

### Task 1: Failing severity-map tests

**Files:**
- Modify: `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`

**Step 1: Write the failing test**

Add two cases (Live `ruleViolations` crew key + Scenario `crew:` key):

- Crew `13645`, tasks: in-window Sep 3 CRAM + out-of-window Sep 20 DO (distinct `schStrDtUtc`/`schEndDtUtc`)
- Crew-target 7305 with `windowStartDt`/`windowEndDt` = `2026-08-31` .. `2026-09-05` (or ISO with times matching stored row)
- Expect: in-window task severity > 0; out-of-window `?? 0 === 0`; crew severity map still lit

**Step 2: Run test — expect FAIL**

```bash
cd gantt && npx vitest run src/components/gantt/source/__tests__/violation-window-severity.test.ts
```

**Step 3: Implement map filters**

In `scenario-gantt-source.ts` crew branch and `live-gantt-source.ts` crew branch: per-violation loop; skip bell-only; bump only when `pairingTasksOverlapViolationWindow([it], v)`.

**Step 4: Run tests — expect PASS** (same command)

**Step 5: Commit** (when user asks)

---

### Task 2: Tooltip window filter

**Files:**
- Modify: `gantt/src/components/gantt/__tests__/violation-tooltip.test.ts`
- Modify: `gantt/src/components/gantt/violation-tooltip.tsx`

**Step 1: Failing test** — puck hover on out-of-window task must not list crew-target 7305; in-window puck must; crew-header hover still lists it.

**Step 2: Run — FAIL**

```bash
cd gantt && npx vitest run src/components/gantt/__tests__/violation-tooltip.test.ts
```

**Step 3: Fix** — Live path: add overlap check on crew match. Scenario puck path: include `targetType === 'crew'` with same overlap check (today Scenario omits crew on puck hover).

**Step 4: PASS + re-run severity tests**

**Step 5: Commit** (when user asks)

---

### Task 3: Verify

```bash
cd gantt && npx vitest run src/components/gantt/source/__tests__/violation-window-severity.test.ts src/components/gantt/__tests__/violation-tooltip.test.ts
```

Manual/optional: scenario 740 crew 13645 — “!” only on Aug 31–Sep 5 duties.
