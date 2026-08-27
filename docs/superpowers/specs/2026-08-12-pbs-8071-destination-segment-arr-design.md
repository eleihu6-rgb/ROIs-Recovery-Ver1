# PBS 8071 Destination = Segment Arrival Design

Date: 2026-08-12  
Status: Implemented (2026-08-12)  
Parent: `docs/superpowers/specs/2026-07-25-pbs-8071-8072-runtime-legality-design.md`

## Goal

PBS PyO3 rule 8071 must match the **Destinations** column against **flight-segment arrival airports**, matching C++ `segment->getArrStation()`, not the often-empty pairing-level `airport` field.

Evidence from SIT scenario 718 (crew 923 / pairing 15968 / DOMO / Dest includes `KIN`):

- `CrewTeam` is already loaded into `crew_teams` after the SIT solver patch.
- Pairing 15968 has segment `YYZ→KIN`, but `Pairing.airport` is empty.
- Current `check_8071` sets `destination = "*"` when `pairing.airport` is empty, so Dest-scoped rows never match KIN (or any concrete dest).
- Assignment trace shows Rust legality returned `valid: true` for `923 + 15968_CA`.

## Decision

**Approach A (approved):** In PyO3 `Engine::check_8071`, build one `RosterPropertyActivity` **per segment** when `pairing_to_8072_segments` has rows for that pairing; set `destination = segment.arr`.

Do **not** rewrite empty pairing airport to `"*"`.

## Behavior

For each pairing index in `fixed ∪ candidate`:

1. If `pairing_to_8072_segments[pi]` is non-empty:
   - Emit one activity per segment index.
   - `destination` = `segments_8072[seg_idx].arr` (trim; empty stays empty, does **not** become `*`).
   - `flight_number` = segment `flight_number` when present.
   - `duty_seq` / `segment_id` = segment `duty_seq` / `segment_id`.
   - Timing: prefer segment `start_utc` / `end_utc`; crew quals / teams / group / label / attributes / position still come from the pairing + crew (same as today).
2. Else (no segment payload for that pairing — ground/RES/etc.):
   - Keep one pairing-level activity.
   - `destination` = `pairing.airport` as-is (empty stays empty).

Matching remains existing `list_matches(rule.destinations, activity.destination)`:

- Dest rule `KIN` matches activity dest `KIN`.
- Dest rule `*` still matches any activity dest (including empty).
- Empty activity dest does **not** match a concrete Dest list.

Count modes unchanged in `rule8071.rs`:

- **R** (roster / `*`): unique `pairing_id` — multi-segment expand still counts the pairing once.
- **D**: unique `(pairing_id, duty_seq)`.
- **F**: `rows.len() / 2.0` over matching segment activities (aligns with C++ flight-sector / 2).

## Scope

| In scope | Out of scope |
|----------|--------------|
| `rule-engine-rs/py` `check_8071` activity construction | Changing Live/Scenario `check-8071` binary (already segment-based via roster properties) |
| PyO3 unit test for Dest=`KIN` + empty pairing airport + segment `arr=KIN` | Changing `pairing_airport` builder / 8056 airport semantics |
| Rebuild/install SIT `rois_rule_engine_rs` wheel into solver env + clear user-site shadow | Broader 8071 redesign |
| Re-run SIT scenario 718 and assert 923 does not keep 15968 when DOMO Dest includes KIN | Changing 8071 param rows in DB |

## Data already available

PBS builder feeds `pairing_8072_segments` from `PairingDutySegment`. F8 ro_input uses **`depArp` / `arvArp`** (not only `strArp` / `endArp`). `_build_8072_segments` must map those aliases into `dep` / `arr`, or Dest matching stays empty even after segment expansion.

## Testing

1. **PyO3** (`rule-engine-rs/py/tests`):
   - Engine with one pairing, `pairing_airport=[""]`, one 8072 segment `arr=KIN`, rule Dest=`KIN`, Max=0, Unit=RP/CD as convenient → `check_line` emits 8071 over-max.
   - Same setup with Dest=`MEX` and only `arr=KIN` → no violation.
   - Dest=`*` with empty arr still matches (wildcard Dest).
2. **Regression**: existing `test_engine_phase2_8071.py` (Dest=`*`) remains green.
3. **SIT**: after wheel deploy, re-run scenario 718; `assignment_original["923"]` must not contain `15968` (or assignment trace must show LEGALITY_RUST / 8071 on that candidate).

## Deploy note (SIT)

Live solver uses `/root/miniforge3/envs/flair-pbs-env`. User site `~yuan.z/.local/.../rois_rule_engine_rs` previously shadowed the env; keep `PYTHONNOUSERSITE=1` in SIT `ro_rust.sh` (already patched) when installing/re-running.

## Non-goals

- Do not pipe-join airports into `pairing_airport`.
- Do not change C++ parity for Live batch beyond what shared `rule8071` already does.
- Do not treat empty dest as wildcard for Dest-scoped rows.
