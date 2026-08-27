import assert from "node:assert/strict";
import test from "node:test";
import {
  isPbsAwardExplanationComment,
  isReservedPbsAwardComment,
  parsePbsAwardExplanationComment,
} from "./pbs-award-results.js";

test("parses the exact PBS Award V1 explanation protocol", () => {
  assert.equal(
    parsePbsAwardExplanationComment(
      "PBS_AWARD_V1|Matched your Tier 3 pairing preferences.",
    ),
    "Matched your Tier 3 pairing preferences.",
  );
  assert.equal(
    isPbsAwardExplanationComment(
      "PBS_AWARD_V1|Matched your Tier 24 pairing preferences.",
    ),
    true,
  );
});

test("rejects malformed, out-of-range, and ordinary comments", () => {
  for (const value of [
    null,
    "",
    "Matched your Tier 3 pairing preferences.",
    "PBS_AWARD_V1|Matched your Tier 0 pairing preferences.",
    "PBS_AWARD_V1|Matched your Tier 25 pairing preferences.",
    "PBS_AWARD_V1|Matched your Tier 3 pairing preferences",
    "PBS_AWARD_V2|Matched your Tier 3 pairing preferences.",
  ]) {
    assert.equal(parsePbsAwardExplanationComment(value), null);
    assert.equal(isPbsAwardExplanationComment(value), false);
  }
});

test("recognizes the reserved namespace independently from protocol validity", () => {
  assert.equal(isReservedPbsAwardComment("PBS_AWARD_V1|invalid"), true);
  assert.equal(isReservedPbsAwardComment("ordinary planner note"), false);
});
