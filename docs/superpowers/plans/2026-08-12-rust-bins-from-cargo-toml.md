# Rust bins from Cargo.toml + startup gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive every deployable `rule-engine-rs` release binary from `Cargo.toml` `[[bin]]` entries (no hand-maintained SIT allowlist), and fail live-server startup if any of those binaries is missing.

**Architecture:** One shared Node parser (`deploy/common/list-rule-engine-bins.mjs`) is the single source of bin names. SIT/UAT deploy shells invoke it; live-server boot calls the same module (or a thin re-export) before listen. Deploy asserts local `-x` after `cargo build --release`; startup asserts existence + execute permission under `rule-engine-rs/target/release`.

**Tech Stack:** Node ESM, bash deploy scripts, Vitest (live-server), existing Fastify `live-server/src/index.ts` bootstrap.

**Spec:** `docs/superpowers/specs/2026-08-12-rust-bins-from-cargo-toml-design.md`

## Global Constraints

- Single source of truth = root `rule-engine-rs/Cargo.toml` `[[bin]]` only (not `py/`).
- Binary-only Portal deploys: startup checks existence/executability only — do not require `rule-engine-rs/src` freshness at boot.
- Do not change Rust rule logic or TSV contracts.
- Do not add per-request bin scans.
- §Minimal-First / §Surgical: no drive-by deploy refactors beyond rust-bins + the shared helper + startup gate.
- No auto-commit unless the user explicitly asks.

## File map

| File | Responsibility |
|------|----------------|
| `deploy/common/list-rule-engine-bins.mjs` | Parse `[[bin]]` names; CLI prints one name per line; export `listRuleEngineBins(cargoTomlPath)` |
| `deploy/common/__tests__/list-rule-engine-bins.test.mjs` | Fixture + real Cargo.toml smoke |
| `deploy/sit/deploy.sh` | Replace hardcoded `RUST_BINS`; call Node helper |
| `deploy/uat/deploy.sh` | After build, assert all Cargo bins `-x` before rsync |
| `live-server/scripts/assert-rust-bins.mjs` | Resolve release dir; reuse list helper; return/throw missing |
| `live-server/scripts/__tests__/assert-rust-bins.test.mjs` | Missing-bin cases |
| `live-server/src/index.ts` | Call assert before `listen` (fail boot with exit 1) |

---

### Task 1: Shared Cargo.toml `[[bin]]` list helper

**Files:**
- Create: `deploy/common/list-rule-engine-bins.mjs`
- Create: `deploy/common/__tests__/list-rule-engine-bins.test.mjs`

**Interfaces:**
- Produces: `export function listRuleEngineBins(cargoTomlPath: string): string[]` — sorted unique bin names; throws if file missing or zero bins.
- Produces CLI: `node deploy/common/list-rule-engine-bins.mjs [path-to-Cargo.toml]` → stdout one name per line; default path = repo `rule-engine-rs/Cargo.toml` relative to this file (`../../rule-engine-rs/Cargo.toml`).

- [ ] **Step 1: Write the failing test**

```js
// deploy/common/__tests__/list-rule-engine-bins.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listRuleEngineBins } from '../list-rule-engine-bins.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('parses [[bin]] names and ignores [lib] / package name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-bins-'))
  const cargo = path.join(dir, 'Cargo.toml')
  fs.writeFileSync(cargo, `
