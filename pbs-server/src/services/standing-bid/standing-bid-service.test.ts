import assert from "node:assert/strict";
import test from "node:test";
import type { PbsSaveStandingDraftRequest } from "../../../../packages/contracts/pbs-standing-bids.js";
import { LineholderBidServiceError, type LineholderDraftActor } from "../lineholder/shared.js";
import { createPbsStandingBidService } from "./standing-bid-service.js";

const actor: LineholderDraftActor = {
  crewId: "F8030",
  userCode: "casey.crew",
};
const defaultReserveCallTypeOptions = ["PRAM", "PRMM", "PRPM"];

const preferOffDictionaryRows = [
  { parentCode: "DOW", code: "MON", name: "Monday", codeValue: "1", idx: 1 },
  { parentCode: "DOW", code: "TUE", name: "Tuesday", codeValue: "2", idx: 2 },
  { parentCode: "DOW", code: "WED", name: "Wednesday", codeValue: "3", idx: 3 },
  { parentCode: "DOW", code: "THU", name: "Thursday", codeValue: "4", idx: 4 },
  { parentCode: "DOW", code: "FRI", name: "Friday", codeValue: "5", idx: 5 },
  { parentCode: "DOW", code: "SAT", name: "Saturday", codeValue: "6", idx: 6 },
  { parentCode: "DOW", code: "SUN", name: "Sunday", codeValue: "7", idx: 7 },
];

const propertyRows = [
  {
    propertyDefinitionId: 1,
    propertyCode: 201,
    bidType: "DaysOff",
    propertyName: "Prefer Off",
    contextId: 101,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 1,
  },
  {
    propertyDefinitionId: 12,
    propertyCode: 204,
    bidType: "DaysOff",
    propertyName: "Long Stretch Off / Compressed Flying",
    contextId: 102,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 2,
  },
  {
    propertyDefinitionId: 2,
    propertyCode: 168,
    bidType: "Pairing",
    propertyName: "Airport Preference",
    contextId: 103,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 3,
  },
  {
    propertyDefinitionId: 3,
    propertyCode: 429,
    bidType: "Line",
    propertyName: "Credit Window Preference",
    contextId: 104,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 4,
  },
  {
    propertyDefinitionId: 4,
    propertyCode: 410,
    bidType: "Line",
    propertyName: "Reserve / Flying Date Pattern",
    contextId: 105,
    isVisibleInPortal: 0,
    recommendedOrder: null,
    contextDisplayOrder: 5,
  },
  {
    propertyDefinitionId: 5,
    propertyCode: 407,
    bidType: "Line",
    propertyName: "Minimum Base Layover",
    contextId: 106,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 6,
  },
  {
    propertyDefinitionId: 6,
    propertyCode: 428,
    bidType: "Pairing",
    propertyName: "Efficient Flying First",
    contextId: 107,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 7,
  },
  {
    propertyDefinitionId: 7,
    propertyCode: 301,
    bidType: "Reserve",
    propertyName: "Short Call Type",
    contextId: 108,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 1,
  },
  {
    propertyDefinitionId: 8,
    propertyCode: 313,
    bidType: "Reserve",
    propertyName: "Reserve Work Block Size",
    contextId: 109,
    isVisibleInPortal: 0,
    recommendedOrder: null,
    contextDisplayOrder: 2,
  },
  {
    propertyDefinitionId: 9,
    propertyCode: 218,
    bidType: "DaysOff",
    propertyName: "Day of Week Off",
    contextId: 110,
    isVisibleInPortal: 0,
    recommendedOrder: null,
    contextDisplayOrder: 8,
  },
  {
    propertyDefinitionId: 10,
    propertyCode: 112,
    bidType: "Pairing",
    propertyName: "Pairing Length",
    contextId: 111,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 9,
  },
  {
    propertyDefinitionId: 11,
    propertyCode: 101,
    bidType: "Pairing",
    propertyName: "Any Landing In Airport",
    contextId: 112,
    isVisibleInPortal: 0,
    recommendedOrder: null,
    contextDisplayOrder: 10,
  },
  {
    propertyDefinitionId: 13,
    propertyCode: 102,
    bidType: "Pairing",
    propertyName: "Pairing Number",
    contextId: 113,
    isVisibleInPortal: 0,
    recommendedOrder: null,
    contextDisplayOrder: 11,
  },
  {
    propertyDefinitionId: 14,
    propertyCode: 129,
    bidType: "Pairing",
    propertyName: "Time Between Flights",
    contextId: 114,
    isVisibleInPortal: 1,
    recommendedOrder: null,
    contextDisplayOrder: 12,
  },
];

const lineholderPropertyRows = propertyRows.filter((row) => row.bidType !== "Reserve");
const reservePropertyRows = propertyRows.filter((row) => row.bidType === "Reserve");

