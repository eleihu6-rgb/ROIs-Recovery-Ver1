import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "./csv.js";

describe("escapeCsvCell", () => {
  it("neutralizes spreadsheet formula prefixes for string values", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(escapeCsvCell("-SUM(A1:A2)")).toBe("'-SUM(A1:A2)");
    expect(escapeCsvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell("  =1+1")).toBe("'  =1+1");
    expect(escapeCsvCell("\t=1+1")).toBe("'\t=1+1");
  });

  it("preserves numbers and standard CSV quoting", () => {
    expect(escapeCsvCell(-12)).toBe("-12");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell("alpha,beta")).toBe("\"alpha,beta\"");
    expect(escapeCsvCell("alpha \"beta\"")).toBe("\"alpha \"\"beta\"\"\"");
    expect(escapeCsvCell("=1,\"quoted\"")).toBe("\"'=1,\"\"quoted\"\"\"");
  });
});
