import assert from "node:assert/strict";
import test from "node:test";

import {
  EFFICIENT_FLYING_CONFIG_ERROR_MESSAGE,
  loadEfficientFlyingConfig,
  parseEfficientFlyingConfigRows,
} from "./efficient-flying-config.js";

test("parseEfficientFlyingConfigRows accepts one integer percentile from 1 through 50", () => {
  assert.deepEqual(parseEfficientFlyingConfigRows([{ code_value: "20" }]), { percentile: 20 });
  assert.deepEqual(parseEfficientFlyingConfigRows([{ code_value: " 50 " }]), { percentile: 50 });
});

test("parseEfficientFlyingConfigRows rejects missing, duplicate, decimal, and out-of-range values", () => {
  for (const rows of [
    [],
    [{ code_value: "20" }, { code_value: "20" }],
    [{ code_value: "20.5" }],
    [{ code_value: "0" }],
    [{ code_value: "51" }],
    [{ code_value: null }],
  ]) {
    assert.throws(
      () => parseEfficientFlyingConfigRows(rows),
      new RegExp(EFFICIENT_FLYING_CONFIG_ERROR_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("loadEfficientFlyingConfig reads the unique company dictionary value", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const config = await loadEfficientFlyingConfig({
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values: values ?? [] });
      return { rows: [{ code_value: "17" }] };
    },
  } as never, "f8");

  assert.deepEqual(config, { percentile: 17 });
  assert.match(queries[0]!.text, /from f8\.dictionary/i);
  assert.deepEqual(queries[0]!.values, ["PBS_EFFICIENT_FLYING_CONFIG", "PERCENTILE"]);
});
