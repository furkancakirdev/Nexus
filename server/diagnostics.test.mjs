import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { installDiagnostics, installErrorHandler } from "./diagnostics.mjs";

async function testServer(build) {
  const app = express();
  installDiagnostics(app);
  build(app);
  installErrorHandler(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await testServer.request(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

testServer.request = async (port, headers = {}) => fetch(`http://127.0.0.1:${port}/api/failure`, { headers });

test("diagnostics propagates a safe correlation id and sanitizes uncaught API errors", async () => {
  const response = await testServer((app) => {
    app.get("/api/failure", () => {
      throw new Error("database password=do-not-expose");
    });
  });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.match(body.error.correlationId, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(body), /database|password|do-not-expose/i);
  assert.equal(response.headers.get("x-correlation-id"), body.error.correlationId);
});

test("diagnostics accepts a bounded safe inbound correlation id", async () => {
  const response = await testServer((app) => {
    app.get("/api/failure", () => {
      throw new Error("internal-only");
    });
  });
  assert.equal(response.status, 500);

  const app = express();
  installDiagnostics(app);
  app.get("/api/failure", (_request, res) => res.json({ correlationId: _request.correlationId }));
  installErrorHandler(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const result = await testServer.request(server.address().port, { "X-Correlation-Id": "trace-123" });
    assert.equal((await result.json()).correlationId, "trace-123");
    assert.equal(result.headers.get("x-correlation-id"), "trace-123");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
