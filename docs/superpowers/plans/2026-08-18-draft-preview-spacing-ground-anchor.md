# Draft Preview Ground-Anchored Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the assign confirm dialog for new 7504/8056 hits that the engine anchors on a ground duty (`pairingId` `0`/`null`), e.g. crew 2724 SIM → pairing 15718.

**Architecture:** `checkLiveDraftLegality` already diffs before/after and filters with `isRelated`. FLY↔FLY neighbor expansion stays. For spacing codes 7504/8056 only, if `pairingId` is `0` or `null`, related means the crew is in `primaryCrewIds` (edited crews, not pairing mates).

**Tech Stack:** TypeScript, Vitest, existing `roster-store-draft-legality.test.ts` helpers (`rosterItem`, `previewViolation`, `checkLiveDraftLegality` mocks).

## Global Constraints

- Spacing codes: **7504** and **8056** only.
- Ground-anchored: `pairingId == null || pairingId === 0` → related ⇔ `primaryCrewIds.has(String(v.crewId))`.
- Do **not** insert `0` into `spacingRelatedPairingIds`.
- Keep `expandRelatedWithNeighborFlyPairings` unchanged (FLY pairing ids only).
- Keep `!beforeKeys.has(violationKey(v))` for 7504/8056 (historical ground-anchored hits stay hidden).
- Do **not** change Rust, persisted `pairing_id = 0`, report/release loaders, 7505/7507, window overlap, or `preview-draft` overlay.
- Live and Scenario share `checkLiveDraftLegality` — one `isRelated` change covers both (§Gantt-Unify).
- Vitest on `roster-store-draft-legality.test.ts` is the gate. No Playwright. No `check:ui`.
- No secrets. §No-Auto-Commit: do not `git commit` unless the user asks.
- Spec: `docs/superpowers/specs/2026-08-18-draft-preview-spacing-ground-anchor-design.md`.

## File map

| File | Responsibility |
|------|----------------|
| `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` | Three new `checkLiveDraftLegality` cases (2724 SIM→15718, historical `0`, mate `0`) |
| `gantt/src/stores/roster-store.ts` | `isRelated` inside `checkLiveDraftLegality` (~255–267) |

Blast radius: `checkLiveDraftLegality` is used by Live roster assign/move/remove (`roster-store.ts`, `app-layout.tsx`, `pane-container.tsx`) and Scenario (`scenario-edit-controller.ts`). Signature unchanged.

---

### Task 1: Failing ground-anchor preview tests

**Files:**
- Modify: `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` (append inside `describe('checkLiveDraftLegality')`, after `shows new 8056 anchored on earlier pairing when related is later only`)

**Interfaces:**
- Consumes: `checkLiveDraftLegality`, `rosterItem`, `previewViolation`, `mocks` already in this file
- Produces: three tests that fail until `isRelated` treats spacing `pairingId` `0`/`null` as related for `primaryCrewIds` only

- [ ] **Step 1: Write the failing tests**

Reuse file helpers. Gap times match scenario 743 (report `10:05Z` vs STD `15:05Z`) so window overlap cannot accidentally pass.

