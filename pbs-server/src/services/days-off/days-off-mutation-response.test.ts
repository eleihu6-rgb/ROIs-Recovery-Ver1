import assert from "node:assert/strict";
import test from "node:test";
import {
  savedDraftMutationResponse,
  savedFavoriteMutationResponse,
  savedMutationResponse,
  savedPropertyMutationResponse,
} from "./days-off-mutation-response.js";
import type { CurrentBidTarget } from "../lineholder/shared.js";

const targetBid: CurrentBidTarget = {
  draftKey: "91001",
  bidId: 91001,
  periodId: 202604,
  periodCode: "Apr 2026",
  draftVersion: 4,
};

test("days off mutation response helpers preserve draft identity fields", () => {
  assert.deepEqual(savedMutationResponse(), {
    saved: true,
    draftKey: undefined,
    bidId: undefined,
    periodId: undefined,
    periodCode: undefined,
    draftVersion: undefined,
  });

  assert.deepEqual(savedDraftMutationResponse(targetBid), {
    saved: true,
    draftKey: "91001",
    bidId: 91001,
    periodId: 202604,
    periodCode: "Apr 2026",
    draftVersion: 4,
  });
});

test("days off property mutation responses include inserted property identity", () => {
  assert.deepEqual(savedPropertyMutationResponse("property-key-1", 3, targetBid), {
    saved: true,
    draftKey: "91001",
    bidId: 91001,
    periodId: 202604,
    periodCode: "Apr 2026",
    draftVersion: 4,
    propertyGroupKey: "property-key-1",
    rowSeq: 3,
  });
});

test("days off favorite mutation responses include favorite and draft identity", () => {
  assert.deepEqual(
    savedFavoriteMutationResponse(
      {
        favoriteKey: "880212",
        propertyId: 700212,
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        bid: { type: "flag" },
        allOrNothing: false,
        minimumN: null,
      },
      targetBid,
    ),
    {
      saved: true,
      draftKey: "91001",
      bidId: 91001,
      periodId: 202604,
      periodCode: "Apr 2026",
      draftVersion: 4,
      favoriteKey: "880212",
      propertyId: 700212,
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      bid: { type: "flag" },
      allOrNothing: false,
      minimumN: null,
    },
  );
});
