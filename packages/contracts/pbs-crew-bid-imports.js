export const pbsCrewBidImportRoutes = Object.freeze({
  dryRun: "/admin/crew-bid-imports/dry-run",
  runs: "/admin/crew-bid-imports",
  byRunId: (runId) => `/admin/crew-bid-imports/${runId}`,
});

export const buildPbsCrewBidImportPairingSelection = (references) => {
  const labelsById = new Map();
  const conflictingPairingIds = new Set();

  for (const reference of references) {
    const pairingId = String(reference?.pairingId ?? "").trim();
    const pairingLabel = String(reference?.pairingNumber ?? "").trim();

    if (!pairingId || !pairingLabel) {
      continue;
    }

    const existingLabel = labelsById.get(pairingId);

    if (existingLabel === undefined) {
      labelsById.set(pairingId, pairingLabel);
    } else if (existingLabel !== pairingLabel) {
      conflictingPairingIds.add(pairingId);
    }
  }

  return {
    pairingIds: Array.from(labelsById.keys()),
    pairingLabels: Array.from(labelsById.values()),
    conflictingPairingIds: Array.from(conflictingPairingIds),
  };
};
