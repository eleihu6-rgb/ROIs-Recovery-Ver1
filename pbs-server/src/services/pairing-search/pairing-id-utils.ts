export const isStablePairingId = (value: string) => /^\d+$/.test(value.trim());

export const normalizeStablePairingIds = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(isStablePairingId)));

// A valid pairing bid id is any non-empty token without whitespace — either the numeric DB
// id or the user-facing pairing label (e.g. "T4145", "M4959", "PRPM-2000-0559").
// Hyphens and underscores are common in airline pairing labels.
export const isPairingBidId = (value: string) => /^[A-Za-z0-9_-]+$/.test(value.trim());

export const normalizePairingBidIds = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(isPairingBidId)));