```typescript
  it('shows new 8056 anchored on ground (pairingId 0) for the edited crew (2724 SIM→15718)', async () => {
    const v8056 = previewViolation({
      crewId: '2724',
      pairingId: 0,
      dutySeq: null,
      ruleCode: '8056',
      ruleInstance: '001',
      scopeKey: 'FLY|SIM>FLY|SIM|PRAM|PRPM|PRMM|CRAM|CRPM',
      startDt: '2026-08-11T23:15:00.000Z',
      endDt: '2026-08-12T10:05:00.000Z',
      message: 'Row 1: Rest between (SIM 2026-08-11 19:15) and (684 2026-08-12 06:05) is 10:50, which is below the required 13 RH.',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [v8056] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const sim = rosterItem({
      id: 10,
      crewId: '2724',
      pairingId: null,
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      label: 'SIM',
      schStrDtUtc: '2026-08-11T21:00:00.000Z',
      schEndDtUtc: '2026-08-12T03:15:00.000Z',
    })
    const fly = rosterItem({
      id: 11,
      crewId: '2724',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      label: '684',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })

    mocks.showConfirmDialog.mockResolvedValueOnce(true)
    await checkLiveDraftLegality(
      ['2724'],
      [sim],
      [sim, fly],
      { relatedItems: [fly], relatedPairingIds: [15718] },
    )

    expect(mocks.toRuleViolations).toHaveBeenCalledWith([v8056])
    expect(mocks.showConfirmDialog).toHaveBeenCalledOnce()
  })

  it('still hides historical ground-anchored 8056 present before and after the edit', async () => {
    const historical = previewViolation({
      crewId: '2724',
      pairingId: 0,
      dutySeq: null,
      ruleCode: '8056',
      ruleInstance: '001',
      scopeKey: '8056-old-ground',
      startDt: '2026-07-20T12:00:00.000Z',
      endDt: '2026-07-20T14:00:00.000Z',
      message: 'Historical ground-anchored 8056',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })
      .mockResolvedValueOnce({ allowed: true, violations: [historical] })

    const fly = rosterItem({
      id: 11,
      crewId: '2724',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })

    await checkLiveDraftLegality(
      ['2724'],
      [fly],
      [fly],
      { relatedItems: [fly], relatedPairingIds: [15718] },
    )

    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })

  it('does not show new ground-anchored 8056 on a pairing mate', async () => {
    const mateHit = previewViolation({
      crewId: '9999',
      pairingId: 0,
      dutySeq: null,
      ruleCode: '8056',
      ruleInstance: '001',
      scopeKey: '8056-mate-ground',
      startDt: '2026-08-11T23:15:00.000Z',
      endDt: '2026-08-12T10:05:00.000Z',
      message: 'Mate ground-anchored 8056',
      severity: 2,
    })
    mocks.checkDraft
      .mockResolvedValueOnce({ allowed: true, violations: [mateHit] })
      .mockResolvedValueOnce({ allowed: true, violations: [] })

    const primaryFly = rosterItem({
      id: 11,
      crewId: '2724',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })
    const mateFly = rosterItem({
      id: 12,
      crewId: '9999',
      pairingId: 15718,
      assignmentGroup: 'FLY',
      schStrDtUtc: '2026-08-12T15:05:00.000Z',
      schEndDtUtc: '2026-08-12T20:00:00.000Z',
    })

    await checkLiveDraftLegality(
      ['2724'],
      [primaryFly, mateFly],
      [primaryFly, mateFly],
      { relatedItems: [primaryFly], relatedPairingIds: [15718] },
    )

    expect(mocks.showConfirmDialog).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the new tests and confirm the first one fails**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts -t "ground"
```

Expected: `shows new 8056 anchored on ground` FAIL (`toRuleViolations` / `showConfirmDialog` not called with the 8056). The historical and mate tests may already PASS (dialog already hidden). Do not implement `isRelated` in this task.

---

### Task 2: Ground-anchored `isRelated` for 7504/8056

**Files:**
- Modify: `gantt/src/stores/roster-store.ts` (`isRelated` inside `checkLiveDraftLegality`, ~255–267)

**Interfaces:**
- Consumes: `primaryCrewIds`, `spacingRelatedRules` already in that function
- Produces: ground-anchored 7504/8056 related iff edited crew

- [ ] **Step 1: Impact check (before edit)**

GitNexus `impact({target: "checkLiveDraftLegality", direction: "upstream"})` if MCP is available. Callers: Live assign/move/remove and Scenario `scenario-edit-controller.ts`. Signature unchanged; risk LOW unless impact returns HIGH/CRITICAL.

- [ ] **Step 2: Update `isRelated`**

Replace the `isRelated` body with:

```typescript
    const isRelated = (v: typeof afterResult.violations[number]): boolean => {
      // Period Min-GDO anchors on an RP pairing, not necessarily the edited one.
      // Only warn for crews this edit actually moved/assigned/removed — not pairing mates.
      if (v.ruleCode === '7505' || v.ruleCode === '7507') {
        return primaryCrewIds.has(String(v.crewId))
      }
      // Spacing anchored on a ground duty (kernel pairing_id 0 / null): FLY-neighbor
      // expansion cannot see it. Related iff this edit's primary crew.
      if (spacingRelatedRules.has(v.ruleCode) && (v.pairingId == null || v.pairingId === 0)) {
        return primaryCrewIds.has(String(v.crewId))
      }
      if (relatedPairingIds.size === 0 && relatedWindows.length === 0) return true
      const pairingSet = spacingRelatedRules.has(v.ruleCode)
        ? spacingRelatedPairingIds
        : relatedPairingIds
      if (v.pairingId != null && pairingSet.has(v.pairingId)) return true
      return overlapsRelatedWindow(v.startDt, v.endDt)
    }
```

Do not change `expandRelatedWithNeighborFlyPairings`. Do not add `0` to that set.

- [ ] **Step 3: Re-run the ground-anchor tests**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts -t "ground"
```

Expected: PASS (3 tests; the first `-t "ground"` also matches `historical ground-anchored` and `pairing mate`).

- [ ] **Step 4: Run the full draft-legality file**

```bash
cd gantt && npx vitest run src/stores/__tests__/roster-store-draft-legality.test.ts
```

Expected: all tests in that file PASS, including existing FLY↔FLY 7504/8056 neighbor cases.

- [ ] **Step 5: Commit only if the user asks**

If asked, include spec + plan + test + `isRelated` together. Message:

```
fix(gantt): show draft 8056/7504 when spacing is anchored on a ground duty

Preview related-set dropped pairing_id=0 hits (SIM→FLY), so assign confirm stayed silent.
```

Do not commit in this task unless the user explicitly requested it.
