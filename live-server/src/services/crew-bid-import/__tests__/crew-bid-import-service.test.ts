import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import {
  createPbsCrewBidImportService,
  insertRunItemsAndProblems,
} from "../crew-bid-import-service.js";
import type { PreparedImportItem } from "../crew-bid-import-service.js";
import type { CrewBidImportDbClient } from "../types.js";

type QueryResult<T> = {
  rows: T[];
};

type RecordedTier = {
  id: string;
  tier: number;
  totalGroups: number;
};

type RecordedGroup = {
  id: string;
  tierId: string;
  tier: number;
  groupSeq: number;
  bidType: string;
  actionId: number | null;
  propertyCode: number;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};

type RecordedOccurrence = {
  tier: number;
  pairingNumber: string;
  originDate: string;
  pairingId: string;
};

type RecordedItem = {
  crewId: string;
  category: string;
  bidContext: "Current" | "Default";
  targetBidContext: "Current" | "StandingLineholder" | "StandingReserve";
  status: string;
  importedBidId: number | null;
  message: string | null;
};

type RecordedProblem = {
  crewId: string | null;
  code: string;
  message: string;
};

const sourceText = `Bid Request

Period: March 2026

----------------------------------------------------------------------------
Seniority 1              Category YYZ-737-FO           Employee #           73
Confirmation: 1625073423 on 2026-02-10T19:59:44 UTC              Default Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Avoid Pairings If Pairing Check-In Time > 07:01

----------------------------------------------------------------------------
Seniority 1              Category YYZ-737-FO           Employee #           73
Confirmation: 1625073423 on 2026-02-10T19:59:44 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Avoid Pairings If Any Landing In CUN, MBJ
   3.  Award Pairings If Departing On Mar 2, 2026 If Pairing Number T4506
   4.  Award Pairings If Pairing Number T9999
   5.  Avoid Pairings If Pairing Check-In Time > 07:01
   6.  Avoid Pairings If Total Legs In Pairing > 2 legs
   7.  Award Pairings If Any Landing In YVR
   8.  Award Pairings If Pairing Number T4545
   9.  Prefer Off Mar 30, 2026
`;

const currentWithoutCandidateSourceText = `Bid Request

Period: March 2026

----------------------------------------------------------------------------
Seniority 4              Category YEG-737-FA           Employee #          237
Confirmation: 1625074038 on 2026-02-13T09:04:30 UTC              Default Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Reserve Bid Group
       ---------------------------------------------------
   2.  Pairing Bid Group
   3.  Prefer Off Mar 23, 2026, Mar 24, 2026, Mar 25, 2026, Mar 26, 2026, Mar 27, 2026, Mar 28, 2026, Mar 29, 2026, Mar 30, 2026
   4.  Avoid Pairings If Any Duty On Mar 23, 2026, Mar 24, 2026, Mar 25, 2026, Mar 26, 2026, Mar 27, 2026, Mar 28, 2026, Mar 29, 2026, Mar 30, 2026
       Award Pairings
       ---------------------------------------------------
       Pairing Bid Group
       Award Pairings
       ---------------------------------------------------
       Reserve Bid Group

----------------------------------------------------------------------------
Seniority 4              Category YEG-737-FA           Employee #          237
Confirmation: 1625074038 on 2026-02-13T09:04:30 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
       Award Pairings
       ---------------------------------------------------
       Pairing Bid Group
       Award Pairings
       ---------------------------------------------------
       Reserve Bid Group
`;

const manualParitySourceText = `Bid Request

Period: March 2026

----------------------------------------------------------------------------
Seniority 4              Category YEG-737-FA           Employee #          237
Confirmation: 1625074038 on 2026-02-13T09:04:30 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Prefer Off Mar 2, 2026 Between 05:00 And 12:00
   3.  Award Pairings If Any Duty On Mar 2, 2026, Mar 4, 2026
`;

const workStartStationSourceText = `Bid Request

Period: June 2026

----------------------------------------------------------------------------
Seniority 2              Category YVR-737-FA           Employee #           73
Confirmation: 1625073423 on 2026-02-10T19:59:44 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Award Pairings If Any Landing In CUN If Work Start Station YVR
`;

const emptyBidGroupOnlySourceText = `Bid Request

Period: June 2026

----------------------------------------------------------------------------
Seniority 210            Category YYC-737-FO           Employee #         2496
Confirmation: 1625082882 on 2026-04-30T14:50:54 UTC              Default Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Reserve Bid Group
       ---------------------------------------------------
       Pairing Bid Group
       Award Pairings
       ---------------------------------------------------
       Reserve Bid Group
`;

const layoverDurationComboSourceText = `Bid Request

Period: June 2026

----------------------------------------------------------------------------
Seniority 259            Category YEG-737-FA           Employee #         2038
Confirmation: 1625082454 on 2026-04-29T16:42:11 UTC              Default Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Avoid Pairings If Any Layover In CUN
   3.  Avoid Pairings If Any Layover In CUN And Of Duration > 015:00
`;

const resumeSourceText = `${sourceText}

${manualParitySourceText}`;

const longPairingNumberSourceText = `Bid Request

Period: March 2026

----------------------------------------------------------------------------
Seniority 1              Category YYZ-737-FO           Employee #           73
Confirmation: 1625073423 on 2026-02-10T19:59:44 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Award Pairings If Pairing Number T4501, T4502, T4503, T4504, T4505, T4506, T4507, T4508, T4509, T4510, T4511, T4512, T4513, T4514, T4515, T4516, T4517, T4518, T4519, T4520, T4521, T4522, T4523, T4524, T4525, T4526, T4527, T4528, T4529, T4530, T4531, T4532, T4533, T4534, T4535
`;

const partialAirportSourceText = `Bid Request

Period: March 2026

----------------------------------------------------------------------------
Seniority 1              Category YYZ-737-FO           Employee #           73
Confirmation: 1 on 2026-02-10T19:59:44 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Award Pairings If Any Landing In CUN, MBJ
`;

const partialFlightNumberSourceText = `Bid Request

Period: March 2026

----------------------------------------------------------------------------
Seniority 1              Category YYZ-737-FO           Employee #           73
Confirmation: 1 on 2026-02-10T19:59:44 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Award Pairings If Any Flight Number 0604, 0605
`;

