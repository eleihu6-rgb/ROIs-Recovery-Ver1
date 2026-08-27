# Preview Flight-Mate Focus Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope draft-preview `expandAffectedWithFlightMates` seed `fltId`s to focus/related pairings so large Scenario assigns (e.g. SIT 746) no longer 413, while keeping 8030 cross-pairing same-`fltId` COF.

**Architecture:** Extend the existing gantt helper with an optional `focusPairingIds` argument. When non-empty, seed only from items on those pairings; still expand to any crew sharing those `fltId`s. Pass the already-computed `focusPairingIds` from `checkLiveDraftLegality`. Empty/omitted focus keeps today’s full-crew seed behavior.

**Tech Stack:** TypeScript, Vitest (gantt), existing `RosterItem` types; no live-server / Rust changes.

**Spec:** `docs/superpowers/specs/2026-08-23-preview-flight-mate-focus-scope-design.md`

## Global Constraints

- §Gantt-Unify: one expand path for Live and Scenario (no Live-only fork)
- §Minimal-First / §Surgical: only `roster-store.ts` + its draft-legality Vitest file
- Do **not** raise Fastify `bodyLimit` in this plan
- Do **not** change pairing-mate expansion or backend preview-draft overlay
- UI copy remains English; no product UI strings in this change
- Commits only when the user explicitly asks (§No-Auto-Commit)

## File map

| File | Role |
|------|------|
| `gantt/src/stores/roster-store.ts` | `expandAffectedWithFlightMates` + `checkLiveDraftLegality` call site |
| `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` | Failing then passing Vitest for focus scope + regression |

---

### Task 1: Focus-scoped flight-mate expansion (TDD)

**Files:**
- Modify: `gantt/src/stores/roster-store.ts` (`expandAffectedWithFlightMates`, ~132–151; call in `checkLiveDraftLegality` ~217–224)
- Test: `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` (`describe('expandAffectedWithFlightMates')` ~208–221; any `checkLiveDraftLegality` assertions that list preview crew ids)

**Interfaces:**
- Consumes: `RosterItem`, existing `expandAffectedWithPairingMates`, `relatedPairingIds` / `focusPairingIds` already built in `checkLiveDraftLegality`
- Produces:
  ```typescript
  export const expandAffectedWithFlightMates = (
    affectedCrewIds: string[],
    simulatedItems: RosterItem[],
    focusPairingIds?: Iterable<number>,
  ): string[]
  ```

- [ ] **Step 1: Write failing Vitest cases**

In `describe('expandAffectedWithFlightMates')`, keep the existing cross-pairing test, then add:

```typescript
it('with focusPairingIds, seeds only fltIds on those pairings (not mates\' other duties)', () => {
  expect(
    expandAffectedWithFlightMates(
      ['B', 'A'], // A already a pairing-mate of the focus pairing
      [
        // Focus pairing 200: B assigning onto shared flight 500 with A
        rosterItem({ crewId: 'A', pairingId: 200, fltId: 500 }),
        rosterItem({ crewId: 'B', pairingId: 200, fltId: 500 }),
        // Mate A also flies unrelated flight 999 on another pairing — must NOT pull C
        rosterItem({ crewId: 'A', pairingId: 300, fltId: 999 }),
        rosterItem({ crewId: 'C', pairingId: 400, fltId: 999 }),
      ],
      [200],
    ).sort(),
  ).toEqual(['A', 'B'])
})

it('with focusPairingIds, still expands cross-pairing crews sharing the focus fltId', () => {
  expect(
    expandAffectedWithFlightMates(
      ['B'],
      [
        rosterItem({ crewId: 'A', pairingId: 100, fltId: 500 }),
        rosterItem({ crewId: 'B', pairingId: 200, fltId: 500 }),
        rosterItem({ crewId: 'C', pairingId: 300, fltId: 999 }),
      ],
      [200],
    ).sort(),
  ).toEqual(['A', 'B'])
})

it('without focusPairingIds, keeps legacy seed from all flts of expanded crews', () => {
  expect(
    expandAffectedWithFlightMates(
      ['A', 'B'],
      [
        rosterItem({ crewId: 'A', pairingId: 200, fltId: 500 }),
        rosterItem({ crewId: 'B', pairingId: 200, fltId: 500 }),
        rosterItem({ crewId: 'A', pairingId: 300, fltId: 999 }),
        rosterItem({ crewId: 'C', pairingId: 400, fltId: 999 }),
      ],
    ).sort(),
  ).toEqual(['A', 'B', 'C'])
})
```

