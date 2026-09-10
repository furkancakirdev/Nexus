import test from "node:test";
import assert from "node:assert/strict";
import { createObservability } from "./observability.mjs";

test("observability records sanitized request counters and latency", () => {
  let now = 1_000;
  const metrics = createObservability({ now: () => now });
  metrics.recordRequest({ method: "get", path: "/api/metrics?token=secret", status: 200, durationMs: 12.5 });
  metrics.recordRequest({ method: "GET", path: "/api/private", status: 403, durationMs: 4 });
  now += 5_000;
  const snapshot = metrics.snapshot({ cpm: { configured: true, readOnly: true } });
  assert.equal(snapshot.uptimeSeconds, 5);
  assert.equal(snapshot.requests["GET /api/metrics 200"], 1);
  assert.equal(snapshot.requests["GET /api/private 403"], 1);
  assert.equal(snapshot.authFailures.total, 1);
  assert.equal(snapshot.latencyMs.max, 12.5);
  assert.equal(JSON.stringify(snapshot).includes("secret"), false);
});

test("observability tracks dependency failures without exposing dependency details", () => {
  const metrics = createObservability({ now: () => 10 });
  metrics.recordDependencyFailure("cpm");
  metrics.recordDependencyFailure("unknown");
  const snapshot = metrics.snapshot({ cpm: { configured: false, connected: false, readOnly: true } });
  assert.deepEqual(snapshot.dependencyFailures, { cpm: 1 });
  assert.deepEqual(snapshot.cpm, { configured: false, connected: false, readOnly: true });
});
