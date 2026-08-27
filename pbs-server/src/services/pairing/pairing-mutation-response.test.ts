import assert from "node:assert/strict";
import test from "node:test";
import {
  savedPairingDraftMutationResponse,
  savedPairingFavoriteMutationResponse,
  savedPairingMutationResponse,
  savedPairingPropertyMutationResponse,
} from "./pairing-mutation-response.js";
import type { CurrentBidTarget } from "../lineholder/shared.js";

const targetBid: CurrentBidTarget = {
  draftKey: "92001",
  bidId: 92001,
  periodId: 202604,
  periodCode: "Apr 2026",
  draftVersion: 7,
};

test("pairing mutation response helpers preserve draft identity fields", () => {
  assert.deepEqual(savedPairingMutationResponse(), {
    saved: true,
    draftKey: undefined,
    bidId: undefined,
    periodId: undefined,
    periodCode: undefined,
    draftVersion: undefined,
  });

  assert.deepEqual(savedPairingDraftMutationResponse(targetBid), {
    saved: true,
    draftKey: "92001",
    bidId: 92001,
    periodId: 202604,
    periodCode: "Apr 2026",
    draftVersion: 7,
  });
});

test("pairing property mutation responses include inserted property identity", () => {
  assert.deepEqual(savedPairingPropertyMutationResponse("pairing-property-key-1", 5, targetBid), {
    saved: true,
    draftKey: "92001",
    bidId: 92001,
    periodId: 202604,
    periodCode: "Apr 2026",
    draftVersion: 7,
    propertyGroupKey: "pairing-property-key-1",
    rowSeq: 5,
  });
});

test("pairing favorite mutation responses include favorite and draft identity", () => {
  assert.deepEqual(
    savedPairingFavoriteMutationResponse(
      {
        favoriteKey: "990132",
        propertyId: 700132,
        propertyCode: 132,
        name: "Prefer Pairing Length",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 3, min: 1, max: 7 },
      },
      targetBid,
    ),
    {
      saved: true,
      draftKey: "92001",
      bidId: 92001,
      periodId: 202604,
      periodCode: "Apr 2026",
      draftVersion: 7,
      favoriteKey: "990132",
      propertyId: 700132,
      propertyCode: 132,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 3, min: 1, max: 7 },
    },
  );
});
