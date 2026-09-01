import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  CAPABILITIES,
  capabilitiesForRole,
  authorizeCapability,
} from "./capabilities.mjs";
import { createApp } from "./index.mjs";

const PASSWORDS = {
  admin: "admin-pass",
  reporting: "reporting-pass",
  operational: "operations-pass",
};

const identities = {
  admin: { username: "admin-fixture", displayName: "Admin fixture", role: "admin" },
  reporting: { username: "reporting-fixture", displayName: "Reporting fixture", role: "reporting" },
  operational: { username: "operational-fixture", displayName: "Operational fixture", role: "operational" },
};

function identityProvider() {
  return {
    async authenticate({ username, password }) {
      const identity = Object.values(identities).find((candidate) => candidate.username === username);
      const role = Object.entries(identities).find(([, candidate]) => candidate.username === username)?.[0];
      if (!identity || PASSWORDS[role] !== password) return null;
      return identity;
    },
  };
}

function stateStore() {
  return {
    async read() { return { settings: {}, employees: [], approvals: {}, auditEvents: [] }; },
    async update() { return { savedAt: "fixture" }; },
    async approve() {},
    async reopen() {},
  };
}

function fixtureRouter() {
  const router = express.Router();
  router.get("/api/overview", (_request, response) => response.json({ fixture: true }));
  router.get("/api/approvals", (_request, response) => response.json({ approvals: {} }));
  router.put("/api/approvals/:year/:month", (_request, response) => response.json({ saved: true }));
  return router;
}

async function startApp() {
  const app = createApp({
    auth: { secret: "task-6-test-secret", identityProvider: identityProvider() },
    stateStore: stateStore(),
    ledgerRouter: fixtureRouter(),
    approvalRouter: fixtureRouter(),
    healthHandler: (_request, response) => response.json({ healthy: true }),
    staticRoot: null,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function login(baseUrl, role) {
  const response = await fetch(`${baseUrl}/api/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: identities[role].username, password: PASSWORDS[role] }),
  });
  const cookies = response.headers.getSetCookie();
  return {
    response,
    cookie: cookies.map((value) => value.split(";", 1)[0]).join("; "),
    csrf: (await response.json()).csrfToken,
  };
}

test("central role capabilities are atomic and default deny unknown roles", () => {
  assert.deepEqual(capabilitiesForRole("admin"), [
    CAPABILITIES.REPORTING_READ,
    CAPABILITIES.OPERATIONS_READ,
    CAPABILITIES.APPROVALS_MANAGE,
    CAPABILITIES.SETTINGS_MANAGE,
  ]);
  assert.deepEqual(capabilitiesForRole("reporting"), [CAPABILITIES.REPORTING_READ]);
  assert.deepEqual(capabilitiesForRole("operational"), [CAPABILITIES.OPERATIONS_READ]);
  assert.deepEqual(capabilitiesForRole("unknown"), []);
});

test("capability policy denies missing capability even for an authenticated user", () => {
  const middleware = authorizeCapability(CAPABILITIES.SETTINGS_MANAGE);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  middleware({ user: { capabilities: [CAPABILITIES.REPORTING_READ] } }, response, assert.fail);
  assert.equal(response.code, 403);
});

test("role isolation authenticates sessions and restricts reporting, operations, approvals, and settings", async (t) => {
  const { server, baseUrl } = await startApp();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  assert.equal((await fetch(`${baseUrl}/api/overview`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/health`)).status, 401);

  const reporting = await login(baseUrl, "reporting");
  assert.equal(reporting.response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/overview`, { headers: { cookie: reporting.cookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/approvals?year=2026`, { headers: { cookie: reporting.cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/app-state`, { headers: { cookie: reporting.cookie } })).status, 403);

  const operational = await login(baseUrl, "operational");
  assert.equal((await fetch(`${baseUrl}/api/overview`, { headers: { cookie: operational.cookie } })).status, 403);

  const admin = await login(baseUrl, "admin");
  assert.equal((await fetch(`${baseUrl}/api/overview`, { headers: { cookie: admin.cookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/app-state`, { headers: { cookie: admin.cookie } })).status, 200);
  const write = await fetch(`${baseUrl}/api/app-state`, {
    method: "PUT",
    headers: { cookie: admin.cookie, "content-type": "application/json", "x-csrf-token": admin.csrf },
    body: JSON.stringify({ settings: {}, employees: [], costOverrides: [] }),
  });
  assert.equal(write.status, 200);
  const csrfFailure = await fetch(`${baseUrl}/api/app-state`, {
    method: "PUT",
    headers: { cookie: admin.cookie, "content-type": "application/json" },
    body: JSON.stringify({ settings: {}, employees: [], costOverrides: [] }),
  });
  assert.equal(csrfFailure.status, 403);
  assert.equal((await fetch(`${baseUrl}/api/not-declared`, { headers: { cookie: admin.cookie } })).status, 403);
});

test("logout clears the injected session and session read is authenticated", async (t) => {
  const { server, baseUrl } = await startApp();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const session = await login(baseUrl, "reporting");
  assert.equal((await fetch(`${baseUrl}/api/session`, { headers: { cookie: session.cookie } })).status, 200);
  const logout = await fetch(`${baseUrl}/api/session/logout`, {
    method: "POST",
    headers: { cookie: session.cookie, "x-csrf-token": session.csrf, origin: "http://127.0.0.1" },
  });
  assert.equal(logout.status, 200);
  assert.equal(logout.headers.getSetCookie().length, 2);
  assert.equal((await fetch(`${baseUrl}/api/session`)).status, 401);
});
