import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { pbsSearchPairingRoutes } from "../../../packages/contracts/pbs-search-pairings.js";
import type { PbsAuthService } from "../services/auth/types.js";
import type { PbsPairingSearchService } from "../services/pairing-search/types.js";

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

const mockPairingSearchService: PbsPairingSearchService = {
  async matchFeedbackPairings() {
    return [];
  },

  async getTimeBetweenFlightsBounds() {
    return { minimumMinutes: 45, maximumMinutes: 260 };
  },

  async searchPairingIds(_actor, request) {
    return {
      query: request.query?.trim().toUpperCase() ?? "",
      rosterPeriodId: request.rosterPeriodId,
      limit: request.limit ?? 20,
      options: [
        {
          value: "M4959",
          label: "M4959 (2026-02-24 - 2026-03-02)",
          pairingId: "4959",
          pairingLabel: "M4959",
          startDate: "2026-02-24",
          endDate: "2026-03-02",
        },
      ],
    };
  },

  async getPairingNumberFilterOptions(_actor, request) {
    return {
      query: request.query?.trim().toUpperCase() ?? "",
      rosterPeriodId: request.rosterPeriodId,
      periodCode: request.periodCode,
      limit: request.limit ?? 30,
      options: [
        { value: "M4959", label: "M4959" },
        { value: "V4146", label: "V4146" },
      ],
      nextCursor: null,
      totalCount: 2,
    };
  },

  async searchCrewIds(_actor, request) {
    return {
      query: request.query?.trim().toUpperCase() ?? "",
      limit: request.limit ?? 20,
      options: [
        {
          value: "5510",
          label: "5510 - Peter Adams",
          crewId: "5510",
          firstName: "Peter",
          lastName: "Adams",
        },
      ],
    };
  },

  async searchFlightNumbers(_actor, request) {
    return {
      query: request.query?.trim().toUpperCase() ?? "",
      limit: request.limit ?? 20,
      options: [
        {
          value: "1993",
          label: "1993",
        },
      ],
    };
  },

  async searchPairingOccurrences(_actor, request) {
    return {
      pairingNumber: "M4959",
      rosterPeriodId: request.rosterPeriodId,
      periodCode: request.periodCode,
      occurrences: [
        {
          occurrenceId: "11:2026-04-03",
          pairingNumber: "M4959",
          pairingId: "11",
          originDate: "2026-04-03",
          startDate: "2026-04-03",
          endDate: "2026-04-05",
          label: "M4959 · 2026-04-03",
        },
      ],
    };
  },

  async searchPairingOccurrencesByDate(_actor, request) {
    return {
      originDate: request.originDate,
      rosterPeriodId: request.rosterPeriodId,
      periodCode: request.periodCode,
      occurrences: [
        {
          occurrenceId: "12:2026-04-04",
          pairingNumber: "V4146",
          pairingId: "12",
          originDate: "2026-04-04",
          startDate: "2026-04-04",
          endDate: "2026-04-06",
          label: "V4146 · 2026-04-04",
        },
      ],
    };
  },

  async getPairingDetails(_actor, request) {
    return {
      results: request.targets.map((target) => ({
        id: target.pairingId,
        pairingId: target.pairingId,
        pairingNumber: target.pairingId === "11" ? "M4959" : "V4146",
        base: "YYZ",
        originDate: target.originDate ?? "2026-04-03",
        endDate: target.originDate ?? "2026-04-03",
        endDateLabel: "Apr 3, 2026",
        reportTime: "0630",
        releaseTime: "1830",
        durationDays: 3,
        routeLabel: "YYZ-YVR-YYZ",
        priorityLabel: "P3",
        prioritySequence: "02",
        totalBlock: "0550",
        totalCredit: "550",
        totalPay: "550",
        activeDates: target.originDate ? [target.originDate] : ["2026-04-03", "2026-04-10"],
        legs: [],
      })),
    };
  },

  async previewPairings(_actor, request) {
    const preview = request.preview;

    return {
      ...("property" in preview
        ? {
            mode: "single_property_preview" as const,
            property: preview.property,
          }
        : preview.mode === "current_rules"
          ? {
            mode: "current_rules_preview" as const,
            tier: preview.tier,
            properties: preview.properties,
          }
          : preview.mode === "all_pairings"
            ? {
              mode: "all_pairings_preview" as const,
            }
          : {
            mode: "criteria_preview" as const,
            properties: preview.properties,
          }),
      summary: {
        pairingIdCount: 1,
        totalItems: 1,
      },
      pagination: {
        page: preview.page ?? 1,
        pageSize: preview.pageSize ?? 30,
        totalItems: 1,
        totalPages: 1,
      },
      results: [
        {
          id: "11",
          pairingId: "11",
          pairingNumber: "M4959",
          base: "YYZ",
          originDate: "2026-04-03",
          endDate: "2026-04-05",
          endDateLabel: "Apr 5, 2026",
          reportTime: "0630",
          releaseTime: "1830",
          durationDays: 3,
          routeLabel: "YYZ-YVR-YYZ",
          priorityLabel: "P3",
          prioritySequence: "02",
          totalBlock: "0550",
          totalCredit: "550",
          totalPay: "550",
          activeDates: ["2026-04-03", "2026-04-10"],
          legs: [
            {
              id: "11-1-1",
              day: 1,
              dutyDate: "0403",
              dutyFdp: "0830",
              dutyFlyingHour: "0550",
              dutyHour: "0930",
              dutyCredit: "0730",
              flightNumber: "1993",
              departureStation: "CLT",
              arrivalStation: "LAX",
              departureTime: "0730",
              arrivalTime: "1020",
              blockTime: "0550",
              equipment: "320",
            },
          ],
        },
      ],
    };
  },

  async countCurrentRules(_actor, request) {
    return {
      mode: "current_rules_counts" as const,
      periodCode: request.periodCode,
      tier: request.tier,
      computedAt: "2026-06-11T00:00:00.000Z",
      summary: {
        activePropertyCount: request.properties.length,
        allRules: request.properties.length > 0
          ? {
            pairingIdCount: 5,
            totalItems: 8,
          }
          : null,
      },
      rows: request.properties.map((property, index) => ({
        propertyGroupKey: property.propertyGroupKey ?? `row-${property.rowSeq}`,
        rowSeq: property.rowSeq,
        propertyCode: property.propertyCode,
        name: property.name,
        rule: {
          pairingIdCount: 10 - index,
          totalItems: 20 - index,
        },
        funnel: {
          pairingIdCount: 5,
          totalItems: 8,
        },
      })),
    };
  },

  async countCurrentRuleTierPools(_actor, request) {
    return {
      mode: "current_rules_tier_pools" as const,
      periodCode: request.periodCode,
      computedAt: "2026-06-22T00:00:00.000Z",
      packageTotal: {
        pairingIdCount: 100,
        totalItems: 120,
      },
      rows: request.tiers.map((tier, index) => ({
        tier,
        activePropertyCount: request.properties.length,
        txSet: {
          pairingIdCount: 20 - index,
          totalItems: 30 - index,
        },
        totalPairings: {
          pairingIdCount: 20 + index,
          totalItems: 30 + index,
        },
        pairingsByTx: {
          pairingIdCount: index === 0 ? 20 : 5,
          totalItems: index === 0 ? 30 : 7,
        },
        status: "success" as const,
      })),
    };
  },

  async getAirportOptions() {
    return {
      airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
      airportPreferenceOptions: [],
      filterAirports: ["LAX", "SFO", "YVR", "YYC"],
      landingAirports: ["YVR", "YYC"],
      layoverAirports: ["LAX", "SFO"],
      workStartStations: ["YVR"],
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
    isAdmin: false,
    tokenVersion: 1,
  }, process.env.JWT_SECRET ?? "test-secret");

test("GET /api/pairing-search/pairing-ids returns matching live pairing number options", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.pairingIds}?rosterPeriodId=38&query=m49&limit=10`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.query, "M49");
  assert.equal(response.json().data.limit, 10);
  assert.equal(response.json().data.options[0].value, "M4959");
  assert.equal(response.json().data.options[0].pairingLabel, "M4959");

  await server.close();
});

test("GET /api/pairing-search/pairing-number-filter-options supports an empty query page", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.pairingNumberFilterOptions}?rosterPeriodId=38&periodCode=Jun%202026&limit=30`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.query, "");
  assert.equal(response.json().data.totalCount, 2);
  assert.equal(response.json().data.options[0].value, "M4959");

  const invalidResponse = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.pairingNumberFilterOptions}?limit=30`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
  });

  assert.equal(invalidResponse.statusCode, 400);
  await server.close();
});

test("GET /api/pairing-search/time-between-flights-bounds returns actor-scoped duration bounds", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.timeBetweenFlightsBounds}?rosterPeriodId=38&periodCode=Jun%202026`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, { minimumMinutes: 45, maximumMinutes: 260 });

  await server.close();
});

