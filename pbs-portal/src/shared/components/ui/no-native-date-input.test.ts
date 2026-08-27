import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredFileSuffixes = [".test.ts", ".test.tsx"];
const nativeDateInputPattern = /type\s*=\s*(?:"date"|'date'|{\s*["']date["']\s*})/;

const collectSourceFiles = (directory: string): string[] => {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    if (!sourceExtensions.has(path.extname(absolutePath))) {
      return [];
    }

    if (ignoredFileSuffixes.some((suffix) => absolutePath.endsWith(suffix))) {
      return [];
    }

    return [absolutePath];
  });
};

describe("native date input guard", () => {
  it("does not use browser-native date inputs in PBS Portal source", () => {
    const offenders = collectSourceFiles(srcRoot).filter((filePath) =>
      nativeDateInputPattern.test(readFileSync(filePath, "utf8")),
    );

    expect(offenders.map((filePath) => path.relative(srcRoot, filePath))).toEqual([]);
  });
});
