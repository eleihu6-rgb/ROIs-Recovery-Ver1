import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLineRulesCsvFromEntries,
  buildLineRulesReadme,
  loadLineRulesCsv,
  type LineRuleSkippedProperty,
} from "./line-rules-export.js";

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

test("buildLineRulesCsvFromEntries outputs only configured rules and increments repeated hits", () => {
  const csv = buildLineRulesCsvFromEntries([
    {
      crewId: "F8030",
      codeId: 411,
      ruleId: 411,
      ruleType: "TARGET_CREDIT_RANGE",
      parametersJson: "{\"from\":75,\"to\":85}",
      description: "Target Credit Range: Between 75 - 85.",
      tier: 1,
    },
    {
      crewId: "F8030",
      codeId: 411,
      ruleId: 411,
      ruleType: "TARGET_CREDIT_RANGE",
      parametersJson: "{\"from\":75,\"to\":85}",
      description: "Target Credit Range: Between 75 - 85.",
      tier: 3,
    },
    {
      crewId: "F8030",
      codeId: 411,
      ruleId: 411,
      ruleType: "TARGET_CREDIT_RANGE",
      parametersJson: "{\"from\":75,\"to\":85}",
      description: "Target Credit Range: Between 75 - 85.",
      tier: 3,
    },
    {
      crewId: "F8030",
      codeId: 411,
      ruleId: 411,
      ruleType: "TARGET_CREDIT_RANGE",
      parametersJson: "{\"from\":75,\"to\":85}",
      description: "Target Credit Range: Between 75 - 85.",
      tier: 8,
    },
  ]);

  assert.equal(csv, [
    lineRulesHeader,
    "F8030,411,411,TARGET_CREDIT_RANGE,\"{\"\"from\"\":75,\"\"to\"\":85}\",1,0,2,0,0,0,0,Target Credit Range: Between 75 - 85.",
    "",
  ].join("\n"));
});

test("loadLineRulesCsv maps Portal 429 More/Less to standard 401/402 with dictionary deltaHours", async () => {
  const rows = [
    {
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
    },
    {
      crewId: "F8030",
      tier: 2,
      bidType: "Line",
      propertyGroupKey: "credit-less",
      propertyCode: 429,
      legacyPropertyCode: 429,
      actionId: null,
      operator: "Json",
      paramA: JSON.stringify({ type: "credit-window-preference", direction: "less" }),
      paramB: null,
      paramC: null,
    },
  ];
  let queryCount = 0;
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      queryCount += 1;
      return queryCount === 1
        ? { rows: rows as T[] }
        : { rows: [{ codeValue: "6" }] as T[] };
    },
  } as unknown as Parameters<typeof loadLineRulesCsv>[0]["db"];

  const csv = await loadLineRulesCsv({
    db,
    periodCode: "Jun 2026",
  });

  assert.match(
    csv,
    /F8030,401,401,MAX_CREDIT_WINDOW,"\{""deltaHours"":6\}",1,0,0,0,0,0,0/,
  );
  assert.match(
    csv,
    /F8030,402,402,MIN_CREDIT_WINDOW,"\{""deltaHours"":6\}",0,1,0,0,0,0,0/,
  );
  assert.equal(queryCount, 2);
});

test("loadLineRulesCsv does not require DELTA_HOURS when the package has no 429", async () => {
  let queryCount = 0;
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      queryCount += 1;
      return { rows: [] };
    },
  } as unknown as Parameters<typeof loadLineRulesCsv>[0]["db"];

  const csv = await loadLineRulesCsv({
    db,
    periodCode: "Jun 2026",
  });

  assert.equal(csv, `${lineRulesHeader}\n`);
  assert.equal(queryCount, 1);
});

test("buildLineRulesCsvFromEntries returns only the header when no line rules exist", () => {
  assert.equal(buildLineRulesCsvFromEntries([]), `${lineRulesHeader}\n`);
});

test("buildLineRulesCsvFromEntries neutralizes spreadsheet formula fields", () => {
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

  assert.equal(csv, [
    lineRulesHeader,
    "'=F8030,408,408,COMMUTER_PATTERN,'@payload,1,0,0,0,0,0,0,'+cmd",
    "",
  ].join("\n"));
});