[package]
name = "rois-rule-engine"
[lib]
name = "rois_rule_engine"
path = "src/lib.rs"
[[bin]]
name = "check-7505"
path = "src/bin/check_7505.rs"
[[bin]]
name = "check-7507"
path = "src/bin/check_7507.rs"
[[bin]]
name = "ruletool"
path = "src/bin/ruletool.rs"
`)
  assert.deepEqual(listRuleEngineBins(cargo), ['check-7505', 'check-7507', 'ruletool'])
})

test('real rule-engine-rs Cargo.toml includes check-7507 and ruletool', () => {
  const cargo = path.resolve(__dirname, '../../../rule-engine-rs/Cargo.toml')
  const bins = listRuleEngineBins(cargo)
  assert.ok(bins.includes('check-7507'))
  assert.ok(bins.includes('ruletool'))
  assert.ok(bins.includes('check-7505'))
  assert.ok(bins.length >= 18)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test deploy/common/__tests__/list-rule-engine-bins.test.mjs`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```js
// deploy/common/list-rule-engine-bins.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Parse workspace-root rule-engine-rs Cargo.toml for [[bin]] names only.
 * Ignores [lib], [package], comments, and does not read py/Cargo.toml.
 */
export function listRuleEngineBins(cargoTomlPath) {
  const text = fs.readFileSync(cargoTomlPath, 'utf8')
  const names = []
  let inBin = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    if (line.startsWith('[')) {
      inBin = line === '[[bin]]'
      continue
    }
    if (!inBin) continue
    const m = /^name\s*=\s*"([^"]+)"\s*$/.exec(line)
    if (m) names.push(m[1])
  }
  const unique = [...new Set(names)].sort()
  if (!unique.length) {
    throw new Error(`no [[bin]] names found in ${cargoTomlPath}`)
  }
  return unique
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const defaultCargo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../rule-engine-rs/Cargo.toml')
  const cargo = process.argv[2] ? path.resolve(process.argv[2]) : defaultCargo
  for (const name of listRuleEngineBins(cargo)) console.log(name)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test deploy/common/__tests__/list-rule-engine-bins.test.mjs`  
Expected: PASS (2 tests)

- [ ] **Step 5: Commit** (only if user asks)

```bash
git add deploy/common/list-rule-engine-bins.mjs deploy/common/__tests__/list-rule-engine-bins.test.mjs
git commit -m "$(cat <<'EOF'
feat(deploy): derive rule-engine release bin list from Cargo.toml

EOF
)"
```

---

### Task 2: SIT + UAT deploy use the shared list

**Files:**
- Modify: `deploy/sit/deploy.sh` (hardcoded `RUST_BINS` + `push_rust_bins`)
- Modify: `deploy/uat/deploy.sh` (`build_rust_bins` existence check)

**Interfaces:**
- Consumes: `node "$ROIS_AI/deploy/common/list-rule-engine-bins.mjs"` → lines of bin names
- Produces: SIT/UAT never hand-maintain bin arrays

- [ ] **Step 1: Replace SIT hardcoded array**

In `deploy/sit/deploy.sh`, delete:

```bash
RUST_BINS=(ruletool check-8002 ... check-8072)
```

Add a helper near `push_rust_bins`:

```bash
# Populate RUST_BINS from rule-engine-rs/Cargo.toml [[bin]] (single source of truth).
load_rust_bins() {
    local cargo="$ROIS_AI/rule-engine-rs/Cargo.toml"
    local list
    list=$(node "$ROIS_AI/deploy/common/list-rule-engine-bins.mjs" "$cargo") \
        || die "[rust-bins] failed to list [[bin]] from $cargo"
    mapfile -t RUST_BINS <<<"$list"
    if [ "${#RUST_BINS[@]}" -eq 0 ]; then
        die "[rust-bins] empty [[bin]] list from $cargo"
    fi
}
```

At the start of `push_rust_bins`, call `load_rust_bins` before the missing/remote loop. Keep `cargo build --release`, per-bin `-x` assert, and `scp` loop unchanged (they already iterate `"${RUST_BINS[@]}"`).

Update the comment above the old array to state bins come from Cargo.toml via `deploy/common/list-rule-engine-bins.mjs`.

- [ ] **Step 2: Harden UAT `build_rust_bins`**

Replace the single `ruletool` check with:

```bash
build_rust_bins() {
    log "[rust-bins] 本机编译法规引擎二进制..."
    (
        source "$HOME/.cargo/env" 2>/dev/null || true
        git -C "$ROIS_AI" submodule update --init --recursive rule-engine-rs >>"$DEPLOY_LOG" 2>&1 || true
        cd "$ROIS_AI/rule-engine-rs"
        cargo build --release --quiet
    ) >>"$DEPLOY_LOG" 2>&1
    local cargo="$ROIS_AI/rule-engine-rs/Cargo.toml"
    local bin
    while IFS= read -r bin; do
        [ -n "$bin" ] || continue
        if [ ! -x "$ROIS_AI/rule-engine-rs/target/release/$bin" ]; then
            fail "[rust-bins] 构建后缺少 $bin"
        fi
    done < <(node "$ROIS_AI/deploy/common/list-rule-engine-bins.mjs" "$cargo")
    ok "[rust-bins] 编译完成"
}
```

