import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsLineBidRoutes } from "../../../packages/contracts/pbs-line-bids.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsLineBidService } from "../services/line/types.js";

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

const mockLineBidService: PbsLineBidService = {
  async getCreditWindowConfig() {
    return {
      available: true,
      deltaHours: 5,
    };
  },
  async getMinimumBaseLayoverConfig() {
    return {
      available: true,
      minDuration: "013:00",
    };
  },
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
            propertyCode: 403,
            name: "Clear Schedule and Start Next Bid Group",
            bid: { type: "flag" },
            tiers: ["T1", "T2"],
          },
        ],
      },
      propertyCatalog: [
        {
          propertyCode: 403,
          name: "Clear Schedule and Start Next Bid Group",
          defaultBid: { type: "flag" },
        },
      ],
      favoriteProperties: [
        {
          favoriteKey: "line-configured-700403",
          propertyId: 403,
          propertyCode: 403,
          name: "Clear Schedule and Start Next Bid Group",
          bid: { type: "flag" },
          tiers: ["T1", "T2"],
        },
      ],
      recommendedPropertyCodes: [429, 404, 405],
    };
  },
  async saveCurrentDraft(_actor, request) {
    return {
      draft: {
        ...request.draft,
        remarks: request.draft.remarks ?? "",
      },
      propertyCatalog: [
        {
          propertyCode: 403,
          name: "Clear Schedule and Start Next Bid Group",
          defaultBid: { type: "flag" },
        },
      ],
      favoriteProperties: [],
      recommendedPropertyCodes: [429, 404, 405],
    };
  },
  async addCurrentDraftProperty(_actor, request) {
    return {
      saved: true,
      draftKey: request.draftKey,
      bidId: request.bidId,
      periodCode: request.periodCode,
      draftVersion: request.draftVersion + 1,
      propertyGroupKey: "line-property-403",
      rowSeq: 2,
    };
  },
  async removeCurrentDraftProperty(_actor, _propertyGroupKey, reference) {
    return {
      saved: true,
      draftKey: reference?.draftKey ?? "10",
      bidId: reference?.bidId ?? 10,
      periodCode: reference?.periodCode ?? "Apr 2026",
      draftVersion: (reference?.draftVersion ?? 1) + 1,
    };
  },
  async patchCurrentDraftProperty(_actor, propertyGroupKey, request) {
    return {
      saved: true,
      draftKey: request.draftKey,
      bidId: request.bidId,
      periodCode: request.periodCode,
      draftVersion: request.draftVersion + 1,
      propertyGroupKey,
      tiers: request.property.tiers,
    };
  },
  async saveConfiguredFavoriteProperty(_actor, request) {
    return {
      saved: true,
      favoriteKey: "line-configured-408",
      propertyId: request.property.propertyCode,
      propertyCode: request.property.propertyCode,
      name: request.property.name,
      bid: request.property.bid,
      draftVersion: request.draftVersion,
    };
  },
  async patchFavoritePropertyByKey(_actor, favoriteKey, request) {
    return {
      saved: true,
      favoriteKey,
      propertyId: request.property.propertyCode,
      propertyCode: request.property.propertyCode,
      name: request.property.name,
      action: request.property.action,
      bid: request.property.bid,
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

test("GET /api/line-bids/current returns the current line draft for the authenticated user", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsLineBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  assert.equal(response.json().data.draft.periodCode, "Apr 2026");
  assert.equal(response.json().data.draft.properties[0].propertyCode, 403);
  assert.equal(response.json().data.favoriteProperties[0].favoriteKey, "line-configured-700403");
  assert.deepEqual(response.json().data.recommendedPropertyCodes, [429, 404, 405]);

  await server.close();
});

test("GET /api/line-bids/current returns 304 when the private ETag matches", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const authHeaders = { authorization: `Bearer ${buildAuthToken()}` };
  const first = await server.inject({
    method: "GET",
    url: `/api${pbsLineBidRoutes.current}`,
    headers: authHeaders,
  });
  assert.equal(first.statusCode, 200);
  assert.ok(first.headers.etag);

  const second = await server.inject({
    method: "GET",
    url: `/api${pbsLineBidRoutes.current}`,
    headers: { ...authHeaders, "if-none-match": String(first.headers.etag) },
  });
  assert.equal(second.statusCode, 304);
  assert.equal(second.body, "");

  await server.close();
});

test("GET /api/line-bids/credit-window-config returns the Line credit window config", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsLineBidRoutes.creditWindowConfig}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.available, true);
  assert.equal(response.json().data.deltaHours, 5);

  await server.close();
});

test("GET /api/line-bids/minimum-base-layover-config returns the configured minimum duration", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsLineBidRoutes.minimumBaseLayoverConfig}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    available: true,
    minDuration: "013:00",
  });

  await server.close();
});

