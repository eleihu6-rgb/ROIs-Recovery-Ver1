import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsDaysOffBidRoutes } from "../../../packages/contracts/pbs-days-off-bids.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsDaysOffBidService } from "../services/days-off/types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const mockAuthService: PbsAuthService = {
  async login() {
    throw new Error("Not used in this test.");
  },
  getSessionFromPayload(payload) {
    return {
      authMode: payload.authMode,
      user: {
        id: payload.id,
        name: payload.name,
        employeeNo: payload.employeeNo,
      },
    };
  },
  async logout() {
    return;
  },
};

const mockDaysOffBidService: PbsDaysOffBidService = {
  async getCurrentDraft() {
    return {
      draft: {
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        remarks: "",
        properties: [
          {
            rowSeq: 1,
            propertyGroupKey: "days-off-property-key-1",
            propertyCode: 212,
            name: "Maximize Weekend Days Off",
            bid: { type: "flag" },
            tiers: ["T2", "T4"],
          },
        ],
      },
      propertyCatalog: [
        {
          propertyCode: 212,
          name: "Maximize Weekend Days Off",
          defaultBid: { type: "flag" },
        },
      ],
      favoriteProperties: [
        {
          favoriteKey: "700212",
          propertyId: 212,
          propertyCode: 212,
          name: "Maximize Weekend Days Off",
          bid: { type: "flag" },
          tiers: ["T2", "T4"],
          allOrNothing: false,
          minimumN: null,
          maximumN: null,
        },
      ],
      recommendedPropertyCodes: [201, 203, 202, 205],
    };
  },
  async saveCurrentDraft(_actor, request) {
    return {
      saved: true,
      draftKey: request.draft.draftKey,
      bidId: request.draft.bidId,
      periodId: request.draft.periodId,
      periodCode: request.draft.periodCode,
      draftVersion: request.draft.draftVersion + 1,
    };
  },
  async addCurrentDraftProperty(_actor, request) {
    return {
      saved: true,
      draftKey: request.draftKey,
      bidId: request.bidId,
      periodCode: request.periodCode,
      propertyGroupKey: "days-off-added-property-key",
      rowSeq: 2,
      draftVersion: request.draftVersion + 1,
    };
  },
  async patchCurrentDraftProperty(_actor, propertyGroupKey, request) {
    const tiers = "property" in request ? request.property.tiers : request.tiers;

    return {
      saved: true,
      draftKey: request.draftKey,
      bidId: request.bidId,
      periodCode: request.periodCode,
      propertyGroupKey,
      draftVersion: request.draftVersion + 1,
      tiers,
    };
  },
  async removeCurrentDraftProperty(_actor, _propertyGroupKey, reference = {}) {
    return {
      saved: true,
      draftKey: reference.draftKey ?? undefined,
      bidId: reference.bidId ?? undefined,
      periodCode: reference.periodCode ?? undefined,
      draftVersion: (reference.draftVersion ?? 0) + 1,
    };
  },
  async saveFavoriteProperty(_actor, request) {
    return {
      saved: true,
      favoriteKey: `800${request.propertyCode}`,
      propertyId: request.propertyCode,
      propertyCode: request.propertyCode,
      name: "Maximize Weekend Days Off",
      bid: request.bid,
      allOrNothing: request.allOrNothing ?? false,
      minimumN: request.minimumN ?? null,
      maximumN: request.maximumN ?? null,
      draftKey: request.draftKey,
      bidId: request.bidId,
      periodCode: request.periodCode,
      draftVersion: request.draftVersion,
    };
  },
  async patchFavoritePropertyByKey(_actor, favoriteKey, request) {
    return {
      saved: true,
      favoriteKey,
      propertyId: request.propertyCode,
      propertyCode: request.propertyCode,
      name: "Maximize Weekend Days Off",
      action: request.action,
      bid: request.bid,
      allOrNothing: request.allOrNothing ?? false,
      minimumN: request.minimumN ?? null,
      maximumN: request.maximumN ?? null,
      draftKey: request.draftKey,
      bidId: request.bidId,
      periodCode: request.periodCode,
      draftVersion: request.draftVersion + 1,
    };
  },
  async removeFavoritePropertyByKey() {
    return {
      saved: true,
      draftVersion: 0,
    };
  },
};

