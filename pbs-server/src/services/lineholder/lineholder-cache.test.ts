import test from "node:test";
import assert from "node:assert/strict";
import { createLineholderTtlCache } from "./lineholder-cache.js";

test("createLineholderTtlCache reuses loaded values inside the TTL", async () => {
  let loadCount = 0;
  let now = 1_000;
  const getValue = createLineholderTtlCache({
    ttlMs: 60_000,
    now: () => now,
    async load() {
      loadCount += 1;
      return { value: loadCount };
    },
    clone: (value) => ({ ...value }),
  });

  assert.deepEqual(await getValue(), { value: 1 });
  assert.deepEqual(await getValue(), { value: 1 });
  assert.equal(loadCount, 1);

  now += 60_001;

  assert.deepEqual(await getValue(), { value: 2 });
  assert.equal(loadCount, 2);
});

test("createLineholderTtlCache clones cached values before returning them", async () => {
  const getValue = createLineholderTtlCache({
    ttlMs: 60_000,
    async load() {
      return {
        items: ["original"],
      };
    },
    clone: (value) => ({
      items: [...value.items],
    }),
  });
  const first = await getValue();

  first.items.push("mutated");

  assert.deepEqual(await getValue(), {
    items: ["original"],
  });
});
