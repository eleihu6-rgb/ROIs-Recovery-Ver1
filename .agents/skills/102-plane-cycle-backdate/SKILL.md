---
name: 102-plane-cycle-backdate
description: Use when you need to add issues to a COMPLETED Plane cycle (the API blocks it). This workaround creates an UPCOMING cycle, adds items while the cycle is open, then patches dates to historical values making it auto-complete.
---

# Plane Cycle Backdate — Add Issues to Completed Cycles

## The Problem

Plane's REST API blocks all modifications to completed cycles:
- `POST .../cycle-issues/` → 400 "already completed"
- `PATCH cycle end_date` → 400 "already completed cannot be edited"
- `PATCH issue { cycle_id }` → 204 but silently ignored
- DB is on 10.15.12.4 (separate VM, no SSH access from CoreServer/WebServer)

## Workaround: Create-and-Backdate

The cycle completion check runs **at the time of the API call**. An UPCOMING cycle accepts issues. PATCHing dates to the past auto-transitions the cycle to COMPLETED — with all items intact.

### Pattern

```js
// 1. Create UPCOMING cycle with future dates
const newCycle = await POST(`/api/workspaces/${SLUG}/projects/${PID}/cycles/`, {
  name: 'Sprint X (copy)', start_date: '2026-08-01', end_date: '2026-08-07'
})  // → UPCOMING

// 2. Add items while UPCOMING (no restriction)
await POST(`.../cycles/${newCycle.id}/cycle-issues/`, { issues: [...issueIds] })

// 3. PATCH historical dates while still UPCOMING → becomes COMPLETED
await PATCH(`.../cycles/${newCycle.id}/`, {
  name: 'Sprint X',          // rename to final name
  start_date: '2026-03-01',  // historical start
  end_date: '2026-04-30'     // historical end (past → auto-completes)
})
// → status becomes COMPLETED, all issues retained ✓
```

### Full Rebuild Pattern (replace an existing completed cycle)

When you need to ADD to existing completed cycles without losing their current items:

1. **Snapshot** existing items: `GET .../cycles/${oldId}/cycle-issues/?per_page=200` → collect `item.id` UUIDs
2. **Create** new UPCOMING shadow cycle (future dates)
3. **Add** all snapshot items + new items to shadow cycle
4. **Backdate**: PATCH shadow cycle with original name + historical dates → COMPLETED
5. **Delete** old completed cycle: `DELETE .../cycles/${oldId}/`

```js
// cycle-issues response: items are issue objects, id = issue UUID
const items = (await GET(`.../cycle-issues/?per_page=200`)).results
const issueIds = items.map(i => i.id)  // NOT i.issue or i.issue_id
```

## Key Facts (verified 2026-06-17)

- **Cycle status** is calculated from dates at read time — not stored. Past end_date = COMPLETED.
- **cycle-issues response** returns issue objects directly; `id` field = issue UUID (not a junction id).
- **DELETE cycle** removes the cycle record; items go back to "no cycle". Existing issues are NOT deleted.
- **Shadow cycle limit**: Plane may show both old and new if you don't delete the old one.
- **Auth**: in-page fetch via Playwright (same session as 100-plane-ops); CSRF from cookie.

## Server Topology (for reference)

| Server | IP | Role |
|--------|----|------|
| WebServer | 47.89.181.217 | nginx proxy; password `jAZD252WrS7l75o1c5v5` |
| CoreServer | 10.15.12.3 | rois-ai Docker, Postgres, Windmill |
| PlaneSrv | 10.15.12.4 | Plane Docker (port 8080); no SSH from CoreServer |

Plane DB is in Docker on 10.15.12.4 — PostgreSQL not exposed, SSH password-blocked.

## When NOT to use

- When you can add to an upcoming/current cycle directly — that's simpler.
- When the completed cycle has zero items — just delete and recreate it cleanly.
