# Remove Python Rule Engine & TypeScript Violations-Init Worker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Python `rois-rule-engine` package, the hybrid `rule-engine/` service (Python FastAPI + TypeScript npm), the TypeScript `violations-init-worker`, and all glue code that wires them up — leaving the Rust `rule-engine-rs/` entirely untouched.

**Architecture:** Pure deletion + minimal caller cleanup. Each task removes one cohesive component and fixes every broken import/reference it leaves behind. No new code is introduced. The Rust CLI binaries (`rule-engine-rs/`) and their DB writes to `rule_violation` / `scenario.rule_violation` remain the sole authoritative violation source.

**Tech Stack:** TypeScript (live-server, gantt), Python (engine-server, po-engine), BullMQ, Playwright e2e.

## Global Constraints

- `rule-engine-rs/` — zero changes, zero touches, not even a read
- Rust binaries in `rule-engine-rs/target/release/` — untouched
- Every task ends with `tsc --noEmit` passing in live-server and gantt
- `npm run check:ui` must stay green (no UI token regressions introduced)
- Commit after every task; never combine two tasks in one commit

---

## File Map — What Gets Deleted vs Modified

### Deleted entirely
| Path | Why |
|------|-----|
| `rois-rule-engine/` | Python rule implementations package |
| `rule-engine/` | Python FastAPI service (port 3001) + TypeScript `@rois/rule-engine` npm pkg |
| `engine-server/src/api/rule_session_routes.py` | Python rule session API (imports rois_rule_engine) |
| `engine-server/src/services/rule_engine_service.py` | Python rule engine session manager |
| `engine-server/src/workers/violation_worker.py` | Python Redis-triggered violation worker |
| `live-server/src/workers/violations-init-worker.ts` | TypeScript BullMQ worker (imports @rois/rule-engine) |
| `live-server/src/workers/check-pairing-worker.ts` | Only calls ruleEngineClient — no other purpose |
| `live-server/src/workers/check-roster-worker.ts` | Only calls ruleEngineClient — no other purpose |
| `live-server/src/routes/admin/violations-init.ts` | Admin trigger route for violations-init |
| `live-server/src/services/rule-engine-client.ts` | HTTP client to port 3001 |
| `gantt/src/services/violations-init-api.ts` | Client-side API wrapper for violations-init |
| `e2e/tests/gantt/live-violation-refresh.spec.ts` | E2E test for the removed feature |

### Modified (callers/registration cleaned up)
| Path | Change |
|------|--------|
| `engine-server/main.py` | Remove import + `include_router(rule_session_router)` |
| `live-server/src/workers/index.ts` | Remove 3 exports (checkPairing, checkRoster, violationsInit) |
| `live-server/src/index.ts` | Remove imports + start calls + cron for those 3 workers; remove violationsInitAdminRoutes |
| `live-server/src/plugins/bullmq.ts` | Remove `violationsInitQueue` (Queue decl, decorate, close) |
| `live-server/src/workers/batch-crew-worker.ts` | Remove `ruleEngineClient` import + 2 checkRoster calls |
| `gantt/src/components/rule/rule-group-header.tsx` | Remove "Refresh Violations" button + violationsInitApi import |
| `po-engine/src/services/rule_service.py` | Point `base_url` to live-server port 3000, path `/api/rule/groups` |

---

### Task 1: Delete `rois-rule-engine/` (Python rule implementations)

**Files:**
- Delete: `rois-rule-engine/` (entire directory, 37 Python files)

- [ ] **Step 1: Delete the directory**

```bash
rm -rf "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/rois-rule-engine"
```

- [ ] **Step 2: Verify it's gone**