const createStandingBidService = (
  reserveCallTypeOptions = defaultReserveCallTypeOptions,
) => {
  let catalogQueryCount = 0;
  const db = {
    select(selection?: Record<string, unknown>) {
      const isPreferOffConfigQuery = Boolean(
        selection
        && "parentCode" in selection
        && "name" in selection
        && "idx" in selection,
      );
      const isMinimumBaseLayoverConfigQuery = Boolean(
        selection
        && "parentCode" in selection
        && "code" in selection
        && "codeValue" in selection,
      );

      return {
        from() {
          return this;
        },
        leftJoin() {
          return this;
        },
        where() {
          if (isPreferOffConfigQuery) {
            return Promise.resolve(preferOffDictionaryRows);
          }

          if (isMinimumBaseLayoverConfigQuery) {
            return Promise.resolve([
              {
                parentCode: "SYS_PARAM",
                code: "PBS_LINE_MINIMUM_BASE_LAYOVER",
                codeValue: "013:00",
              },
              {
                parentCode: "SYS_PARAM",
                code: "PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES",
                codeValue: "45",
              },
            ]);
          }

          return this;
        },
        orderBy() {
          catalogQueryCount += 1;
          return Promise.resolve(catalogQueryCount % 2 === 1 ? lineholderPropertyRows : reservePropertyRows);
        },
        limit() {
          return Promise.resolve([]);
        },
      };
    },
    transaction() {
      throw new Error("Invalid Standing Bid payload should not start a transaction.");
    },
  } as unknown as Parameters<typeof createPbsStandingBidService>[0]["db"];

  return createPbsStandingBidService({
    db,
    reserveCallTypeOptionsResolver: async () => ({
      division: "P",
      rank: "CA",
      options: reserveCallTypeOptions,
    }),
  });
};

const buildSaveRequest = (
  draft: PbsSaveStandingDraftRequest["draft"],
  mode: PbsSaveStandingDraftRequest["mode"] = "lineholder",
): PbsSaveStandingDraftRequest => ({
  mode,
  draft,
});

test("getCurrentStandingBid returns reusable Lineholder and Reserve catalog rows", async () => {
  const service = createStandingBidService();
  const response = await service.getCurrentStandingBid(actor);

  assert.deepEqual(
    response.propertyCatalog.lineholder.map((property) => property.propertyCode),
    [201, 204, 168, 429, 407, 428, 112, 129],
  );
  assert.equal(
    response.propertyCatalog.lineholder.find((property) => property.propertyCode === 428)?.bidType,
    "Pairing",
  );
  assert.deepEqual(
    response.propertyCatalog.reserve.map((property) => property.propertyCode),
    [301],
  );
  assert.deepEqual(
    response.propertyCatalog.reserve.find((property) => property.propertyCode === 301)?.defaultBid,
    {
      type: "reserve-call-type-date-scope",
      callType: "PRAM",
      options: defaultReserveCallTypeOptions,
      dateScope: { mode: "whole_month" },
    },
  );
  assert.equal(response.propertyCatalog.lineholder.some((property) => property.propertyCode === 102), false);
  assert.equal(response.propertyCatalog.lineholder.some((property) => property.propertyCode === 101), false);
  assert.equal(response.propertyCatalog.lineholder.some((property) => property.propertyCode === 218), false);
  assert.equal(response.propertyCatalog.lineholder.some((property) => property.propertyCode === 410), false);
  assert.deepEqual(
    response.propertyCatalog.lineholder.find((property) => property.propertyCode === 201)?.defaultBid,
    { type: "tag-list", values: [], suggestions: [] },
  );
  assert.deepEqual(
    response.preferOffConfig.weekdays.map((weekday) => [weekday.code, weekday.name]),
    [
      ["MON", "Monday"],
      ["TUE", "Tuesday"],
      ["WED", "Wednesday"],
      ["THU", "Thursday"],
      ["FRI", "Friday"],
      ["SAT", "Saturday"],
      ["SUN", "Sunday"],
    ],
  );
});

