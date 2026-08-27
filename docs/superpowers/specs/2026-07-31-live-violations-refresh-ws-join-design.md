# Design: Fix live violations refresh after recheck (WS group join)

**Status:** Approved (user confirmed refresh-link failure; DB already updated)

## Root cause

`live-legality` already PUBLISHes `violations:{schema}:{rulesetId}`. The WS plugin only forwards to clients with `client.groupCode === rulesetId`. The gantt rarely sends `set_rule_group` (Rule Set UI uses `legality-store`, not `rule-check-store.setRuleGroup`), so `client.groupCode` stays `''` and the browser never hears the publish. Alert Center keeps the pre-recheck snapshot until hard refresh.

## Fix

1. When selecting / initializing a legality ruleset, also `setRuleGroup(String(id))` so WS joins that group.
2. On WS `authenticated` / `connected`, re-send `set_rule_group` with current `ruleGroupCode || '103'`.
3. When `LegalityRecheckIndicator` transitions to `done`, dispatch `violations:updated` (covers Save/Recheck even if publish is missed).
4. On `spawnLiveRecheck` child exit 0, parent also PUBLISHes via `fastify.redis` (same Redis the WS subscriber uses).

## Verification

- Unit: WS re-join on connected; indicator done → event; parent publish on exit 0.
- Manual: delete + Save → Alert Center 7505 updates to new DO without Ctrl+Shift+R.
