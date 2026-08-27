import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  assertCurrentPeriodCanEdit,
  LineholderBidServiceError,
  loadCurrentPeriodAndExistingBid,
  parseTierKey,
  resolveCurrentPeriod,
  type LineholderDraftActor,
} from "./shared.js";

const actor: LineholderDraftActor = {
  crewId: "F8030",
  userCode: "casey.crew",
};
const businessNow = new Date("2026-03-05T12:00:00.000Z");

const openPeriodRow = {
  period_id: "7",
  roster_period_key: "2026RP02",
  period_code: "Feb 2026",
  filiale: "F8",
  status: "OPEN",
  bid_open_at: "2026-03-01T00:00:00.000Z",
  bid_close_at: "2026-03-10T23:59:59.000Z",
  base: "YYZ",
  zone_id: "America/Toronto",
  rp_start_local: "2026-01-31",
  rp_end_local: "2026-03-01",
};

const expectedOpenPeriod = {
  rosterPeriodId: 7,
  rosterPeriodKey: "2026RP02",
  periodCode: "Feb 2026",
  filiale: "F8",
  status: "OPEN",
  computedStage: "OPEN" as const,
  bidOpenAt: new Date("2026-03-01T00:00:00.000Z"),
  bidCloseAt: new Date("2026-03-10T23:59:59.000Z"),
  base: "YYZ",
  zoneId: "America/Toronto",
  timezoneLabel: "YYZ Local Time",
  rpStartLocal: "2026-01-31",
  rpEndLocal: "2026-03-01",
  canEditBid: true,
  readOnlyReason: null,
};

const createDb = (rows: Record<string, unknown>[], captureSql?: (text: string) => void) => ({
  async execute(query: SQL) {
    captureSql?.(new PgDialect().sqlToQuery(query).sql);
    return { rows };
  },
  select() {
    throw new Error("Fallback select should not be used for this test.");
  },
}) as unknown as Parameters<typeof loadCurrentPeriodAndExistingBid>[0];

const normalizeSql = (text: string) => text.replace(/\s+/g, " ").trim();

test("loadCurrentPeriodAndExistingBid maps the current period and matching current bid", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    bid_id: "42",
    bid_period_code: "Feb 2026",
    bid_roster_period_id: "7",
    bid_draft_version: 3,
    bid_remarks: "ready",
  }]), actor, businessNow);

  assert.deepEqual(result, {
    period: expectedOpenPeriod,
    existingBid: {
      id: 42,
      periodCode: "Feb 2026",
      rosterPeriodId: 7,
      draftVersion: 3,
      remarks: "ready",
    },
  });
});

test("loadCurrentPeriodAndExistingBid compares bigint roster period IDs without an implicit text operator", async () => {
  let queryText = "";

  await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }], (text) => {
    queryText = text;
  }), actor, businessNow);

  assert.match(queryText, /roster_period_id"? = current_period\.period_id::bigint/);
  assert.doesNotMatch(queryText, /roster_period_id"? = current_period\.period_id(?:\s|\n)/);
});

test("loadCurrentPeriodAndExistingBid does not load a period-code-only legacy draft", async () => {
  let queryText = "";

  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }], (text) => {
    queryText = text;
  }), actor, businessNow);

  const normalized = normalizeSql(queryText);

  assert.deepEqual(result, {
    period: expectedOpenPeriod,
    existingBid: null,
  });
  assert.match(normalized, /"roster_period_id" = current_period\.period_id::bigint/i);
  assert.doesNotMatch(normalized, /or .*"period_code" = current_period\.period_code/i);
});

test("resolveCurrentPeriod SQL ranks closed periods before future not-open periods", async () => {
  let queryText = "";

  await resolveCurrentPeriod(createDb([openPeriodRow], (text) => {
    queryText = text;
  }), actor, businessNow);

  const normalized = normalizeSql(queryText);

  assert.match(
    normalized,
    /when period\.pbs_bid_close_at at time zone effective_base\.zone_id <= \$\d+ then 1/i,
  );
  assert.match(
    normalized,
    /when period\.pbs_bid_open_at at time zone effective_base\.zone_id > \$\d+ then 2/i,
  );
  assert.match(
    normalized,
    /order by sort_rank asc, case when sort_rank in \(0, 1\) then bid_close_at end desc nulls last, case when sort_rank = 2 then bid_open_at end asc nulls last, period_sort_id desc/i,
  );
  assert.doesNotMatch(normalized, /case when sort_rank = 1 then bid_open_at/i);
});

test("loadCurrentPeriodAndExistingBid keeps an empty current draft when no bid exists", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }]), actor, businessNow);

  assert.deepEqual(result, {
    period: expectedOpenPeriod,
    existingBid: null,
  });
});

test("resolveCurrentPeriod returns the crew-base period without a division field", async () => {
  const period = await resolveCurrentPeriod(
    createDb([openPeriodRow]),
    actor,
    businessNow,
  );

  assert.deepEqual(period, expectedOpenPeriod);
  assert.equal("division" in period, false);
});

