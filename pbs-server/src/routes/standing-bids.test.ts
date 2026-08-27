import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsStandingBidRoutes } from "../../../packages/contracts/pbs-standing-bids.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsStandingBidService } from "../services/standing-bid/types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const currentPeriod = {
  id: null,
  periodCode: "Standing Bid",
  filiale: null,
  status: "OPEN",
  computedStage: "OPEN" as const,
  bidOpenAt: null,
  bidCloseAt: null,
  canEditBid: true,
  readOnlyReason: null,
};

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

const mockStandingBidService: PbsStandingBidService = {
  async getCurrentStandingBid() {
    return {
      currentPeriod,
      lineholderDraft: {
        draftKey: "100",
        bidId: 100,
        periodId: null,
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        remarks: "",
        properties: [
          {
            propertyGroupKey: "standing-lineholder-218",
            rowSeq: 1,
            bidType: "DaysOff",
            propertyCode: 218,
            name: "Day of Week Off",
            bid: { type: "select", value: "Sat", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
            tiers: ["T1"],
          },
        ],
      },
      preferOffConfig: {
        weekdays: [
          { code: "MON", name: "Monday", order: 1, isoDay: 1 },
          { code: "TUE", name: "Tuesday", order: 2, isoDay: 2 },
          { code: "WED", name: "Wednesday", order: 3, isoDay: 3 },
          { code: "THU", name: "Thursday", order: 4, isoDay: 4 },
          { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
          { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
          { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
        ],
        weekend: { available: false },
      },
      reserveDraft: {
        draftVersion: 0,
        periodId: null,
        periodCode: "STANDING",
        bidContext: "StandingReserve",
        remarks: "",
        properties: [],
      },
      propertyCatalog: {
        lineholder: [
          {
            bidType: "DaysOff",
            propertyCode: 201,
            name: "Prefer Off",
            defaultBid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
          },
          {
            bidType: "DaysOff",
            propertyCode: 218,
            name: "Day of Week Off",
            defaultBid: { type: "select", value: "Sat", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
          },
          {
            bidType: "Pairing",
            propertyCode: 168,
            name: "Airport Preference",
            defaultAction: "award",
            supportedActions: ["award", "avoid"],
            defaultBid: {
              type: "airport-preference",
              event: "landing",
              locations: [],
              dateScope: null,
              minimumLayoverDuration: null,
            },
          },
          {
            bidType: "Pairing",
            propertyCode: 428,
            name: "Efficient Flying First",
            defaultAction: "award",
            supportedActions: ["award"],
            defaultBid: { type: "efficient-flying-preference", mode: "efficient" },
          },
          {
            bidType: "Line",
            propertyCode: 429,
            name: "Credit Window Preference",
            defaultBid: {
              type: "credit-window-preference",
              direction: "more",
            },
          },
        ],
        reserve: [
          {
            bidType: "Reserve",
            propertyCode: 301,
            name: "Short Call Type",
            defaultBid: {
              type: "reserve-call-type-date-scope",
              callType: "PRAM",
              options: ["PRAM", "PRPM", "CRAM", "CRPM"],
              dateScope: { mode: "whole_month" },
            },
          },
          {
            bidType: "Reserve",
            propertyCode: 313,
            name: "Reserve Work Block Size",
            defaultBid: { type: "stepper-range", from: 3, to: 5, min: 3, max: 6 },
          },
        ],
      },
    };
  },
  async saveStandingDraft(_actor, request) {
    const current = await mockStandingBidService.getCurrentStandingBid(_actor);
    const savedDraft = {
      ...request.draft,
      draftKey: request.draft.draftKey ?? "200",
      bidId: request.draft.bidId ?? 200,
      periodId: null,
      draftVersion: request.draft.draftVersion + 1,
      periodCode: "STANDING",
    };

    return request.mode === "lineholder"
      ? { ...current, lineholderDraft: savedDraft }
      : { ...current, reserveDraft: savedDraft };
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

const buildServerWithStandingMock = async () => {
  const { buildServer } = await import("../app.js");

  return buildServer({
    authService: mockAuthService,
    standingBidService: mockStandingBidService,
    skipDatabase: true,
  });
};

test("GET /api/standing-bids/current returns Standing Bid drafts", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.currentPeriod.canEditBid, true);
  assert.equal(response.json().data.lineholderDraft.bidContext, "StandingLineholder");
  assert.equal(response.json().data.lineholderDraft.properties[0].propertyCode, 218);
  assert.deepEqual(
    response.json().data.propertyCatalog.lineholder.map((property: { propertyCode: number }) => property.propertyCode),
    [201, 218, 168, 428, 429],
  );
  assert.deepEqual(
    response.json().data.propertyCatalog.reserve.map((property: { propertyCode: number }) => property.propertyCode),
    [301, 313],
  );

  await server.close();
});

test("PUT /api/standing-bids/current saves a Standing Lineholder draft", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftKey: "100",
        bidId: 100,
        periodId: null,
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            propertyGroupKey: "standing-lineholder-218",
            rowSeq: 1,
            bidType: "DaysOff",
            propertyCode: 218,
            name: "Day of Week Off",
            bid: { type: "select", value: "Sun", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
            tiers: ["T1", "T2"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.lineholderDraft.draftVersion, 3);
  assert.deepEqual(response.json().data.lineholderDraft.properties[0].tiers, ["T1", "T2"]);

  await server.close();
});

test("PUT /api/standing-bids/current accepts Month-End Carryover bids", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftKey: "100",
        bidId: 100,
        periodId: null,
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            propertyGroupKey: "standing-lineholder-163",
            rowSeq: 1,
            bidType: "Pairing",
            propertyCode: 163,
            name: "Month-End Carryover",
            action: "award",
            bid: {
              type: "month-end-carryover",
              operator: ">",
              days: 2,
            },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("PUT /api/standing-bids/current accepts Work Day Preference weekday-only windows", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftKey: "100",
        bidId: 100,
        periodId: null,
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            propertyGroupKey: "standing-lineholder-110",
            rowSeq: 1,
            bidType: "Pairing",
            propertyCode: 110,
            name: "Work Day Preference",
            action: "award",
            bid: {
              type: "work-day-preference",
              days: [{ dayOfWeek: "THU", checkInFrom: null, checkInTo: null }],
              dateScope: null,
            },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data.lineholderDraft.properties[0].bid, {
    type: "work-day-preference",
    days: [{ dayOfWeek: "THU", checkInFrom: null, checkInTo: null }],
    dateScope: null,
  });

  await server.close();
});

test("PUT /api/standing-bids/current accepts reusable Airport and Efficient Flying bids", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftKey: "100",
        bidId: 100,
        periodId: null,
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            propertyGroupKey: "standing-lineholder-168",
            rowSeq: 1,
            bidType: "Pairing",
            propertyCode: 168,
            name: "Airport Preference",
            action: "award",
            bid: {
              type: "airport-preference",
              event: "landing",
              locations: [{ code: "YYZ", kind: "airport" }],
              dateScope: null,
              minimumLayoverDuration: null,
            },
            tiers: ["T1"],
          },
          {
            propertyGroupKey: "standing-lineholder-428",
            rowSeq: 2,
            bidType: "Pairing",
            propertyCode: 428,
            name: "Efficient Flying First",
            action: "award",
            bid: { type: "efficient-flying-preference", mode: "efficient" },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().data.lineholderDraft.properties.map((property: { propertyCode: number }) => property.propertyCode),
    [168, 428],
  );

  await server.close();
});

test("PUT /api/standing-bids/current accepts reusable Long Stretch Off without concrete dates", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftKey: "100",
        bidId: 100,
        periodId: null,
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            propertyGroupKey: "standing-lineholder-204",
            rowSeq: 1,
            bidType: "DaysOff",
            propertyCode: 204,
            name: "Long Stretch Off / Compressed Flying",
            bid: {
              type: "stepper-date-range",
              value: 8,
              from: "",
              to: "",
              min: 1,
              max: 14,
            },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data.lineholderDraft.properties[0].bid, {
    type: "stepper-date-range",
    value: 8,
    from: "",
    to: "",
    min: 1,
    max: 14,
  });

  await server.close();
});