const currentAndDefaultSourceText = `Bid Request

Period: March 2026

----------------------------------------------------------------------------
Seniority 4              Category YEG-737-FA           Employee #          237
Confirmation: 1625074038 on 2026-02-13T09:04:30 UTC              Default Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Prefer Off Weekends Between 18:00 And 23:59
   3.  Set Condition Short Call Type PRAM

----------------------------------------------------------------------------
Seniority 4              Category YEG-737-FA           Employee #          237
Confirmation: 1625074038 on 2026-02-13T09:04:30 UTC              Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Avoid Pairings If Pairing Check-In Time > 07:01
`;

const defaultCompoundDateSourceText = `Bid Request

Period: July 2026

----------------------------------------------------------------------------
Seniority 4              Category YEG-737-FA           Employee #          237
Confirmation: 1625074038 on 2026-06-13T09:04:30 UTC              Default Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group
   2.  Award Pairings If Any Duty On Jul 13, 2026 If Pairing Check-In Time Between 08:00 And 10:00 If Pairing Total Credit = 004:00
`;

const createFakePool = (options: {
  missingPerformanceColumn?: boolean;
  bidInsertErrorMessage?: string;
  failBidInsertAt?: number;
  resumeImportedCrewIds?: string[];
  generatePairingRows?: boolean;
  pairingRows?: Array<{
    pairing_id: string;
    pairing_label: string;
    origin_date: string;
  }>;
  flightNumbers?: string[];
  period?: {
    rosterPeriodId: number;
    periodCode: string;
    startDate: string;
    endDate: string;
    startTimestamp: string;
    endTimestamp: string;
  };
} = {}) => {
  const tiers: RecordedTier[] = [];
  const groups: RecordedGroup[] = [];
  const occurrences: RecordedOccurrence[] = [];
  const items: RecordedItem[] = [];
  const problems: RecordedProblem[] = [];
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let nextRunId = 1;
  let nextBidId = 100;
  let bidInsertCount = 0;
  let nextGroupId = 300;
  let nextItemId = 400;

  const query = async <T>(textOrConfig: string | { text?: string }, values: unknown[] = []): Promise<QueryResult<T>> => {
    const text = typeof textOrConfig === "string" ? textOrConfig : textOrConfig.text ?? "";
    const normalized = text.replace(/\s+/g, " ").trim();
    queries.push({ text, values });

    if (/^(begin|commit|rollback)$/i.test(normalized) || /^(savepoint|release savepoint|rollback to savepoint)/i.test(normalized)) {
      return { rows: [] as T[] };
    }

    if (normalized.includes('from "live".roster_period')) {
      const rosterPeriodId = Number(values[0]);
      if (options.period?.rosterPeriodId === rosterPeriodId) {
        return {
          rows: [{ ...options.period, rosterPeriodId: String(rosterPeriodId) }] as T[],
        };
      }
      const periods = new Map([
        [3, { periodCode: "Mar 2026", startDate: "2026-03-01", endDate: "2026-03-31", startTimestamp: "2026-03-01 00:00:00", endTimestamp: "2026-03-31 23:59:59" }],
        [6, { periodCode: "Jun 2026", startDate: "2026-06-01", endDate: "2026-06-30", startTimestamp: "2026-06-01 00:00:00", endTimestamp: "2026-06-30 23:59:59" }],
        [7, { periodCode: "Jul 2026", startDate: "2026-07-01", endDate: "2026-07-31", startTimestamp: "2026-07-01 00:00:00", endTimestamp: "2026-07-31 23:59:59" }],
      ]);
      const period = periods.get(rosterPeriodId);

      return {
        rows: period ? [{ rosterPeriodId: String(rosterPeriodId), ...period }] as T[] : [],
      };
    }

    if (normalized.includes("from \"pbs\".pbs_user")) {
      const crewIds = values[0] as string[];
      const knownUsers = [
        { crew_id: "73", rank: "FO" },
        { crew_id: "237", rank: "FA" },
        { crew_id: "2038", rank: "FA" },
        { crew_id: "2496", rank: "FO" },
      ];

      return { rows: knownUsers.filter((user) => crewIds.includes(user.crew_id)) as T[] };
    }

    if (normalized.includes("pbs_bid_property_context context")) {
      const propertyCodes = [102, 103, 107, 110, 112, 116, 117, 168, 201, 301, 408, 429];

      return {
        rows: ["Current", "StandingLineholder", "StandingReserve"].flatMap((bidContext) =>
          propertyCodes.map((propertyCode) => ({
            property_code: propertyCode,
            bid_context: bidContext,
          }))) as T[],
      };
    }

    if (normalized.includes("from \"pbs\".pbs_bid_property")) {
      return {
        rows: [102, 103, 107, 110, 112, 116, 117, 168, 201, 301, 408, 429].map((propertyCode) => ({
          property_code: propertyCode,
          id: String(propertyCode * 10),
          bid_type: propertyCode === 201
            ? "DaysOff"
            : propertyCode === 301
              ? "Reserve"
              : propertyCode === 408 || propertyCode === 429
                ? "Line"
                : "Pairing",
          property_name: `Property ${propertyCode}`,
        })) as T[],
      };
    }

    if (normalized.includes("from \"pbs\".pbs_crew_bid_import_item item")) {
      const crewIds = values[2] as string[];
      const resumeImportedCrewIds = new Set(options.resumeImportedCrewIds ?? []);
      const rows = crewIds
        .filter((crewId) => resumeImportedCrewIds.has(crewId))
        .map((crewId) => ({
          crew_id: crewId,
          target_bid_context: "Current",
          run_key: `previous-run-${crewId}`,
          imported_bid_id: String(9000 + Number.parseInt(crewId, 10)),
          imported_at: "2026-06-24T00:00:00.000Z",
        }));

      return { rows: rows as T[] };
    }

    if (normalized.includes("with matched_pairings as")) {
      const requestedPairingNumbers = values[1] as string[];
      const rows = options.pairingRows
        ? options.pairingRows.filter((row) => requestedPairingNumbers.includes(row.pairing_label))
        : options.generatePairingRows
        ? requestedPairingNumbers.map((pairingNumber, index) => ({
            pairing_id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
            pairing_label: pairingNumber,
            origin_date: "2026-06-02",
          }))
        : [
            {
              pairing_id: "pairing-t4506",
              pairing_label: "T4506",
              origin_date: "2026-06-02",
            },
            {
              pairing_id: "pairing-t4545",
              pairing_label: "T4545",
              origin_date: "2026-06-16",
            },
          ].filter((row) => requestedPairingNumbers.includes(row.pairing_label));

      return { rows: rows as T[] };
    }

    if (normalized.includes("select role, airport from")) {
      return {
        rows: [
          { role: "landing", airport: "CUN" },
          { role: "landing", airport: "YVR" },
          { role: "layover", airport: "YVR" },
          { role: "work_start", airport: "YVR" },
          ...(options.flightNumbers ?? []).map((airport) => ({ role: "flight_number", airport })),
        ] as T[],
      };
    }

    if (normalized.includes("insert into \"pbs\".pbs_crew_bid_import_run")) {
      return { rows: [{ id: String(nextRunId++) }] as T[] };
    }

    if (normalized.includes("performance_json")) {
      if (options.missingPerformanceColumn) {
        throw Object.assign(new Error("column performance_json does not exist"), { code: "42703" });
      }

      return { rows: [] as T[] };
    }

    if (normalized.includes("update \"pbs\".pbs_crew_bid_import_run")) {
      return { rows: [] as T[] };
    }

    if (normalized.includes("select id::varchar from \"pbs\".pbs_bid")) {
      return { rows: [] as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_bid (")) {
      bidInsertCount += 1;

      if (options.bidInsertErrorMessage || bidInsertCount === options.failBidInsertAt) {
        throw new Error(options.bidInsertErrorMessage ?? "bid insert failed");
      }

      return { rows: [{ id: String(nextBidId++) }] as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_bid_tier")) {
      const rows: Array<{ id: string; tier: number }> = [];

      for (let index = 0; index < values.length; index += 4) {
        const tier = values[index + 2] as number;
        const record = {
          id: `tier-${tier}`,
          tier,
          totalGroups: values[index + 3] as number,
        };
        tiers.push(record);
        rows.push({ id: record.id, tier });
      }

      return { rows: rows as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_bid_group")) {
      const rows: Array<{
        id: string;
        tier_id: string;
        group_seq: number;
        property_group_key: string;
      }> = [];

      for (let index = 0; index < values.length; index += 17) {
        const tierId = values[index + 1] as string;
        const tier = Number(tierId.replace("tier-", ""));
        const record = {
          id: `group-${nextGroupId++}`,
          tierId,
          tier,
          groupSeq: values[index + 3] as number,
          bidType: values[index + 5] as string,
          actionId: values[index + 6] as number | null,
          propertyCode: values[index + 7] as number,
          operator: values[index + 9] as string | null,
          paramA: values[index + 10] as string | null,
          paramB: values[index + 11] as string | null,
          paramC: values[index + 12] as string | null,
        };
        groups.push(record);
        rows.push({
          id: record.id,
          tier_id: tierId,
          group_seq: record.groupSeq,
          property_group_key: values[index + 4] as string,
        });
      }

      return { rows: rows as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_bid_pairing_occurrence")) {
      for (let index = 0; index < values.length; index += 10) {
        occurrences.push({
          tier: values[index + 5] as number,
          pairingNumber: values[index + 6] as string,
          originDate: values[index + 7] as string,
          pairingId: values[index + 8] as string,
        });
      }

      return { rows: [] as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_crew_bid_import_backup")) {
      return { rows: [] as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_crew_bid_import_item")) {
      const rows: Array<{
        id: string;
        crew_id: string;
        category: string;
        bid_context: "Current" | "Default";
        target_bid_context: "Current" | "StandingLineholder" | "StandingReserve";
      }> = [];

      for (let index = 0; index < values.length; index += 16) {
        items.push({
          crewId: values[index + 2] as string,
          category: values[index + 3] as string,
          bidContext: values[index + 4] as "Current" | "Default",
          targetBidContext: values[index + 5] as RecordedItem["targetBidContext"],
          status: values[index + 6] as string,
          importedBidId: (values[index + 14] as number | null) ?? null,
          message: (values[index + 15] as string | null) ?? null,
        });
        rows.push({
          id: String(nextItemId++),
          crew_id: values[index + 2] as string,
          category: values[index + 3] as string,
          bid_context: values[index + 4] as "Current" | "Default",
          target_bid_context: values[index + 5] as RecordedItem["targetBidContext"],
        });
      }

      return { rows: rows as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_crew_bid_import_problem")) {
      if (normalized.includes("values ($1, $1, $2::bigint, null, 'error', 'import_run_failed', $3)")) {
        problems.push({
          crewId: null,
          code: "import_run_failed",
          message: values[2] as string,
        });

        return { rows: [] as T[] };
      }

      for (let index = 0; index < values.length; index += 13) {
        problems.push({
          crewId: (values[index + 3] as string | null) ?? null,
          code: values[index + 10] as string,
          message: values[index + 11] as string,
        });
      }

      return { rows: [] as T[] };
    }

    if (normalized.startsWith("select * from \"pbs\".")) {
      return { rows: [] as T[] };
    }

    if (normalized.includes("select 'pbs_bid_")) {
      return {
        rows: [{
          bid: {
            id: values[0],
            created_by: "crew-bid-import",
            updated_by: "crew-bid-import",
            updated_at: "2026-06-01T00:00:00.000Z",
          },
          tiers: [],
          groups: [],
          conditions: [],
          days_off: [],
          pairing_occurrences: [],
          favorites: [],
        }] as T[],
      };
    }

    throw new Error(`Unhandled SQL in crew bid import test: ${normalized}`);
  };

  const client = {
    query,
    release: () => undefined,
  };

  return {
    pool: {
      connect: async () => client,
      query,
    } as unknown as Pool,
    records: {
      tiers,
      groups,
      occurrences,
      items,
      problems,
      queries,
    },
  };
};

const createPreparedImportItems = (
  itemCount: number,
  problemCount: number,
): PreparedImportItem[] => {
  const baseProblemsPerItem = Math.floor(problemCount / itemCount);
  const extraProblemItems = problemCount % itemCount;

  return Array.from({ length: itemCount }, (_, itemIndex) => {
    const crewId = String(itemIndex + 1);
    const itemProblemCount = baseProblemsPerItem + (itemIndex < extraProblemItems ? 1 : 0);

    return {
      item: {
        crewId,
        category: "YEG-737-FA",
        bidContext: "Current",
        targetBidContext: "Current",
        status: "failed",
        parsedPreferenceCount: itemProblemCount,
        importablePreferenceCount: 0,
        importedPreferenceCount: 0,
        skippedPreferenceCount: 0,
        failedPreferenceCount: itemProblemCount,
        matchedPairingCount: 0,
        unmatchedPairingCount: 0,
      },
      mappedPreferences: [],
      problems: Array.from({ length: itemProblemCount }, (_, problemIndex) => ({
        crewId,
        category: "YEG-737-FA",
        bidContext: "Current" as const,
        sourceSeq: problemIndex + 1,
        severity: "error" as const,
        code: `problem_${itemIndex}_${problemIndex}`,
        message: `Problem ${problemIndex + 1} for crew ${crewId}.`,
      })),
      actorRank: "FA",
    };
  });
};

const createImportDetailClient = (options: {
  failItemBatch?: number;
  failProblemBatch?: number;
} = {}) => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let itemBatch = 0;
  let problemBatch = 0;
  let nextItemId = 1;

  const query = async <T>(text: string, values: unknown[] = []): Promise<QueryResult<T>> => {
    const normalized = text.replace(/\s+/g, " ").trim();
    queries.push({ text, values });

    if (/^(begin|commit|rollback)$/i.test(normalized)) {
      return { rows: [] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_crew_bid_import_item")) {
      itemBatch += 1;

      if (itemBatch === options.failItemBatch) {
        throw new Error("item batch failed");
      }

      const rows = [];

      for (let index = 0; index < values.length; index += 16) {
        rows.push({
          id: String(nextItemId++),
          crew_id: values[index + 2],
          category: values[index + 3],
          bid_context: values[index + 4],
          target_bid_context: values[index + 5],
        });
      }

      return { rows: rows as T[] };
    }

    if (normalized.includes("insert into \"pbs\".pbs_crew_bid_import_problem")) {
      problemBatch += 1;

      if (problemBatch === options.failProblemBatch) {
        throw new Error("problem batch failed");
      }

      return { rows: [] };
    }

    throw new Error(`Unhandled detail SQL: ${normalized}`);
  };
  const client = { query } as unknown as CrewBidImportDbClient;

  return { client, queries };
};

const writeImportDetailsInTransaction = async (
  client: CrewBidImportDbClient,
  preparedItems: PreparedImportItem[],
) => {
  await client.query("begin");

  try {
    await insertRunItemsAndProblems(client, "\"pbs\"", "29", { userCode: "tester" }, preparedItems);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
};

const createRollbackPool = (options: {
  currentBidOverrides?: Record<string, unknown>;
  importedSnapshot?: Record<string, unknown> | null;
} = {}) => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const bid = {
    id: "100",
    created_by: "crew-bid-import",
    created_at: "2026-07-23T09:00:00.000Z",
    updated_by: "crew-bid-import",
    updated_at: "2026-07-23T09:00:00.000Z",
    remarks: "crew-bid-import:test-run",
    ...options.currentBidOverrides,
  };
  const currentSnapshot = {
    bid,
    tiers: [],
    groups: [],
    conditions: [],
    daysOff: [],
    pairingOccurrences: [],
    favorites: [],
  };
  const importedSnapshot = options.importedSnapshot === undefined
    ? currentSnapshot
    : options.importedSnapshot;

  const query = async <T>(text: string, values: unknown[] = []): Promise<QueryResult<T>> => {
    const normalized = text.replace(/\s+/g, " ").trim();
    queries.push({ text, values });

    if (/^(begin isolation level serializable|commit|rollback)$/i.test(normalized)) {
      return { rows: [] };
    }

    if (normalized.includes("from \"pbs\".pbs_crew_bid_import_run") && normalized.includes("for update")) {
      return {
        rows: [{
          id: "29",
          run_key: "test-run",
          status: "failed",
          completed_at: "2026-07-23T10:00:00.000Z",
          rolled_back_at: null,
        }] as T[],
      };
    }

    if (normalized.includes("from \"pbs\".pbs_crew_bid_import_backup")) {
      return {
        rows: [{
          imported_bid_id: "100",
          previous_snapshot_json: {
            bid: null,
            tiers: [],
            groups: [],
            conditions: [],
            daysOff: [],
            pairingOccurrences: [],
            favorites: [],
          },
          imported_snapshot_json: importedSnapshot,
        }] as T[],
      };
    }

    if (normalized.includes("select id::varchar from \"pbs\".pbs_bid") && normalized.includes("for update")) {
      return { rows: [{ id: "100" }] as T[] };
    }

    if (normalized.includes("(select to_jsonb(t.*) from \"pbs\".pbs_bid")) {
      return {
        rows: [{
          bid_id: "100",
          bid,
          tiers: [],
          groups: [],
          conditions: [],
          days_off: [],
          pairing_occurrences: [],
          favorites: [],
        }] as T[],
      };
    }

    if (normalized.startsWith("with deleted_pairing_occurrence as")) {
      return { rows: [] };
    }

    if (normalized.includes("update \"pbs\".pbs_crew_bid_import_run")) {
      return { rows: [] };
    }

    throw new Error(`Unhandled rollback SQL: ${normalized}`);
  };
  const client = { query, release: () => undefined };

  return {
    pool: {
      connect: async () => client,
      query,
    } as unknown as Pool,
    queries,
  };
};

describe("createPbsCrewBidImportService", () => {
  it("uses the selected Live roster period window instead of deriving a calendar month from its label", async () => {
    const { pool, records } = createFakePool({
      period: {
        rosterPeriodId: 42,
        periodCode: "RP 2026-06",
        startDate: "2026-06-15",
        endDate: "2026-07-14",
        startTimestamp: "2026-06-15 06:30:00",
        endTimestamp: "2026-07-14 21:45:00",
      },
    });
    const service = createPbsCrewBidImportService({ pgPool: pool, pbsSchema: "pbs", liveSchema: "live" });

    const response = await service.dryRun(
      { userCode: "tester" },
      {
        rosterPeriodId: 42,
        sourceText: workStartStationSourceText,
        scope: { base: "YVR", crewIds: ["73"] },
      },
    );

    expect(response).toMatchObject({ rosterPeriodId: 42, periodCode: "RP 2026-06" });
    const airportQuery = records.queries.find((query) => query.text.includes("select role, airport"));
    expect(airportQuery?.values.slice(0, 3)).toEqual([
      "YVR",
      "2026-06-15 06:30:00",
      "2026-07-14 21:45:00",
    ]);
  });

  it("batches the 663 import items and all 6092 incident-scale problems without data loss", async () => {
    const preparedItems = createPreparedImportItems(663, 6_092);
    const { client, queries } = createImportDetailClient();

    await insertRunItemsAndProblems(client, "\"pbs\"", "29", { userCode: "tester" }, preparedItems);

    const itemQueries = queries.filter((query) => query.text.includes("pbs_crew_bid_import_item"));
    const problemQueries = queries.filter((query) => query.text.includes("pbs_crew_bid_import_problem"));

    expect(itemQueries).toHaveLength(1);
    expect(itemQueries[0]?.values).toHaveLength(663 * 16);
    expect(problemQueries).toHaveLength(7);
    expect(problemQueries.every((query) => query.values.length <= 1_000 * 13)).toBe(true);
    expect(problemQueries.reduce((total, query) => total + query.values.length / 13, 0)).toBe(6_092);

    for (const query of problemQueries) {
      for (let index = 0; index < query.values.length; index += 13) {
        expect(query.values[index + 2]).toBe(query.values[index + 3]);
      }
    }
  });

  it("keeps item ids mapped correctly across the 1001-item batch boundary", async () => {
    const preparedItems = createPreparedImportItems(1_001, 1_001);
    const { client, queries } = createImportDetailClient();

    await insertRunItemsAndProblems(client, "\"pbs\"", "30", { userCode: "tester" }, preparedItems);

    const itemQueries = queries.filter((query) => query.text.includes("pbs_crew_bid_import_item"));
    const problemQueries = queries.filter((query) => query.text.includes("pbs_crew_bid_import_problem"));

    expect(itemQueries.map((query) => query.values.length / 16)).toEqual([1_000, 1]);
    expect(problemQueries.map((query) => query.values.length / 13)).toEqual([1_000, 1]);
    expect(problemQueries[1]?.values[2]).toBe("1001");
    expect(problemQueries[1]?.values[3]).toBe("1001");
  });

  it("rolls back the detail transaction when a later item batch fails", async () => {
    const preparedItems = createPreparedImportItems(1_001, 0);
    const { client, queries } = createImportDetailClient({ failItemBatch: 2 });

    await expect(writeImportDetailsInTransaction(client, preparedItems)).rejects.toThrow("item batch failed");

    const transactionQueries = queries
      .map((query) => query.text.replace(/\s+/g, " ").trim().toLowerCase())
      .filter((query) => /^(begin|commit|rollback)$/.test(query));
    expect(transactionQueries).toEqual(["begin", "rollback"]);
  });

  it("rolls back the detail transaction when a later problem batch fails", async () => {
    const preparedItems = createPreparedImportItems(663, 1_001);
    const { client, queries } = createImportDetailClient({ failProblemBatch: 2 });

    await expect(writeImportDetailsInTransaction(client, preparedItems)).rejects.toThrow("problem batch failed");

    const transactionQueries = queries
      .map((query) => query.text.replace(/\s+/g, " ").trim().toLowerCase())
      .filter((query) => /^(begin|commit|rollback)$/.test(query));
    expect(transactionQueries).toEqual(["begin", "rollback"]);
  });

  it("rejects rollback when a current bid no longer matches its imported snapshot", async () => {
    const importedSnapshot = {
      bid: {
        id: "100",
        created_by: "crew-bid-import",
        created_at: "2026-07-23T09:00:00.000Z",
        updated_by: "crew-bid-import",
        updated_at: "2026-07-23T09:00:00.000Z",
        remarks: "crew-bid-import:test-run",
        total_tiers: 1,
      },
      tiers: [],
      groups: [],
      conditions: [],
      daysOff: [],
      pairingOccurrences: [],
      favorites: [],
    };
    const { pool, queries } = createRollbackPool({
      currentBidOverrides: { total_tiers: 2 },
      importedSnapshot,
    });
    const service = createPbsCrewBidImportService({ pgPool: pool, pbsSchema: "pbs", liveSchema: "live" });

    await expect(service.rollbackRun(
      { userCode: "tester" },
      "test-run",
      { confirm: true, restorePrevious: true },
    )).rejects.toThrow("no longer matches its backup");

    expect(queries.some((query) => query.text.includes("deleted_pairing_occurrence"))).toBe(false);
    expect(queries.at(-1)?.text.trim().toLowerCase()).toBe("rollback");
  });

  it("rejects legacy rollback when audit fields show a later edit", async () => {
    const { pool, queries } = createRollbackPool({
      currentBidOverrides: {
        updated_by: "planner",
        updated_at: "2026-07-23T10:01:00.000Z",
      },
      importedSnapshot: null,
    });
    const service = createPbsCrewBidImportService({ pgPool: pool, pbsSchema: "pbs", liveSchema: "live" });

    await expect(service.rollbackRun(
      { userCode: "tester" },
      "test-run",
      { confirm: true, restorePrevious: true },
    )).rejects.toThrow("changed after the run");

    expect(queries.some((query) => query.text.includes("deleted_pairing_occurrence"))).toBe(false);
    expect(queries.at(-1)?.text.trim().toLowerCase()).toBe("rollback");
  });

  it("allows an unchanged legacy import to roll back in one serializable transaction", async () => {
    const { pool, queries } = createRollbackPool({ importedSnapshot: null });
    const service = createPbsCrewBidImportService({ pgPool: pool, pbsSchema: "pbs", liveSchema: "live" });

    const response = await service.rollbackRun(
      { userCode: "tester" },
      "test-run",
      { confirm: true, restorePrevious: true },
    );

    expect(response).toMatchObject({
      runId: "test-run",
      status: "rolled_back",
      restoredBidCount: 0,
      deletedImportedBidCount: 1,
    });
    expect(queries[0]?.text.trim().toLowerCase()).toBe("begin isolation level serializable");
    expect(queries.at(-1)?.text.trim().toLowerCase()).toBe("commit");
  });

  it("writes Prefer Off time windows and Any Duty On using the same structures as manual bids", async () => {
    const { pool, records } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: manualParitySourceText,
        scope: {
          base: "YEG",
          crewIds: ["237"],
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed");
    expect(response.summary.importedPreferenceCount).toBe(2);
    expect(records.groups.map((group) => [
      group.tier,
      group.propertyCode,
      group.actionId,
      group.operator,
      group.paramA,
    ])).toEqual([
      [1, 201, null, "In", "2026-03-02,Window 05:00-12:00"],
      [2, 110, 1, "Json", JSON.stringify({
        type: "work-day-preference",
        days: [
          { dayOfWeek: "MON", checkInFrom: "00:00", checkInTo: "23:59" },
          { dayOfWeek: "WED", checkInFrom: "00:00", checkInTo: "23:59" },
        ],
        dateScope: {
          mode: "specific_dates",
          dates: ["2026-03-02", "2026-03-04"],
        },
      })],
    ]);
    const backupQuery = records.queries.find((query) => query.text.includes("pbs_crew_bid_import_backup"));
    expect(backupQuery?.values[7]).toEqual(expect.any(String));
    expect(JSON.parse(backupQuery?.values[7] as string)).toEqual(expect.objectContaining({
      tiers: [],
      groups: [],
      conditions: [],
    }));
  });

  it("blocks the whole Airport Preference in strict matching mode", async () => {
    const { pool } = createFakePool();
    const service = createPbsCrewBidImportService({ pgPool: pool, pbsSchema: "pbs", liveSchema: "live" });

    const response = await service.dryRun(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: partialAirportSourceText,
        scope: { crewIds: ["73"] },
        options: { failOnUnmatchedAirport: true },
      },
    );

    expect(response.status).toBe("failed");
    expect(response.summary.readyCrew).toBe(0);
    expect(response.summary.failedCrew).toBe(1);
    expect(response.items[0]).toMatchObject({ importablePreferenceCount: 0, failedPreferenceCount: 1 });
    expect(response.problems).toEqual([
      expect.objectContaining({ code: "airport_not_in_pairing_period", severity: "error" }),
    ]);
  });

  it("blocks the whole Flight Number Preference when the Portal autocomplete has a missing value", async () => {
    const { pool } = createFakePool({ flightNumbers: ["0604"] });
    const service = createPbsCrewBidImportService({ pgPool: pool, pbsSchema: "pbs", liveSchema: "live" });

    const response = await service.dryRun(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: partialFlightNumberSourceText,
        scope: { crewIds: ["73"] },
      },
    );

    expect(response.status).toBe("failed");
    expect(response.summary.readyCrew).toBe(0);
    expect(response.summary.failedCrew).toBe(1);
    expect(response.items[0]).toMatchObject({ importablePreferenceCount: 0, failedPreferenceCount: 1 });
    expect(response.problems).toEqual([
      expect.objectContaining({ code: "flight_number_not_in_pairing_period", severity: "error" }),
    ]);
  });

  it("imports Current bid preferences into T1-T7, splits combined pairing criteria, and reports missing target-period values", async () => {
    const { pool, records } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText,
        scope: {
          base: "YYZ",
          crewIds: ["73"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed_with_warnings");
    expect(response.items[0]?.bidContext).toBe("Current");
    expect(response.summary.importedCrew).toBe(1);
    expect(response.summary.importedPreferenceCount).toBe(4);
    expect(response.summary.unmatchedPairingCount).toBe(1);
    expect(response.performance?.totalMs).toBeGreaterThanOrEqual(0);
    expect(response.performance?.pairingResolverQueryCount).toBe(1);
    expect(response.performance?.airportResolverQueryCount).toBe(1);
    expect(response.performance?.writtenBidCount).toBe(1);
    expect(response.performance?.timings.map((timing) => timing.phase)).toEqual(expect.arrayContaining([
      "parseSource",
      "selectBlocks",
      "loadCrewContext",
      "prepareItems",
      "resolvePairings",
      "resolveAirports",
      "loadPropertyIdentities",
      "writeBids",
      "writeSnapshots",
      "writeRunDetail",
      "total",
    ]));
    expect(records.tiers.map((tier) => [tier.tier, tier.totalGroups])).toEqual([
      [1, 1],
      [4, 1],
      [6, 1],
      [7, 1],
    ]);

    const tierOneLanding = records.groups.find((group) => group.tier === 1 && group.propertyCode === 168);
    expect(JSON.parse(tierOneLanding?.paramA ?? "{}")).toMatchObject({ type: "airport-preference", event: "landing" });
    expect(records.groups.some((group) => group.tier === 3)).toBe(false);
    const tierSevenPairingPreference = records.groups.find(
      (group) => group.tier === 7 && group.propertyCode === 102,
    );
    expect(JSON.parse(tierSevenPairingPreference?.paramA ?? "{}")).toEqual({
      type: "pairing-preference",
      pairingIds: ["pairing-t4545"],
      pairingLabels: ["T4545"],
    });
    expect(records.occurrences).toEqual([]);
    expect(records.queries.some((query) => query.text.includes("pbs_bid_pairing_occurrence ("))).toBe(false);

    const pairingResolveQuery = records.queries.find((query) => query.text.includes("with matched_pairings as"));
    const airportOptionsQuery = records.queries.find((query) => query.text.includes("select role, airport"));
    expect(pairingResolveQuery).toBeDefined();
    expect(airportOptionsQuery?.text).toMatch(/pairing_composition pc/);
    expect(airportOptionsQuery?.text).not.toMatch(/at time zone 'UTC'\)::date/);
    expect(airportOptionsQuery?.values).toContain("FO");

    expect(response.problems.map((problem) => problem.code)).toEqual(expect.arrayContaining([
      "airport_not_in_pairing_period",
      "unmatched_pairing_number",
      "preference_ignored_tier_capacity",
    ]));
    expect(records.problems.map((problem) => problem.code)).toEqual(expect.arrayContaining([
      "airport_not_in_pairing_period",
      "unmatched_pairing_number",
      "preference_ignored_tier_capacity",
    ]));
  });

  it("keeps Default separate from Current and skips date-only Default preferences", async () => {
    const { pool, records } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: currentWithoutCandidateSourceText,
        scope: {
          base: "YEG",
          crewIds: ["237"],
        },
        options: {
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed_with_warnings");
    expect(response.summary.importedCrew).toBe(0);
    expect(response.summary.failedCrew).toBe(0);
    expect(response.summary.skippedCrew).toBe(1);
    expect(response.summary.importedPreferenceCount).toBe(0);
    expect(response.items).toEqual([
      expect.objectContaining({
        crewId: "237",
        category: "YEG-737-FA",
        bidContext: "Default",
        targetBidContext: "StandingLineholder",
        status: "skipped",
        importablePreferenceCount: 0,
        importedPreferenceCount: 0,
      }),
      expect.objectContaining({
        crewId: "237",
        bidContext: "Default",
        targetBidContext: "StandingReserve",
        status: "skipped",
        importablePreferenceCount: 0,
        importedPreferenceCount: 0,
      }),
    ]);
    expect(records.groups).toEqual([]);
    expect(response.problems.map((problem) => problem.code)).toEqual(expect.arrayContaining([
      "STANDING_DATE_ONLY_SKIPPED",
    ]));
  });

  it("does not select a Default block containing only bid group headers", async () => {
    const { pool } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.dryRun(
      { userCode: "tester" },
      {
        rosterPeriodId: 6,
        sourceText: emptyBidGroupOnlySourceText,
        scope: {
          crewIds: ["2496"],
        },
        options: {
          failOnUnmatchedPairing: false,
        },
      },
    );

    expect(response.status).toBe("completed");
    expect(response.summary.readyCrew).toBe(0);
    expect(response.summary.selectedCrew).toBe(0);
    expect(response.summary.skippedCrew).toBe(0);
    expect(response.summary.failedCrew).toBe(0);
    expect(response.summary.importablePreferenceCount).toBe(0);
    expect(response.summary.skippedPreferenceCount).toBe(0);
    expect(response.problems).toEqual([]);
    expect(response.items).toEqual([]);
  });

  it("drops all same-source pairing conditions when a combined layover airport criterion has no target-period airport match", async () => {
    const { pool } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.dryRun(
      { userCode: "tester" },
      {
        rosterPeriodId: 6,
        sourceText: layoverDurationComboSourceText,
        scope: {
          crewIds: ["2038"],
        },
        options: {
          failOnUnmatchedPairing: false,
        },
      },
    );

    expect(response.status).toBe("failed");
    expect(response.summary.readyCrew).toBe(0);
    expect(response.summary.failedCrew).toBe(1);
    expect(response.summary.importablePreferenceCount).toBe(0);
    expect(response.summary.failedPreferenceCount).toBe(2);
    expect(response.items[0]).toEqual(expect.objectContaining({
      crewId: "2038",
      category: "YEG-737-FA",
      bidContext: "Default",
      status: "failed",
      importablePreferenceCount: 0,
      failedPreferenceCount: 2,
      message: "No importable preferences remain after target-period airport matching.",
    }));
    const airportProblems = response.problems.filter((problem) => problem.code === "airport_not_in_pairing_period");
    expect(airportProblems).toHaveLength(2);
    expect(response.problems.map((problem) => problem.code)).toContain("secondary_pairing_clause_dropped");
    expect(airportProblems.map((problem) => problem.message)).toEqual([
      expect.stringContaining("airport(s) CUN are not present in YEG FA pairings for Jun 2026"),
      expect.stringContaining("airport(s) CUN are not present in YEG FA pairings for Jun 2026"),
    ]);
    expect(response.problems.map((problem) => problem.message).join("\n")).not.toContain("CUN AND OF DURATION");
  });

  it("imports the primary airport and records hidden Work Start Station as a dropped secondary clause", async () => {
    const { pool, records } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 6,
        sourceText: workStartStationSourceText,
        scope: {
          base: "YVR",
          crewIds: ["73"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed_with_warnings");
    expect(response.summary.importedCrew).toBe(1);
    expect(response.summary.importedPreferenceCount).toBe(1);
    expect(response.performance?.airportResolverQueryCount).toBe(1);
    expect(records.groups).toHaveLength(1);
    expect(records.groups[0]).toMatchObject({ tier: 1, propertyCode: 168, operator: "Json" });
    expect(response.problems.map((problem) => problem.code)).toContain("secondary_pairing_clause_dropped");

    const airportOptionsQuery = records.queries.find((query) => query.text.includes("select role, airport"));

    expect(airportOptionsQuery?.text).toMatch(/'work_start'::text/);
    expect(airportOptionsQuery?.text).toMatch(/s\.duty_str_arp/);
  });

  it("does not fail the import when the performance_json migration has not been applied yet", async () => {
    const { pool } = createFakePool({ missingPerformanceColumn: true });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText,
        scope: {
          base: "YYZ",
          crewIds: ["73"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed_with_warnings");
    expect(response.summary.importedCrew).toBe(1);
    expect(response.performance?.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("normalizes long report messages before persisting import items and problems", async () => {
    const longMessage = `Bid write failed\u0000: ${"x".repeat(17_000)}`;
    const { pool, records } = createFakePool({ bidInsertErrorMessage: longMessage });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText,
        scope: {
          base: "YYZ",
          crewIds: ["73"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    const itemMessage = records.items[0]?.message;
    const problemMessage = records.problems.find((problem) => problem.code === "bid_write_failed")?.message;

    expect(response.status).toBe("failed");
    expect(records.items[0]).toEqual(expect.objectContaining({
      crewId: "73",
      status: "failed",
    }));
    expect(itemMessage).toBeDefined();
    expect(problemMessage).toBeDefined();
    expect(itemMessage).toBe(problemMessage);
    expect(itemMessage).not.toContain("\u0000");
    expect(itemMessage).toHaveLength(16_000);
    expect(itemMessage?.endsWith("... [truncated]")).toBe(true);
  });

  it("resolves legacy Pairing Number lists to stable pairing ids", async () => {
    const { pool, records } = createFakePool({ generatePairingRows: true });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: longPairingNumberSourceText,
        scope: {
          base: "YYZ",
          crewIds: ["73"],
        },
        options: {
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed");
    expect(response.summary.importedCrew).toBe(1);
    expect(response.summary.failedCrew).toBe(0);
    expect(records.groups).toHaveLength(1);
    expect(records.groups[0]).toMatchObject({ propertyCode: 102, operator: "Json" });
    const pairingPreference = JSON.parse(records.groups[0]?.paramA ?? "{}");
    expect(pairingPreference).toMatchObject({ type: "pairing-preference" });
    expect(pairingPreference.pairingIds).toHaveLength(35);
    expect(pairingPreference.pairingLabels).toHaveLength(35);
    expect(records.occurrences).toEqual([]);
  });

  it("keeps one pairing label for every stable id when a number matches multiple pairings", async () => {
    const { pool, records } = createFakePool({
      pairingRows: [
        { pairing_id: "98991", pairing_label: "T4545", origin_date: "2026-06-03" },
        { pairing_id: "99126", pairing_label: "T4545", origin_date: "2026-06-05" },
        { pairing_id: "99196", pairing_label: "T4545", origin_date: "2026-06-06" },
      ],
    });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText,
        scope: {
          base: "YYZ",
          crewIds: ["73"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed_with_warnings");
    const pairingGroup = records.groups.find((group) => group.propertyCode === 102);
    expect(JSON.parse(pairingGroup?.paramA ?? "{}")).toEqual({
      type: "pairing-preference",
      pairingIds: ["98991", "99126", "99196"],
      pairingLabels: ["T4545", "T4545", "T4545"],
    });
  });

  it("previews resume imports by skipping crew already imported from the same source file", async () => {
    const { pool } = createFakePool({ resumeImportedCrewIds: ["73"] });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.dryRun(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: resumeSourceText,
        scope: {
          crewIds: ["73", "237"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
      },
    );

    expect(response.status).toBe("completed");
    expect(response.summary.selectedCrew).toBe(2);
    expect(response.summary.skippedCrew).toBe(1);
    expect(response.summary.readyCrew).toBe(1);
    expect(response.items.find((item) => item.crewId === "73")).toEqual(expect.objectContaining({
      status: "skipped",
      importedBidId: 9073,
      message: "Already imported by previous run previous-run-73; skipped for resume import.",
    }));
    expect(response.items.find((item) => item.crewId === "237")).toEqual(expect.objectContaining({
      status: "ready",
    }));
    expect(response.problems).toEqual([]);
  });

  it("imports only pending crew when resuming the same source file", async () => {
    const { pool, records } = createFakePool({ resumeImportedCrewIds: ["73"] });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: resumeSourceText,
        scope: {
          crewIds: ["73", "237"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed");
    expect(response.summary.selectedCrew).toBe(2);
    expect(response.summary.skippedCrew).toBe(1);
    expect(response.summary.importedCrew).toBe(1);
    expect(response.performance?.writtenBidCount).toBe(1);
    expect(records.items.map((item) => [item.crewId, item.status, item.importedBidId])).toEqual([
      ["73", "skipped", 9073],
      ["237", "imported", 100],
    ]);
    expect(records.queries.filter((query) => query.text.includes("insert into \"pbs\".pbs_bid ("))).toHaveLength(1);
    expect(response.problems).toEqual([]);
  });

  it("completes resume imports when every selected crew was already imported", async () => {
    const { pool, records } = createFakePool({ resumeImportedCrewIds: ["73", "237"] });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: resumeSourceText,
        scope: {
          crewIds: ["73", "237"],
        },
        options: {
          importDefaultAsStanding: false,
          failOnUnmatchedPairing: false,
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed");
    expect(response.summary.selectedCrew).toBe(2);
    expect(response.summary.skippedCrew).toBe(2);
    expect(response.summary.importedCrew).toBe(0);
    expect(response.performance?.writtenBidCount ?? 0).toBe(0);
    expect(records.items.map((item) => [item.crewId, item.status, item.importedBidId])).toEqual([
      ["73", "skipped", 9073],
      ["237", "skipped", 9237],
    ]);
    expect(records.queries.filter((query) => query.text.includes("insert into \"pbs\".pbs_bid ("))).toHaveLength(0);
  });

  it("imports Current and Default into separate Current and Standing targets for the same crew", async () => {
    const { pool, records } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: currentAndDefaultSourceText,
        scope: { crewIds: ["237"] },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed");
    expect(response.summary.selectedCrew).toBe(1);
    expect(response.summary.importedCrew).toBe(1);
    expect(response.summary.importedPreferenceCount).toBe(3);
    expect(response.items.map((item) => [
      item.bidContext,
      item.targetBidContext,
      item.status,
      item.importedPreferenceCount,
    ])).toEqual([
      ["Current", "Current", "imported", 1],
      ["Default", "StandingLineholder", "imported", 1],
      ["Default", "StandingReserve", "imported", 1],
    ]);

    const bidWrites = records.queries
      .filter((query) => query.text.includes("insert into \"pbs\".pbs_bid ("))
      .map((query) => [query.values[2], query.values[3], query.values[4]]);
    expect(bidWrites).toEqual([
      ["Mar 2026", 3, "Current"],
      ["STANDING", null, "StandingLineholder"],
      ["STANDING", null, "StandingReserve"],
    ]);
  });

  it("removes an absolute-date clause and imports the remaining reusable Default pairing conditions", async () => {
    const { pool, records } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 7,
        sourceText: defaultCompoundDateSourceText,
        scope: { crewIds: ["237"] },
        confirm: true,
      },
    );

    expect(response.status).toBe("completed_with_warnings");
    expect(response.summary.importedCrew).toBe(1);
    expect(response.items).toEqual([
      expect.objectContaining({
        targetBidContext: "StandingLineholder",
        status: "imported",
        importedPreferenceCount: 1,
      }),
      expect.objectContaining({
        targetBidContext: "StandingReserve",
        status: "skipped",
      }),
    ]);
    expect(records.groups.map((group) => group.propertyCode)).toEqual([103]);
    expect(response.problems.map((problem) => problem.code)).toEqual(expect.arrayContaining([
      "STANDING_ABSOLUTE_DATE_REMOVED",
      "secondary_pairing_clause_dropped",
    ]));
    expect(records.groups.map((group) => `${group.paramA ?? ""} ${group.paramB ?? ""}`)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("2026-07-13")]),
    );
  });

  it("rolls back every target for a crew when a later Standing target write fails", async () => {
    const { pool, records } = createFakePool({ failBidInsertAt: 3 });
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText: currentAndDefaultSourceText,
        scope: { crewIds: ["237"] },
        confirm: true,
      },
    );

    expect(response.status).toBe("failed");
    expect(response.summary.importedCrew).toBe(0);
    expect(response.summary.failedCrew).toBe(1);
    expect(response.items).toHaveLength(3);
    expect(response.items.every((item) =>
      item.status === "failed"
      && item.importedPreferenceCount === 0
      && item.importedBidId === undefined)).toBe(true);
    expect(response.problems.filter((problem) => problem.code === "bid_write_failed")).toHaveLength(3);
    expect(records.queries.map((query) => query.text.trim().toLowerCase())).toContain("rollback");
  });

  it("fails an import immediately when the selected scope matches no crew", async () => {
    const { pool, records } = createFakePool();
    const service = createPbsCrewBidImportService({
      pgPool: pool,
      pbsSchema: "pbs",
      liveSchema: "live",
    });

    const response = await service.importBids(
      { userCode: "tester" },
      {
        rosterPeriodId: 3,
        sourceText,
        scope: {
          base: "YEG",
          crewIds: ["73"],
        },
        confirm: true,
      },
    );

    expect(response.status).toBe("failed");
    expect(response.summary.selectedCrew).toBe(0);
    expect(response.items).toEqual([]);
    expect(response.problems[0]?.code).toBe("import_run_failed");
    expect(response.problems[0]?.message).toContain("No crew matched");
    expect(records.problems).toEqual([
      {
        crewId: null,
        code: "import_run_failed",
        message: "No crew matched the selected import scope. Check Base, Category, and Crew IDs.",
      },
    ]);
  });
});
