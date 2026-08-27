import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePbsRuleset } from "./ruleset-resolver.js";

const fakePool = (rows: Array<{ id: number; name: string }>) => ({
  query: async (_sql: string, _params?: unknown[]) => ({ rows }),
});

test("resolves the enabled PBS workset for the division", async () => {
  const pool = fakePool([{ id: 103, name: "PBS Solver Ruleset FD" }]);
  const r = await resolvePbsRuleset(pool as never, "f8", "P");
  assert.deepEqual(r, { rulesetId: 103, name: "PBS Solver Ruleset FD" });
});

test("returns null when no enabled PBS workset exists", async () => {
  const pool = fakePool([]);
  const r = await resolvePbsRuleset(pool as never, "f8", "C");
  assert.equal(r, null);
});