```bash
ls "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/rois-rule-engine" 2>&1
```
Expected: `No such file or directory`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete rois-rule-engine Python package"
```

---

### Task 2: Clean up `engine-server` — remove Python rule files + unregister from main.py

**Files:**
- Delete: `engine-server/src/api/rule_session_routes.py`
- Delete: `engine-server/src/services/rule_engine_service.py`
- Delete: `engine-server/src/workers/violation_worker.py`
- Modify: `engine-server/main.py` (lines 10 and 163)

- [ ] **Step 1: Delete the three Python files**

```bash
rm "engine-server/src/api/rule_session_routes.py"
rm "engine-server/src/services/rule_engine_service.py"
rm "engine-server/src/workers/violation_worker.py"
```

- [ ] **Step 2: Remove from engine-server/main.py**

Open `engine-server/main.py`. Remove exactly:
- Line ~10: `from src.api.rule_session_routes import router as rule_session_router`
- Line ~163: `app.include_router(rule_session_router)`

No other changes.

- [ ] **Step 3: Verify engine-server starts (or at least imports cleanly)**

```bash
cd engine-server && python -c "import main" 2>&1 | grep -i "error\|traceback" | head -10
```
Expected: no ImportError referencing rule_session_routes or rois_rule_engine.

- [ ] **Step 4: Commit**

```bash
git add engine-server/main.py \
        engine-server/src/api/rule_session_routes.py \
        engine-server/src/services/rule_engine_service.py \
        engine-server/src/workers/violation_worker.py
git commit -m "chore: remove Python rule engine from engine-server (rule_session_routes, rule_engine_service, violation_worker)"
```

---

### Task 3: Delete `rule-engine/` directory (Python FastAPI service + TypeScript npm package)

**Files:**
- Delete: `rule-engine/` (entire directory — Python `src/`, `main.py`, `pyproject.toml`, `requirements.txt` AND TypeScript `dist/`, `package.json`, `node_modules/`)

> `@rois/rule-engine` (TypeScript) is consumed only by `violations-init-worker.ts` which is deleted in Task 5. `rule-engine/src/` (Python) is the FastAPI HTTP service on port 3001. Both go together.

- [ ] **Step 1: Delete the directory**

```bash
rm -rf "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/rule-engine"
```

- [ ] **Step 2: Verify**

```bash
ls "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/rule-engine" 2>&1
```
Expected: `No such file or directory`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete rule-engine directory (Python FastAPI service + @rois/rule-engine TS package)"
```

---

### Task 4: Delete `check-pairing-worker` and `check-roster-worker` from live-server

These two workers exist solely to call `ruleEngineClient`. With the rule engine gone they have no purpose.

**Files:**
- Delete: `live-server/src/workers/check-pairing-worker.ts`
- Delete: `live-server/src/workers/check-roster-worker.ts`
- Modify: `live-server/src/workers/index.ts` (remove 2 export lines)
- Modify: `live-server/src/index.ts` (remove imports + `startCheckPairingWorker` + `startCheckRosterWorker` calls)

- [ ] **Step 1: Delete the two worker files**

```bash
rm "live-server/src/workers/check-pairing-worker.ts"
rm "live-server/src/workers/check-roster-worker.ts"
```

- [ ] **Step 2: Update `live-server/src/workers/index.ts`**

Remove these two lines:
```typescript
export { startCheckPairingWorker } from './check-pairing-worker.js'
export { startCheckRosterWorker } from './check-roster-worker.js'
```
Leave all other exports untouched.

- [ ] **Step 3: Update `live-server/src/index.ts`**

Remove:
- `import { startCheckPairingWorker } from './workers/check-pairing-worker.js'` (line ~33)
- `import { startCheckRosterWorker } from './workers/check-roster-worker.js'` (line ~34)
- Any call to `startCheckPairingWorker(...)` 
- Any call to `startCheckRosterWorker(...)`

- [ ] **Step 4: TypeScript check**

```bash
cd live-server && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors referencing check-pairing-worker or check-roster-worker.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/workers/check-pairing-worker.ts \
        live-server/src/workers/check-roster-worker.ts \
        live-server/src/workers/index.ts \
        live-server/src/index.ts
git commit -m "chore: remove check-pairing-worker and check-roster-worker (rule-engine callers)"
```

---

### Task 5: Remove violations-init-worker and its plumbing

