import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsUserRoutes } from "../../../packages/contracts/pbs-search-pairings.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsUserService } from "../services/pbs-user/types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

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

test("GET /api/pbs-users/crew-options returns matching PBS user crew options", async () => {
  const calls: Array<{
    actor: { crewId: string; userCode: string; isAdmin?: boolean };
    request: { query?: string; limit?: number };
  }> = [];
  const pbsUserService: PbsUserService = {
    async searchCrewOptions(actor, request) {
      calls.push({ actor, request });

      return {
        query: request.query?.trim().toUpperCase() ?? "",
        limit: request.limit ?? 20,
        options: [
          {
            value: "762",
            label: "Carolyn Susan Ann Alves",
            crewId: "762",
            userName: "Carolyn Susan Ann Alves",
            userCode: "762",
            base: "YEG",
            rank: "FA",
            division: "C",
          },
        ],
      };
    },
  };
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pbsUserService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsUserRoutes.crewOptions}?query=car&limit=10`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    actor: {
      crewId: "F8030",
      userCode: "casey.crew",
      isAdmin: false,
    },
    request: { query: "car", limit: 10 },
  }]);
  assert.deepEqual(response.json().data, {
    query: "CAR",
    limit: 10,
    options: [
      {
        value: "762",
        label: "Carolyn Susan Ann Alves",
        crewId: "762",
        userName: "Carolyn Susan Ann Alves",
        userCode: "762",
        base: "YEG",
        rank: "FA",
        division: "C",
      },
    ],
  });

  await server.close();
});

test("GET /api/pbs-users/crew-options requires a bearer token", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsUserRoutes.crewOptions}?query=car`,
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Authentication required. Please login first.");

  await server.close();
});
