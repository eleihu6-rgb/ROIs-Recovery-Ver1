import { expect, test, type Locator, type Page } from "@playwright/test";
import { PbsLoginPage } from "../../pages/pbs-portal/pbs-login-page";

const PBS_USER = process.env.PBS_TEST_USER ?? "762";
const PBS_PASS = process.env.PBS_TEST_PASS ?? "rois";
const AUTH_TOKEN_STORAGE_KEY = "pbs-portal.auth.token";

test.use({ storageState: { cookies: [], origins: [] } });

type CssTone = "blue" | "green" | "red";

type RgbaColor = {
  a: number;
  b: number;
  g: number;
  r: number;
};

const unavailableEligibility = {
  status: "unknown",
  checked: [],
  unavailable: ["rule_engine"],
  reasons: [],
};
const eligibleEligibility = {
  status: "eligible",
  checked: ["rule_engine"],
  unavailable: [],
  reasons: [],
};
const ineligibleEligibility = {
  status: "ineligible",
  checked: ["rule_engine"],
  unavailable: [],
  reasons: [{
    code: "RULE_ENGINE_CONFLICT",
    message: "Minimum rest between duties is not satisfied.",
    ruleId: "8072",
    ruleName: "Minimum Rest",
  }],
};

const currentPeriod = {
  id: 6,
  rosterPeriodId: 6,
  periodCode: "Jun 2026",
  bidOpenAt: "2026-05-01T00:00:00.000Z",
  bidCloseAt: "2026-05-15T00:00:00.000Z",
  rpStartLocal: "2026-06-01",
  rpEndLocal: "2026-06-30",
  zoneId: "America/Toronto",
  timezoneLabel: "YYZ Local Time",
  computedStage: "OPEN",
  canEditBid: true,
  readOnlyReason: null,
};

const apiResponse = (data: unknown) => ({
  code: 200,
  message: "ok",
  data,
});

const fulfillApiData = (data: unknown) => ({
  contentType: "application/json",
  body: JSON.stringify(apiResponse(data)),
});

const buildDaysOffCurrentDraft = () => ({
  currentPeriod,
  preferOffConfig: {
    weekend: { startDayCode: "SAT", endDayCode: "SUN" },
  },
  draft: {
    draftKey: "days-off-current",
    bidId: 101,
    periodId: 6,
    draftVersion: 1,
    periodCode: "Jun 2026",
    bidContext: "Current",
    remarks: "",
    properties: [{
      propertyGroupKey: "days-off-existing-201",
      rowSeq: 1,
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["2026-06-01"], suggestions: [] },
      tiers: ["T1"],
      allOrNothing: false,
      minimumN: null,
      maximumN: null,
    }],
  },
  propertyCatalog: [{
    propertyCode: 201,
    name: "Prefer Off",
    defaultBid: { type: "tag-list", values: [], suggestions: [] },
  }],
  favoriteProperties: [],
  recommendedPropertyCodes: [201],
});

const buildPairingCurrentDraft = () => ({
  currentPeriod,
  draft: {
    draftKey: "pairing-current",
    bidId: 102,
    periodId: 6,
    draftVersion: 1,
    periodCode: "Jun 2026",
    bidContext: "Current",
    remarks: "",
    properties: [{
      propertyGroupKey: "pairing-existing-102",
      rowSeq: 1,
      propertyCode: 102,
      name: "Pairing Number",
      action: "award",
      quantifier: null,
      bid: { type: "pairing-id-list", pairingIds: ["13335"], pairingLabels: ["V4126"] },
      tiers: ["T1"],
    }],
  },
  propertyCatalog: [{
    propertyCode: 102,
    name: "Pairing Number",
    defaultBid: { type: "pairing-id-list", pairingIds: [] },
    supportedActions: ["award", "avoid"],
  }],
  favoriteProperties: [],
  recommendedPropertyCodes: [102],
});

const buildLineCurrentDraft = () => ({
  currentPeriod,
  draft: {
    draftKey: "line-current",
    bidId: 103,
    periodId: 6,
    draftVersion: 1,
    periodCode: "Jun 2026",
    bidContext: "Current",
    remarks: "",
    properties: [],
  },
  propertyCatalog: [{
    propertyCode: 403,
    name: "Clear Schedule and Start Next Bid Group",
    defaultBid: { type: "flag" },
  }],
  favoriteProperties: [],
  recommendedPropertyCodes: [403],
});