test("loadLineRulesCsv serializes supported line rules and skips unsupported properties", async () => {
  const skippedProperties: LineRuleSkippedProperty[] = [];
  const rows = [
    {
      crewId: "F8030",
      tier: 1,
      bidType: "Reserve",
      propertyGroupKey: "whole-month-pram",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: "In",
      paramA: "PRAM",
      paramB: JSON.stringify({ mode: "whole_month" }),
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 2,
      bidType: "Reserve",
      propertyGroupKey: "first-half-prpm",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 2,
      operator: "In",
      paramA: "PRPM",
      paramB: JSON.stringify({ mode: "first_half" }),
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 3,
      bidType: "Reserve",
      propertyGroupKey: "specific-date-pram",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: "In",
      paramA: "PRAM",
      paramB: JSON.stringify({ mode: "specific_dates", dates: ["2026-06-01"] }),
      paramC: null,
    },
    {
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
    },
    {
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
    },
    {
      crewId: "F8030",
      tier: 1,
      bidType: "DaysOff",
      propertyGroupKey: "min-consecutive-days-off-window",
      propertyCode: 204,
      legacyPropertyCode: 204,
      actionId: 2,
      operator: "Between",
      paramA: "2",
      paramB: "2026-06-01",
      paramC: "2026-06-07",
    },
    {
      crewId: "F8030",
      tier: 1,
      bidType: "DaysOff",
      propertyGroupKey: "days-off-days-on-pattern",
      propertyCode: 205,
      legacyPropertyCode: 205,
      actionId: null,
      operator: "Between",
      paramA: "4",
      paramB: "4",
      paramC: "5",
    },
    {
      crewId: "F8030",
      tier: 1,
      bidType: "DaysOff",
      propertyGroupKey: "shared-days-off",
      propertyCode: 206,
      legacyPropertyCode: 206,
      actionId: null,
      operator: "=",
      paramA: "1234",
      paramB: "2",
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 1,
      propertyGroupKey: "target-credit",
      propertyCode: 411,
      legacyPropertyCode: 411,
      actionId: null,
      operator: "Between",
      paramA: "75",
      paramB: "85",
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "reserve-pattern",
      propertyCode: 410,
      legacyPropertyCode: 410,
      actionId: null,
      operator: "Pattern",
      paramA: JSON.stringify([
        {
          workType: "reserve",
          callType: "PRAM",
          dateScope: { mode: "whole_month" },
        },
      ]),
      paramB: "strong",
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "unsupported",
      propertyCode: 999,
      legacyPropertyCode: 999,
      actionId: null,
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
    },
  ];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: rows as T[] };
    },
  } as unknown as Parameters<typeof loadLineRulesCsv>[0]["db"];

  const csv = await loadLineRulesCsv({
    db,
    periodCode: "Jun 2026",
    onSkippedProperty: (event) => skippedProperties.push(event),
  });

  assert.equal(csv, [
    lineRulesHeader,
    "F8030,202,408,COMMUTER_PATTERN,\"{\"\"maxDaysOff\"\":0,\"\"maxDaysOn\"\":5,\"\"minDaysOff\"\":0,\"\"minDaysOn\"\":5}\",1,0,0,0,0,0,0,DaysOff rule: Max Consecutive Days On is 5.",
    "F8030,203,408,COMMUTER_PATTERN,\"{\"\"maxDaysOff\"\":7,\"\"maxDaysOn\"\":30,\"\"minDaysOff\"\":7,\"\"minDaysOn\"\":1}\",1,0,0,0,0,0,0,DaysOff rule: Min Consecutive Days Off is 7.",
    "F8030,204,204,MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW,\"{\"\"from\"\":\"\"2026-06-01\"\",\"\"minimumDaysOff\"\":2,\"\"to\"\":\"\"2026-06-07\"\"}\",1,0,0,0,0,0,0,DaysOff rule: Long Stretch Off / Compressed Flying is 2 from 2026-06-01 to 2026-06-07.",
    "F8030,205,408,COMMUTER_PATTERN,\"{\"\"maxDaysOff\"\":4,\"\"maxDaysOn\"\":5,\"\"minDaysOff\"\":4,\"\"minDaysOn\"\":4}\",1,0,0,0,0,0,0,\"DaysOff rule: Days Off / Days On Pattern requires 4 days off, 4-5 days on.\"",
    "F8030,206,206,EMPLOYEE_SCHEDULE_PREFERENCE,\"{\"\"crewId\"\":\"\"1234\"\",\"\"days\"\":2,\"\"mode\"\":\"\"same_days_off\"\",\"\"relationship\"\":\"\"together\"\",\"\"scheduleType\"\":\"\"days_off\"\",\"\"thresholdType\"\":\"\"minimum\"\"}\",1,0,0,0,0,0,0,DaysOff rule: Employee Schedule Preference with minimum 2 days off together with crew 1234.",
    "F8030,301,301,RESERVE_SHORT_CALL_TYPE,\"{\"\"action\"\":\"\"avoid\"\",\"\"callType\"\":\"\"PRPM\"\",\"\"dateScope\"\":{\"\"mode\"\":\"\"first_half\"\"}}\",0,1,0,0,0,0,0,Avoid Reserve Preference PRPM for first half.",
    "F8030,301,301,RESERVE_SHORT_CALL_TYPE,\"{\"\"action\"\":\"\"award\"\",\"\"callType\"\":\"\"PRAM\"\",\"\"dateScope\"\":{\"\"mode\"\":\"\"whole_month\"\"}}\",1,0,0,0,0,0,0,Award Reserve Preference PRAM for whole month.",
    "F8030,410,410,RESERVE_FLYING_DATE_PATTERN,\"{\"\"segments\"\":[{\"\"callType\"\":\"\"PRAM\"\",\"\"dateScope\"\":{\"\"mode\"\":\"\"whole_month\"\"},\"\"workType\"\":\"\"reserve\"\"}],\"\"strength\"\":\"\"strong\"\"}\",0,1,0,0,0,0,0,Reserve / Flying Date Pattern: PRAM on Whole Month; strength strong.",
    "F8030,411,411,TARGET_CREDIT_RANGE,\"{\"\"from\"\":75,\"\"to\"\":85}\",1,0,0,0,0,0,0,Target Credit Range: Between 75 - 85.",
    "",
  ].join("\n"));
  assert.deepEqual(skippedProperties, [{
    crewId: "F8030",
    periodCode: "Jun 2026",
    propertyCode: 999,
    propertyGroupKey: "unsupported",
    reason: "Unsupported line rule property code.",
  }]);
});

