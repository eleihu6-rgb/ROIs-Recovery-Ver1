import assert from "node:assert/strict";
import test from "node:test";
import { createPbsUserService } from "./pbs-user-service.js";

test("PBS user crew option search queries pbs_user and returns crew_id values with user_name labels", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });

      return {
        rows: [
          {
            crew_id: "762",
            user_code: "762",
            user_name: "Carolyn Susan Ann Alves",
            base: "YEG",
            rank: "FA",
            division: "C",
          },
        ],
      };
    },
  };
  const service = createPbsUserService({
    pgPool: pgPool as never,
    pbsSchema: "f8_pbs",
  });

  const result = await service.searchCrewOptions(
    { crewId: "F8030", userCode: "casey.crew", isAdmin: false },
    {
      query: " car ",
      limit: 200,
    },
  );

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /from f8_pbs\.pbs_user pu/i);
  assert.match(queries[0]!.text, /actor_search_scope as/i);
  assert.match(queries[0]!.text, /pu\.is_admin = 0/i);
  assert.match(queries[0]!.text, /pu\.status = 0/i);
  assert.match(queries[0]!.text, /upper\(pu\.user_name\) like \$1/i);
  assert.match(queries[0]!.text, /upper\(pu\.crew_id\) like \$1/i);
  assert.match(queries[0]!.text, /upper\(pu\.user_code\) like \$1/i);
  assert.match(queries[0]!.text, /nullif\(upper\(btrim\(pu\.crew_id\)\), ''\)\s*=\s*nullif\(upper\(btrim\(\$6::varchar\)\), ''\)/i);
  assert.match(queries[0]!.text, /nullif\(upper\(btrim\(pu\.base\)\), ''\) = actor_scope\.base/i);
  assert.match(queries[0]!.text, /nullif\(upper\(btrim\(pu\.division\)\), ''\) = actor_scope\.division/i);
  assert.deepEqual(queries[0]!.values, ["%CAR%", "CAR", "CAR%", 50, false, "F8030", "casey.crew"]);
  assert.deepEqual(result, {
    query: "CAR",
    limit: 50,
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
});

test("PBS user crew option search returns empty options without scanning for an empty query", async () => {
  const pgPool = {
    async query() {
      throw new Error("Unexpected PBS user search query");
    },
  };
  const service = createPbsUserService({
    pgPool: pgPool as never,
    pbsSchema: "f8_pbs",
  });

  const result = await service.searchCrewOptions(
    { crewId: "F8030", userCode: "casey.crew", isAdmin: false },
    {
      query: " ",
    },
  );

  assert.deepEqual(result, {
    query: "",
    limit: 20,
    options: [],
  });
});

test("PBS user crew option search passes admin scope through SQL parameters", async () => {
  const queries: Array<{ text: string; values: unknown[] | undefined }> = [];
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });

      return {
        rows: [],
      };
    },
  };
  const service = createPbsUserService({
    pgPool: pgPool as never,
    pbsSchema: "f8_pbs",
  });

  await service.searchCrewOptions(
    { crewId: "admin", userCode: "admin", isAdmin: true },
    {
      query: " car ",
    },
  );

  assert.equal(queries.length, 1);
  assert.match(queries[0]!.text, /\$5::boolean/i);
  assert.deepEqual(queries[0]!.values, ["%CAR%", "CAR", "CAR%", 20, true, "admin", "admin"]);
});
