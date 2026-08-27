import test from "node:test";
import assert from "node:assert/strict";
import { constants, publicEncrypt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import {
  pbsAuthRoutes,
  type PbsLoginRequest,
  type PbsPasswordPublicKeyResponse,
} from "../../packages/contracts/pbs-auth.js";
import { pbsPairingBidRoutes } from "../../packages/contracts/pbs-pairing-bids.js";
import type { PbsAuthService } from "./services/auth/types.js";
import type { PbsPairingBidService } from "./services/pairing/types.js";

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
    return { airports: [], cities: [] };
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
        },
      ],
      recommendedPropertyCodes: [102, 168, 103, 107, 110],
    };
  },
  async saveCurrentDraft(actor, request) {
    assert.equal(actor.crewId, "F8030");
    assert.equal(request.draft.bidContext, "Current");
    return { saved: true, draftVersion: request.draft.draftVersion + 1 };
  },
  async addCurrentDraftProperty(actor, request) {
    assert.equal(actor.crewId, "F8030");
    assert.equal(request.bidContext, "Current");
    assert.equal(request.draftVersion, 0);
    return { saved: true, propertyGroupKey: "pairing-property-key-new", rowSeq: 2 };
  },
  async removeCurrentDraftProperty(actor, propertyGroupKey, reference) {
    assert.equal(actor.crewId, "F8030");
    assert.equal(propertyGroupKey, "pairing-property-key-1");
    assert.deepEqual(reference, { periodCode: "Apr 2026", draftVersion: 0 });
    return { saved: true };
  },
  async patchCurrentDraftProperty(actor, propertyGroupKey, request) {
    assert.equal(actor.crewId, "F8030");
    assert.equal(propertyGroupKey, "pairing-property-key-1");
    assert.equal(request.draftVersion, 0);
    return { saved: true, propertyGroupKey, deleted: false, tiers: request.property.tiers };
  },
  async saveConfiguredFavoriteProperty() {
    return {
      saved: true,
      favoriteKey: "9003",
      propertyId: 132,
      propertyCode: 132,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 3, min: 1, max: 7 },
    };
  },
  async patchFavoritePropertyByKey(actor, favoriteKey, request) {
    assert.equal(actor.crewId, "F8030");
    assert.equal(favoriteKey, "9003");
    assert.equal(request.draftVersion, 0);
    return {
      saved: true,
      favoriteKey,
      propertyId: 132,
      propertyCode: 132,
      name: "Prefer Pairing Length",
      action: request.property.action,
      quantifier: request.property.quantifier,
      bid: request.property.bid,
    };
  },
  async removeFavoritePropertyByKey() {
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
    isAdmin: false,
    tokenVersion: 1,
  }, process.env.JWT_SECRET ?? "test-secret");

const getPasswordPublicKey = async (
  server: FastifyInstance,
): Promise<PbsPasswordPublicKeyResponse> => {
  const response = await server.inject({
    method: "GET",
    url: `/api${pbsAuthRoutes.passwordPublicKey}`,
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { data: PbsPasswordPublicKeyResponse };
  assert.equal(body.data.algorithm, "RSA-OAEP-256");
  assert.ok(body.data.keyId);
  assert.match(body.data.publicKeyPem, /BEGIN PUBLIC KEY/);
  return body.data;
};

const encryptPasswordForTest = (
  publicKey: PbsPasswordPublicKeyResponse,
  password: string,
): string => {
  return publicEncrypt(
    {
      key: publicKey.publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(password, "utf8"),
  ).toString("base64");
};

const buildEncryptedLoginPayload = async (
  server: FastifyInstance,
  userCode: string,
  password: string,
): Promise<PbsLoginRequest> => {
  const publicKey = await getPasswordPublicKey(server);

  return {
    userCode,
    encryptedPassword: encryptPasswordForTest(publicKey, password),
    encryption: {
      algorithm: publicKey.algorithm,
      keyId: publicKey.keyId,
    },
  };
};

test("legacy crew bid import routes are not registered", async () => {
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/admin/crew-bid-imports/dry-run",
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 404);

  await server.close();
});

test("GET /api/auth/password-public-key returns the RSA login public key", async () => {
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsAuthRoutes.passwordPublicKey}`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json().data.algorithm, "RSA-OAEP-256");
  assert.ok(response.json().data.keyId);
  assert.match(response.json().data.publicKeyPem, /BEGIN PUBLIC KEY/);

  await server.close();
});

test("POST /api/auth/session returns the JWT payload for valid credentials", async () => {
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsAuthRoutes.session}`,
    payload: await buildEncryptedLoginPayload(server, "casey.crew", "super-secret"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    code: 200,
    data: {
      token: "jwt-token",
      authMode: "password",
      user: {
        id: "1",
        name: "casey.crew",
        employeeNo: "F8030",
      },
    },
    message: "ok",
  });

  await server.close();
});

