# F8 Crew App Live Roster Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link the Royce crew app to ROIS CMS live-server so F8 crew `113` can log in with the existing PBS portal password and see current + next month roster duties.

**Architecture:** Add a stable mobile roster contract on live-server backed by live roster tables plus PBS credential verification. Generalize the app's EK API-backed roster adapter so F8 can reuse the same fetch/persist/display path without touching TG/PR portal capture or EK behavior.

**Tech Stack:** Fastify, TypeScript, Drizzle/raw parameterized PostgreSQL, Zod, bcryptjs, Vitest, React Native, Jest, Maestro.

**Spec:** `docs/superpowers/specs/2026-08-28-f8-crew-app-live-roster-link-design.md`

## Global Constraints

- Source is live-server, not PBS award results.
- Use existing PBS portal credentials from `pbs.pbs_user.password_hash`; do not store a separate crew-app password.
- Include all duties that can be represented in the mobile contract.
- Default roster date window is current month plus next month.
- Do not touch existing TG/PR/EK roster fetching logic except narrow generic naming/validation needed for API-backed airlines.
- App code changes must bump `rn-app/src/version.ts` from `95` to `96`.
- No auto-commit; this repo forbids `git commit` / `git push` without explicit user command.

---

## Task 1: Live-Server Mobile Roster Service And Tests

**Files:**

- Create: `live-server/src/services/mobile-roster/mobile-roster-service.ts`
- Create: `live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts`

**Interfaces:**

- Produces: `authenticateAndLoadMobileRoster(options, input): Promise<MobileRosterResponse>`
- Consumes: `pgPool.query`, `env.LIVE_SCHEMA`, `env.PBS_SCHEMA`
- Later tasks call this from the route.

- [ ] **Step 1: Write failing service tests**

Create tests for:

```ts
it("authenticates crew 113 through pbs_user password_hash and maps flying pairing", async () => {
  // Mock pgPool.query:
  // 1. pbs_user row with user_code/crew_id "113", password_hash generated with bcrypt.hash("Pier2026", 10),
  //    status 0, password_access "1", portal_access "1", eff_dt in past, exp_dt null.
  // 2. crew profile row.
  // 3. roster rows including one pairing with two flight segments.
  // Expect airline F8, crew.crewId 113, one pairing, two flights.
});

it("rejects invalid password", async () => {
  // Same pbs_user row, call with wrong password.
  // Expect MobileRosterServiceError statusCode 401.
});

it("rejects disabled portal account", async () => {
  // pbs_user portal_access "0".
  // Expect statusCode 403.
});

it("maps non-flying duty into groundDuties", async () => {
  // Roster row without pairing/flight but with assignment, start/end.
  // Expect groundDuties[0].assignment and startUtc/endUtc.
});

it("defaults date window to current month plus next month", async () => {
  // Inject now = 2026-08-28.
  // Expect roster query params include 2026-08-01 and 2026-10-01 exclusive.
});
```

- [ ] **Step 2: Run service test and verify failure**

Run:

```bash
cd live-server
npx vitest run src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement minimal service**

Implement:

```ts
export interface MobileRosterLoginInput {
  airline: "F8";
  crewId: string;
  password: string;
  startDate?: string;
  endDate?: string;
}

export interface MobileRosterResponse {
  apiVersion: "1";
  airline: "F8";
  crew: {
    crewId: string;
    firstName: string;
    lastName: string;
    base: string;
    rank: string;
  };
  pairings: MobileRosterPairing[];
  groundDuties: MobileRosterGroundDuty[];
}
```

Service behavior:

- Normalize `crewId` with `trim()`.
- Query `${pbsSchema}.pbs_user` by `user_code = $1` first; use `crew_id` from that row for live roster scoping.
- Check `status = 0`, `password_access = '1'`, `portal_access = '1'`, `eff_dt <= now`, and `exp_dt is null or exp_dt > now`.
- Compare password with `bcrypt.compare(password, row.password_hash)`.
- Query live crew profile/base/rank for display metadata.
- Query live roster rows between `[startDate, endDate)`; if dates omitted, compute current month start and next-next month start from injected/current date.
- Group rows with `pairing_id` into pairings and flights.
- Put rows without usable pairing/flight into `groundDuties`.
- Use parameterized SQL; only schema names may come from validated config.

- [ ] **Step 4: Run service test and verify pass**

Run:

```bash
cd live-server
npx vitest run src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
```

Expected: PASS.

---

## Task 2: Live-Server Route Registration And Route Tests

**Files:**

- Create: `live-server/src/routes/mobile-roster/mobile-roster.ts`
- Modify: `live-server/src/index.ts`
- Create: `live-server/src/__tests__/unit/mobile-roster-route.test.ts`

**Interfaces:**

- Consumes: `authenticateAndLoadMobileRoster(...)` from Task 1.
- Produces: `POST /api/mobile-roster/session`.

- [ ] **Step 1: Write failing route tests**

Use Fastify injection pattern:

```ts
it("returns 400 for unsupported airline", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/mobile-roster/session",
    payload: { airline: "EK", crewId: "113", password: "Pier2026" },
  });
  expect(JSON.parse(res.body).code).toBe(400);
});