const buildAuthToken = () =>
  jwt.sign({
    id: "1",
    name: "casey.crew",
    employeeNo: "F8030",
    userCode: "casey.crew",
    userName: "Casey Crew",
    authMode: "password",
  }, process.env.JWT_SECRET ?? "test-secret");

test("GET /api/days-off-bids/current returns the current days off draft for the authenticated user", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsDaysOffBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  assert.equal(response.json().data.draft.properties[0].propertyCode, 212);
  assert.equal(response.json().data.draft.properties[0].propertyGroupKey, "days-off-property-key-1");
  assert.equal(response.json().data.favoriteProperties[0].favoriteKey, "700212");
  assert.deepEqual(response.json().data.recommendedPropertyCodes, [201, 203, 202, 205]);

  await server.close();
});

test("GET /api/days-off-bids/current returns 304 when the private ETag matches", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const authHeaders = { authorization: `Bearer ${buildAuthToken()}` };
  const first = await server.inject({
    method: "GET",
    url: `/api${pbsDaysOffBidRoutes.current}`,
    headers: authHeaders,
  });
  assert.equal(first.statusCode, 200);
  assert.ok(first.headers.etag);

  const second = await server.inject({
    method: "GET",
    url: `/api${pbsDaysOffBidRoutes.current}`,
    headers: { ...authHeaders, "if-none-match": String(first.headers.etag) },
  });
  assert.equal(second.statusCode, 304);
  assert.equal(second.body, "");

  await server.close();
});

test("PUT /api/days-off-bids/current saves the days off draft payload for the authenticated user", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsDaysOffBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draft: {
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        properties: [
          {
            rowSeq: 1,
            propertyCode: 215,
            name: "String of Days Off Starting on Date",
            bid: { type: "date", value: "2026-04-12" },
            tiers: ["T5"],
            allOrNothing: true,
            minimumN: 2,
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);
  assert.equal(response.json().data.draftVersion, 1);

  await server.close();
});

test("POST /api/days-off-bids/current/properties adds a current days off property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsDaysOffBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "2",
      bidId: 2,
      periodCode: "Apr 2026",
      draftVersion: 0,
      propertyCode: 212,
      bid: { type: "flag" },
      tiers: ["T1"],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.propertyGroupKey, "days-off-added-property-key");
  assert.equal(response.json().data.draftKey, "2");
  assert.equal(response.json().data.bidId, 2);
  assert.equal(response.json().data.periodCode, "Apr 2026");

  await server.close();
});

test("POST /api/days-off-bids/current/properties accepts structured days off bid values", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const structuredProperties = [
    {
      propertyCode: 204,
      bid: {
        type: "stepper-date-range",
        value: 2,
        from: "2026-05-01",
        to: "2026-05-07",
        min: 1,
        max: 14,
      },
      tiers: ["T1"],
    },
    {
      propertyCode: 205,
      bid: {
        type: "days-off-on-pattern",
        minDaysOff: 3,
        minDaysOn: 3,
        maxDaysOn: 5,
        min: 1,
        max: 14,
      },
      tiers: ["T1"],
    },
    {
      propertyCode: 206,
      bid: {
        type: "employee-schedule-preference",
        crewId: "817",
        crewName: "Diana Crew",
        relationship: "apart",
        scheduleType: "days_off",
        thresholdType: "minimum",
        days: 12,
        min: 1,
        max: 31,
      },
      tiers: ["T1"],
    },
  ] as const;

  for (const property of structuredProperties) {
    const response = await server.inject({
      method: "POST",
      url: `/api${pbsDaysOffBidRoutes.currentProperties}`,
      headers: {
        authorization: `Bearer ${buildAuthToken()}`,
      },
      payload: {
        draftVersion: 1018,
        ...property,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.propertyGroupKey, "days-off-added-property-key");
  }

  await server.close();
});

test("DELETE /api/days-off-bids/current/properties/:propertyGroupKey removes a current days off property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "DELETE",
    url: `/api${pbsDaysOffBidRoutes.currentPropertyByKey("days-off-property-key-1")}?draftKey=2&bidId=2&periodCode=Apr%202026&draftVersion=0`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);
  assert.equal(response.json().data.draftKey, "2");
  assert.equal(response.json().data.bidId, 2);
  assert.equal(response.json().data.periodCode, "Apr 2026");

  await server.close();
});