**Files:**
- Delete: `live-server/src/workers/violations-init-worker.ts`
- Delete: `live-server/src/routes/admin/violations-init.ts`
- Modify: `live-server/src/plugins/bullmq.ts` (remove `violationsInitQueue`)
- Modify: `live-server/src/workers/index.ts` (remove 1 export line)
- Modify: `live-server/src/index.ts` (remove import + start call + cron job + route registration)

- [ ] **Step 1: Delete the two files**

```bash
rm "live-server/src/workers/violations-init-worker.ts"
rm "live-server/src/routes/admin/violations-init.ts"
```

- [ ] **Step 2: Update `live-server/src/plugins/bullmq.ts`**

Remove all lines that mention `violationsInitQueue`:
- The `violationsInitQueue: Queue` property in the FastifyInstance augmentation block
- `const violationsInitQueue = new Queue('violations-init', {...})`
- `fastify.decorate('violationsInitQueue', violationsInitQueue)`
- `await violationsInitQueue.close()` in the onClose hook

- [ ] **Step 3: Update `live-server/src/workers/index.ts`**

Remove:
```typescript
export { startViolationsInitWorker } from './violations-init-worker.js'
```

- [ ] **Step 4: Update `live-server/src/index.ts`**

Remove:
- `import { startViolationsInitWorker } from './workers/violations-init-worker.js'` (line ~45)
- `import violationsInitAdminRoutes from './routes/admin/violations-init.js'` (line ~54)
- `await server.register(violationsInitAdminRoutes, { prefix: '/api/admin' })` (line ~131)
- `startViolationsInitWorker(server, ruleLoader)` call (line ~156–162)
- The nightly cron job that enqueues `violationsInit:start` (lines ~156–162 including the `'0 2 * * *'` schedule)

- [ ] **Step 5: TypeScript check**

```bash
cd live-server && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add live-server/src/workers/violations-init-worker.ts \
        live-server/src/routes/admin/violations-init.ts \
        live-server/src/plugins/bullmq.ts \
        live-server/src/workers/index.ts \
        live-server/src/index.ts
git commit -m "chore: remove violations-init-worker, admin route, and BullMQ queue"
```

---

### Task 6: Strip `rule-engine-client` calls from `batch-crew-worker`, then delete the client

`batch-crew-worker.ts` calls `ruleEngineClient.checkRoster()` twice (lines ~132 and ~164) but does other useful work (batch orchestration). Remove only those calls.

**Files:**
- Modify: `live-server/src/workers/batch-crew-worker.ts`
- Delete: `live-server/src/services/rule-engine-client.ts`

- [ ] **Step 1: Open `batch-crew-worker.ts` and identify the two checkRoster blocks**

Line ~6: `import { ruleEngineClient } from '../services/rule-engine-client.js'`
Line ~132: `const rosterResult = await ruleEngineClient.checkRoster(...)`
Line ~164: `const monthResult = await ruleEngineClient.checkRoster(...)`

- [ ] **Step 2: Remove the import and both call sites**

Delete the import line. For each `checkRoster` call site: delete the call and any variable that only existed to hold its result (e.g. `rosterResult`, `monthResult`) and any code that only runs conditionally on that result. Leave surrounding logic intact.

- [ ] **Step 3: Delete the client file**

```bash
rm "live-server/src/services/rule-engine-client.ts"
```

- [ ] **Step 4: TypeScript check**

```bash
cd live-server && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/workers/batch-crew-worker.ts \
        live-server/src/services/rule-engine-client.ts
git commit -m "chore: remove rule-engine-client from batch-crew-worker and delete client"
```

---

### Task 7: Remove gantt violations-init UI

**Files:**
- Delete: `gantt/src/services/violations-init-api.ts`
- Modify: `gantt/src/components/rule/rule-group-header.tsx` (remove button + import)

- [ ] **Step 1: Delete the API service file**

```bash
rm "gantt/src/services/violations-init-api.ts"
```

- [ ] **Step 2: Open `gantt/src/components/rule/rule-group-header.tsx`**

