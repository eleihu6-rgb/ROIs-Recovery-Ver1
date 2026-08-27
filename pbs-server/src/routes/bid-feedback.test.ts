import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsBidFeedbackRoutes } from "../../../packages/contracts/pbs-bid-feedback.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsBidFeedbackService } from "../services/bid-feedback/types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const authService: PbsAuthService = {
  async login() { throw new Error("not used"); },
  async logout() { return; },
  getSessionFromPayload(payload) {
    return { authMode: payload.authMode, user: { id: payload.id, name: payload.name, employeeNo: payload.employeeNo } };
  },
};

const token = jwt.sign({
  id: "1",
  name: "crew",
  employeeNo: "1001",
  userCode: "crew",
  userName: "Crew User",
  authMode: "password",
}, process.env.JWT_SECRET);

const bidFeedbackService: PbsBidFeedbackService = {
  async getCurrentConflicts(actor) {
    assert.equal(actor.crewId, "1001");
    return {
      draftVersion: "2:2:2:1",
      generatedAt: "2026-08-10T00:00:00.000Z",
      conflictCount: 1,
      advisoryCount: 0,
      conflicts: [{ code: "A1", stableKey: "A1:test", severity: "conflict", title: "Conflict", message: "Award and Avoid overlap." }],
    };
  },
  async getCurrentFeedback() {
    return {
      crewId: "1001",
      currentPeriod: { id: 6, rosterPeriodId: 6, periodCode: "Jun 2026", computedStage: "OPEN", canEditBid: true, readOnlyReason: null },
      timezoneLabel: "YYZ Local Time",
      eligibilityLabel: "Eligible on available checks",
      draftVersion: "2:2:2:1",
      generatedAt: "2026-08-10T00:00:00.000Z",
      conflictCount: 0,
      advisoryCount: 0,
      conflicts: [],
      pairings: [],
      daysOff: [],
    };
  },
  async getCurrentEligibility(actor, input) {
    assert.equal(actor.crewId, "1001");
    assert.deepEqual(input.pairingIds, ["13335", "13336"]);
    return {
      draftVersion: "2:2:2:1",
      generatedAt: "2026-08-10T00:00:01.000Z",
      eligibilityLabel: "Eligibility based on PBS ruleset \"Test Ruleset\".",
      pairings: [{
        pairingId: "13335",
        eligibility: {
          status: "eligible",
          checked: ["rule_engine"],
          unavailable: [],
          reasons: [],
        },
      }],
    };
  },
  async startEligibilityRun(actor, input) {
    assert.equal(actor.crewId, "1001");
    assert.deepEqual(input.pairingIds, ["13335", "13336"]);
    return {
      runId: "run-test-1",
      status: "computing",
      draftVersion: "2:2:2:1",
      eligibilityLabel: "Eligibility based on PBS ruleset \"Test Ruleset\".",
    };
  },
  async getEligibilityRun(runId) {
    assert.equal(runId, "run-test-1");
    return {
      runId,
      status: "done",
      eligibilityLabel: "Eligibility based on PBS ruleset \"Test Ruleset\".",
      pairings: [{
        pairingId: "13335",
        eligibility: {
          status: "eligible",
          checked: ["rule_engine"],
          unavailable: [],
          reasons: [],
        },
      }],
    };
  },
};

test("GET Bid Feedback routes return authenticated crew feedback", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({ authService, bidFeedbackService, skipDatabase: true });

  const conflicts = await server.inject({
    method: "GET",
    url: `/api${pbsBidFeedbackRoutes.conflicts}`,
    headers: { authorization: `Bearer ${token}` },
  });
  const feedback = await server.inject({
    method: "GET",
    url: `/api${pbsBidFeedbackRoutes.current}`,
    headers: { authorization: `Bearer ${token}` },
  });
  const eligibility = await server.inject({
    method: "GET",
    url: `/api${pbsBidFeedbackRoutes.eligibility}?pairingIds=13335,13336`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(conflicts.statusCode, 200);
  assert.equal(conflicts.json().data.conflictCount, 1);
  assert.equal(feedback.statusCode, 200);
  assert.equal(feedback.headers["cache-control"], "private, no-cache");
  assert.ok(feedback.headers.etag);
  assert.equal(feedback.json().data.currentPeriod.periodCode, "Jun 2026");
  assert.equal(eligibility.statusCode, 200);
  assert.equal(eligibility.headers["cache-control"], "private, no-cache");
  assert.equal(eligibility.json().data.status, "computing");
  assert.equal(eligibility.json().data.runId, "run-test-1");

  const runResult = await server.inject({
    method: "GET",
    url: `/api${pbsBidFeedbackRoutes.eligibilityRun.replace(":runId", "run-test-1")}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(runResult.statusCode, 200);
  assert.equal(runResult.json().data.pairings[0].eligibility.status, "eligible");

  const invalidEligibility = await server.inject({
    method: "GET",
    url: `/api${pbsBidFeedbackRoutes.eligibility}?pairingIds=not-a-number`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(invalidEligibility.statusCode, 400);
  await server.close();
});
