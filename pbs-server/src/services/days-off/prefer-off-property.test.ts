import assert from "node:assert/strict";
import test from "node:test";
import type { PbsDaysOffDraftProperty } from "../../../../packages/contracts/pbs-days-off-bids.js";
import { normalizePreferOffProperty } from "./prefer-off-property.js";

const buildProperty = (
  values: string[],
  allOrNothing: boolean,
  minimumN: number | null,
  maximumN: number | null,
): PbsDaysOffDraftProperty => ({
  propertyGroupKey: "prefer-off-1",
  rowSeq: 1,
  propertyCode: 201,
  name: "Prefer Off",
  bid: { type: "tag-list", values },
  tiers: ["T1"],
  allOrNothing,
  minimumN,
  maximumN,
});

test("normalizePreferOffProperty always standardizes Prefer Off to all selected periods", () => {
  const single = normalizePreferOffProperty(
    buildProperty(["2026-04-10"], false, 1, 1),
    { periodCode: "Apr 2026" },
  );
  const legacyEmpty = normalizePreferOffProperty(
    buildProperty(["2026-04-10", "2026-04-11"], false, null, null),
    { periodCode: "Apr 2026" },
  );
  const legacyMinOnly = normalizePreferOffProperty(
    buildProperty(["2026-04-10", "2026-04-11", "2026-04-12"], false, 2, null),
    { periodCode: "Apr 2026" },
  );
  const legacyRange = normalizePreferOffProperty(
    buildProperty(["2026-04-10", "2026-04-11", "2026-04-12"], false, 1, 2),
    { periodCode: "Apr 2026" },
  );

  assert.deepEqual(
    [single.allOrNothing, single.minimumN, single.maximumN],
    [true, null, null],
  );
  assert.deepEqual(
    [legacyEmpty.allOrNothing, legacyEmpty.minimumN, legacyEmpty.maximumN],
    [true, null, null],
  );
  assert.deepEqual(
    [legacyMinOnly.allOrNothing, legacyMinOnly.minimumN, legacyMinOnly.maximumN],
    [true, null, null],
  );
  assert.deepEqual(
    [legacyRange.allOrNothing, legacyRange.minimumN, legacyRange.maximumN],
    [true, null, null],
  );
});
