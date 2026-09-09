# rois-rule-engine (Rust)

Rust port of the ROIS crew-rostering rule engine. First rule migrated as the pilot for
moving the PBS solver / rule checks to Rust.

## Migration provenance

| Layer | Source |
|-------|--------|
| Proven logic | C++ `crewrule-dev/RuleEngine/rule8002.cpp` |
| Validation | C++ gtest `crewrule-dev/RuleTest/rule8002_gtest.cpp` |
| Params (authority) | legacy `rule.param_json` for 8002/006 (workset 103 "PBS Solver Ruleset") |

## Rule 8002 — MAX_CUM_BLOCK

Cumulative block hours (BLH), summed per crew per calendar day, must not exceed a limit
in any rolling **N-calendar-day** window. The standard F8 limit is 112:00 / 28 CD; it was
lowered to **40:00 / 28 CD** in `param_json` to stress-test against live rosters.

- `src/lib.rs` — the rule: `days_from_civil`/`parse_date_ord` (calendar-day ordinals),
  `max_rolling_window`, `check_max_cum_block`. Dependency-free (std only).
- `tests/rule_8002_cpp_replica.rs` — replicates the C++ gtest fixture (26 segments, 6715 min):
  **111:55 legal**, **112:05 (last seg +10 = 6725) violation** under the 112:00 limit.
- `src/bin/check_8002.rs` — live CLI. Reads TSV `crew_id\tYYYY-MM-DD\tblock_minutes` on
  stdin, applies the rule, prints violating crew + worst windows.

## Run

```bash
# Unit validation against the proven C++ values
cargo test --release

# Live check — data adapter (node → TSV) feeds the Rust rule engine
node <query roster_flight → TSV> | \
  target/release/check-8002 --window-days 28 --limit-hours 40
```

## Live results (f8 demo DB, 40h / 28 CD)

| Period | Crew | Violating | Worst window |
|--------|------|-----------|--------------|
| **Jun 2026** | 113 | **1 (0.9%)** | crew 998 — 54.5h | 
| **Jan 2026** (dense) | 546 | **151 (27.7%)** | crew 13187 — 105.0h |

June's roster is sparse in this demo (max ~37h block/crew), so 40h yields ~no violations;
the dense month (January) shows the rule firing widely. The check counts scheduled block
(`sch_end_dt_utc − sch_str_dt_utc`) per flight segment, bucketed by UTC calendar day — the
C++ engine buckets at crew-base local time, a refinement to add when this feeds a service.

## Next

- Crew-base-local day bucketing + cross-midnight block split (C++ `accumulateSegmentBlhAtCrewBase`).
- Expose as a service / wasm module consumed by live-server / pbs-server.
- Port the remaining 13 F8 rules from `param_json`.
