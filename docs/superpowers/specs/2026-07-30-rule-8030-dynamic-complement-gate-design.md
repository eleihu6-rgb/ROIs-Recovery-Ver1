# Rule 8030 Dynamic Complement Gate (PBS + Gantt)

Date: 2026-07-30

## Goal

Whenever a crew is newly assigned to a pairing, rule **8030 (Pilot Age / Age Restriction)** must evaluate the **full current crew-on-flight (COF) complement** on that pairing:

- pre-assigned / PA / fixed crews
- crews already committed by earlier optimizer steps (PBS)
- crews already present from saved roster **or** earlier draft ops (Gantt preview)

Violation when Division matches the rule (typically `P`) and  
`count(age ≥ Age Define) > Max Number` (F8 baseline: Age Define = 65, Max Number = 1).

Precedent: rule **8072** incremental complement APIs (`can_add` / `commit` / `rollback`) — see `docs/superpowers/specs/2026-07-25-pbs-8071-8072-runtime-legality-design.md`.

## Problem

### PBS

8030 was wired through PyO3 `check_line` using a **static** `pairing_baseline_crews` inverted only from fixed rosters. Documented simplification: it did **not** see other candidate lines committed in the same solve. Two dynamically assigned ≥65 pilots on the same pairing therefore passed the gate.

### Gantt draft preview

`POST /api/legality/preview-draft` built a temp `roster_flight` containing only `affectedCrewIds`. Pairing-mates (saved or draft) were invisible to `pilotAge()` / `check-8030`, so assigning a second ≥65 pilot did not surface 8030 at assign time.

## Design

### Grain

> **Superseded 2026-08-20:** COF is now **`flt_id` (segment) grain**. See
> [`2026-08-20-rule-8030-segment-grain-design.md`](./2026-08-20-rule-8030-segment-grain-design.md).
> Historical note below retained for audit only.

~~**Pairing-level** COF (same as the current live/PBS 8030 port). Not C++ per-`flt_id`.~~

### PBS

1. Maintain mutable `crew_on_pairing_8030: Vec<Vec<usize>>`, initialized from fixed rosters (same invert as today’s baseline).
2. Expose:
   - `can_add_pairing_8030(crew_idx, pairing_idx) -> Vec<String>`
   - `commit_pairing_8030(crew_idx, pairing_idx)`
   - `rollback_pairing_8030(crew_idx, pairing_idx)`
3. Classify 8030 under `complement_check_functions` alongside 8072 (leaves `actual_check_functions`).
4. `RustRuleChecker.can_add_complement` / `commit` / `rollback` dispatch **both** 8072 and 8030 when gated on.
5. Keep `check_line`’s 8030 path, but read the **mutable** COF so post-checks stay consistent after commits.

### Gantt draft preview

1. **Backend**: after loading affected crews into the temp roster, seed other non-deleted rows for touched `pairing_id`s whose `crew_id` ∉ `affectedCrewIds` (live + scenario).
2. **Frontend**: expand `affectedCrewIds` / `afterItems` to include simulated pairing-mates already holding those pairing ids (covers unsaved draft mates under §First-Paint).

## Non-goals

- Changing Age Define / Max Number business params
- ~~Porting C++ per-flight grain~~ (done in 2026-08-20 segment-grain spec)
- Soft “alert only” in the solver (gate remains hard reject like 8072)

## Verification

- PyO3 tests: second ≥65 rejected after first `commit`; rollback restores; PA peer counts
- PBS `rule_gates` + checker unit tests
- live-server / gantt Vitest for preview complement seeding
- Playwright: assign second ≥65 on a pairing that already has one → 8030 surfaces