test("getCurrentStandingBid preserves legacy single weekdays and Prefer Off weekday lists", async () => {
  let standingBidQueryCount = 0;
  let catalogQueryCount = 0;
  const db = {
    select(selection?: Record<string, unknown>) {
      const isCatalogQuery = Boolean(selection && "propertyDefinitionId" in selection);
      const isGroupQuery = Boolean(selection && "propertyGroupKey" in selection);
      const isPreferOffConfigQuery = Boolean(
        selection
        && "parentCode" in selection
        && "name" in selection
        && "idx" in selection,
      );

      return {
        from() {
          return this;
        },
        innerJoin() {
          return this;
        },
        leftJoin() {
          return this;
        },
        where() {
          if (isPreferOffConfigQuery) {
            return Promise.resolve(preferOffDictionaryRows);
          }

          return this;
        },
        orderBy() {
          if (isCatalogQuery) {
            catalogQueryCount += 1;
            return Promise.resolve(catalogQueryCount % 2 === 1 ? lineholderPropertyRows : reservePropertyRows);
          }

          if (isGroupQuery) {
            return Promise.resolve([
              {
                propertyGroupKey: "legacy-day-off",
                groupSeq: 1,
                bidType: "DaysOff",
                legacyPropertyCode: "218",
                propertyCode: 218,
                operator: "=",
                paramA: "Tue",
                paramB: null,
                paramC: null,
                actionId: null,
                tier: 1,
              },
              {
                propertyGroupKey: "legacy-prefer-off",
                groupSeq: 2,
                bidType: "DaysOff",
                legacyPropertyCode: "201",
                propertyCode: 201,
                operator: "In",
                paramA: JSON.stringify({ dates: [], daysOfWeek: ["MON", "FRI"] }),
                paramB: null,
                paramC: null,
                actionId: null,
                tier: 2,
              },
            ]);
          }

          return Promise.resolve([]);
        },
        limit() {
          standingBidQueryCount += 1;
          return Promise.resolve(standingBidQueryCount === 1
            ? [{ id: 100, draftVersion: 1, remarks: "" }]
            : []);
        },
      };
    },
  } as unknown as Parameters<typeof createPbsStandingBidService>[0]["db"];
  const service = createPbsStandingBidService({
    db,
    reserveCallTypeOptionsResolver: async () => ({
      division: "P",
      rank: "CA",
      options: defaultReserveCallTypeOptions,
    }),
  });
  const response = await service.getCurrentStandingBid(actor);

  assert.deepEqual(
    response.lineholderDraft.properties.find((property) => property.propertyCode === 218)?.bid,
    { type: "date-or-dow-list", dates: [], daysOfWeek: ["TUE"] },
  );
  assert.deepEqual(
    response.lineholderDraft.properties.find((property) => property.propertyCode === 201)?.bid,
    { type: "tag-list", values: ["Monday", "Friday"], suggestions: [] },
  );
});

test("saveStandingDraft rejects Minimum Base Layover below the configured minimum", async () => {
  const service = createStandingBidService();

  await assert.rejects(
    () => service.saveStandingDraft(actor, buildSaveRequest({
      draftVersion: 0,
      periodCode: "STANDING",
      bidContext: "StandingLineholder",
      properties: [
        {
          rowSeq: 1,
          propertyCode: 407,
          name: "Minimum Base Layover",
          bid: { type: "minimum-base-layover", minimumDuration: "12:59" },
          tiers: ["T1"],
        },
      ],
    })),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Minimum Base Layover must be at least 13:00.",
  );
});

test("saveStandingDraft rejects Time Between Flights below the configured minimum", async () => {
  const service = createStandingBidService();

  await assert.rejects(
    () => service.saveStandingDraft(actor, buildSaveRequest({
      draftVersion: 0,
      periodCode: "STANDING",
      bidContext: "StandingLineholder",
      properties: [
        {
          rowSeq: 1,
          propertyCode: 129,
          name: "Time Between Flights",
          action: "award",
          bid: { type: "duration", value: "00:44", operator: ">" },
          tiers: ["T1"],
        },
      ],
    })),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Time Between Flights must be at least 00:45.",
  );
});

test("saveStandingDraft rejects Prefer Off tag lists with concrete dates", async () => {
  const service = createStandingBidService();

  await assert.rejects(
    () => service.saveStandingDraft(actor, buildSaveRequest({
      draftVersion: 0,
      periodCode: "STANDING",
      bidContext: "StandingLineholder",
      properties: [
        {
          rowSeq: 1,
          propertyCode: 201,
          name: "Prefer Off",
          bid: { type: "tag-list", values: ["2026-06-01"] },
          tiers: ["T1"],
        },
      ],
    })),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Prefer Off cannot use specific dates in Standing Bid.",
  );
});

test("saveStandingDraft rejects concrete dates on Long Stretch Off in Standing Bid", async () => {
  const service = createStandingBidService();

  await assert.rejects(
    () => service.saveStandingDraft(actor, buildSaveRequest({
      draftVersion: 0,
      periodCode: "STANDING",
      bidContext: "StandingLineholder",
      properties: [
        {
          rowSeq: 1,
          propertyCode: 204,
          name: "Long Stretch Off",
          bid: {
            type: "stepper-date-range",
            value: 10,
            from: "2026-06-01",
            to: "2026-06-10",
            min: 1,
            max: 14,
          },
          tiers: ["T1"],
        },
      ],
    })),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Long Stretch Off / Compressed Flying is not valid for Standing Bid.",
  );
});