Leave `push_rust_bins` rsync as-is (already pushes whole release dir after the gate).

- [ ] **Step 3: Sanity-check SIT loader without full deploy**

Run from repo root:

```bash
node deploy/common/list-rule-engine-bins.mjs rule-engine-rs/Cargo.toml | grep -x check-7507
```

Expected: prints `check-7507`

Optional dry parse of the bash function:

```bash
ROIS_AI=$PWD bash -c 'source /dev/null; die(){ echo "$*"; exit 1;}; load_rust_bins(){ ... copy from deploy.sh ...}; load_rust_bins; printf "%s\n" "${RUST_BINS[@]}" | grep -x check-7507'
```

Or manually confirm `grep -n RUST_BINS deploy/sit/deploy.sh` no longer contains a long parenthesized allowlist of check-* names.

- [ ] **Step 4: Commit** (only if user asks)

```bash
git add deploy/sit/deploy.sh deploy/uat/deploy.sh
git commit -m "$(cat <<'EOF'
fix(deploy): push all Cargo.toml rule-engine bins on SIT/UAT

EOF
)"
```

---

### Task 3: live-server startup rust-bin gate

**Files:**
- Create: `live-server/scripts/assert-rust-bins.mjs`
- Create: `live-server/scripts/__tests__/assert-rust-bins.test.mjs`
- Modify: `live-server/src/index.ts` (before `server.listen`)

**Interfaces:**
- Consumes: `listRuleEngineBins` from `../../deploy/common/list-rule-engine-bins.mjs` (path from `live-server/scripts/`)
- Produces: `export function assertRustReleaseBins({ cargoTomlPath, releaseDir } = {}): string[]` — returns the bin list on success; throws `Error` listing missing names on failure
- Default paths match `legality-recheck-core.mjs`:  
  - releaseDir = `path.resolve(__dirname, '../../rule-engine-rs/target/release')`  
  - cargoTomlPath = `path.resolve(__dirname, '../../rule-engine-rs/Cargo.toml')`

- [ ] **Step 1: Write the failing test**

```js
// live-server/scripts/__tests__/assert-rust-bins.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertRustReleaseBins } from '../assert-rust-bins.mjs'

test('throws when a Cargo [[bin]] is missing from release dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-bins-'))
  const cargo = path.join(root, 'Cargo.toml')
  const release = path.join(root, 'release')
  fs.mkdirSync(release)
  fs.writeFileSync(cargo, `
[[bin]]
name = "check-7507"
[[bin]]
name = "ruletool"
`)
  fs.writeFileSync(path.join(release, 'ruletool'), 'x')
  fs.chmodSync(path.join(release, 'ruletool'), 0o755)
  assert.throws(
    () => assertRustReleaseBins({ cargoTomlPath: cargo, releaseDir: release }),
    /check-7507/,
  )
})

test('passes when all bins exist and are executable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-bins-'))
  const cargo = path.join(root, 'Cargo.toml')
  const release = path.join(root, 'release')
  fs.mkdirSync(release)
  fs.writeFileSync(cargo, `
[[bin]]
name = "check-7507"
`)
  const binPath = path.join(release, 'check-7507')
  fs.writeFileSync(binPath, 'x')
  fs.chmodSync(binPath, 0o755)
  const bins = assertRustReleaseBins({ cargoTomlPath: cargo, releaseDir: release })
  assert.deepEqual(bins, ['check-7507'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test live-server/scripts/__tests__/assert-rust-bins.test.mjs`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement assert helper**

```js
// live-server/scripts/assert-rust-bins.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listRuleEngineBins } from '../../deploy/common/list-rule-engine-bins.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CARGO = path.resolve(__dirname, '../../rule-engine-rs/Cargo.toml')
const DEFAULT_RELEASE = path.resolve(__dirname, '../../rule-engine-rs/target/release')

export function assertRustReleaseBins(options = {}) {
  const cargoTomlPath = options.cargoTomlPath ?? DEFAULT_CARGO
  const releaseDir = options.releaseDir ?? DEFAULT_RELEASE
  const bins = listRuleEngineBins(cargoTomlPath)
  const missing = []
  for (const bin of bins) {
    const binPath = path.join(releaseDir, bin)
    try {
      fs.accessSync(binPath, fs.constants.X_OK)
    } catch {
      missing.push(bin)
    }
  }
  if (missing.length) {
    throw new Error(
      `rule-engine-rs release binaries missing or not executable under ${releaseDir}: ${missing.join(', ')}. ` +
        `Deploy via deploy/sit/deploy.sh rust-bins, or: cargo build --release --manifest-path rule-engine-rs/Cargo.toml`,
    )
  }
  return bins
}
```

