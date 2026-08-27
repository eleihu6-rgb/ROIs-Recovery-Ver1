# Design: rule-engine-rs release bins from Cargo.toml + live-server startup gate

**Date:** 2026-08-12
**Status:** approved (2026-08-12)
**Context:** SIT scenario 740 legality stayed `FAILED` with `check-7507` ENOENT after live-server JS fixes shipped. Root cause: `deploy/sit/deploy.sh` maintained a hardcoded `RUST_BINS=(...)` allowlist that omitted `check-7507` even though `rule-engine-rs/Cargo.toml` already declares `[[bin]] name = "check-7507"`.

## Goals

1. **Single source of truth** for which release binaries must be built and deployed: every `[[bin]]` in `rule-engine-rs/Cargo.toml` (workspace root package only; not `py/`).
2. **Fail deploy** if any declared bin is missing after `cargo build --release`.
3. **Fail live-server startup** if any declared bin is missing or not executable at the resolved `rule-engine-rs/target/release/` path — before any legality recheck can silently half-fail.

## Non-goals

- Changing Rust rule logic or TSV contracts.
- Per-request binary existence checks (startup once is enough; `runBin` already has missing/stale guards when a rule runs).
- Deploying Cargo build intermediates (`*.d`, `deps/`, etc.) as first-class artifacts (UAT may still rsync the release dir wholesale after the same existence gate).

## Approach

### A. Shared bin list derivation

Add a small shared helper used by deploy scripts (and optionally by tests):

- Path suggestion: `deploy/common/list-rule-engine-bins.sh` (sourced by SIT/UAT), **or** a tiny Node/Python one-liner invoked the same way from both.
- Input: path to `rule-engine-rs/Cargo.toml`.
- Behavior: walk `[[bin]]` tables in that file only; emit one bin `name` per line (stable sort optional).
- Ignore: comments, `[workspace]` / `py` member manifests, `[lib]`.
- Failure: empty list or unreadable file → non-zero exit / deploy `die`.

No second hand-maintained array in `deploy/sit/deploy.sh`.

### B. SIT deploy (`deploy/sit/deploy.sh`)

Update `push_rust_bins`:

1. `mapfile -t RUST_BINS < <(list_rule_engine_bins "$ROIS_AI/rule-engine-rs/Cargo.toml")` (or equivalent).
2. Keep existing change-detection / remote-missing logic, but evaluate “missing on Portal” against this dynamic list.
3. `cargo build --release` as today.
4. For each name in the list: require local `-x target/release/$bin`, else `die` with a clear message naming the bin.
5. `scp` each bin to `$PORTAL_DEV/rule-engine-rs/target/release/`.

Delete the hardcoded `RUST_BINS=(ruletool check-8002 ...)` block (including the stale comment that claims “all Cargo.toml bins” while the array lags).

### C. UAT deploy (`deploy/uat/deploy.sh`)

Align the gate even though push uses `rsync` of `target/release/`:

1. After `cargo build --release`, verify **every** Cargo-derived bin is `-x` (today only `ruletool` is checked).
2. Then rsync as today.

### D. live-server startup gate

On live-server boot (before or immediately after successful listen setup — preferably **before** accepting traffic / spawning legality children):

1. Resolve bin dir the same way as `legality-recheck-core.mjs` (`…/rule-engine-rs/target/release` relative to repo layout used in production).
2. At build/deploy time, generate `live-server/scripts/rust-bins.json` from the **same** Cargo.toml derivation and deploy it with the runtime scripts. Binary-only SIT/UAT hosts load this manifest because neither `Cargo.toml` nor `deploy/common/` is shipped.
3. In a full local checkout, fall back to `Cargo.toml` through the shared list helper when the manifest is absent. `Cargo.toml` remains the source of truth; the JSON file is its generated runtime artifact.
4. For each name: `fs.existsSync` + executable bit (or `fs.accessSync(X_OK)`).
5. On any miss: log all missing names in one error and **`process.exit(1)`** (or refuse to finish bootstrap). Message must mention deploy path (`deploy/sit/deploy.sh` rust-bins / `cargo build --release`).

Do **not** require source-tree freshness (`assertFresh`) at startup on binary-only Portal deploys where `rule-engine-rs/src` is absent — existence/executability only. Staleness remains a `runBin`-time concern when sources are present.

### E. Tests

- Unit/fixture: mini Cargo.toml with several `[[bin]]` → parser returns exact names including a stand-in for `check-7507`.
- Smoke against real `rule-engine-rs/Cargo.toml`: list includes `check-7507`, `ruletool`, and length matches count of `[[bin]]` tables.
- live-server: startup helper test with temp dir missing one bin → throws / returns the missing set (no need to boot full Fastify in CI if the helper is extracted).

## Data / control flow

```text
rule-engine-rs/Cargo.toml [[bin]]
        │
        ▼
 list-rule-engine-bins (shared)
        │
        ├─► deploy/sit|uat → rust-bins.json → live-server scripts
        ├─► deploy/sit|uat push_rust_bins → cargo build → assert -x → scp/rsync
        └─► live-server boot gate → manifest (or local Cargo fallback) → assert -x
```

## Error handling

| Layer | Missing bin behavior |
|-------|----------------------|
| Deploy after build | `die` / `fail` — do not push a partial set as “success” |
| live-server startup | exit non-zero with full missing list |
| `runBin` (unchanged) | still throws ENOENT/stale if something deletes a bin after boot |

## Acceptance

- Hand-edited `RUST_BINS` array no longer exists in SIT deploy.
- Adding a new `[[bin]]` to Cargo.toml alone is enough for the next rust-bins deploy to build, verify, and push it.
- Real Cargo.toml derivation includes `check-7507`.
- Live-server started against a release dir without `check-7507` fails immediately with an explicit missing-bin error.
- Scenario legality recompute no longer fails solely because deploy forgot a Cargo-declared bin.

## Out of scope follow-ups

- CI job on every PR that runs the Cargo.toml list vs a dry-run of deploy assertions (nice-to-have; local/deploy gate is the hard fix).
- pbs-server independent-host deploys that also need these bins (same helper can be reused later).
