import assert from "node:assert/strict";
import test from "node:test";
import type { PbsDaysOffDraftProperty } from "../../../../packages/contracts/pbs-days-off-bids.js";
import { materializeReusableLongStretchPeriod } from "./days-off-bid-service.js";

const reusableLongStretch: PbsDaysOffDraftProperty = {
  propertyGroupKey: "favorite-long-stretch",
  rowSeq: 1,
  propertyCode: 204,
  name: "Long Stretch Off / Compressed Flying",
  action: "award",
  bid: { type: "stepper-date-range", value: 10, from: "", to: "", min: 1, max: 14 },
  tiers: ["T1"],
};

test("reusable Long Stretch favorite materializes to the active roster period", () => {
  assert.deepEqual(
    materializeReusableLongStretchPeriod(reusableLongStretch, "2026-05-31", "2026-06-29").bid,
    { type: "stepper-date-range", value: 10, from: "2026-05-31", to: "2026-06-29", min: 1, max: 14 },
  );
});

test("explicit Long Stretch date ranges are preserved", () => {
  const explicit: PbsDaysOffDraftProperty = {
    ...reusableLongStretch,
    bid: {
      ...reusableLongStretch.bid,
      type: "stepper-date-range" as const,
      value: 10,
      from: "2026-06-03",
      to: "2026-06-20",
      min: 1,
      max: 14,
    },
  };

  assert.equal(materializeReusableLongStretchPeriod(explicit, "2026-05-31", "2026-06-29"), explicit);
});