const buildLineholderSummary = () => ({
  draftKey: "lineholder-summary-current",
  bidId: 104,
  periodId: 6,
  draftVersion: 1,
  periodCode: "Jun 2026",
  bidContext: "Current",
  statistics: [
    { tier: "T1", totalItems: 2, pairingCount: 1, daysOffCount: 1, lineCount: 0, reserveCount: 0, unsupportedItemCount: 0 },
  ],
  summaryItems: [
    {
      id: "summary-pairing-existing-102",
      groupKey: "pairing-existing-102",
      bidType: "Pairing",
      action: "Award",
      label: "Pairing Number",
      bid: "V4126",
      value: "V4126",
      readableText: "Award Pairing Number: V4126",
      tiers: ["T1"],
      source: "currentDraft",
      editableSource: { module: "Pairing", propertyGroupKey: "pairing-existing-102" },
    },
    {
      id: "summary-days-off-existing-201",
      groupKey: "days-off-existing-201",
      bidType: "DaysOff",
      action: "SetCondition",
      label: "Prefer Off",
      bid: "2026-06-01",
      value: "2026-06-01",
      readableText: "Prefer Off: 2026-06-01",
      tiers: ["T1"],
      source: "currentDraft",
      editableSource: { module: "DaysOff", propertyGroupKey: "days-off-existing-201" },
    },
  ],
  warnings: [],
  diagnostics: [],
});

const readComputedColor = async (
  locator: Locator,
  property: "backgroundColor" | "color",
) => locator.evaluate((element, styleProperty) => {
  const raw = getComputedStyle(element)[styleProperty];
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  context.fillStyle = raw;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;

  return { r, g, b, a: a / 255 };
}, property);

const expectComputedTone = async (
  locator: Locator,
  property: "backgroundColor" | "color",
  tone: CssTone,
  message: string,
  minDelta = 20,
) => {
  await expect.poll(async () => {
    const color = await readComputedColor(locator, property);
    if (color.a <= 0) return Number.NEGATIVE_INFINITY;

    return tone === "red"
      ? color.r - Math.max(color.g, color.b)
      : tone === "green"
        ? color.g - Math.max(color.r, color.b)
        : color.b - Math.max(color.r, color.g);
  }, { message, timeout: 1_000 }).toBeGreaterThanOrEqual(minDelta);
};

const expectPairingColumnsAligned = async (
  page: Page,
  listName: "award pairings" | "avoid pairings",
  pairingNumber: string,
) => {
  const list = page.getByRole("listbox", { name: listName });
  const row = list.getByRole("option", { name: new RegExp(pairingNumber) });
  for (const column of ["pairing", "base", "start", "end", "days", "credit"] as const) {
    const headerBox = await list.locator(`[data-column="${column}"][data-column-role="header"]`).boundingBox();
    const cellBox = await row.locator(`[data-column="${column}"]`).boundingBox();
    expect(headerBox, `${column} header should be visible`).not.toBeNull();
    expect(cellBox, `${column} cell should be visible`).not.toBeNull();
    expect(
      Math.abs((headerBox!.x + headerBox!.width / 2) - (cellBox!.x + cellBox!.width / 2)),
      `${column} center points`,
    ).toBeLessThanOrEqual(1);
  }
};

const expectDaysOffColumnsAligned = async (page: Page) => {
  const list = page.getByRole("listbox", { name: "Days Off bids" });
  const row = list.getByRole("option", { name: /2026-06-01 T2/ });
  for (const column of ["date", "tier"] as const) {
    const headerBox = await list.locator(`[data-column="${column}"][data-column-role="header"]`).boundingBox();
    const cellBox = await row.locator(`[data-column="${column}"]`).boundingBox();
    expect(headerBox, `${column} header should be visible`).not.toBeNull();
    expect(cellBox, `${column} cell should be visible`).not.toBeNull();
    expect(
      Math.abs((headerBox!.x + headerBox!.width / 2) - (cellBox!.x + cellBox!.width / 2)),
      `${column} center points`,
    ).toBeLessThanOrEqual(1);
  }
};