test("loadLineRulesCsv exports Line Reserve actions as Rule ID 427", async () => {
  const rows = [
    {
      crewId: "F8030",
      tier: 1,
      propertyGroupKey: "award-reserve",
      propertyCode: 427,
      legacyPropertyCode: 427,
      actionId: 1,
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "avoid-reserve",
      propertyCode: 427,
      legacyPropertyCode: 427,
      actionId: 2,
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
    },
  ];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: rows as T[] };
    },
  } as unknown as Parameters<typeof loadLineRulesCsv>[0]["db"];

  const csv = await loadLineRulesCsv({
    db,
    periodCode: "Jun 2026",
  });

  assert.equal(csv, [
    lineRulesHeader,
    "F8030,427,427,RESERVE,\"{\"\"action\"\":\"\"avoid\"\",\"\"scope\"\":\"\"whole_bid_month\"\"}\",0,1,0,0,0,0,0,No Reserve for the whole bid month.",
    "F8030,427,427,RESERVE,\"{\"\"action\"\":\"\"award\"\",\"\"scope\"\":\"\"whole_bid_month\"\"}\",1,0,0,0,0,0,0,Award only Reserve for the whole bid month; require the line to be reserve-only.",
    "",
  ].join("\n"));
});

test("loadLineRulesCsv exports Mixed Line short-call date ranges saved as Line rows", async () => {
  const rows = [
    {
      crewId: "F8030",
      tier: 1,
      bidType: "Line",
      propertyGroupKey: "mixed-short-call",
      propertyCode: 301,
      legacyPropertyCode: 301,
      actionId: 1,
      operator: "In",
      paramA: "PRAM",
      paramB: JSON.stringify({ mode: "date_range", from: "2026-09-01", to: "2026-09-03" }),
      paramC: null,
    },
  ];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: rows as T[] };
    },
  } as unknown as Parameters<typeof loadLineRulesCsv>[0]["db"];

  const csv = await loadLineRulesCsv({
    db,
    periodCode: "Sep 2026",
  });

  assert.equal(csv, [
    lineRulesHeader,
    "F8030,301,301,RESERVE_SHORT_CALL_TYPE,\"{\"\"action\"\":\"\"award\"\",\"\"callType\"\":\"\"PRAM\"\",\"\"dateScope\"\":{\"\"from\"\":\"\"2026-09-01\"\",\"\"mode\"\":\"\"date_range\"\",\"\"to\"\":\"\"2026-09-03\"\"}}\",1,0,0,0,0,0,0,Award Reserve Preference PRAM for 2026-09-01 to 2026-09-03.",
    "",
  ].join("\n"));
});