test("PUT /api/line-bids/current saves the line draft payload for the authenticated user", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsLineBidRoutes.current}`,
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
            propertyCode: 403,
            name: "Clear Schedule and Start Next Bid Group",
            bid: { type: "flag" },
            tiers: ["T3"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.draft.properties[0].bid.type, "flag");
  assert.deepEqual(response.json().data.draft.properties[0].tiers, ["T3"]);

  await server.close();
});

test("POST /api/line-bids/current/properties adds one line property for the authenticated user", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsLineBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "10",
      bidId: 10,
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 1,
      property: {
        propertyCode: 403,
        name: "Clear Schedule and Start Next Bid Group",
        bid: { type: "flag" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);
  assert.equal(response.json().data.propertyGroupKey, "line-property-403");
  assert.equal(response.json().data.rowSeq, 2);
  assert.equal(response.json().data.draftVersion, 2);

  await server.close();
});

test("POST /api/line-bids/current/properties returns service conflicts for stale line drafts", async () => {
  const { LineholderBidServiceError } = await import("../services/lineholder/shared.js");
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: {
      ...mockLineBidService,
      async addCurrentDraftProperty() {
        throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      },
    },
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsLineBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 1,
      property: {
        propertyCode: 403,
        name: "Clear Schedule and Start Next Bid Group",
        bid: { type: "flag" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().message, "Current draft has changed. Please refresh before saving again.");

  await server.close();
});

test("PATCH /api/line-bids/current/properties/:propertyGroupKey patches one line property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsLineBidRoutes.currentPropertyByKey("line-property-403")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "10",
      bidId: 10,
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 2,
      property: {
        propertyCode: 403,
        name: "Clear Schedule and Start Next Bid Group",
        bid: { type: "flag" },
        tiers: ["T2"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);
  assert.equal(response.json().data.propertyGroupKey, "line-property-403");
  assert.deepEqual(response.json().data.tiers, ["T2"]);
  assert.equal(response.json().data.draftVersion, 3);

  await server.close();
});

test("DELETE /api/line-bids/current/properties/:propertyGroupKey removes one line property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "DELETE",
    url: `/api${pbsLineBidRoutes.currentPropertyByKey("line-property-403")}?draftKey=10&bidId=10&periodCode=Apr%202026&draftVersion=2`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);
  assert.equal(response.json().data.draftVersion, 3);

  await server.close();
});

test("POST and DELETE line favorites use configured stable favorite keys", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const configuredFavoriteResponse = await server.inject({
    method: "POST",
    url: `/api${pbsLineBidRoutes.currentFavorites}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      bidId: 10,
      periodCode: "Apr 2026",
      draftVersion: 2,
      property: {
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 5, maxDaysOn: 5 },
      },
    },
  });

  assert.equal(configuredFavoriteResponse.statusCode, 200);
  assert.equal(configuredFavoriteResponse.json().data.favoriteKey, "line-configured-408");
  assert.equal(configuredFavoriteResponse.json().data.bid.minDaysOn, 5);

  const removeResponse = await server.inject({
    method: "DELETE",
    url: `/api${pbsLineBidRoutes.favoriteByKey("line-configured-408")}?bidId=10&periodCode=Apr%202026&draftVersion=2`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(removeResponse.statusCode, 200);
  assert.equal(removeResponse.json().data.saved, true);

  await server.close();
});

test("PATCH /api/line-bids/current/favorites/by-key/:favoriteKey updates the configured favorite without tiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsLineBidRoutes.favoriteByKey("line-configured-408")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "10",
      bidId: 10,
      periodCode: "Apr 2026",
      draftVersion: 2,
      property: {
        propertyCode: 408,
        name: "Commuter Pattern",
        action: "award",
        bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 5, maxDaysOn: 5 },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.favoriteKey, "line-configured-408");
  assert.equal(response.json().data.draftVersion, 3);
  assert.equal(response.json().data.tiers, undefined);

  await server.close();
});

test("POST /api/line-bids/current/favorites rejects legacy favorite tiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsLineBidRoutes.currentFavorites}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      draftVersion: 2,
      property: {
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 5, maxDaysOn: 5 },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("PATCH /api/line-bids/current/favorites/by-key/:favoriteKey rejects legacy favorite tiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsLineBidRoutes.favoriteByKey("line-configured-408")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      draftVersion: 2,
      property: {
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 5, maxDaysOn: 5 },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("POST /api/line-bids/current/properties accepts credit density line bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsLineBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      bidId: 10,
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 2,
      property: {
        propertyCode: 409,
        name: "Most Flying In Least Working Days (Configured)",
        bid: {
          type: "credit-density-preference",
          minimumTotalCredit: "78:00",
          maximumWorkingDays: 14,
          strength: "strong",
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);

  await server.close();
});

test("PUT /api/line-bids/current rejects invalid line draft payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineBidService: mockLineBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsLineBidRoutes.current}`,
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
  assert.equal(response.json().message, "Invalid line draft payload.");

  await server.close();
});
