import { createHash } from "node:crypto";

const canonicalize = (value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, entryValue]) => [key, canonicalize(entryValue)] as const)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  return Object.fromEntries(entries);
};

export const stableJsonStringify = (value: unknown): string => JSON.stringify(canonicalize(value)) ?? "null";

export const stableHash = (value: unknown): string =>
  createHash("sha256")
    .update(stableJsonStringify(value))
    .digest("hex")
    .slice(0, 32);