test("GET /api/pairing-search/crew-ids returns matching crew id options", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.crewIds}?query=pet&limit=10`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.query, "PET");
  assert.equal(response.json().data.limit, 10);
  assert.equal(response.json().data.options[0].value, "5510");
  assert.equal(response.json().data.options[0].label, "5510 - Peter Adams");

  await server.close();
});

test("GET /api/pairing-search/flight-numbers returns matching flight number options", async () => {
  let capturedType: string | undefined;
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: {
      ...mockPairingSearchService,
      async searchFlightNumbers(_actor, request) {
        capturedType = request.type;

        return {
          query: request.query?.trim().toUpperCase() ?? "",
          limit: request.limit ?? 20,
          options: [
            {
              value: request.type === "positioning-charter-network" ? "9900" : "1993",
              label: request.type === "positioning-charter-network" ? "9900" : "1993",
            },
          ],
        };
      },
    },
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.flightNumbers}?query=99&limit=10&type=positioning-charter-network`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.query, "99");
  assert.equal(response.json().data.limit, 10);
  assert.equal(response.json().data.options[0].value, "9900");
  assert.equal(capturedType, "positioning-charter-network");

  await server.close();
});

test("GET /api/pairing-search/flight-numbers rejects unsupported type filters", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.flightNumbers}?query=70&type=acmi`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid flight number search query.");

  await server.close();
});

test("GET /api/pairing-search/pairing-occurrences returns current-period pairing runs", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.pairingOccurrences}?rosterPeriodId=38&pairingId=11&periodCode=Apr%202026`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.pairingNumber, "M4959");
  assert.equal(response.json().data.periodCode, "Apr 2026");
  assert.equal(response.json().data.occurrences[0].originDate, "2026-04-03");

  await server.close();
});