test("saveStandingDraft rejects nested concrete date scopes in reusable Pairing properties", async () => {
  const service = createStandingBidService();

  await assert.rejects(
    () => service.saveStandingDraft(actor, buildSaveRequest({
      draftVersion: 0,
      periodCode: "STANDING",
      bidContext: "StandingLineholder",
      properties: [
        {
          rowSeq: 1,
          propertyCode: 168,
          name: "Airport Preference",
          action: "award",
          bid: {
            type: "airport-preference",
            event: "landing",
            locations: [{ code: "YYZ", kind: "airport" }],
            dateScope: { mode: "specific_dates", dates: ["2026-06-01"] },
            minimumLayoverDuration: null,
          },
          tiers: ["T1"],
        },
      ],
    })),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Airport Preference cannot use specific dates in Standing Bid.",
  );
});

test("getCurrentStandingBid keeps a saved property readable after its catalog visibility is disabled", async () => {
  let standingBidQueryCount = 0;
  let catalogQueryCount = 0;
  const db = {
    select(selection?: Record<string, unknown>) {
      const isCatalogQuery = Boolean(selection && "propertyDefinitionId" in selection);
      const isGroupQuery = Boolean(selection && "propertyGroupKey" in selection);
      const isPreferOffConfigQuery = Boolean(
        selection
        && "parentCode" in selection
        && "name" in selection
        && "idx" in selection,
      );

      return {
        from() {
          return this;
        },
        innerJoin() {
          return this;
        },
        leftJoin() {
          return this;
        },
        where() {
          if (isPreferOffConfigQuery) {
            return Promise.resolve(preferOffDictionaryRows);
          }

          return this;
        },
        orderBy() {
          if (isCatalogQuery) {
            catalogQueryCount += 1;
            return Promise.resolve(catalogQueryCount % 2 === 1 ? lineholderPropertyRows : reservePropertyRows);
          }

          if (isGroupQuery) {
            return Promise.resolve([
              {
                propertyGroupKey: "hidden-standing-pairing-number",
                groupSeq: 1,
                bidType: "Pairing",
                legacyPropertyCode: "102",
                propertyCode: 102,
                operator: "In",
                paramA: "YEG-1001",
                paramB: null,
                paramC: null,
                actionId: 1,
                tier: 1,
              },
            ]);
          }

          return Promise.resolve([]);
        },
        limit() {
          standingBidQueryCount += 1;

          return Promise.resolve(standingBidQueryCount === 1
            ? [{ id: 100, draftVersion: 1, remarks: "" }]
            : []);
        },
      };
    },
  } as unknown as Parameters<typeof createPbsStandingBidService>[0]["db"];
  const service = createPbsStandingBidService({
    db,
    reserveCallTypeOptionsResolver: async () => ({
      division: "P",
      rank: "CA",
      options: defaultReserveCallTypeOptions,
    }),
  });

  const response = await service.getCurrentStandingBid(actor);

  assert.equal(
    response.propertyCatalog.lineholder.some((property) => property.propertyCode === 102),
    false,
  );
  assert.equal(
    response.lineholderDraft.properties.find((property) => property.propertyCode === 102)?.propertyCode,
    102,
  );
});

test("saveStandingDraft rejects concrete Reserve date scopes in Standing Bid", async () => {
  const service = createStandingBidService();

  await assert.rejects(
    () => service.saveStandingDraft(actor, buildSaveRequest({
      draftVersion: 0,
      periodCode: "STANDING",
      bidContext: "StandingReserve",
      properties: [
        {
          rowSeq: 1,
          propertyCode: 301,
          name: "Short Call Type",
          bid: {
            type: "reserve-call-type-date-scope",
            callType: "PRAM",
            options: ["PRAM", "PRPM", "CRAM", "CRPM"],
            dateScope: { mode: "date_range", from: "2026-06-01", to: "2026-06-10" },
          },
          tiers: ["T1"],
        },
      ],
    }, "reserve")),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Short Call Type cannot use specific dates in Standing Bid.",
  );
});

test("saveStandingDraft rejects Reserve Preference call types outside the actor division", async () => {
  const service = createStandingBidService(["CRAM", "CRPM"]);

  await assert.rejects(
    () => service.saveStandingDraft(actor, buildSaveRequest({
      draftVersion: 0,
      periodCode: "STANDING",
      bidContext: "StandingReserve",
      properties: [
        {
          rowSeq: 1,
          propertyCode: 301,
          name: "Short Call Type",
          bid: {
            type: "reserve-call-type-date-scope",
            callType: "PRAM",
            options: ["PRAM", "CRAM"],
            dateScope: { mode: "whole_month" },
          },
          tiers: ["T1"],
        },
      ],
    }, "reserve")),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Short Call Type must use a valid reserve call type.",
  );
});