it("returns mobile roster response for F8 crew 113", async () => {
  // Register route with mocked service returning MobileRosterResponse.
  // Expect code 200 and data.airline F8.
});

it("maps service auth errors to response status", async () => {
  // Mock MobileRosterServiceError(401, "Invalid crew credentials.")
  // Expect HTTP/body code 401.
});
```

- [ ] **Step 2: Run route test and verify failure**

Run:

```bash
cd live-server
npx vitest run src/__tests__/unit/mobile-roster-route.test.ts
```

Expected: FAIL because route module is missing.

- [ ] **Step 3: Implement route**

Route shape:

```ts
const loginSchema = z.object({
  airline: z.literal("F8"),
  crewId: z.string().trim().min(1),
  password: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();
```

Register in `live-server/src/index.ts`:

```ts
import mobileRosterRoutes from "./routes/mobile-roster/mobile-roster.js";
...
await server.register(mobileRosterRoutes, { prefix: "/api/mobile-roster" });
```

This endpoint must be public only for the first mobile login path if no planner JWT exists. If making it public, add exact path `/api/mobile-roster/session` to `PUBLIC_PATHS` in `live-server/src/plugins/auth.ts` and document that production hardening remains required.

- [ ] **Step 4: Run route test and verify pass**

Run:

```bash
cd live-server
npx vitest run src/__tests__/unit/mobile-roster-route.test.ts
```

Expected: PASS.

---

## Task 3: Crew App Generic API Roster Adapter

**Files:**

- Modify: `Royce-Travel-APP-Ver2/rn-app/src/features/travel/ekRosterApi.ts`
- Modify: `Royce-Travel-APP-Ver2/rn-app/__tests__/features/ekRosterApi.test.ts`

**Interfaces:**

- Consumes: live-server `POST /api/mobile-roster/session`.
- Produces: existing `fetchEkRoster(...)` and `mapEkRosterToTrips(...)` continue to work for EK; add generic acceptance for F8.

- [ ] **Step 1: Write failing F8 parser/fetch tests**

Add to existing `ekRosterApi.test.ts`:

```ts
const f8Response: EkRosterResponse = {
  apiVersion: "1",
  airline: "F8",
  crew: { crewId: "113", firstName: "F8", lastName: "Crew", base: "YEG", rank: "CA" },
  pairings: [{
    pairingId: "F8-1001",
    label: "F8101/F8102",
    checkInUtc: "2026-09-03T10:00:00.000Z",
    releaseUtc: "2026-09-04T22:00:00.000Z",
    assignment: "FLY",
    flights: [{
      flightId: "F8-1001-1",
      flightNumber: "F8101",
      carrier: "F8",
      departureAirport: "YEG",
      arrivalAirport: "YVR",
      departureUtc: "2026-09-03T12:00:00.000Z",
      arrivalUtc: "2026-09-03T14:00:00.000Z",
      departureLocal: null,
      arrivalLocal: null,
      fleet: "7M8",
      registration: null,
      assignment: "FLY",
    }],
  }],
  groundDuties: [{
    dutyId: "F8-DO-2026-09-05",
    label: "DO",
    startUtc: "2026-09-05T00:00:00.000Z",
    endUtc: "2026-09-06T00:00:00.000Z",
    assignment: "DO",
  }],
};

it("maps F8 mobile roster payload through API-backed trip structures", () => {
  const trips = mapEkRosterToTrips(f8Response);
  expect(trips[0].crewId).toBe("113");
  expect(trips[0].legs[0].fltNumber).toBe("F8101");
});
```

Also update fetch test to pass airline explicitly when needed:

```ts
await fetchEkRoster("http://127.0.0.1:3000/api", {
  airline: "F8",
  crewId: "113",
  password: "Pier2026",
});
expect(global.fetch).toHaveBeenCalledWith(
  "http://127.0.0.1:3000/api/mobile-roster/session",
  expect.objectContaining({
    body: JSON.stringify({ airline: "F8", crewId: "113", password: "Pier2026" }),
  }),
);
```

- [ ] **Step 2: Run app test and verify failure**

Run:

```bash
cd /Users/kimi/DevOps/Royce-Travel-APP-Ver2/rn-app
npx jest __tests__/features/ekRosterApi.test.ts
```

Expected: FAIL because parser rejects non-EK payload and fetch posts the EK path.

- [ ] **Step 3: Generalize adapter narrowly**

Keep exported function names for compatibility, but change internals:

- `EkRosterCredentials` gains optional `airline?: string`.
- `parseEkRosterResponse` accepts `airline` in `["EK", "F8"]`.
- Error strings become generic where tests expect generic behavior, but existing EK tests still pass.
- `fetchEkRoster` posts:
  - EK to `/crew-app/v1/roster`
  - F8 to `/mobile-roster/session`
- The request body includes normalized airline and crew id.

- [ ] **Step 4: Run app API tests and verify pass**

Run:

```bash
cd /Users/kimi/DevOps/Royce-Travel-APP-Ver2/rn-app
npx jest __tests__/features/ekRosterApi.test.ts
```

Expected: PASS.

---

## Task 4: Crew App F8 Airline Wiring And Login Text

**Files:**

- Modify: `Royce-Travel-APP-Ver2/rn-app/src/features/auth/airlines.ts`
- Modify: `Royce-Travel-APP-Ver2/rn-app/src/features/auth/EkRosterLoginScreen.tsx`
- Modify: `Royce-Travel-APP-Ver2/rn-app/src/features/auth/ekRosterLogin.ts`
- Modify: `Royce-Travel-APP-Ver2/rn-app/src/version.ts`
- Modify: `Royce-Travel-APP-Ver2/rn-app/__tests__/features/ekAirlineSelection.test.ts`
- Modify: `Royce-Travel-APP-Ver2/rn-app/__tests__/features/ekRosterLogin.test.ts`

**Interfaces:**

- Consumes: generic API adapter from Task 3.
- Produces: F8 selectable airline with test crew `113` and password prefill from the same password Ryan confirms exists in PBS portal.

- [ ] **Step 1: Write failing airline/login tests**

Add to `ekAirlineSelection.test.ts`:

```ts
it("wires F8 API adapter to live-server simulator endpoint", () => {
  expect(airlineByCode("F8")).toMatchObject({
    code: "F8",
    name: "Flair Airlines",
    carrier: "F8",
    portalKind: "rois-api",
    apiBaseUrl: "http://127.0.0.1:3000/api",
  });
expect(TEST_CREDENTIALS.F8).toEqual({ crewId: "113", password: "Pier2026" });
  expect(loginRouteForAirline("F8")).toBe("EkRoster");
});
```

The app cannot recover plaintext from `pbs.pbs_user.password_hash`; bcrypt is one-way. If real crew `113` does not use `Pier2026` in the PBS portal, update the simulator prefill to the known password or reset crew `113` through the existing PBS user admin reset path before simulator validation.

Add to `ekRosterLogin.test.ts`:

```ts
it("loads F8 through the API-backed roster transaction", async () => {
  const f8Params = { airline: "F8", crewId: "113", password: "Pier2026", keepLogin: true };
  await loadEkRosterSession(f8Params, dispatch as never);
  expect(fetchEkRoster).toHaveBeenCalledWith(
    expect.any(String),
    { airline: "F8", crewId: "113", password: "Pier2026" },
    undefined,
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd /Users/kimi/DevOps/Royce-Travel-APP-Ver2/rn-app
npx jest __tests__/features/ekAirlineSelection.test.ts __tests__/features/ekRosterLogin.test.ts
```

Expected: FAIL because F8 is not wired.

- [ ] **Step 3: Implement F8 config and generic loading text**

Changes:

- Add live-server dev fallback resolver, or generalize `resolveEkRosterApiBaseUrl` so F8 defaults to `http://127.0.0.1:3000/api` in development.
- Add `F8` to `WIRED` with `portalKind: "rois-api"`.
- Add `TEST_CREDENTIALS.F8`.
- Pass `airline.code` into `fetchEkRoster`.
- Change loading/error text to use airline name, for example `Loading Flair Airlines roster...`.
- Bump `APP_VERSION` to `96`.

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
cd /Users/kimi/DevOps/Royce-Travel-APP-Ver2/rn-app
npx jest __tests__/features/ekAirlineSelection.test.ts __tests__/features/ekRosterLogin.test.ts
```

Expected: PASS.

---

## Task 5: End-To-End Verification And Simulator Flow

**Files:**

- Create: `Royce-Travel-APP-Ver2/rn-app/.maestro/f8_login.yaml`

**Interfaces:**

- Consumes: running live-server on port `3000`.
- Produces: repeatable simulator validation for F8 crew `113`.

- [ ] **Step 1: Add Maestro flow**

Create:

```yaml
appId: org.reactjs.native.example.RoyceTravelTemplate
---
- launchApp:
    clearState: true
- assertVisible:
    id: "login-screen"
- tapOn:
    id: "airline-dropdown"
- tapOn:
    id: "airline-F8"
- assertVisible:
    id: "crew-id"
- assertVisible: "113"
- assertVisible:
    id: "crew-pw"
- tapOn:
    id: "login-btn"
- extendedWaitUntil:
    visible: "Next Adventure"
    timeout: 30000
- tapOn: "tab-agenda"
- assertVisible:
    id: "agenda-screen"
- assertVisible:
    id: "trip-list"
- takeScreenshot: maestro_f8_roster_113
```

- [ ] **Step 2: Run focused automated checks**

Run:

```bash
cd /Users/kimi/DevOps/ROIs-Recovery-Ver1/live-server
npx vitest run src/services/mobile-roster/__tests__/mobile-roster-service.test.ts src/__tests__/unit/mobile-roster-route.test.ts
```

Run:

```bash
cd /Users/kimi/DevOps/Royce-Travel-APP-Ver2/rn-app
npx jest __tests__/features/ekRosterApi.test.ts __tests__/features/ekAirlineSelection.test.ts __tests__/features/ekRosterLogin.test.ts
npx tsc --noEmit
```

- [ ] **Step 3: Run remote DB read-only validation**

Using the remote PostgreSQL authority from root `CLAUDE.md`, verify:

```sql
select user_code, crew_id, status, password_access, portal_access, app_access, eff_dt, exp_dt
from f8_pbs.pbs_user
where user_code = '113' or crew_id = '113';
```

And:

```sql
select count(*) as roster_rows
from f8.roster_flight
where crew_id = '113'
  and coalesce(sch_str_dt_utc, flt_dt::timestamp) >= date_trunc('month', current_date)
  and coalesce(sch_str_dt_utc, flt_dt::timestamp) < date_trunc('month', current_date) + interval '2 months';
```

Do not print password hashes or secrets in final output.

- [ ] **Step 4: Start live-server for simulator**

Run:

```bash
cd /Users/kimi/DevOps/ROIs-Recovery-Ver1/live-server
npm run dev
```

Keep this running while executing Maestro.

- [ ] **Step 5: Run F8 simulator validation**

Run:

```bash
cd /Users/kimi/DevOps/Royce-Travel-APP-Ver2/rn-app
maestro test .maestro/f8_login.yaml
```

Expected: PASS and screenshot `maestro_f8_roster_113`.

- [ ] **Step 6: Run required TG/PR regression simulator flows**

Run:

```bash
cd /Users/kimi/DevOps/Royce-Travel-APP-Ver2/rn-app
maestro test .maestro/trip_trade_tg.yaml
maestro test .maestro/trip_trade_pr.yaml
```

Expected: PASS; no TG/PR data mixing.
