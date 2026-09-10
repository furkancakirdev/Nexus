import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import crypto from "node:crypto";
import { createApp } from "./index.mjs";
import { createCpmReadOnlyExecutor, fingerprintCpmQuery } from "./cpmReadOnly.mjs";

const passwordHash = crypto.createHash("sha256").update("test").digest("hex");

function stateStore() {
  let state = { settings: null, employees: [], costOverrides: [], revision: 1 };
  return {
    async read() { return structuredClone(state); },
    async update(mutator) {
      const next = await mutator(structuredClone(state));
      state = { ...next, revision: state.revision + 1 };
      return structuredClone(state);
    },
  };
}

async function startApp() {
  const ledgerRouter = express.Router();
  ledgerRouter.get("/api/overview", (_request, response) => response.json({ rows: [{ id: "isolated-1" }] }));
  const app = createApp({
    auth: { secret: "integration-secret", username: "admin", passwordHash },
    stateStore: stateStore(),
    ledgerRouter,
    healthHandler: (_request, response) => response.json({ connected: false, mode: "test" }),
    staticRoot: null,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test" }),
  });
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

test("composed API denies unauthenticated access and permits authorized overview", async () => {
  const { server, baseUrl } = await startApp();
  try {
    const denied = await fetch(`${baseUrl}/api/overview`);
    assert.equal(denied.status, 401);

    const cookie = await login(baseUrl);
    const allowed = await fetch(`${baseUrl}/api/overview`, { headers: { cookie } });
    assert.equal(allowed.status, 200);
    assert.deepEqual((await allowed.json()).rows, [{ id: "isolated-1" }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("composed API enforces state payload constraints and CSRF on mutation", async () => {
  const { server, baseUrl } = await startApp();
  try {
    const cookie = await login(baseUrl);
    const csrf = cookie.match(/nexus_csrf=([^;]+)/)?.[1];
    const invalid = await fetch(`${baseUrl}/api/app-state`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", origin: baseUrl, "x-csrf-token": csrf },
      body: JSON.stringify({ settings: null, employees: "not-an-array" }),
    });
    assert.equal(invalid.status, 400);

    const missingCsrf = await fetch(`${baseUrl}/api/app-state`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ settings: {}, employees: [], costOverrides: [] }),
    });
    assert.equal(missingCsrf.status, 403);
    assert.ok(csrf);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("isolated state adapter serializes updates and preserves revisions", async () => {
  const store = stateStore();
  const [first, second] = await Promise.all([
    store.update((current) => ({ ...current, employees: [{ id: "one" }] })),
    store.update((current) => ({ ...current, employees: [{ id: "two" }] })),
  ]);
  assert.equal(first.revision, 2);
  assert.equal(second.revision, 3);
  assert.equal((await store.read()).revision, 3);
});

test("representative SQL integration contract executes parameterized fake request only for approved query", async () => {
  const query = "SELECT * FROM dbo.CpmReadModel WHERE company = @company";
  const received = [];
  const request = {
    input(name, type, value) { received.push({ name, type, value }); return this; },
    async query(sql) { received.push({ sql }); return { recordsets: [[{ id: 1 }]] }; },
  };
  const execute = createCpmReadOnlyExecutor({ allowedFingerprints: { integration: fingerprintCpmQuery(query) } });
  request.input("company", "VarChar", "01");
  const result = await execute({ request, queryId: "integration", query });
  assert.deepEqual(result.recordsets[0], [{ id: 1 }]);
  assert.deepEqual(received[0], { name: "company", type: "VarChar", value: "01" });
  await assert.rejects(() => execute({ request, queryId: "integration", query: `${query} -- tampered` }));
});