const expectIntegratedPairingSurface = async (page: Page) => {
  const list = page.getByRole("listbox", { name: "award pairings" });
  const header = list.getByTestId("bid-feedback-pairing-header");
  const detailSurface = page.getByRole("region", { name: "Selected Pairing detail" });
  expect(await header.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(await detailSurface.evaluate((element) => getComputedStyle(element).backgroundColor));
};

test("PBS-BID-FEEDBACK-001 — opens Bid Feedback from the Bid toolbar", async ({ page }, testInfo) => {
  await page.addInitScript(({ storageKey }) => {
    window.sessionStorage.setItem(storageKey, "mock-e2e-token");
  }, { storageKey: AUTH_TOKEN_STORAGE_KEY });
  await page.route("**/api/auth/session", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      message: "ok",
      data: {
        user: {
          id: PBS_USER,
          name: `Crew ${PBS_USER}`,
          employeeNo: PBS_USER,
        },
        authMode: "password",
      },
    }),
  }));
  await page.route("**/api/bidding-calendar/current", (route) => route.fulfill(fulfillApiData({
    currentPeriod,
    periodCode: "Jun 2026",
    bidContext: "Current",
    activeTierRange: ["T1"],
    events: [],
    warnings: [],
  })));
  await page.route("**/api/days-off-bids/current", (route) => route.fulfill(fulfillApiData(buildDaysOffCurrentDraft())));
  await page.route("**/api/pairing-bids/current", (route) => route.fulfill(fulfillApiData(buildPairingCurrentDraft())));
  await page.route("**/api/line-bids/current", (route) => route.fulfill(fulfillApiData(buildLineCurrentDraft())));
  await page.route("**/api/lineholder-bids/current/summary", (route) => route.fulfill(fulfillApiData(buildLineholderSummary())));
  const conflictRequests: string[] = [];
  await page.route("**/api/bid-feedback/current/conflicts", (route) => {
    conflictRequests.push(route.request().url());
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: 500, message: "Feedback conflict badge should not be requested.", data: null }),
    });
  });
  await page.route("**/api/bid-feedback/current/eligibility?*", (route) => route.fulfill(fulfillApiData({
    draftVersion: "1",
    generatedAt: new Date().toISOString(),
    eligibilityLabel: "Eligibility based on PBS ruleset \"E2E Ruleset\".",
    pairings: [
      { pairingId: "13335", eligibility: { ...eligibleEligibility } },
      { pairingId: "13718", eligibility: { ...ineligibleEligibility } },
      { pairingId: "13740", eligibility: { ...unavailableEligibility } },
    ],
  })));
  await page.route("**/api/bid-feedback/current", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ code: 200, message: "ok", data: {
      crewId: PBS_USER,
      currentPeriod: { id: 6, rosterPeriodId: 6, periodCode: "Jun 2026", computedStage: "OPEN", canEditBid: true, readOnlyReason: null, rpStartLocal: "2026-06-01", rpEndLocal: "2026-06-30" },
      timezoneLabel: "YYZ Local Time",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
      draftVersion: "1",
      generatedAt: new Date().toISOString(),
      conflictCount: 2,
      advisoryCount: 0,
      conflicts: [],
      pairings: [
        { pairingId: "13335", pairingNumber: "V4126", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto", originDate: "2026-06-08", endDate: "2026-06-10", routeLabel: "YYZ-MEX-YYZ", reportTime: "16:57", releaseTime: "23:21", totalCredit: "15:48", durationDays: 3, tafbDays: 3, rawScore: 7, rawDirection: "award", eligibility: { ...unavailableEligibility }, matchedBids: [{ propertyGroupKey: "p1", propertyName: "Pairing Number", tier: "T1", action: "award" }] },
        { pairingId: "13336", pairingNumber: "V4127", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto", originDate: "2026-06-08", endDate: "2026-06-09", routeLabel: "YYZ-YVR-YYZ", reportTime: "07:10", releaseTime: "21:25", totalCredit: "08:15", durationDays: 2, tafbDays: 2, rawScore: 6, rawDirection: "award", eligibility: { ...unavailableEligibility }, matchedBids: [{ propertyGroupKey: "p4", propertyName: "Pairing Number", tier: "T1", action: "award" }] },
        { pairingId: "13337", pairingNumber: "V4128", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto", originDate: "2026-06-08", endDate: "2026-06-09", routeLabel: "YYZ-LAX-YYZ", reportTime: "08:20", releaseTime: "22:35", totalCredit: "08:45", durationDays: 2, tafbDays: 2, rawScore: 5, rawDirection: "award", eligibility: { ...unavailableEligibility }, matchedBids: [{ propertyGroupKey: "p5", propertyName: "Pairing Number", tier: "T1", action: "award" }] },
        { pairingId: "13338", pairingNumber: "V4129", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto", originDate: "2026-06-08", endDate: "2026-06-09", routeLabel: "YYZ-MIA-YYZ", reportTime: "09:30", releaseTime: "23:45", totalCredit: "09:05", durationDays: 2, tafbDays: 2, rawScore: 4, rawDirection: "award", eligibility: { ...unavailableEligibility }, matchedBids: [{ propertyGroupKey: "p6", propertyName: "Pairing Number", tier: "T1", action: "award" }] },
        { pairingId: "13718", pairingNumber: "V4133", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto", originDate: "2026-06-13", endDate: "2026-06-13", routeLabel: "YYZ-YYC-YYZ", reportTime: "07:40", releaseTime: "16:23", totalCredit: "06:30", durationDays: 1, tafbDays: 1, rawScore: 6, rawDirection: "award", eligibility: { ...unavailableEligibility }, matchedBids: [{ propertyGroupKey: "p2", propertyName: "Pairing Length", tier: "T2", action: "award" }] },
        { pairingId: "13740", pairingNumber: "V4140", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto", originDate: "2026-06-17", endDate: "2026-06-18", routeLabel: "YYZ-ORD-YYZ", reportTime: "06:20", releaseTime: "20:40", totalCredit: "08:20", durationDays: 2, tafbDays: 2, rawScore: 4, rawDirection: "award", eligibility: { ...unavailableEligibility }, matchedBids: [{ propertyGroupKey: "p7", propertyName: "Pairing Length", tier: "T2", action: "award" }] },
        { pairingId: "14001", pairingNumber: "V4200", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto", originDate: "2026-06-20", endDate: "2026-06-20", routeLabel: "YYZ-YUL-YYZ", reportTime: "08:10", releaseTime: "15:25", totalCredit: "07:15", durationDays: 1, tafbDays: 1, rawScore: -7, rawDirection: "avoid", eligibility: null, matchedBids: [{ propertyGroupKey: "p3", propertyName: "Airport Preference", tier: "T3", action: "avoid" }] },
      ],
      daysOff: [
        { date: "2026-06-03", propertyGroupKey: "d2", propertyName: "Prefer Early Off", tier: "T1", source: "prefer_off", fromOption: true, description: "Jun 3" },
        { date: "2026-06-01", propertyGroupKey: "d1", propertyName: "Prefer Off", tier: "T2", source: "prefer_off", fromOption: true, description: "Jun 1" },
      ],
    } }),
    });
  });

  await page.goto("bid");

  const bidPage = page.getByTestId("bid-page");
  await expect(bidPage).toBeVisible({ timeout: 15_000 });
  const feedbackButton = bidPage.getByRole("button", { name: "Bid Feedback", exact: true });
  await expect(feedbackButton).toHaveCount(1);
  await expect(feedbackButton.getByTestId("bid-feedback-toolbar-label")).toHaveText("Feedback");
  await expect(feedbackButton.locator("svg")).toHaveCount(0);
  await expect(feedbackButton).toHaveClass(/border-\[#e3b94f\]/);
  await expect(feedbackButton).toHaveClass(/bg-\[#fff7dd\]/);
  await expect(feedbackButton.getByTestId("bid-feedback-conflict-count")).toHaveCount(0);
  expect(conflictRequests).toEqual([]);
  await feedbackButton.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await feedbackButton.click();
  await expect(page.getByTestId("bid-feedback-dialog")).toBeVisible();
  expect(conflictRequests).toEqual([]);
  await expect(page.getByTestId("bid-feedback-skeleton-list")).toBeVisible();
  await expect(page.getByTestId("bid-feedback-skeleton-detail")).toBeVisible();
  await expect(page.getByText(`Crew ${PBS_USER} · Jun 2026 · YYZ Local Time`)).toBeVisible();
  await expect(page.getByTestId("bid-feedback-master-detail")).toBeVisible();
  await expectPairingColumnsAligned(page, "award pairings", "V4126");
  const awardPairingList = page.getByRole("listbox", { name: "award pairings" });
  const awardPairingRow = awardPairingList.getByRole("option", { name: /V4126/ });
  for (const column of ["pairing", "base", "start", "end", "days", "credit"] as const) {
    const headerMetrics = await awardPairingList
      .locator(`[data-column="${column}"][data-column-role="header"]`)
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          scale: Number.parseFloat(style.scale),
        };
      });
    expect(headerMetrics.fontSize * headerMetrics.scale).toBeCloseTo(10.8, 1);
    expect(await awardPairingRow.locator(`[data-column="${column}"]`).evaluate((element) => getComputedStyle(element).scale)).toBe("none");
  }
  await expectIntegratedPairingSurface(page);
  await expect(page.getByRole("option", { name: /V4126/ })).toContainText("15:48h");
  await expect(page.getByRole("option", { name: /V4126/ })).toContainText("06-08");
  await expect(page.getByRole("option", { name: /V4126/ })).toHaveAttribute("aria-selected", "false");
  await page.getByRole("option", { name: /V4126/ }).click();
  await page.getByRole("tab", { name: "Avoid 1" }).click();
  await expectPairingColumnsAligned(page, "avoid pairings", "V4200");
  await expect(page.getByRole("option", { name: /V4200/ })).toContainText("07:15h");
  await page.getByRole("tab", { name: "Award 6" }).click();
  await expect(page.getByRole("option", { name: /V4126/ })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByText("Select a pairing to see whether this crew can be awarded it.")).toBeVisible();
  await page.getByRole("option", { name: /V4126/ }).click();
  await expect(page.getByRole("option", { name: /V4126/ })).toHaveAttribute("data-eligibility", "eligible");
  await expect(page.getByRole("option", { name: /V4126/ }).locator('[data-column="eligibility"]')).toHaveText("✓");
  await expect(page.getByText("Eligible", { exact: true })).toHaveClass(/bg-emerald-50/);
  await expect(page.getByText("PASS", { exact: true })).toHaveClass(/bg-emerald-50/);
  await expect(page.getByText("Eligible for this crew. No blocking rule was returned by the rule engine.")).toBeVisible();
  await expect(page.getByText("Eligibility unavailable")).toHaveCount(0);
  await expect(page.getByText("FAIL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Not eligible", { exact: true })).toHaveCount(0);
  const pairingDetail = page.getByTestId("bid-feedback-pairing-detail");
  await expect(pairingDetail).toContainText("RankCA+FO");
  await expect(pairingDetail).toContainText("TAFB3");
  await expect(pairingDetail).toContainText("YYZ → MEX → YYZ");
  await expect(pairingDetail.getByText("Score", { exact: true })).toHaveCount(0);
  await expect(pairingDetail.getByText("Matched Bids", { exact: true })).toHaveCount(0);
  const previouslyBlockedOption = page.getByRole("option", { name: /V4133/ });
  await expect(previouslyBlockedOption).toHaveAttribute("data-eligibility", "ineligible");
  await expect(previouslyBlockedOption).toHaveClass(/(?:^|\s)bg-destructive\/5(?:\s|$)/);
  await expect(previouslyBlockedOption.locator('[data-column="eligibility"]')).toHaveText("✗");
  await expect(page.getByText("BID CONFLICTS")).toHaveCount(0);
  await previouslyBlockedOption.click();
  await expect(previouslyBlockedOption).toHaveAttribute("aria-selected", "true");
  await expect(previouslyBlockedOption).toHaveClass(/(?:^|\s)bg-primary\/10(?:\s|$)/);
  await expectComputedTone(previouslyBlockedOption, "backgroundColor", "blue", "selected unavailable row background should compute as blue tint", 5);
  await expect(page.getByText("Not eligible", { exact: true })).toHaveClass(/bg-destructive\/10/);
  await expect(page.getByText("FAIL", { exact: true })).toHaveClass(/bg-destructive\/10/);
  await expect(page.getByText("Minimum rest between duties is not satisfied.")).toBeVisible();
  await expect(page.getByText("Minimum Rest · 8072")).toBeVisible();
  const screenshotPath = testInfo.outputPath("bid-feedback-unavailable-styles.png");
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach("bid-feedback-unavailable-styles", { contentType: "image/png", path: screenshotPath });
  const unknownOption = page.getByRole("option", { name: /V4140/ });
  await expect(unknownOption).toHaveAttribute("data-eligibility", "unknown");
  await expect(unknownOption.locator('[data-column="eligibility"]')).toHaveText("");
  await expect(page.getByLabel("Unable to verify")).toHaveCount(0);
  await unknownOption.click();
  await expect(page.getByText("Eligibility unavailable", { exact: true })).toHaveClass(/text-muted-foreground/);
  await expect(page.getByText("Unavailable", { exact: true })).toHaveClass(/text-muted-foreground/);
  await expect(page.getByText("Eligibility based on PBS ruleset \"E2E Ruleset\".")).toBeVisible();
  await page.getByRole("tab", { name: "Days Off 2" }).click();
  await expectDaysOffColumnsAligned(page);
  const daysOffList = page.getByRole("listbox", { name: "Days Off bids" });
  expect(await daysOffList.getByRole("option").evaluateAll((elements) => elements.map((element) => element.querySelector('[data-column="date"]')?.textContent?.trim()))).toEqual([
    "2026-06-01",
    "2026-06-03",
  ]);
  const daysOffHeader = page.getByRole("listbox", { name: "Days Off bids" }).getByTestId("bid-feedback-days-off-header");
  const daysOffDetailSurface = page.getByRole("region", { name: "Selected Days Off detail" });
  expect(await daysOffHeader.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(await daysOffDetailSurface.evaluate((element) => getComputedStyle(element).backgroundColor));
  await expect(page.getByText("Select a day off to view its bid.")).toBeVisible();
  await page.getByRole("option", { name: /2026-06-01 T2/ }).click();
  await expect(page.getByTestId("bid-feedback-days-off-detail")).toContainText("Days Off Bid");
  await expect(page.getByTestId("bid-feedback-days-off-detail")).toContainText("Jun 1");
  await page.getByRole("button", { name: "calendar", exact: true }).click();
  await expect(page.getByTestId("bid-feedback-calendar")).toBeVisible();
  await expect(page.getByText("Award Pairing, not eligible")).toBeVisible();
  await expect(page.getByLabel(/V4126, 2026-06-08 16:57 to 2026-06-10 23:21/)).toBeVisible();
  await expect(page.getByLabel(/V4133, 2026-06-13 07:40 to 2026-06-13 16:23/)).toHaveClass(/ring-\[#d83030\]/);
  await expect(page.getByLabel(/V4140, 2026-06-17 06:20 to 2026-06-18 20:40/)).toBeVisible();
  await expect(page.getByLabel(/V4200/)).toHaveCount(0);
  await expect(page.getByTestId("bid-feedback-calendar-segment")).toHaveCount(8);
  const calendarWeeks = page.getByTestId("bid-feedback-calendar-week");
  await expect(calendarWeeks).toHaveCount(5);
  const weekBoxes = await calendarWeeks.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      laneCount: Number(element.getAttribute("data-lane-count") ?? "0"),
    };
  }));
  expect(weekBoxes[1]?.laneCount).toBeGreaterThan(1);
  expect(weekBoxes[1]?.height).toBeGreaterThan(92);
  expect((weekBoxes[1]?.bottom ?? 0) <= (weekBoxes[2]?.top ?? 0)).toBe(true);

  await page.setViewportSize({ width: 900, height: 760 });
  await page.getByRole("button", { name: "bids", exact: true }).click();
  await page.getByRole("tab", { name: "Award 6" }).click();
  await expect(page.getByRole("option", { name: /V4126/ })).toBeVisible();
  await page.getByRole("option", { name: /V4126/ }).click();
  await expect(page.getByTestId("bid-feedback-pairing-detail")).toBeVisible();
  await expectPairingColumnsAligned(page, "award pairings", "V4126");
  await expectIntegratedPairingSurface(page);
  await page.getByRole("tab", { name: "Avoid 1" }).click();
  await expectPairingColumnsAligned(page, "avoid pairings", "V4200");
});

