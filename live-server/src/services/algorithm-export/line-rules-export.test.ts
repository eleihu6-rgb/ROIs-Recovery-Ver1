import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "./csv.js";
import { buildLineRulesCsvFromEntries } from "./line-rules-csv.js";

import type { LineRuleGroupRow, LoadLineRulesCsvOptions } from "./line-rules-types.js";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const queryText = (query: unknown): string => {
  const render = (chunk: unknown): string => {
    if (typeof chunk === "string" || typeof chunk === "number") return String(chunk);
    if (typeof chunk !== "object" || chunk === null) return "";
    if ("queryChunks" in chunk) {
      return (chunk as { queryChunks: unknown[] }).queryChunks.map(render).join("");
    }
    if ("value" in chunk) {
      const value = (chunk as { value: unknown }).value;
      return Array.isArray(value) ? value.map(render).join("") : String(value);
    }
    return "";
  };
  return render(query).replace(/\s+/g, " ").trim();
};

const createFakeDb = (
  rows: LineRuleGroupRow[],
  deltaHours: string | null = "5",
): LoadLineRulesCsvOptions["db"] => ({
  async execute<T>(query: unknown): Promise<{ rows: T[] }> {
    if (queryText(query).includes("PBS_LINE_CREDIT_WINDOW_CONFIG")) {
      return {
        rows: deltaHours === null ? [] : [{ codeValue: deltaHours }] as T[],
      };
    }

    return { rows: rows as T[] };
  },
} as unknown as LoadLineRulesCsvOptions["db"]);

