import { LineholderBidServiceError } from "./shared-types.js";

export const parseTierKey = (tier: string) => {
  const normalized = tier.trim().toUpperCase();
  const match = normalized.match(/^T([1-9]\d*)$/);

  if (!match) {
    throw new LineholderBidServiceError(400, `Unsupported lineholder tier: ${tier}`);
  }

  return {
    key: `T${match[1]}`,
    number: Number.parseInt(match[1], 10),
  };
};

export const normalizeTiers = (tiers: string[]) =>
  Array.from(
    new Map(
      tiers.map((tier) => {
        const parsed = parseTierKey(tier);
        return [parsed.number, parsed.key];
      }),
    ).entries(),
  )
    .sort((left, right) => left[0] - right[0])
    .map(([, key]) => key);
