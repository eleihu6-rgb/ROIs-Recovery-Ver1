import assert from "node:assert/strict";
import test from "node:test";

import { buildPbsCrewBidImportPairingSelection } from "./pbs-crew-bid-imports.js";

test("builds aligned pairing IDs and labels while preserving repeated labels", () => {
  assert.deepEqual(buildPbsCrewBidImportPairingSelection([
    { pairingId: "98991", pairingNumber: "C4107" },
    { pairingId: "99126", pairingNumber: "C4107" },
    { pairingId: "99196", pairingNumber: "C4107" },
    { pairingId: "99661", pairingNumber: "C4130" },
  ]), {
    pairingIds: ["98991", "99126", "99196", "99661"],
    pairingLabels: ["C4107", "C4107", "C4107", "C4130"],
    conflictingPairingIds: [],
  });
});

test("deduplicates by pairing ID without deduplicating labels independently", () => {
  assert.deepEqual(buildPbsCrewBidImportPairingSelection([
    { pairingId: "98991", pairingNumber: "C4107" },
    { pairingId: "98991", pairingNumber: "C4107" },
    { pairingId: "99126", pairingNumber: "C4107" },
  ]), {
    pairingIds: ["98991", "99126"],
    pairingLabels: ["C4107", "C4107"],
    conflictingPairingIds: [],
  });
});

test("reports a stable pairing ID mapped to conflicting labels", () => {
  assert.deepEqual(buildPbsCrewBidImportPairingSelection([
    { pairingId: "98991", pairingNumber: "C4107" },
    { pairingId: "98991", pairingNumber: "C9999" },
  ]), {
    pairingIds: ["98991"],
    pairingLabels: ["C4107"],
    conflictingPairingIds: ["98991"],
  });
});