test("PUT /api/standing-bids/current rejects half-empty Long Stretch Off date bounds", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            rowSeq: 1,
            bidType: "DaysOff",
            propertyCode: 204,
            name: "Long Stretch Off / Compressed Flying",
            bid: {
              type: "stepper-date-range",
              value: 8,
              from: "",
              to: "2026-08-10",
              min: 1,
              max: 14,
            },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("PUT /api/standing-bids/current structurally accepts concrete Long Stretch Off dates for service validation", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            rowSeq: 1,
            bidType: "DaysOff",
            propertyCode: 204,
            name: "Long Stretch Off / Compressed Flying",
            bid: {
              type: "stepper-date-range",
              value: 8,
              from: "2026-08-01",
              to: "2026-08-10",
              min: 1,
              max: 14,
            },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

for (const action of ["award", "avoid"] as const) {
  test(`PUT /api/standing-bids/current accepts Line Reserve action ${action}`, async () => {
    const server = await buildServerWithStandingMock();

    const response = await server.inject({
      method: "PUT",
      url: `/api${pbsStandingBidRoutes.current}`,
      headers: {
        authorization: `Bearer ${buildAuthToken()}`,
      },
      payload: {
        mode: "lineholder",
        draft: {
          draftVersion: 2,
          periodCode: "STANDING",
          bidContext: "StandingLineholder",
          properties: [
            {
              rowSeq: 1,
              bidType: "Line",
              propertyCode: 427,
              name: "Reserve",
              action,
              bid: { type: "flag" },
              tiers: ["T1"],
            },
          ],
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data.lineholderDraft.properties[0].bid, {
      type: "flag",
    });
    assert.equal(response.json().data.lineholderDraft.properties[0].action, action);

    await server.close();
  });
}

test("PUT /api/standing-bids/current rejects Line Reserve without explicit action", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            rowSeq: 1,
            bidType: "Line",
            propertyCode: 427,
            name: "Reserve",
            bid: { type: "flag" },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("PUT /api/standing-bids/current rejects legacy Reserve Avoidance payload", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "lineholder",
      draft: {
        draftVersion: 2,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [
          {
            rowSeq: 1,
            bidType: "Line",
            propertyCode: 427,
            name: "Reserve",
            action: "avoid",
            bid: { type: "reserve-avoidance", mode: "no_matter_what" },
            tiers: ["T1"],
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});

test("PUT /api/standing-bids/current rejects mismatched Standing mode and context", async () => {
  const server = await buildServerWithStandingMock();

  const response = await server.inject({
    method: "PUT",
    url: `/api${pbsStandingBidRoutes.current}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      mode: "reserve",
      draft: {
        draftVersion: 0,
        periodCode: "STANDING",
        bidContext: "StandingLineholder",
        properties: [],
      },
    },
  });

  assert.equal(response.statusCode, 400);

  await server.close();
});
