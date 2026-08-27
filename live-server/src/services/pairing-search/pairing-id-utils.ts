export const isStablePairingId = (value: string) => /^\d+$/.test(value.trim());

export const normalizeStablePairingIds = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(isStablePairingId)));