test("GET /api/pairing-search/pairing-occurrences/by-date returns pairing runs for an origin date", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "GET",
    url: `/api${pbsSearchPairingRoutes.pairingOccurrencesByDate}?rosterPeriodId=38&originDate=2026-04-04&periodCode=Apr%202026`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.originDate, "2026-04-04");
  assert.equal(response.json().data.periodCode, "Apr 2026");
  assert.equal(response.json().data.occurrences[0].pairingNumber, "V4146");

  await server.close();
});

test("POST /api/pairing-search/pairing-details returns details for calendar pairing targets", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.pairingDetails}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      targets: [
        {
          pairingId: "11",
          originDate: "2026-04-03",
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.results[0].pairingId, "11");
  assert.equal(response.json().data.results[0].pairingNumber, "M4959");

  await server.close();
});

test("POST /api/pairing-search/pairing-details rejects invalid detail payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.pairingDetails}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      targets: [
        {
          pairingId: "M4959",
          originDate: "2026-04-03",
        },
      ],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid pairing details payload.");

  await server.close();
});

test("POST /api/pairing-search/preview previews a single pairing property search", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      preview: {
        property: {
          propertyCode: 150,
          name: "Layover at City",
          action: "award",
          quantifier: "any",
          bid: {
            type: "tag-list",
            values: ["YYZ"],
          },
        },
        page: 1,
        pageSize: 30,
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.mode, "single_property_preview");
  assert.equal(response.json().data.property.propertyCode, 150);
  assert.equal(response.json().data.summary.totalItems, 1);
  assert.equal(response.json().data.results[0].pairingId, "11");
  assert.equal(response.json().data.results[0].pairingNumber, "M4959");

  await server.close();
});

test("POST /api/pairing-search/preview accepts Month-End Carryover bids", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Jun 2026",
      preview: {
        property: {
          propertyCode: 163,
          name: "Month-End Carryover",
          action: "award",
          quantifier: null,
          bid: {
            type: "month-end-carryover",
            operator: "Between",
            from: 2,
            to: 4,
          },
        },
        page: 1,
        pageSize: 30,
      },
    },
  });

  assert.equal(response.statusCode, 200);

  await server.close();
});

