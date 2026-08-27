export type GeneratedSqlPreflightHandler = "core" | "time" | "detail";

export type GeneratedSqlPreflightManifestEntry = {
  propertyCode: number;
  handler: GeneratedSqlPreflightHandler;
  requiredCaseIds: readonly string[];
};

const entry = (
  handler: GeneratedSqlPreflightHandler,
  propertyCode: number,
  variants: readonly string[] = ["default"],
): GeneratedSqlPreflightManifestEntry => ({
  propertyCode,
  handler,
  requiredCaseIds: variants.map((variant) => `${handler}:${propertyCode}:${variant}`),
});

export const generatedSqlPreflightManifest = Object.freeze([
  ...[102, 108, 105, 109, 106, 113, 132, 133, 137].map((code) => entry("core", code)),
  entry("core", 163, ["legacy", "current-single", "current-range"]),
  entry("core", 112, ["range", "specific-dates", "date-range"]),
  entry("core", 131),
  entry("time", 103, ["legacy", "current-whole", "current-specific", "current-range"]),
  ...[134, 139, 111, 135, 140, 120, 164, 136, 126, 141].map((code) => entry("time", code)),
  entry("time", 114, ["any", "every"]),
  entry("detail", 107, ["legacy-any", "legacy-every", "current-any", "current-every", "current-range"]),
  entry("detail", 110, ["date-range", "specific-dates"]),
  entry("detail", 123, ["dates-any", "dates-every"]),
  ...[124, 130, 115, 116, 118, 119, 121, 127, 125, 101, 165, 142, 143, 144, 145, 146, 128, 147, 148, 153, 154, 157, 158, 161].map((code) => entry("detail", code)),
  entry("detail", 117, ["whole-period", "specific-dates", "date-range"]),
  entry("detail", 122, ["any-deadhead", "deadhead-only-duty"]),
  entry("detail", 129, ["any", "every"]),
  entry("detail", 168, ["landing", "layover", "both-date-range-minimum"]),
  ...[104, 150, 151, 152].map((code) => entry("detail", code, ["any", "every"])),
  ...[155, 156, 159, 160].map((code) => entry("detail", code)),
]) satisfies readonly GeneratedSqlPreflightManifestEntry[];