test("POST /api/auth/session rejects plaintext password payloads", async () => {
  let loginCalls = 0;
  const rejectingAuthService: PbsAuthService = {
    ...mockAuthService,
    async login(userCode, password, context) {
      loginCalls += 1;
      return mockAuthService.login(userCode, password, context);
    },
  };
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: rejectingAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsAuthRoutes.session}`,
    payload: {
      userCode: "casey.crew",
      password: "super-secret",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "User code and encrypted password are required.");
  assert.equal(loginCalls, 0);

  await server.close();
});

test("POST /api/auth/session rejects encrypted payloads with the wrong key id", async () => {
  let loginCalls = 0;
  const rejectingAuthService: PbsAuthService = {
    ...mockAuthService,
    async login(userCode, password, context) {
      loginCalls += 1;
      return mockAuthService.login(userCode, password, context);
    },
  };
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: rejectingAuthService,
    skipDatabase: true,
  });
  const payload = await buildEncryptedLoginPayload(server, "casey.crew", "super-secret");

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsAuthRoutes.session}`,
    payload: {
      ...payload,
      encryption: {
        ...payload.encryption,
        keyId: "old-key",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid encrypted login request.");
  assert.equal(loginCalls, 0);

  await server.close();
});

test("GET /api/pairing-bids/current returns the current pairing draft for the authenticated user", async () => {
  const { buildServer } = await import("./app.js");
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

test("PUT /api/pairing-bids/current saves the pairing draft payload for the authenticated user", async () => {
  const { buildServer } = await import("./app.js");
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

test("POST /api/pairing-bids/current/properties adds a current pairing property for the authenticated user", async () => {
  const { buildServer } = await import("./app.js");
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

test("DELETE /api/pairing-bids/current/properties/:propertyGroupKey removes a current pairing property for the authenticated user", async () => {
  const { buildServer } = await import("./app.js");
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

test("PUT /api/pairing-bids/current rejects invalid pairing draft payloads", async () => {
  const { buildServer } = await import("./app.js");
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

  await server.close();
});

test("POST /api/pairing-bids/current/favorites saves a configured pairing favorite for the authenticated user", async () => {
  const { buildServer } = await import("./app.js");
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
        bid: { type: "stepper", value: 3, min: 1, max: 7 },
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
    bid: { type: "stepper", value: 3, min: 1, max: 7 },
  });

  await server.close();
});

test("PATCH /api/pairing-bids/current/favorites/by-key/:favoriteKey updates a configured pairing favorite", async () => {
  const { buildServer } = await import("./app.js");
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

test("DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey removes a persisted pairing favorite for the authenticated user", async () => {
  const { buildServer } = await import("./app.js");
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

test("POST /api/auth/login remains available as a compatibility login endpoint", async () => {
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsAuthRoutes.legacyLogin}`,
    payload: await buildEncryptedLoginPayload(server, "casey.crew", "super-secret"),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.user.name, "casey.crew");

  await server.close();
});

test("GET /api/auth/session requires a bearer token", async () => {
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/auth/session",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Authentication required. Please login first.");

  await server.close();
});

test("GET /api/auth/session rejects revoked bearer tokens after auth service validation", async () => {
  const validatingAuthService: PbsAuthService = {
    ...mockAuthService,
    async validatePayload() {
      const error = new Error("Token expired or invalid. Please login again.");
      Object.assign(error, { statusCode: 401 });
      throw error;
    },
  };
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: validatingAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Token expired or invalid. Please login again.");

  await server.close();
});

test("DELETE /api/auth/session calls the auth service logout hook", async () => {
  let logoutCalls = 0;
  const logoutAuthService: PbsAuthService = {
    ...mockAuthService,
    async logout(payload) {
      logoutCalls += 1;
      assert.equal(payload.userCode, "casey.crew");
    },
  };
  const { buildServer } = await import("./app.js");
  const server = await buildServer({
    authService: logoutAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "DELETE",
    url: "/api/auth/session",
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, { loggedOut: true });
  assert.equal(logoutCalls, 1);

  await server.close();
});

test("GET /metrics uses metrics token auth instead of PBS user JWT auth", async () => {
  const { env } = await import("./config/env.js");
  const { buildServer } = await import("./app.js");
  const originalToken = env.METRICS_TOKEN;
  const token = "app-metrics-test-token";
  env.METRICS_TOKEN = token;
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  try {
    const missing = await server.inject({
      method: "GET",
      url: "/metrics",
    });

    assert.equal(missing.statusCode, 403);

    const withMetricsToken = await server.inject({
      method: "GET",
      url: "/metrics",
      headers: {
        "x-metrics-token": token,
      },
    });

    assert.equal(withMetricsToken.statusCode, 200);
    assert.match(withMetricsToken.body, /rois_pbs_server_process_cpu_user_seconds_total/);
  } finally {
    env.METRICS_TOKEN = originalToken;
    await server.close();
  }
});