test("POST /api/pairing-search/preview rejects invalid search preview payloads", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      preview: {
        property: {
          propertyCode: 0,
          name: "",
          bid: {
            type: "text",
            value: "",
          },
        },
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "Invalid pairing search preview payload.");

  await server.close();
});

test("POST /api/pairing-search/preview previews current pairing rules for one tier", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "current_rules",
        tier: "T4",
        properties: [
          {
            propertyGroupKey: "property-1",
            rowSeq: 1,
            propertyCode: 131,
            name: "Prefer Pairing Length",
            action: null,
            quantifier: null,
            bid: { type: "stepper", value: 3, min: 1, max: 7 },
            tiers: ["T4"],
          },
        ],
        page: 1,
        pageSize: 30,
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.mode, "current_rules_preview");
  assert.equal(response.json().data.tier, "T4");
  assert.equal(response.json().data.properties[0].propertyCode, 131);

  await server.close();
});

test("POST /api/pairing-search/current-rules/counts returns rule and funnel counts", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.currentRulesCounts}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      tier: "T4",
      properties: [
        {
          propertyGroupKey: "property-1",
          rowSeq: 1,
          propertyCode: 131,
          name: "Prefer Pairing Length",
          action: null,
          quantifier: null,
          bid: { type: "stepper", value: 3, min: 1, max: 7 },
          tiers: ["T4"],
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.mode, "current_rules_counts");
  assert.equal(response.json().data.tier, "T4");
  assert.equal(response.json().data.summary.allRules.pairingIdCount, 5);
  assert.equal(response.json().data.rows[0].propertyGroupKey, "property-1");
  assert.equal(response.json().data.rows[0].rule.totalItems, 20);
  assert.equal(response.json().data.rows[0].funnel.totalItems, 8);

  await server.close();
});

test("POST /api/pairing-search/current-rules/tier-pools returns AA-style tier pool counts", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.currentRulesTierPools}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      tiers: ["T1", "T2"],
      properties: [
        {
          propertyGroupKey: "property-1",
          rowSeq: 1,
          propertyCode: 131,
          name: "Prefer Pairing Length",
          action: null,
          quantifier: null,
          bid: { type: "stepper", value: 3, min: 1, max: 7 },
          tiers: ["T1", "T2"],
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.mode, "current_rules_tier_pools");
  assert.equal(response.json().data.packageTotal.pairingIdCount, 100);
  assert.equal(response.json().data.rows[0].tier, "T1");
  assert.equal(response.json().data.rows[0].totalPairings.pairingIdCount, 20);
  assert.equal(response.json().data.rows[1].pairingsByTx.pairingIdCount, 5);

  await server.close();
});

test("POST /api/pairing-search/preview previews ad-hoc search criteria", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "criteria",
        properties: [
          {
            propertyGroupKey: "criteria-pairing-id",
            rowSeq: 1,
            propertyCode: 102,
            name: "Pairing Number",
            action: null,
            quantifier: null,
            bid: { type: "pairing-id-list", pairingIds: ["11"] },
            tiers: ["T1"],
          },
        ],
        page: 1,
        pageSize: 30,
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.mode, "criteria_preview");
  assert.equal(response.json().data.properties[0].propertyCode, 102);

  await server.close();
});

