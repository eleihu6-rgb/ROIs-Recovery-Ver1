import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { createPairingReferenceOptionsLoader } from "./pairing-reference-options.js";

test("pairing reference options load airports and distinct cities from live schema", async () => {
  const queries: string[] = [];
  const pgPool = {
    async query(sql: string) {
      queries.push(sql);
      return {
        rows: [
          { code: "dfw", name: " DALLAS-FORT WORTH INTL ", icao: null, abbr: null, city: "dfw" },
          { code: "yyz", name: "LESTER B. PEARSON INTL", icao: null, abbr: null, city: "yto" },
          { code: "abc", name: null, icao: null, abbr: null, city: "dfw" },
        ],
      };
    },
  } as unknown as Pool;
  const loadOptions = createPairingReferenceOptionsLoader({ pgPool, liveSchema: "f8" });

  const first = await loadOptions();
  const second = await loadOptions();

  assert.equal(queries.length, 1);
  assert.match(queries[0], /from f8\.airport/);
  assert.deepEqual(first, {
    airports: [
      { code: "DFW", name: "DALLAS-FORT WORTH INTL", icao: null, abbr: null, city: "DFW" },
      { code: "YYZ", name: "LESTER B. PEARSON INTL", icao: null, abbr: null, city: "YTO" },
      { code: "ABC", name: null, icao: null, abbr: null, city: "DFW" },
    ],
    cities: [
      { code: "DFW" },
      { code: "YTO" },
    ],
  });
  assert.deepEqual(second, first);
});

test("pairing reference options reject unsafe live schema names", () => {
  const pgPool = { async query() { return { rows: [] }; } } as unknown as Pool;

  assert.throws(
    () => createPairingReferenceOptionsLoader({ pgPool, liveSchema: "f8;drop" }),
    /Invalid live schema name/,
  );
});

test("pairing reference options return empty options without a live connection", async () => {
  const loadOptions = createPairingReferenceOptionsLoader({});

  assert.deepEqual(await loadOptions(), { airports: [], cities: [] });
});
