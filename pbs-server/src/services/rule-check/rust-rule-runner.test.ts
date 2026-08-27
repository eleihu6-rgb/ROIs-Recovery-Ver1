import assert from "node:assert/strict";
import test from "node:test";
import { buildCandidatePairingInjectionStatement } from "./rust-rule-runner.js";

test("candidate pairing injection uses pairing division and only declared SQL params", () => {
  const statement = buildCandidatePairingInjectionStatement("f8_dev_live", "73", 35502);

  assert.deepEqual(statement.params, ["73", 35502]);
  assert.match(statement.sql, /p\.division/);
  assert.match(statement.sql, /p\.base/);
  assert.match(statement.sql, /'MA', 'BID_CHECK'/);
  assert.match(statement.sql, /coalesce\(pc\.acting_rank, 'UNK'\)/);
  assert.doesNotMatch(statement.sql, /\$3|\$4/);
});