Remove:
- The import of `violationsInitApi` (or `violations-init-api`)
- The "Refresh Violations" button element and its click handler
- Any state (`useState`) that existed only to track the violations-init request status
- Any `useEffect` or callback that calls `violationsInitApi`

Leave everything else in the component intact.

- [ ] **Step 3: TypeScript + UI standard check**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
cd .. && npm run check:ui 2>&1 | tail -5
```
Expected: 0 TS errors, 0 hard UI violations.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/violations-init-api.ts \
        gantt/src/components/rule/rule-group-header.tsx
git commit -m "chore: remove violations-init UI from gantt rule-group-header"
```

---

### Task 8: Delete e2e test for removed feature

`live-violation-refresh.spec.ts` tests the admin violations-init endpoint — a feature we just removed. Keeping it would leave 3 permanently-red tests.

**Files:**
- Delete: `e2e/tests/gantt/live-violation-refresh.spec.ts`

- [ ] **Step 1: Delete the file**

```bash
rm "e2e/tests/gantt/live-violation-refresh.spec.ts"
```

- [ ] **Step 2: Confirm the spec IDs (Live-1097/1098/1099) are not referenced elsewhere**

```bash
grep -r "1097\|1098\|1099\|live-violation-refresh" e2e/ 2>/dev/null
```
Expected: no results.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/live-violation-refresh.spec.ts
git commit -m "chore: delete live-violation-refresh e2e test (feature removed)"
```

---

### Task 9: Fix `po-engine` — point rule config fetch to live-server

`po-engine/src/services/rule_service.py` calls `/api/rules/groups/{group_code}` on the now-deleted rule-engine service (port 3001). Live-server exposes rule group configs at `GET /api/rule/groups/:groupCode` (port 3000). Update to point there.

**Files:**
- Modify: `po-engine/src/services/rule_service.py`
- Modify: `po-engine/src/config/settings.py` (change default URL + env var name)

- [ ] **Step 1: Check the live-server endpoint path**

```bash
grep -n "route\|prefix\|/rule/groups\|/rules/groups" \
  "live-server/src/routes/rule/rule-config.ts" | head -20
```
Confirm the exact path (expected: `/api/rule/groups/:groupCode`).

- [ ] **Step 2: Update `po-engine/src/config/settings.py`**

Change the `rule_engine_url` setting (or equivalent) default from `http://localhost:3001` to `http://localhost:3000`. Rename the env var from `RULE_ENGINE_URL` to `LIVE_SERVER_URL` (or reuse `LIVE_SERVER_URL` if it already exists).

- [ ] **Step 3: Update `po-engine/src/services/rule_service.py`**

Change the URL construction from:
```python
url = f"{self.base_url}/api/rules/groups/{group_code}"
```
to:
```python
url = f"{self.base_url}/api/rule/groups/{group_code}"
```
(Note: `/rules/` → `/rule/` — no trailing 's'.)

Also update any auth header if live-server requires a bearer token (check `live-server/src/plugins/auth.ts` PUBLIC_PATHS — if `/api/rule/groups` is not public, add the internal service token).

- [ ] **Step 4: Verify po-engine can import without error**

```bash
cd po-engine && python -c "from src.services.rule_service import RuleService; print('ok')"
```
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add po-engine/src/services/rule_service.py \
        po-engine/src/config/settings.py
git commit -m "chore: point po-engine rule config fetch to live-server (port 3000)"
```

---

## Final Verification

After all 9 tasks:

```bash
# 1. TypeScript — both packages must compile cleanly
cd live-server && npx tsc --noEmit
cd ../gantt && npx tsc --noEmit

# 2. UI standard gate
cd .. && npm run check:ui

# 3. No dangling references to deleted modules
grep -r "rois_rule_engine\|rule_engine_service\|rule_session_routes\|violation_worker\|rule-engine-client\|violations-init-api\|@rois/rule-engine" \
  live-server/src gantt/src engine-server/src po-engine/src 2>/dev/null

# 4. Confirm rule-engine-rs is untouched
git diff HEAD -- rule-engine-rs/
```
Expected: tsc 0 errors, check:ui 0 hard violations, grep finds nothing, diff is empty.
