import assert from "node:assert/strict";
import test from "node:test";
import { stableHash, stableJsonStringify } from "./stable-hash.js";

test("stableJsonStringify sorts object keys recursively and ignores undefined object fields", () => {
  assert.equal(
    stableJsonStringify({
      b: 2,
      a: {
        z: null,
        ignored: undefined,
        y: "value",
      },
    }),
    "{\"a\":{\"y\":\"value\",\"z\":null},\"b\":2}",
  );
});

test("stableHash is stable for object key order but preserves array order", () => {
  assert.equal(
    stableHash({ b: 2, a: [{ y: 1, x: 2 }] }),
    stableHash({ a: [{ x: 2, y: 1 }], b: 2 }),
  );
  assert.notEqual(
    stableHash({ values: ["T1", "T2"] }),
    stableHash({ values: ["T2", "T1"] }),
  );
});
