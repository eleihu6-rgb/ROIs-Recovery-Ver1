import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsLineholderBidRoutes } from "../../../packages/contracts/pbs-lineholder-summary.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsLineholderSummaryService } from "../services/lineholder/types.js";

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

const mockLineholderSummaryService: PbsLineholderSummaryService = {
  async getCurrentSummary() {
    return {
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      statistics: [
        {
          tier: "T1",
          totalItems: 3,
          pairingCount: 1,
          lineCount: 1,
          daysOffCount: 0,
        },
      ],
      summaryItems: [
        {
          id: "pairing-1",
          groupKey: "pairing-key-1",
          bidType: "Pairing",
          action: "Award",
          label: "Prefer Pairing Length",
          bid: "3",
          value: "3",
          readableText: "Award Prefer Pairing Length: 3",
          tiers: ["T1"],
          editableSource: {
            module: "Pairing",
            propertyGroupKey: "pairing-key-1",
          },
          conditions: [
            {
              id: "condition-1",
              label: "Pairing Check-In Time",
              operator: "<",
              value: "12:00",
              connector: "AND",
            },
          ],
        },
      ],
      diagnostics: [
        {
          id: "duplicate-across-tier-pairing-1",
          code: "duplicateAcrossTier",
          severity: "info",
          message: "Review whether this bid should apply to multiple Tx.",
          tiers: ["T1", "T2"],
          groupKey: "pairing-key-1",
          itemIds: ["pairing-1"],
        },
      ],
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

test("GET /api/lineholder-bids/current/summary returns the current lineholder draft summary", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    lineholderSummaryService: mockLineholderSummaryService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsLineholderBidRoutes.summary}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.ok(response.headers.etag);
  assert.equal(response.json().data.statistics[0].tier, "T1");
  assert.equal(response.json().data.summaryItems[0].bidType, "Pairing");
  assert.equal(response.json().data.summaryItems[0].readableText, "Award Prefer Pairing Length: 3");
  assert.deepEqual(response.json().data.summaryItems[0].editableSource, {
    module: "Pairing",
    propertyGroupKey: "pairing-key-1",
  });
  assert.equal(response.json().data.summaryItems[0].conditions[0].connector, "AND");
  assert.equal(response.json().data.diagnostics[0].code, "duplicateAcrossTier");

  await server.close();
});