const loadCsvForRows = async (
  periodCode: string,
  rows: LineRuleGroupRow[],
  deltaHours: string | null = "5",
) => {
  const { loadLineRulesCsv } = await import("./line-rules-export.js");
  const period = periodCode === "Mar 2026"
    ? { rosterPeriodId: 3, rosterPeriodKey: "2026RP03", periodCode, rpStartLocal: "2026-03-02", rpEndLocal: "2026-03-31" }
    : { rosterPeriodId: 6, rosterPeriodKey: "2026RP06", periodCode, rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" };

  return loadLineRulesCsv({
    db: createFakeDb(rows, deltaHours),
    liveSchema: "f8",
    pbsSchema: "f8",
    periodCode,
    period,
  });
};

const lineRulesHeader = [
  "Crew_ID",
  "Code_ID",
  "Rule_ID",
  "Rule_Type",
  "Parameters_JSON",
  "T1_Counter",
  "T2_Counter",
  "T3_Counter",
  "T4_Counter",
  "T5_Counter",
  "T6_Counter",
  "T7_Counter",
  "Description",
].join(",");

describe("buildLineRulesCsvFromEntries", () => {
  it("neutralizes spreadsheet formula fields", () => {
    const csv = buildLineRulesCsvFromEntries([
      {
        crewId: "=F8030",
        codeId: 408,
        ruleId: 408,
        ruleType: "COMMUTER_PATTERN",
        parametersJson: "@payload",
        description: "+cmd",
        tier: 1,
      },
    ]);

    expect(csv).toBe([
      lineRulesHeader,
      "'=F8030,408,408,COMMUTER_PATTERN,'@payload,1,0,0,0,0,0,0,'+cmd",
      "",
    ].join("\n"));
  });
});

describe("loadLineRulesCsv standard-answer mappings", () => {
  it("documents only the actual standard-answer mappings", async () => {
    const { buildLineRulesReadme } = await import("./line-rules-readme.js");
    const readme = buildLineRulesReadme();

    expect(readme).toContain("| 407 | 403 | MIN_BASE_LAYOVER |");
    expect(readme).not.toContain("| 428 |");
    expect(readme).not.toContain("| 429 |");
  });

  it("maps Portal 407 duration to standard 403 MIN_BASE_LAYOVER minHours", async () => {
    const csv = await loadCsvForRows("Jun 2026", [{
      crewId: "F8030",
      tier: 1,
      bidType: "Line",
      propertyGroupKey: "minimum-base-layover",
      propertyCode: 407,
      legacyPropertyCode: 407,
      actionId: null,
      operator: "=",
      paramA: "013:30",
      paramB: null,
      paramC: null,
    }]);

    expect(csv).toContain(
      "F8030,403,403,MIN_BASE_LAYOVER,\"{\"\"minHours\"\":13.5}\",1,0,0,0,0,0,0",
    );
  });

  it("exports Line Reserve Award and Avoid as standard Rule 427", async () => {
    const baseRow = {
      crewId: "F8030",
      bidType: "Line",
      propertyCode: 427,
      legacyPropertyCode: 427,
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
    };
    const csv = await loadCsvForRows("Jun 2026", [
      { ...baseRow, tier: 1, propertyGroupKey: "award-reserve", actionId: 1 },
      { ...baseRow, tier: 2, propertyGroupKey: "avoid-reserve", actionId: 2 },
    ]);

    expect(csv).toContain(
      "F8030,427,427,RESERVE,\"{\"\"action\"\":\"\"award\"\",\"\"scope\"\":\"\"whole_bid_month\"\"}\",1,0,0,0,0,0,0",
    );
    expect(csv).toContain(
      "F8030,427,427,RESERVE,\"{\"\"action\"\":\"\"avoid\"\",\"\"scope\"\":\"\"whole_bid_month\"\"}\",0,1,0,0,0,0,0",
    );
  });

  it("does not export Pairing property 428 through LINE_RULES.csv", async () => {
    const csv = await loadCsvForRows("Jun 2026", [428].map((propertyCode) => ({
      crewId: "F8030",
      tier: 1,
      bidType: "Line",
      propertyGroupKey: `line-${propertyCode}`,
      propertyCode,
      legacyPropertyCode: propertyCode,
      actionId: 1,
      operator: "=",
      paramA: "award",
      paramB: null,
      paramC: null,
    })));

    expect(csv).toBe(`${lineRulesHeader}\n`);
  });

  it("maps Portal 429 More/Less to standard 401/402 with the company delta", async () => {
    const baseRow = {
      crewId: "F8030",
      bidType: "Line",
      propertyCode: 429,
      legacyPropertyCode: 429,
      actionId: null,
      operator: "Json",
      paramB: null,
      paramC: null,
    };
    const csv = await loadCsvForRows("Jun 2026", [
      {
        ...baseRow,
        tier: 1,
        propertyGroupKey: "credit-more",
        paramA: JSON.stringify({ type: "credit-window-preference", direction: "more" }),
      },
      {
        ...baseRow,
        tier: 2,
        propertyGroupKey: "credit-less",
        paramA: JSON.stringify({ type: "credit-window-preference", direction: "less" }),
      },
    ], "8");

    expect(csv).toContain(
      "F8030,401,401,MAX_CREDIT_WINDOW,\"{\"\"deltaHours\"\":8}\",1,0,0,0,0,0,0",
    );
    expect(csv).toContain(
      "F8030,402,402,MIN_CREDIT_WINDOW,\"{\"\"deltaHours\"\":8}\",0,1,0,0,0,0,0",
    );
  });

  it("rejects a package with 429 when DELTA_HOURS is unavailable", async () => {
    await expect(loadCsvForRows("Jun 2026", [{
      crewId: "F8030",
      tier: 1,
      bidType: "Line",
      propertyGroupKey: "credit-more",
      propertyCode: 429,
      legacyPropertyCode: 429,
      actionId: null,
      operator: "Json",
      paramA: JSON.stringify({ type: "credit-window-preference", direction: "more" }),
      paramB: null,
      paramC: null,
    }], null)).rejects.toThrow("DELTA_HOURS");
  });

  it("filters non-crew rows in the SQL source", async () => {
    const { loadLineRulesCsv } = await import("./line-rules-export.js");
    let sqlText = "";
    const db = {
      async execute<T>(query: unknown): Promise<{ rows: T[] }> {
        sqlText = queryText(query);
        return { rows: [] };
      },
    } as unknown as LoadLineRulesCsvOptions["db"];

    await loadLineRulesCsv({
      db,
      liveSchema: "f8",
      pbsSchema: "f8_pbs",
      periodCode: "Jun 2026",
      period: {
        rosterPeriodId: 6,
        rosterPeriodKey: "2026RP06",
        periodCode: "Jun 2026",
        rpStartLocal: "2026-06-01",
        rpEndLocal: "2026-06-30",
      },
    });

    expect(sqlText).toContain("inner join f8.crew");
  });

  it.each([
    {
      label: "whole month",
      dateScope: { mode: "whole_month" },
      expectedScope: { mode: "whole_month" },
      expectedDescription: "Award Reserve Short Call Type PRAM for whole month.",
    },
    {
      label: "date range",
      dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
      expectedScope: {
        mode: "date_range",
        start: "2026-06-03",
        end: "2026-06-18",
      },
      expectedDescription: "Award Reserve Short Call PRAM for 2026-06-03..2026-06-18.",
    },
    {
      label: "first half",
      dateScope: { mode: "first_half" },
      expectedScope: {
        mode: "date_range",
        start: "2026-06-01",
        end: "2026-06-15",
      },
      expectedDescription: "Award Reserve Short Call PRAM for 2026-06-01..2026-06-15.",
    },
    {
      label: "second half",
      dateScope: { mode: "second_half" },
      expectedScope: {
        mode: "date_range",
        start: "2026-06-16",
        end: "2026-06-30",
      },
      expectedDescription: "Award Reserve Short Call PRAM for 2026-06-16..2026-06-30.",
    },
  ])("exports Reserve $label exclusively as standard Rule 301", async ({
    dateScope,
    expectedScope,
    expectedDescription,
  }) => {
    const csv = await loadCsvForRows("Jun 2026", [{
      crewId: "F8030",
      tier: 1,
      bidType: "Reserve",
      propertyGroupKey: "reserve-short-call-type",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: "In",
      paramA: "PRAM",
      paramB: JSON.stringify(dateScope),
      paramC: null,
    }]);

    const escapedParameters = escapeCsvCell(JSON.stringify({
      action: "award",
      callType: "PRAM",
      dateScope: expectedScope,
    }));

    expect(csv).toContain("F8030,301,301,RESERVE_SHORT_CALL_TYPE");
    expect(csv).toContain(escapedParameters);
    expect(csv).toContain(expectedDescription);
  });

  it("does not place specific-date Reserve conditions in LINE_RULES", async () => {
    const csv = await loadCsvForRows("Jun 2026", [{
      crewId: "F8030",
      tier: 1,
      bidType: "Reserve",
      propertyGroupKey: "reserve-short-call-type",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: "In",
      paramA: "PRAM",
      paramB: JSON.stringify({ mode: "specific_dates", dates: ["2026-06-03"] }),
      paramC: null,
    }]);

    expect(csv).toBe(`${lineRulesHeader}\n`);
  });

  it("matches the standard-answer Test_7 date-range row byte for byte", async () => {
    const csv = await loadCsvForRows("Jun 2026", [{
      crewId: "247",
      tier: 1,
      bidType: "Reserve",
      propertyGroupKey: "reserve-short-call-type",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: "In",
      paramA: "PRAM",
      paramB: JSON.stringify({
        mode: "date_range",
        from: "2026-06-07",
        to: "2026-06-13",
      }),
      paramC: null,
    }]);

    expect(csv).toBe([
      lineRulesHeader,
      "247,301,301,RESERVE_SHORT_CALL_TYPE,\"{\"\"action\"\":\"\"award\"\",\"\"callType\"\":\"\"PRAM\"\",\"\"dateScope\"\":{\"\"mode\"\":\"\"date_range\"\",\"\"start\"\":\"\"2026-06-07\"\",\"\"end\"\":\"\"2026-06-13\"\"}}\",1,0,0,0,0,0,0,Award Reserve Short Call PRAM for 2026-06-07..2026-06-13.",
      "",
    ].join("\n"));
  });
});

describe("loadLineRulesCsv COMMUTER_PATTERN parameters", () => {
  it("exports maximum days on as a maximum range instead of an exact days-on count", async () => {
    const csv = await loadCsvForRows("Jun 2026", [{
      crewId: "F8030",
      tier: 1,
      bidType: "DaysOff",
      propertyGroupKey: "max-consecutive-days-on",
      propertyCode: 202,
      legacyPropertyCode: 202,
      actionId: null,
      operator: "=",
      paramA: "5",
      paramB: null,
      paramC: null,
    }]);

    expect(csv).toContain(
      "F8030,202,408,COMMUTER_PATTERN,\"{\"\"maxDaysOff\"\":0,\"\"maxDaysOn\"\":5,\"\"minDaysOff\"\":0,\"\"minDaysOn\"\":1}\"",
    );
  });

  it("exports minimum days off with maxDaysOff expanded to the bid month length", async () => {
    const csv = await loadCsvForRows("Jun 2026", [{
      crewId: "F8030",
      tier: 1,
      bidType: "DaysOff",
      propertyGroupKey: "min-consecutive-days-off",
      propertyCode: 203,
      legacyPropertyCode: 203,
      actionId: null,
      operator: "=",
      paramA: "7",
      paramB: null,
      paramC: null,
    }]);

    expect(csv).toContain(
      "F8030,203,408,COMMUTER_PATTERN,\"{\"\"maxDaysOff\"\":30,\"\"maxDaysOn\"\":30,\"\"minDaysOff\"\":7,\"\"minDaysOn\"\":1}\"",
    );
  });

  it("uses the selected bid period when expanding minimum days off maxDaysOff", async () => {
    const csv = await loadCsvForRows("Mar 2026", [{
      crewId: "F8030",
      tier: 1,
      bidType: "DaysOff",
      propertyGroupKey: "min-consecutive-days-off",
      propertyCode: 203,
      legacyPropertyCode: 203,
      actionId: null,
      operator: "=",
      paramA: "2",
      paramB: null,
      paramC: null,
    }]);

    expect(csv).toContain(
      "F8030,203,408,COMMUTER_PATTERN,\"{\"\"maxDaysOff\"\":30,\"\"maxDaysOn\"\":30,\"\"minDaysOff\"\":2,\"\"minDaysOn\"\":1}\"",
    );
  });
});