test("loadCurrentPeriodAndExistingBid fails when no current roster period exists", async () => {
  await assert.rejects(
    () => loadCurrentPeriodAndExistingBid(createDb([]), actor, businessNow),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.errorCode === "PERIOD_NOT_FOUND",
  );
});

test("resolveCurrentPeriod rejects incomplete and reversed roster period contexts", async () => {
  for (const [row, errorCode] of [
    [{ ...openPeriodRow, period_id: null }, "PERIOD_CONTEXT_REQUIRED"],
    [{ ...openPeriodRow, roster_period_key: null }, "PERIOD_CONTEXT_REQUIRED"],
    [{ ...openPeriodRow, rp_start_local: null }, "PERIOD_RANGE_INVALID"],
    [{ ...openPeriodRow, rp_end_local: null }, "PERIOD_RANGE_INVALID"],
    [{ ...openPeriodRow, rp_start_local: "2026-03-02" }, "PERIOD_RANGE_INVALID"],
  ] as const) {
    await assert.rejects(
      () => resolveCurrentPeriod(createDb([row]), actor, businessNow),
      (error) =>
        error instanceof LineholderBidServiceError
        && error.errorCode === errorCode,
    );
  }
});

test("loadCurrentPeriodAndExistingBid ignores stored status and uses the bid window", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    status: "DRAFT",
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }]), actor, businessNow);

  assert.equal(result.period.canEditBid, true);
  assert.equal(result.period.computedStage, "OPEN");
  assert.equal(result.period.readOnlyReason, null);
});

test("loadCurrentPeriodAndExistingBid maps future bid windows as not open", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    status: "DRAFT",
    bid_open_at: "2026-09-04T04:00:00.000Z",
    bid_close_at: "2026-09-14T03:59:00.000Z",
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }]), actor, businessNow);

  assert.equal(result.period.canEditBid, false);
  assert.equal(result.period.computedStage, "NOT_OPEN");
  assert.equal(result.period.readOnlyReason, "Bidding opens at Sep 04, 00:00.");
  assert.doesNotMatch(result.period.readOnlyReason ?? "", /\.000Z|T04:00:00\.000Z/);
});

test("loadCurrentPeriodAndExistingBid maps expired bid windows as closed", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    status: "OPEN",
    bid_open_at: "2026-09-01T04:00:00.000Z",
    bid_close_at: "2026-09-14T03:59:00.000Z",
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }]), actor, new Date("2026-09-14T04:00:00.000Z"));

  assert.equal(result.period.canEditBid, false);
  assert.equal(result.period.computedStage, "CLOSED");
  assert.equal(result.period.readOnlyReason, "Bidding closed at Sep 13, 23:59.");
  assert.doesNotMatch(result.period.readOnlyReason ?? "", /\.000Z|T03:59:00\.000Z/);
});

test("loadCurrentPeriodAndExistingBid closes bidding at the exact configured close time", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    bid_close_at: businessNow.toISOString(),
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }]), actor, businessNow);

  assert.equal(result.period.computedStage, "CLOSED");
  assert.equal(result.period.canEditBid, false);
});

test("loadCurrentPeriodAndExistingBid maps incomplete bid windows as incomplete", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    bid_open_at: null,
    bid_close_at: null,
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }]), actor, businessNow);

  assert.equal(result.period.canEditBid, false);
  assert.equal(result.period.computedStage, "INCOMPLETE");
  assert.equal(result.period.readOnlyReason, "Bid period window is incomplete.");
});

test("loadCurrentPeriodAndExistingBid blocks a period without an effective prime base", async () => {
  const result = await loadCurrentPeriodAndExistingBid(createDb([{
    ...openPeriodRow,
    bid_open_at: null,
    bid_close_at: null,
    base: null,
    zone_id: null,
    bid_id: null,
    bid_period_code: null,
    bid_roster_period_id: null,
    bid_draft_version: null,
    bid_remarks: null,
  }]), actor, businessNow);

  assert.equal(result.period.computedStage, "INCOMPLETE");
  assert.equal(result.period.canEditBid, false);
  assert.equal(
    result.period.readOnlyReason,
    "No effective prime base is configured for this roster period. Please contact an administrator.",
  );
});

test("assertCurrentPeriodCanEdit rejects date-closed periods and stale period references", () => {
  assert.throws(
    () => assertCurrentPeriodCanEdit({
      ...expectedOpenPeriod,
      computedStage: "CLOSED",
      canEditBid: false,
      readOnlyReason: "Bidding closed at Mar 10, 19:59.",
    }),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 423
      && error.message === "Bidding closed at Mar 10, 19:59.",
  );

  assert.throws(
    () => assertCurrentPeriodCanEdit(expectedOpenPeriod, "Mar 2026"),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 409
      && error.message === "Current bid period changed to Feb 2026. Please refresh before saving again.",
  );
});

test("parseTierKey accepts Tx labels and rejects legacy Lx labels", () => {
  assert.deepEqual(parseTierKey("t3"), {
    key: "T3",
    number: 3,
  });

  assert.throws(
    () => parseTierKey("L3"),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Unsupported lineholder tier: L3",
  );
});