test("loadLineRulesCsv skips invalid Line Reserve and legacy Line 428 rules", async () => {
  const skippedProperties: LineRuleSkippedProperty[] = [];
  const rows = [
    {
      crewId: "F8030",
      tier: 1,
      propertyGroupKey: "reserve-without-mode",
      propertyCode: 427,
      legacyPropertyCode: 427,
      actionId: null,
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      tier: 2,
      propertyGroupKey: "efficient-without-action",
      propertyCode: 428,
      legacyPropertyCode: 428,
      actionId: null,
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
    },
  ];
  const db = {
    async execute<T>(): Promise<{ rows: T[] }> {
      return { rows: rows as T[] };
    },
  } as unknown as Parameters<typeof loadLineRulesCsv>[0]["db"];

  const csv = await loadLineRulesCsv({
    db,
    periodCode: "Jun 2026",
    onSkippedProperty: (event) => skippedProperties.push(event),
  });

  assert.equal(csv, `${lineRulesHeader}\n`);
  assert.deepEqual(skippedProperties, [
    {
      crewId: "F8030",
      periodCode: "Jun 2026",
      propertyCode: 427,
      propertyGroupKey: "reserve-without-mode",
      reason: "Line Reserve requires Award or Avoid.",
    },
    {
      crewId: "F8030",
      periodCode: "Jun 2026",
      propertyCode: 428,
      propertyGroupKey: "efficient-without-action",
      reason: "Unsupported line rule property code.",
    },
  ]);
});

test("buildLineRulesReadme documents Rule ID mapping for the export package", () => {
  const readme = buildLineRulesReadme();

  assert.match(readme, /# LINE_RULES\.csv Rule ID Reference/);
  assert.match(readme, /\| Code_ID \| Source PBS property code from the portal configuration\./);
  assert.match(readme, /Code_ID 202, 203, and 205 are exported as Rule_ID 408 \/ Rule_Type COMMUTER_PATTERN/);
  assert.match(readme, /\| 301 \| 301 \| RESERVE_SHORT_CALL_TYPE \| Reserve Preference \| Reserve \|/);
  assert.match(readme, /\| 202 \| 408 \| COMMUTER_PATTERN \| Max Consecutive Days On \| DaysOff \|/);
  assert.match(readme, /\| 203 \| 408 \| COMMUTER_PATTERN \| Min Consecutive Days Off \| DaysOff \|/);
  assert.match(readme, /\| 204 \| 204 \| MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW \| Long Stretch Off \/ Compressed Flying \| DaysOff \|/);
  assert.match(readme, /\| 205 \| 408 \| COMMUTER_PATTERN \| Days Off \/ Days On Pattern \| DaysOff \|/);
  assert.match(readme, /\| 206 \| 206 \| EMPLOYEE_SCHEDULE_PREFERENCE \| Employee Schedule Preference \| DaysOff \|/);
  assert.match(readme, /\| 410 \| 410 \| RESERVE_FLYING_DATE_PATTERN \| Reserve \/ Flying Date Pattern \|/);
  assert.match(readme, /\| 427 \| 427 \| RESERVE \| Reserve \|/);
  assert.doesNotMatch(readme, /\| 428 \| 428 \| EFFICIENT_FLYING_FIRST/);
  assert.match(readme, /Whole-month Reserve call type structure from the Reserve tab is exported as Rule_ID 301/);
  assert.match(readme, /First-half, second-half, date-range, and specific-date Reserve call type requests remain in RESERVE_SCORE\.csv/);
  assert.match(readme, /Line Reserve is exported as Rule_ID 427 with action award or avoid for the whole bid month/);
  assert.doesNotMatch(readme, /Only Reserve is represented by Rule_ID 410/);
});
