export type GeneratedSqlPreflightHandler = "special" | "core" | "time" | "detail";

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
  entry("special", 428, ["efficient", "inefficient"]),
  ...[102, 108, 105, 109, 106, 113, 132, 133, 137].map((code) => entry("core", code)),
  entry("core", 112, ["range", "specific-dates", "date-range"]),
  entry("core", 131),
  entry("core", 163, ["single", "between"]),
  entry("time", 103, ["check-in", "check-out-date-range", "facts"]),
  ...[134, 139, 135, 140, 120, 164, 136, 126, 141].map((code) => entry("time", code)),
  entry("time", 114, ["any", "every"]),
  entry("detail", 107, ["any", "every-date-range", "facts"]),
  entry("detail", 110, ["date-range", "specific-dates", "weekday-only", "start-only", "end-only"]),
  ...[123, 166, 167].flatMap((code) => [
    entry("detail", code, ["dates-any", "dates-every"]),
  ]),
  ...[124, 130, 115, 118, 119, 121, 127, 125, 101, 165, 142, 143, 144, 145, 146, 128, 147, 148, 153, 154, 157, 158, 161].map((code) => entry("detail", code)),
  entry("detail", 116, ["whole-period", "specific-dates", "date-range"]),
  entry("detail", 117, ["whole-period", "specific-dates", "date-range"]),
  entry("detail", 122, ["any-deadhead", "deadhead-only-duty"]),
  entry("detail", 129, ["any", "every"]),
  entry("detail", 168, ["landing", "layover", "both-date-range-minimum", "facts"]),
  ...[104, 150, 151, 152].map((code) => entry("detail", code, ["any", "every"])),
  ...[155, 156, 159, 160].map((code) => entry("detail", code)),
]) satisfies readonly GeneratedSqlPreflightManifestEntry[];
