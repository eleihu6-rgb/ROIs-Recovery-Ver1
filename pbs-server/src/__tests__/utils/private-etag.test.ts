import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { sendPrivateJsonWithEtag } from "../../utils/private-etag.js";

test("sendPrivateJsonWithEtag returns 304 for matching private ETag", async () => {
  const app = Fastify({ logger: false });

  app.get("/api/etag-fixture", async (request, reply) =>
    sendPrivateJsonWithEtag(request, reply, { value: "same" }));

  const first = await app.inject({ method: "GET", url: "/api/etag-fixture" });
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers["cache-control"], "private, no-cache");
  assert.ok(first.headers.etag);

  const second = await app.inject({
    method: "GET",
    url: "/api/etag-fixture",
    headers: { "if-none-match": String(first.headers.etag) },
  });

  assert.equal(second.statusCode, 304);
  assert.equal(second.body, "");
  await app.close();
});