test("POST /api/pairing-search/preview previews all visible pairings", async () => {
  const { buildServer } = await import("../app.js");
  let capturedPairingScope: string | undefined;
  let capturedPairingNumbers: string[] | undefined;
  let capturedAirports: string[] | undefined;
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: {
      ...mockPairingSearchService,
      async previewPairings(actor, request) {
        if ("mode" in request.preview && request.preview.mode === "all_pairings") {
          capturedPairingScope = request.preview.filters?.pairingScope;
          capturedPairingNumbers = request.preview.filters?.pairingNumbers;
          capturedAirports = request.preview.filters?.airports;
        }

        return mockPairingSearchService.previewPairings(actor, request);
      },
    },
    skipDatabase: true,
  });

  const response = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: {
      authorization: `Bearer ${buildAuthToken()}`,
    },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        page: 2,
        pageSize: 15,
        filters: {
          pairingScope: "fly",
          pairingNumber: "M49",
          pairingNumbers: [" M4959 ", "V4146"],
          originDateFrom: "2026-04-03",
          originDateTo: "2026-04-05",
          airport: "YVR",
          airports: [" yvr ", "YYC"],
          timeFrom: "06:00",
          timeTo: "12:00",
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.mode, "all_pairings_preview");
  assert.equal(response.json().data.pagination.page, 2);
  assert.equal(response.json().data.pagination.pageSize, 15);
  assert.equal(response.json().data.results[0].pairingNumber, "M4959");
  assert.equal(capturedPairingScope, "fly");
  assert.deepEqual(capturedPairingNumbers, ["M4959", "V4146"]);
  assert.deepEqual(capturedAirports, ["YVR", "YYC"]);

  await server.close();
});

test("POST /api/pairing-search/preview rejects invalid all-pairings filters", async () => {
  const { buildServer } = await import("../app.js");
  const server = await buildServer({
    authService: mockAuthService,
    pairingSearchService: mockPairingSearchService,
    skipDatabase: true,
  });

  const invalidTimeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { releaseTimeFrom: "25:00" },
      },
    },
  });
  const overnightTimeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { timeFrom: "15:53", timeTo: "08:59" },
      },
    },
  });
  const tooManyTermsResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { query: "one two three four five six seven" },
      },
    },
  });
  const reversedRangeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { durationDaysMin: 4, durationDaysMax: 2 },
      },
    },
  });
  const reversedDateRangeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { originDateFrom: "2026-04-05", originDateTo: "2026-04-03" },
      },
    },
  });
  const reversedReleaseTimeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { releaseTimeFrom: "15:53", releaseTimeTo: "08:59" },
      },
    },
  });
  const reversedCreditResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { creditMinutesMin: 480, creditMinutesMax: 240 },
      },
    },
  });
  const invalidPairingScopeResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      periodCode: "Apr 2026",
      preview: {
        mode: "all_pairings",
        filters: { pairingScope: "res" },
      },
    },
  });
  const tooManyPairingNumbersResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "all_pairings",
        filters: { pairingNumbers: Array.from({ length: 51 }, (_, index) => `T${index}`) },
      },
    },
  });
  const invalidPairingNumberResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "all_pairings",
        filters: { pairingNumbers: ["X".repeat(33)] },
      },
    },
  });
  const invalidAirportResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "all_pairings",
        filters: { airports: ["Y-VR"] },
      },
    },
  });
  const reversedLayoverCountResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "all_pairings",
        filters: { layoverCountMin: 3, layoverCountMax: 1 },
      },
    },
  });
  const invalidRedeyeFalseResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "all_pairings",
        filters: { hasRedeye: false },
      },
    },
  });
  const invalidLayoverAirportResponse = await server.inject({
    method: "POST",
    url: `/api${pbsSearchPairingRoutes.preview}`,
    headers: { authorization: `Bearer ${buildAuthToken()}` },
    payload: {
      rosterPeriodId: 38,
      preview: {
        mode: "all_pairings",
        filters: { layoverAirports: ["Y-VR"] },
      },
    },
  });

  assert.equal(invalidTimeResponse.statusCode, 400);
  assert.equal(overnightTimeResponse.statusCode, 200);
  assert.equal(tooManyTermsResponse.statusCode, 400);
  assert.equal(reversedRangeResponse.statusCode, 400);
  assert.equal(reversedDateRangeResponse.statusCode, 400);
  assert.equal(reversedReleaseTimeResponse.statusCode, 400);
  assert.equal(reversedCreditResponse.statusCode, 400);
  assert.equal(invalidPairingScopeResponse.statusCode, 400);
  assert.equal(tooManyPairingNumbersResponse.statusCode, 400);
  assert.equal(invalidPairingNumberResponse.statusCode, 400);
  assert.equal(invalidAirportResponse.statusCode, 400);
  assert.equal(reversedLayoverCountResponse.statusCode, 400);
  assert.equal(invalidRedeyeFalseResponse.statusCode, 400);
  assert.equal(invalidLayoverAirportResponse.statusCode, 400);

  await server.close();
});
