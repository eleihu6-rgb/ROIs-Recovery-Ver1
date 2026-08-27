import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsPairingBidRoutes } from "../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsPairingBidService } from "../services/pairing/types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const mockAuthService: PbsAuthService = {
  async login(userCode, password) {
    if (userCode !== "casey.crew" || password !== "super-secret") {
      const error = new Error("Invalid user code or password.");
      Object.assign(error, { statusCode: 401 });
      throw error;
    }

    return {
      token: "jwt-token",
      authMode: "password",
      user: {
        id: "1",
        name: "casey.crew",
        employeeNo: "F8030",
      },
    };
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

const mockPairingBidService: PbsPairingBidService = {
  async getRedeyeConfig() {
    return { available: true, startTime: "03:30", endTime: "05:30", crossesMidnight: false, version: "03:30|05:30" };
  },
  async getEfficientFlyingConfig() {
    return { percentile: 20 };
  },
  async getReferenceOptions() {
    return {
      airports: [
        { code: "DFW", name: "DALLAS-FORT WORTH INTL", icao: null, abbr: null, city: "DFW" },
      ],
      cities: [
        { code: "DFW" },
      ],
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
            propertyGroupKey: "pairing-property-key-1",
            rowSeq: 1,
            propertyCode: 131,
            name: "Prefer Pairing Length",
            action: "award",
            quantifier: null,
            bid: { type: "stepper", value: 3, min: 1, max: 7 },
            tiers: ["T4", "T5"],
          },
        ],
      },
      propertyCatalog: [
          {
            propertyCode: 131,
            name: "Prefer Pairing Length",
            defaultBid: { type: "stepper", value: 3, min: 1, max: 7 },
            supportedActions: ["award", "avoid"],
          },
      ],
      favoriteProperties: [
        {
          favoriteKey: "9001",
          propertyId: 131,
          propertyCode: 131,
          name: "Prefer Pairing Length",
          action: "award",
          quantifier: null,
          bid: { type: "stepper", value: 3, min: 1, max: 7 },
          tiers: ["T4"],
        },
      ],
      recommendedPropertyCodes: [102, 168, 103, 107, 110],
    };
  },
  async saveCurrentDraft(_actor, request) {
    assert.equal(request.draft.bidContext, "Current");
    return { saved: true, draftVersion: request.draft.draftVersion + 1 };
  },
  async addCurrentDraftProperty(_actor, request) {
    assert.equal(request.bidContext, "Current");
    assert.equal(request.draftVersion, 0);
    return { saved: true, propertyGroupKey: "pairing-property-key-new", rowSeq: 2 };
  },
  async removeCurrentDraftProperty(_actor, propertyGroupKey, reference) {
    assert.equal(propertyGroupKey, "pairing-property-key-1");
    assert.deepEqual(reference, { periodCode: "Apr 2026", draftVersion: 0 });
    return { saved: true };
  },
  async patchCurrentDraftProperty(_actor, propertyGroupKey, request) {
    assert.equal(propertyGroupKey, "pairing-property-key-1");
    assert.equal(request.draftVersion, 0);
    return { saved: true, propertyGroupKey, deleted: false, tiers: request.property.tiers };
  },
  async saveConfiguredFavoriteProperty(_actor, request) {
    assert.equal(request.draftVersion, 0);
    assert.deepEqual(request.property, {
      propertyCode: 132,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 4, min: 1, max: 7 },
    });

    return {
      saved: true,
      favoriteKey: "9003",
      propertyId: 132,
      propertyCode: 132,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: request.property.bid,
    };
  },
  async patchFavoritePropertyByKey(_actor, favoriteKey, request) {
    assert.equal(favoriteKey, "9003");
    assert.equal(request.draftVersion, 0);
    assert.deepEqual(request.property, {
      propertyCode: 132,
      name: "Prefer Pairing Length",
      action: "avoid",
      quantifier: null,
      bid: { type: "stepper", value: 5, min: 1, max: 7 },
    });

    return {
      saved: true,
      favoriteKey,
      propertyId: 132,
      propertyCode: 132,
      name: "Prefer Pairing Length",
      action: "avoid",
      quantifier: null,
      bid: request.property.bid,
    };
  },
  async removeFavoritePropertyByKey(_actor, favoriteKey, reference) {
    assert.equal(favoriteKey, "9002");
    assert.deepEqual(reference, { periodCode: "Apr 2026", draftVersion: 0 });
    return { saved: true };
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

test("GET /api/pairing-bids/current returns the current pairing draft for the authenticated user", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsPairingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.draft.periodCode, "Apr 2026");
  assert.equal(response.json().data.draft.properties[0].propertyCode, 131);
  assert.equal(response.json().data.favoriteProperties[0].propertyCode, 131);
  assert.deepEqual(response.json().data.recommendedPropertyCodes, [102, 168, 103, 107, 110]);

  await server.close();
});