Update the existing test to pass `[200]` (or the pairing that owns B’s item) **or** leave it without focus so it still asserts legacy behavior — prefer leaving the original test **without** the third arg so it documents empty-focus = legacy.

- [ ] **Step 2: Run tests — expect new cases to fail**

Run:

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts -t 'expandAffectedWithFlightMates'
```

Expected: new focus-scoped tests FAIL (third arg ignored / C still included).

- [ ] **Step 3: Implement `expandAffectedWithFlightMates`**

Replace the body in `gantt/src/stores/roster-store.ts` with:

```typescript
/** Expand affected crews with draft mates sharing the same physical fltId (8030 COF).
 *  When focusPairingIds is non-empty, seed fltIds only from items on those pairings
 *  (not from mates' full-period duties). Empty/omitted focus keeps legacy seeding. */
export const expandAffectedWithFlightMates = (
  affectedCrewIds: string[],
  simulatedItems: RosterItem[],
  focusPairingIds?: Iterable<number>,
): string[] => {
  const expanded = new Set(affectedCrewIds.map(String))
  const focus = new Set(
    [...(focusPairingIds ?? [])].filter((id) => Number.isFinite(id) && id > 0),
  )
  const seedFltIds = new Set<number>()
  for (const item of simulatedItems) {
    const fltId = item.fltId == null ? null : Number(item.fltId)
    if (fltId == null || !Number.isFinite(fltId) || fltId <= 0) continue
    if (focus.size > 0) {
      if (item.pairingId != null && focus.has(item.pairingId)) seedFltIds.add(fltId)
      continue
    }
    if (expanded.has(String(item.crewId))) seedFltIds.add(fltId)
  }
  if (seedFltIds.size === 0) return [...expanded]
  for (const item of simulatedItems) {
    const fltId = item.fltId == null ? null : Number(item.fltId)
    if (fltId != null && seedFltIds.has(fltId) && item.crewId) {
      expanded.add(String(item.crewId))
    }
  }
  return [...expanded]
}
```

Wire the call site in `checkLiveDraftLegality` (after `focusPairingIds` is defined):

```typescript
const previewCrewIds = expandAffectedWithFlightMates(
  expandAffectedWithPairingMates(
    affectedCrewIds,
    simulatedItems,
    relatedPairingIds,
  ),
  simulatedItems,
  focusPairingIds,
)
```

- [ ] **Step 4: Run expand + draft-legality Vitest — expect PASS**

Run:

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts
```

Expected: all tests in that file PASS. If any `checkLiveDraftLegality` test asserted over-expanded crew lists, update expectations to the focus-scoped set (same file; keep asserting 8030 mate still included).

- [ ] **Step 5: Commit only if the user asks**

Suggested message (do not run unless requested):

```bash
git add gantt/src/stores/roster-store.ts \
  gantt/src/stores/__tests__/roster-store-draft-legality.test.ts \
  docs/superpowers/specs/2026-08-23-preview-flight-mate-focus-scope-design.md \
  docs/superpowers/plans/2026-08-23-preview-flight-mate-focus-scope.md
git commit -m "$(cat <<'EOF'
fix(gantt): scope draft flight-mate expand to focus pairings

Prevent preview-draft 413 on dense Scenario assigns by seeding 8030
COF fltIds from focus pairings only, not mates' full-period duties.
EOF
)"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Seed from focus pairing `fltId`s when focus non-empty | Task 1 |
| Still expand cross-pairing same `fltId` | Task 1 Vitest |
| Empty focus = legacy behavior | Task 1 Vitest |
| Wire `checkLiveDraftLegality` → pass `focusPairingIds` | Task 1 |
| No bodyLimit / pairing-mate / backend changes | Explicit non-goals; no tasks |
| §Gantt-Unify shared path | Single helper + single call site |

## Playwright note

No dedicated e2e in this plan: reproducing SIT 746 density locally is fixture-heavy. Vitest covers the over-expansion regression that caused 413. If a headed SIT retest is needed after deploy, manually assign pairing 16183 → crew 1256 on scenario 746 and confirm preview returns 200.