test("PBS-BID-FEEDBACK-002 — real Feedback API preserves the eligibility contract", async ({ page }, testInfo) => {
  const login = new PbsLoginPage(page);
  await login.goto();
  await login.login(PBS_USER, PBS_PASS);
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Bid", exact: true }).click();

  const bidPage = page.getByTestId("bid-page");
  await expect(bidPage).toBeVisible({ timeout: 15_000 });
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/bid-feedback/current")
    && !response.url().includes("/eligibility")
    && !response.url().includes("/conflicts"),
  );
  const eligibilityResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/bid-feedback/current/eligibility"),
    { timeout: 15_000 },
  ).catch(() => null);
  const coldStartedAt = performance.now();
  await bidPage.getByRole("button", { name: /Bid Feedback/ }).click();
  const response = await responsePromise;
  const coldResponseMs = performance.now() - coldStartedAt;
  expect(response.status()).toBe(200);

  const payload = await response.json() as {
    data?: {
      pairings?: Array<Record<string, unknown> & {
        eligibility?: null | {
          checked?: unknown[];
          reasons?: unknown[];
          status?: string;
          unavailable?: unknown[];
        };
        rawDirection?: string;
      }>;
    };
  };
  const pairings = payload.data?.pairings ?? [];
  expect(Array.isArray(pairings)).toBe(true);
  expect(pairings.every((pairing) => !("eligibleScore" in pairing) && !("exportDirection" in pairing))).toBe(true);
  const rawDirectionCounts = pairings.reduce<Record<string, number>>((counts, pairing) => {
    const direction = typeof pairing.rawDirection === "string" ? pairing.rawDirection : "missing";
    counts[direction] = (counts[direction] ?? 0) + 1;
    return counts;
  }, {});
  await testInfo.attach("bid-feedback-real-api-raw-direction-distribution", {
    body: JSON.stringify({
      crew: PBS_USER,
      coldResponseMs,
      total: pairings.length,
      rawDirectionCounts,
    }, null, 2),
    contentType: "application/json",
  });
  if (PBS_USER === "19") {
    expect(pairings.length).toBeGreaterThan(0);
    expect(rawDirectionCounts.award ?? 0).toBeGreaterThan(0);
  }
  const awardPairings = pairings.filter((pairing) => pairing.rawDirection === "award");
  expect(awardPairings.every((pairing) => {
    const eligibility = pairing.eligibility;
    return eligibility !== null
      && eligibility !== undefined
      && eligibility.status === "unknown"
      && Array.isArray(eligibility.checked)
      && eligibility.checked.length === 0
      && Array.isArray(eligibility.reasons)
      && Array.isArray(eligibility.unavailable);
  })).toBe(true);
  expect(pairings
    .filter((pairing) => pairing.rawDirection === "avoid" || pairing.rawDirection === "neutral")
    .every((pairing) => pairing.eligibility === null)).toBe(true);

  await expect(page.getByTestId("bid-feedback-dialog")).toBeVisible();
  if (awardPairings.length > 0) {
    const eligibilityResponse = await eligibilityResponsePromise;
    expect(eligibilityResponse).not.toBeNull();
    expect(eligibilityResponse!.status()).toBe(200);
    const eligibilityPayload = await eligibilityResponse!.json() as {
      data?: {
        pairings?: Array<{
          eligibility?: {
            checked?: unknown[];
            reasons?: unknown[];
            status?: string;
            unavailable?: unknown[];
          };
          pairingId?: string;
        }>;
      };
    };
    expect((eligibilityPayload.data?.pairings ?? []).every((pairing) =>
      pairing.pairingId
      && pairing.eligibility
      && ["eligible", "ineligible", "unknown"].includes(String(pairing.eligibility.status))
      && Array.isArray(pairing.eligibility.checked)
      && Array.isArray(pairing.eligibility.reasons)
      && Array.isArray(pairing.eligibility.unavailable))).toBe(true);
  }
});