test("GET /api/pairing-bids/reference-options returns airport and city options", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsPairingBidRoutes.referenceOptions}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    airports: [
      { code: "DFW", name: "DALLAS-FORT WORTH INTL", icao: null, abbr: null, city: "DFW" },
    ],
    cities: [
      { code: "DFW" },
    ],
  });

  await server.close();
});

test("GET /api/pairing-bids/redeye-config returns the current dictionary-backed definition", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsPairingBidRoutes.redeyeConfig}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    available: true,
    startTime: "03:30",
    endTime: "05:30",
    crossesMidnight: false,
    version: "03:30|05:30",
  });

  await server.close();
});

test("PUT /api/pairing-bids/current saves the pairing draft payload for the authenticated user", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsPairingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draft: {
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        remarks: "saved-from-test",
        properties: [
          {
            rowSeq: 1,
            propertyCode: 131,
            name: "Prefer Pairing Length",
            action: "avoid",
            quantifier: "every",
            bid: { type: "stepper", value: 5, min: 1, max: 7 },
            tiers: ["T4"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, { saved: true, draftVersion: 1 });

  await server.close();
});

test("PUT /api/pairing-bids/current returns 409 when the draft version is stale", async () => {
  const { buildServer } = await import("../app.js");
  const { LineholderBidServiceError } = await import("../services/lineholder/shared.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: {
      ...mockPairingBidService,
      async saveCurrentDraft() {
        throw new LineholderBidServiceError(409, "Current draft has changed. Please refresh before saving again.");
      },
    },
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsPairingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draft: {
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        properties: [],
      },
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().message, "Current draft has changed. Please refresh before saving again.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties adds a current pairing property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 131,
        name: "Prefer Pairing Length",
        action: "avoid",
        quantifier: "every",
        bid: { type: "stepper", value: 5, min: 1, max: 7 },
        tiers: ["T4"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    saved: true,
    propertyGroupKey: "pairing-property-key-new",
    rowSeq: 2,
  });

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts unified pairing check-time conditions", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        action: "award",
        bid: {
          type: "pairing-check-time",
          timeType: "check_out",
          operator: "Between",
          from: "14:00",
          to: "22:00",
          dateScope: { mode: "date_range", from: "2026-04-15", to: "2026-04-21" },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts Month-End Carryover bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      draftKey: "3635",
      bidId: 3635,
      periodCode: "Jun 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 163,
        name: "Month-End Carryover",
        action: "award",
        quantifier: null,
        bid: {
          type: "month-end-carryover",
          operator: "<",
          days: 2,
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts pairing total credit duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 105,
        name: "Pairing Total Credit",
        action: "award",
        bid: { type: "duration", value: "112:30", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts average daily credit duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 109,
        name: "Average Daily Credit",
        action: "award",
        bid: { type: "duration", value: "005:30", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts average daily block time duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 121,
        name: "Average Daily Block Time",
        action: "award",
        bid: { type: "duration", value: "006:00", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects average daily block time text bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 121,
        name: "Average Daily Block Time",
        action: "award",
        bid: { type: "text", value: "06:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Average Daily Block Time requires duration bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects unsupported average daily block time operators", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 121,
        name: "Average Daily Block Time",
        action: "award",
        bid: { type: "duration", value: "006:00", operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Average Daily Block Time supports < or > only.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts pairing total block time duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 127,
        name: "Pairing Total Block Time",
        action: "award",
        bid: { type: "duration", value: "006:00", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts pairing total block time ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 127,
        name: "Pairing Total Block Time",
        action: "award",
        bid: { type: "duration-range", from: "004:00", to: "006:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects pairing total block time text bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 127,
        name: "Pairing Total Block Time",
        action: "award",
        bid: { type: "text", value: "06:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Pairing Total Block Time requires duration bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects unsupported pairing total block time operators", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 127,
        name: "Pairing Total Block Time",
        action: "award",
        bid: { type: "duration", value: "006:00", operator: "<" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Pairing Total Block Time supports > or Between only.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts credit per time away from base percent and duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const percentResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 125,
        name: "Credit Per Time Away From Base",
        action: "award",
        bid: { type: "percent-or-duration", unit: "percent", value: "75", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(percentResponse.statusCode, 200);

  const durationResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 125,
        name: "Credit Per Time Away From Base",
        action: "avoid",
        bid: { type: "percent-or-duration", unit: "duration", value: "007:00", operator: "<" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(durationResponse.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects unsupported credit per time away from base bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const equalsResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 125,
        name: "Credit Per Time Away From Base",
        action: "award",
        bid: { type: "percent-or-duration", unit: "percent", value: "75", operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(equalsResponse.statusCode, 400);
  assert.equal(equalsResponse.json().message, "Credit Per Time Away From Base supports < or > only.");

  const invalidPercentResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 125,
        name: "Credit Per Time Away From Base",
        action: "award",
        bid: { type: "percent-or-duration", unit: "percent", value: "abc", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(invalidPercentResponse.statusCode, 400);
  assert.equal(invalidPercentResponse.json().message, "Credit Per Time Away From Base percent value is invalid.");

  const invalidDurationResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 125,
        name: "Credit Per Time Away From Base",
        action: "award",
        bid: { type: "percent-or-duration", unit: "duration", value: "08:75", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(invalidDurationResponse.statusCode, 400);
  assert.equal(invalidDurationResponse.json().message, "Credit Per Time Away From Base duration value is invalid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts TAFB day bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 113,
        name: "TAFB",
        action: "award",
        bid: { type: "stepper", value: 2, operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts TAFB day ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 113,
        name: "TAFB",
        action: "avoid",
        bid: { type: "stepper-range", from: 1, to: 7 },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts any/every duty duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const durationResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 118,
        name: "Any/Every Duty Duration",
        action: "award",
        quantifier: "any",
        bid: { type: "duration", value: "11:30", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(durationResponse.statusCode, 200);

  const rangeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 118,
        name: "Any/Every Duty Duration",
        action: "avoid",
        quantifier: "every",
        bid: { type: "duration-range", from: "08:00", to: "12:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(rangeResponse.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects text duty duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 118,
        name: "Any/Every Duty Duration",
        action: "award",
        quantifier: "any",
        bid: { type: "text", value: "11:30" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Duty Duration requires duration bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects equals duty duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 118,
        name: "Any/Every Duty Duration",
        action: "award",
        quantifier: "any",
        bid: { type: "duration", value: "11:30", operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Duty Duration supports <, >, or Between only.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects invalid duty duration quantifiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 118,
        name: "Any/Every Duty Duration",
        action: "award",
        quantifier: null,
        bid: { type: "duration", value: "11:30", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Duty Duration requires Any or Every.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts any duty on time bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const equalResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 120,
        name: "Any Duty On Time",
        action: "award",
        quantifier: "any",
        bid: { type: "time", value: "12:00", operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(equalResponse.statusCode, 200);

  const rangeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 120,
        name: "Any Duty On Time",
        action: "avoid",
        quantifier: "any",
        bid: { type: "time-range", from: "08:00", to: "10:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(rangeResponse.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects non-any duty on time quantifiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 120,
        name: "Any Duty On Time",
        action: "award",
        quantifier: "every",
        bid: { type: "time", value: "12:00", operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any Duty On Time requires Any.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects non-time duty on time bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 120,
        name: "Any Duty On Time",
        action: "award",
        quantifier: "any",
        bid: { type: "text", value: "12:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any Duty On Time requires time bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts any/every layover duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const durationResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 119,
        name: "Any/Every Layover Duration",
        action: "award",
        quantifier: "any",
        bid: { type: "duration", value: "15:00", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(durationResponse.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts airport preference layover bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 168,
        name: "Airport Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "airport-preference",
          event: "layover",
          locations: [{ code: "YYZ", kind: "airport" }],
          dateScope: { mode: "date_range", from: "2026-04-15", to: "2026-04-21" },
          minimumLayoverDuration: "12:00",
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects legacy airport preference payload fields", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 168,
        name: "Airport Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "airport-preference",
          event: "landing",
          locations: [{ code: "YVR", kind: "airport" }],
          airports: ["YVR"],
          dateCondition: { mode: "specific_dates", dates: ["2026-06-15"] },
          matchingCount: { operator: ">", value: 1 },
          layoverDuration: { operator: ">", value: "12:00" },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects removed airport preference fulfilment fields", async () => {
  const { buildServer } = await import("../app.js");
  let addCalls = 0;
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: {
      ...mockPairingBidService,
      async addCurrentDraftProperty(actor, request) {
        addCalls += 1;
        return mockPairingBidService.addCurrentDraftProperty(actor, request);
      },
    },
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 168,
        name: "Airport Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "airport-preference",
          event: "layover",
          locations: [{ code: "YYZ", kind: "airport" }],
          minimumRequired: 1,
          maximumRequired: 2,
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(addCalls, 0);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects text layover duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 119,
        name: "Any/Every Layover Duration",
        action: "award",
        quantifier: "any",
        bid: { type: "text", value: "15:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Layover Duration requires duration bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects layover duration ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 119,
        name: "Any/Every Layover Duration",
        action: "avoid",
        quantifier: "every",
        bid: { type: "duration-range", from: "08:00", to: "12:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Layover Duration requires duration bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects equals layover duration bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 119,
        name: "Any/Every Layover Duration",
        action: "award",
        quantifier: "any",
        bid: { type: "duration", value: "15:00", operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Layover Duration supports < or > only.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects invalid layover duration quantifiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 119,
        name: "Any/Every Layover Duration",
        action: "award",
        quantifier: null,
        bid: { type: "duration", value: "15:00", operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Layover Duration requires Any or Every.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts every enroute check-in time ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 114,
        name: "Any/Every Enroute Check-In Time",
        action: "avoid",
        quantifier: "every",
        bid: { type: "time-range", from: "19:00", to: "23:59" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts any/every enroute check-out time ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 126,
        name: "Any/Every Enroute Check-Out Time",
        action: "avoid",
        quantifier: "every",
        bid: { type: "time-range", from: "19:00", to: "23:59" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects unsupported enroute check-out time operators", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 126,
        name: "Any/Every Enroute Check-Out Time",
        action: "award",
        quantifier: "any",
        bid: { type: "time", value: "22:30", operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Enroute Check-Out Time supports < or Between only.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects enroute check-out time without Any or Every", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 126,
        name: "Any/Every Enroute Check-Out Time",
        action: "award",
        quantifier: null,
        bid: { type: "time", value: "22:30", operator: "<" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Enroute Check-Out Time requires Any or Every.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts leg employee number crew id lists", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 115,
        name: "Any/Every Leg With Employee Number",
        action: "award",
        quantifier: "every",
        bid: { type: "tag-list", values: ["5510", "5513"] },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects empty leg employee number lists", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 115,
        name: "Any/Every Leg With Employee Number",
        action: "award",
        quantifier: "any",
        bid: { type: "tag-list", values: [] },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Leg With Employee Number requires at least one crew id.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts Flight Number Preference payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 116,
        name: "Flight Number Preference",
        action: "avoid",
        quantifier: null,
        bid: {
          type: "flight-number-preference",
          flightNumbers: ["1993", "1600"],
          dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-10"] },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects legacy Flight Number payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 116,
        name: "Flight Number Preference",
        action: "award",
        quantifier: "any",
        bid: { type: "tag-list", values: [] },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Flight Number Preference is invalid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts Redeye Preference bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 117,
        name: "Redeye Preference",
        action: "avoid",
        quantifier: null,
        bid: {
          type: "redeye-preference",
          dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-18"] },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects legacy Redeye flag bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 117,
        name: "Redeye Preference",
        action: "award",
        quantifier: "any",
        bid: { type: "flag" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Redeye Preference is invalid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects invalid Redeye Preference bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const invalidBidResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 117,
        name: "Redeye Preference",
        action: "award",
        quantifier: null,
        bid: { type: "tag-list", values: ["Y"] },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(invalidBidResponse.statusCode, 400);
  assert.equal(invalidBidResponse.json().message, "Redeye Preference is invalid.");

  const invalidQuantifierResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 117,
        name: "Redeye Preference",
        action: "avoid",
        quantifier: "any",
        bid: { type: "redeye-preference", dateScope: null },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(invalidQuantifierResponse.statusCode, 400);
  assert.equal(invalidQuantifierResponse.json().message, "Redeye Preference does not support Any or Every.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts departing on date or day bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 106,
        name: "Departure Date / Day",
        action: "award",
        bid: {
          type: "date-or-dow-list",
          dates: ["2026-04-03"],
          daysOfWeek: ["MON", "WED"],
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts Work Day Preference weekday windows", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 110,
        name: "Work Day Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "work-day-preference",
          days: [
            { dayOfWeek: "FRI", checkInFrom: "06:00", checkInTo: "10:00" },
            { dayOfWeek: "SAT", checkInFrom: null, checkInTo: null },
            { dayOfWeek: "SUN", checkInFrom: "12:00", checkInTo: null },
          ],
          dateScope: null,
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts Work Day Preference event date ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 110,
        name: "Work Day Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "work-day-preference",
          days: [{ dayOfWeek: "FRI", checkInFrom: "22:00", checkInTo: "04:00" }],
          dateScope: { mode: "date_range", from: "2026-04-03", to: "2026-04-10" },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts layover on date or day bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 123,
        name: "Any/Every Layover On Date / Day",
        action: "award",
        quantifier: "any",
        bid: {
          type: "date-or-dow-list",
          dates: ["2026-04-03"],
          daysOfWeek: ["FRI"],
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts layover on date ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 123,
        name: "Any/Every Layover On Date / Day",
        action: "avoid",
        quantifier: "every",
        bid: { type: "date-range", from: "2026-04-03", to: "2026-04-10" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts enroute check-in date or day bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 166,
        name: "Any/Every Enroute Check-In Date / Day",
        action: "award",
        quantifier: "any",
        bid: {
          type: "date-or-dow-list",
          dates: ["2026-04-03"],
          daysOfWeek: ["FRI"],
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts enroute check-out date ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 167,
        name: "Any/Every Enroute Check-Out Date / Day",
        action: "avoid",
        quantifier: "every",
        bid: { type: "date-range", from: "2026-04-03", to: "2026-04-10" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects properties with missing mode", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 105,
        name: "Pairing Total Credit",
        action: null,
        bid: { type: "duration", value: "12:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Pairing Mode is required.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts credit priority on credit bids", async () => {
  const { buildServer } = await import("../app.js");
  const pairingBidService: PbsPairingBidService = {
    ...mockPairingBidService,
    async addCurrentDraftProperty(_actor, request) {
      assert.deepEqual(request.property, {
        propertyCode: 105,
        name: "Pairing Total Credit",
        action: "award",
        bid: {
          type: "duration",
          value: "08:00",
          operator: ">",
          creditPriority: "higher",
        },
        tiers: ["T1"],
      });

      return { saved: true, propertyGroupKey: "pairing-property-key-new", rowSeq: 2 };
    },
  };
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 105,
        name: "Pairing Total Credit",
        action: "award",
        bid: {
          type: "duration",
          value: "08:00",
          operator: ">",
          creditPriority: "higher",
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects text pairing total credit bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 105,
        name: "Pairing Total Credit",
        action: "award",
        bid: { type: "text", value: "08:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Pairing Total Credit requires duration bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects text average daily credit bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 109,
        name: "Average Daily Credit",
        action: "award",
        bid: { type: "text", value: "005:30" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Average Daily Credit requires duration bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects text TAFB bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 113,
        name: "TAFB",
        action: "award",
        bid: { type: "duration", value: "020:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "TAFB requires a day value.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects TAFB equals bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 113,
        name: "TAFB",
        action: "award",
        bid: { type: "stepper", value: 2, operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "TAFB supports <, >, or Between only.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects invalid pairing total credit durations", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 105,
        name: "Pairing Total Credit",
        action: "award",
        bid: { type: "duration", value: "08:75" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid pairing property payload.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects old pairing check-in time bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        action: "award",
        bid: { type: "time-range", from: "10:00", to: "11:00" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Pairing Check-In / Check-Out Time requires pairing-check-time bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects old departing on tag bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 106,
        name: "Departure Date / Day",
        action: "award",
        bid: { type: "tag-list", values: ["MON"] },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Departure Date / Day requires date-or-dow bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects old Work Day Preference payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 110,
        name: "Work Day Preference",
        action: "award",
        quantifier: "any",
        bid: { type: "tag-list-date", values: ["MON"], date: "2026-04-03" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Work Day Preference requires work-day-preference bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects old layover on tag-date bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 123,
        name: "Any/Every Layover On Date / Day",
        action: "award",
        quantifier: "any",
        bid: { type: "tag-list-date", values: ["YYZ"], date: "2026-04-03" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Layover On Date / Day requires date-or-dow bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects old enroute check-in date tag bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 166,
        name: "Any/Every Enroute Check-In Date / Day",
        action: "award",
        quantifier: "any",
        bid: { type: "tag-list-date", values: ["MON"], date: "2026-04-03" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Enroute Check-In Date / Day requires date-or-dow bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects enroute check-out date without Any or Every", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 167,
        name: "Any/Every Enroute Check-Out Date / Day",
        action: "award",
        quantifier: null,
        bid: { type: "date-or-dow-list", dates: ["2026-04-03"], daysOfWeek: [] },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Enroute Check-Out Date / Day requires Any or Every.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects layover on date or day without quantifier", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 123,
        name: "Any/Every Layover On Date / Day",
        action: "award",
        quantifier: null,
        bid: { type: "date-or-dow-list", dates: ["2026-04-03"], daysOfWeek: [] },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Layover On Date / Day requires Any or Every.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects zero-width Work Day Preference windows", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 110,
        name: "Work Day Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "work-day-preference",
          days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "06:00" }],
          dateScope: null,
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid pairing property payload.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects invalid layover on date ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 123,
        name: "Any/Every Layover On Date / Day",
        action: "award",
        quantifier: "any",
        bid: { type: "date-range", from: "2026-04-10", to: "2026-04-03" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Layover On Date / Day date range end date must be on or after start date.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects invalid enroute check-out date ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 167,
        name: "Any/Every Enroute Check-Out Date / Day",
        action: "award",
        quantifier: "any",
        bid: { type: "date-range", from: "2026-04-10", to: "2026-04-03" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Any/Every Enroute Check-Out Date / Day date range end date must be on or after start date.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts departure time ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 164,
        name: "Departure Time",
        action: "award",
        bid: { type: "time-range", from: "06:00", to: "06:45" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects departure date/day time ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 106,
        name: "Departure Date / Day",
        action: "award",
        bid: { type: "date-range", from: "09:10", to: "09:20" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Departure Date / Day date range end date must be on or after start date.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts deadhead flying specific-date bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 122,
        name: "Deadhead Flying",
        action: "award",
        quantifier: null,
        bid: {
          type: "deadhead-flying",
          mode: "any-deadhead",
          dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-08"] },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts deadhead-only duty flight-date ranges", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 122,
        name: "Deadhead Flying",
        action: "avoid",
        quantifier: null,
        bid: {
          type: "deadhead-flying",
          mode: "deadhead-only-duty",
          dateScope: { mode: "date_range", from: "2026-04-10", to: "2026-04-12" },
        },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts total legs in first duty stepper bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const greaterResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 124,
        name: "Total Legs In First Duty",
        action: "award",
        bid: { type: "stepper", value: 2, min: 1, max: 8, operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(greaterResponse.statusCode, 200);

  const lessResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 124,
        name: "Total Legs In First Duty",
        action: "avoid",
        bid: { type: "stepper", value: 3, min: 1, max: 8, operator: "<" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(lessResponse.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-bids/current/properties accepts total legs in last duty stepper bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 130,
        name: "Total Legs In Last Duty",
        action: "avoid",
        bid: { type: "stepper", value: 2, min: 1, max: 8, operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.saved, true);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects unsupported total legs in first duty stepper bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const equalsResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 124,
        name: "Total Legs In First Duty",
        action: "award",
        bid: { type: "stepper", value: 2, min: 1, max: 8, operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(equalsResponse.statusCode, 400);
  assert.equal(equalsResponse.json().message, "Total Legs In First Duty supports < or > only.");

  const rangeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 124,
        name: "Total Legs In First Duty",
        action: "award",
        bid: { type: "stepper-range", from: 1, to: 3, min: 1, max: 8 },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(rangeResponse.statusCode, 400);
  assert.equal(rangeResponse.json().message, "Total Legs In First Duty requires number bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects unsupported total legs in last duty stepper bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const equalsResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 130,
        name: "Total Legs In Last Duty",
        action: "avoid",
        bid: { type: "stepper", value: 2, min: 1, max: 8, operator: "=" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(equalsResponse.statusCode, 400);
  assert.equal(equalsResponse.json().message, "Total Legs In Last Duty supports > only.");

  const quantifierResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 130,
        name: "Total Legs In Last Duty",
        action: "avoid",
        quantifier: "any",
        bid: { type: "stepper", value: 2, min: 1, max: 8, operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(quantifierResponse.statusCode, 400);
  assert.equal(quantifierResponse.json().message, "Total Legs In Last Duty does not support Any or Every.");

  const rangeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 130,
        name: "Total Legs In Last Duty",
        action: "avoid",
        bid: { type: "stepper-range", from: 1, to: 3, min: 1, max: 8 },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(rangeResponse.statusCode, 400);
  assert.equal(rangeResponse.json().message, "Total Legs In Last Duty requires number bid.");

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects legacy deadhead legs payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 122,
        name: "Deadhead Flying",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 2, min: 0, max: 8, operator: ">" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Deadhead Flying is invalid.");

  const oldModeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 122,
        name: "Deadhead Flying",
        action: "avoid",
        quantifier: null,
        bid: { type: "deadhead-flying", mode: "deadhead-legs", operator: ">", legs: 1 },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(oldModeResponse.statusCode, 400);

  await server.close();
});

test("POST /api/pairing-bids/current/properties rejects deadhead flying quantifiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentProperties}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 122,
        name: "Deadhead Flying",
        action: "award",
        quantifier: "any",
        bid: { type: "deadhead-flying", mode: "any-deadhead" },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Deadhead Flying does not support Any or Every.");

  await server.close();
});

test("DELETE /api/pairing-bids/current/properties/:propertyGroupKey removes a current pairing property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "DELETE",
    url: `/api${pbsPairingBidRoutes.currentPropertyByKey("pairing-property-key-1")}?periodCode=Apr%202026&draftVersion=0`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, { saved: true });

  await server.close();
});

test("PATCH /api/pairing-bids/current/properties/:propertyGroupKey patches one current pairing property", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsPairingBidRoutes.currentPropertyByKey("pairing-property-key-1")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      bidContext: "Current",
      draftVersion: 0,
      property: {
        propertyCode: 131,
        name: "Prefer Pairing Length",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 4, min: 1, max: 7 },
        tiers: ["T4", "T5"],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    saved: true,
    propertyGroupKey: "pairing-property-key-1",
    deleted: false,
    tiers: ["T4", "T5"],
  });

  await server.close();
});

test("PUT /api/pairing-bids/current rejects invalid pairing draft payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsPairingBidRoutes.current}`,
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
  assert.equal(response.json().message, "Invalid pairing draft payload.");

  const missingTiersResponse = await server.inject({
    method: "PUT",
    url: `/api${pbsPairingBidRoutes.current}`,
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
            propertyCode: 131,
            name: "Prefer Pairing Length",
            bid: {
              type: "flag",
            },
            tierLabels: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(missingTiersResponse.statusCode, 400);
  assert.equal(missingTiersResponse.json().message, "Invalid pairing draft payload.");

  await server.close();
});

test("POST /api/pairing-bids/current/favorites saves a configured pairing favorite snapshot", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentFavorites}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      draftVersion: 0,
      property: {
        propertyCode: 132,
        name: "Prefer Pairing Length",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 4, min: 1, max: 7 },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    saved: true,
    favoriteKey: "9003",
    propertyId: 132,
    propertyCode: 132,
    name: "Prefer Pairing Length",
    action: "award",
    quantifier: null,
    bid: { type: "stepper", value: 4, min: 1, max: 7 },
  });

  await server.close();
});

test("POST /api/pairing-bids/current/favorites rejects legacy favorite tiers", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsPairingBidRoutes.currentFavorites}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      draftVersion: 0,
      property: {
        propertyCode: 132,
        name: "Prefer Pairing Length",
        action: "award",
        quantifier: null,
        bid: { type: "stepper", value: 4, min: 1, max: 7 },
        tiers: ["T1"],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("PATCH /api/pairing-bids/current/favorites/by-key/:favoriteKey updates a configured pairing favorite", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "PATCH",
    url: `/api${pbsPairingBidRoutes.favoriteByKey("9003")}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      periodCode: "Apr 2026",
      draftVersion: 0,
      property: {
        propertyCode: 132,
        name: "Prefer Pairing Length",
        action: "avoid",
        quantifier: null,
        bid: { type: "stepper", value: 5, min: 1, max: 7 },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    saved: true,
    favoriteKey: "9003",
    propertyId: 132,
    propertyCode: 132,
    name: "Prefer Pairing Length",
    action: "avoid",
    quantifier: null,
    bid: { type: "stepper", value: 5, min: 1, max: 7 },
  });

  await server.close();
});

test("DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey removes a persisted pairing favorite", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "DELETE",
    url: `/api${pbsPairingBidRoutes.favoriteByKey("9002")}?periodCode=Apr%202026&draftVersion=0`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, { saved: true });

  await server.close();
});

test("DELETE /api/pairing-bids/current/favorites/:propertyCode is not a supported favorite delete path", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingBidService: mockPairingBidService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "DELETE",
    url: "/api/pairing-bids/current/favorites/132?periodCode=Apr%202026",
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 404);

  await server.close();
});
