import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsReserveBidRoutes } from "../../../packages/contracts/pbs-reserve-bids.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsReserveBidService } from "../services/reserve/types.js";

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

const mockReserveBidService: PbsReserveBidService = {
  async getCurrentDraft() {
    return {
      draft: {
        draftKey: "42",
        bidId: 42,
        periodId: 1,
        draftVersion: 0,
        periodCode: "May 2026",
        bidContext: "Current",
        mode: "legacy",
        remarks: "",
        properties: [
          {
            rowSeq: 1,
            propertyGroupKey: "reserve-property-301",
            propertyCode: 301,
            name: "Reserve Preference",
            bid: {
              type: "reserve-call-type-date-scope",
              callType: "PRAM",
              options: ["CRAM", "CRPM", "PRAM"],
              dateScope: { mode: "whole_month" },
            },
            tiers: ["T1"],
          },
        ],
      },
      propertyCatalog: [
        {
          propertyCode: 301,
          name: "Reserve Preference",
          defaultBid: {
            type: "reserve-call-type-date-scope",
            callType: "PRAM",
            options: ["CRAM", "CRPM", "PRAM"],
            dateScope: { mode: "whole_month" },
          },
        },
      ],
    };
  },
  async saveCurrentDraft(_actor, request) {
    return {
      draft: {
        ...request.draft,
        draftKey: request.draft.draftKey ?? "42",
        bidId: request.draft.bidId ?? 42,
        periodId: request.draft.periodId ?? 1,
        draftVersion: request.draft.draftVersion + 1,
      },
      propertyCatalog: [],
    };
  },
  async addCurrentDraftProperty(_actor, request) {
    return {
      saved: true,
      draftKey: request.draftKey,
      bidId: request.bidId,
      periodCode: request.periodCode,
      draftVersion: request.draftVersion + 1,
      propertyGroupKey: "reserve-property-301-new",
      rowSeq: 2,
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
  async removeCurrentDraftProperty(_actor, _propertyGroupKey, reference = {}) {
    return {
      saved: true,
      draftKey: reference.draftKey ?? undefined,
      bidId: reference.bidId ?? undefined,
      periodCode: reference.periodCode ?? undefined,
      draftVersion: (reference.draftVersion ?? 0) + 1,
    };
  },
  async getCurrentCoverage() {
    return {
      rosterPeriodId: 5,
      rpStartLocal: "2026-05-01",
      rpEndLocal: "2026-05-31",
      periodCode: "May 2026",
      baseCode: "F8",
      days: [
        {
          date: "2026-05-01",
          requiredReserveCount: 279,
          availableOffCount: 33,
        },
      ],
      warnings: [],
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

const buildServerWithReserveMock = async () => {
  const { buildServer } = await import("../app.js");

  return buildServer({
    authService: mockAuthService,
    reserveBidService: mockReserveBidService,
    skipDatabase: true,
  });
};

test("GET /api/reserve-bids/current returns the current Reserve Preference draft", async () => {
  const server = await buildServerWithReserveMock();

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsReserveBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.draft.mode, "legacy");
  assert.equal(response.json().data.draft.properties[0].propertyCode, 301);

  await server.close();
});

test("GET /api/reserve-bids/current/coverage returns live-computed reserve coverage counts", async () => {
  const server = await buildServerWithReserveMock();

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsReserveBidRoutes.currentCoverage}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.baseCode, "F8");
  assert.equal(response.json().data.days[0].requiredReserveCount, 279);
  assert.equal(response.json().data.days[0].availableOffCount, 33);

  await server.close();
});

test("POST /api/reserve-bids/current/properties adds a Reserve Preference property", async () => {
  const server = await buildServerWithReserveMock();

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsReserveBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "42",
      bidId: 42,
      periodCode: "May 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "CRPM",
          options: ["CRAM", "CRPM", "PRAM"],
          dateScope: { mode: "first_half" },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.propertyGroupKey, "reserve-property-301-new");
  assert.equal(response.json().data.rowSeq, 2);

  await server.close();
});

test("PATCH /api/reserve-bids/current/properties/:propertyGroupKey updates a Reserve Preference property", async () => {
  const server = await buildServerWithReserveMock();

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsReserveBidRoutes.currentPropertyByKey("reserve-property-301")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "42",
      bidId: 42,
      periodCode: "May 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "CRAM",
          options: ["CRAM", "CRPM", "PRAM"],
          dateScope: { mode: "specific_dates", dates: ["2026-05-01"] },
        },
        tiers: ["T2", "T3"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.propertyGroupKey, "reserve-property-301");
  assert.deepEqual(response.json().data.tiers, ["T2", "T3"]);

  await server.close();
});

test("POST /api/reserve-bids/current/properties rejects unsupported reserve bid shapes", async () => {
  const server = await buildServerWithReserveMock();

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsReserveBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 301,
        name: "Reserve Preference",
        bid: { type: "flag" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid reserve property payload.");

  await server.close();
});