test("PUT /api/days-off-bids/current/properties/:propertyGroupKey updates one current days off property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsDaysOffBidRoutes.currentPropertyByKey("days-off-property-key-1")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "2",
      bidId: 2,
      periodCode: "Apr 2026",
      draftVersion: 0,
      bid: { type: "flag" },
      tiers: ["T2", "T4"],
      allOrNothing: true,
      minimumN: 2,
      maximumN: 4,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    saved: true,
    draftKey: "2",
    bidId: 2,
    periodCode: "Apr 2026",
    propertyGroupKey: "days-off-property-key-1",
    draftVersion: 1,
    tiers: ["T2", "T4"],
  });

  await server.close();
});

test("POST and DELETE days off configured favorites use stable favorite keys", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const favoriteResponse = await server.inject({
    method: "POST",
    url: `/api${pbsDaysOffBidRoutes.currentFavorites}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "2",
      bidId: 2,
      periodCode: "Apr 2026",
      draftVersion: 7,
      propertyCode: 212,
      bid: { type: "flag" },
      allOrNothing: true,
      minimumN: 2,
      maximumN: 4,
    },
  });

  assert.equal(favoriteResponse.statusCode, 200);
  assert.equal(favoriteResponse.json().data.favoriteKey, "800212");
  assert.deepEqual(favoriteResponse.json().data.bid, { type: "flag" });
  assert.equal(favoriteResponse.json().data.tiers, undefined);
  assert.equal(favoriteResponse.json().data.allOrNothing, true);
  assert.equal(favoriteResponse.json().data.minimumN, 2);
  assert.equal(favoriteResponse.json().data.maximumN, 4);

  const removeResponse = await server.inject({
    method: "DELETE",
    url: `/api${pbsDaysOffBidRoutes.favoriteByKey("800212")}?draftKey=2&bidId=2&periodCode=Apr%202026&draftVersion=7`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(removeResponse.statusCode, 200);
  assert.equal(removeResponse.json().data.saved, true);

  await server.close();
});

test("PATCH /api/days-off-bids/current/favorites/by-key/:favoriteKey updates the configured favorite without tiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsDaysOffBidRoutes.favoriteByKey("800212")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "2",
      bidId: 2,
      periodCode: "Apr 2026",
      draftVersion: 7,
      propertyCode: 212,
      action: "award",
      bid: { type: "flag" },
      allOrNothing: true,
      minimumN: 2,
      maximumN: 4,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.favoriteKey, "800212");
  assert.equal(response.json().data.draftVersion, 8);
  assert.equal(response.json().data.tiers, undefined);

  await server.close();
});

test("POST /api/days-off-bids/current/favorites rejects legacy favorite tiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsDaysOffBidRoutes.currentFavorites}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      draftVersion: 7,
      propertyCode: 212,
      bid: { type: "flag" },
      tiers: ["T1"],
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("PATCH /api/days-off-bids/current/favorites/by-key/:favoriteKey rejects legacy favorite tiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsDaysOffBidRoutes.favoriteByKey("800212")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      draftVersion: 7,
      propertyCode: 212,
      bid: { type: "flag" },
      tiers: ["T1"],
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("PUT /api/days-off-bids/current rejects invalid days off draft payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    daysOffBidService: mockDaysOffBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsDaysOffBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draft: {
        periodCode: "",
        draftVersion: 0,
        bidContext: "Current",
        properties: [],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid days off draft payload.");

  await server.close();
});
