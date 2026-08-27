import assert from "node:assert/strict";
import test from "node:test";
import { register } from "prom-client";
import { observePbsHttpResponse } from "../../plugins/metrics.js";

test("observePbsHttpResponse records low-cardinality route metrics", async () => {
  register.clear();

  observePbsHttpResponse({
    method: "GET",
    route: "/api/bidding-calendar/current",
    statusCode: 200,
    elapsedMs: 123,
    responseBytes: 2048,
  });

  const text = await register.metrics();

  assert.match(text, /rois_pbs_server_http_request_duration_seconds/);
  assert.match(text, /route="\/api\/bidding-calendar\/current"/);
  assert.match(text, /rois_pbs_server_http_response_bytes/);
  assert.doesNotMatch(text, /crewId/);
});