- [ ] **Step 4: Wire into `live-server/src/index.ts` before listen**

Near the top of `start()` (after server is constructed is fine; **must** run before `server.listen`), add:

```ts
import { createRequire } from 'node:module'
// Prefer dynamic import of the ESM helper from compiled CJS/TS bootstrap:
const { assertRustReleaseBins } = await import('../../scripts/assert-rust-bins.mjs')
assertRustReleaseBins()
```

Place the call inside the existing `try` of `start()`, immediately before `await server.listen(...)`, so a thrown Error hits the existing `catch` that logs and `process.exit(1)`.

If the TS build cannot import `.mjs` from `src/` cleanly, use:

```ts
const { pathToFileURL } = await import('node:url')
const { assertRustReleaseBins } = await import(
  pathToFileURL(new URL('../../scripts/assert-rust-bins.mjs', import.meta.url)).href
)
```

or `createRequire` + absolute path to `scripts/assert-rust-bins.mjs` — pick whichever matches how other scripts are loaded from `src/` in this package. Prefer checking existing patterns (`acc-ref-tz`, manday) first; if none import scripts, dynamic `import()` of the absolute path via `path.join(__dirname, '../../scripts/assert-rust-bins.mjs')` after compiling to `dist/` must account for `dist/` depth (`path.join(__dirname, '../../../scripts/assert-rust-bins.mjs')` from `dist/index.js`). **Use a path that works from both `tsx`/dev and `node dist/index.js`:**

```ts
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// live-server/src → ../scripts ; live-server/dist → ../scripts
const scriptsDir = path.resolve(here, '..', 'scripts')
const { assertRustReleaseBins } = await import(
  pathToFileURL(path.join(scriptsDir, 'assert-rust-bins.mjs')).href
)
assertRustReleaseBins()
```

- [ ] **Step 5: Run assert-rust-bins tests**

Run: `node --test live-server/scripts/__tests__/assert-rust-bins.test.mjs`  
Expected: PASS

- [ ] **Step 6: Optional typecheck / build smoke**

Run: `npm --prefix live-server run build` (or project’s usual `tsc`)  
Expected: PASS (import resolves)

- [ ] **Step 7: Commit** (only if user asks)

```bash
git add live-server/scripts/assert-rust-bins.mjs \
  live-server/scripts/__tests__/assert-rust-bins.test.mjs \
  live-server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(live-server): fail boot when Cargo.toml rule-engine bins are missing

EOF
)"
```

---

### Task 4: End-to-end verification

**Files:** none new (verification only)

- [ ] **Step 1: Shared list includes check-7507**

```bash
node deploy/common/list-rule-engine-bins.mjs | grep -x check-7507
node --test deploy/common/__tests__/list-rule-engine-bins.test.mjs
node --test live-server/scripts/__tests__/assert-rust-bins.test.mjs
```

Expected: all PASS; `check-7507` printed.

- [ ] **Step 2: Confirm SIT script no longer hardcodes the old allowlist**

```bash
! grep -E 'RUST_BINS=\(ruletool' deploy/sit/deploy.sh
grep -n 'list-rule-engine-bins' deploy/sit/deploy.sh deploy/uat/deploy.sh
```

Expected: no hardcoded array; both scripts reference the helper.

- [ ] **Step 3: Report verification receipt in the final message**

List exact commands + PASS/FAIL. Note: full SIT `push_rust_bins` against Portal is optional ops verification after merge; not required to close the code task if local gates pass.

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| A. Shared bin list from Cargo.toml | Task 1 |
| B. SIT `push_rust_bins` dynamic list + die on missing | Task 2 |
| C. UAT assert all bins after build | Task 2 |
| D. live-server startup exit(1) on missing | Task 3 |
| E. Tests (fixture + real Cargo + missing bin) | Tasks 1 + 3 |
| Acceptance: no hand-edited SIT array; includes check-7507 | Task 4 |

## Placeholder scan

No TBD / “implement later” steps remain.
