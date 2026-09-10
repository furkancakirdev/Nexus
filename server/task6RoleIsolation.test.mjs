import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  CAPABILITIES,
  capabilitiesForRole,
  authorizeCapability,
} from "./capabilities.mjs";
import { buildFinalInvoiceLedger } from "./finalInvoiceLedger.mjs";
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

async function startInventoryContractApp() {
  const ledger = buildFinalInvoiceLedger({
    economics: [],
    lineage: [],
    actorEvents: [],
    pilotOrders: [],
  });
  const app = createApp({
    auth: { secret: "inventory-contract-test-secret", identityProvider: identityProvider() },
    stateStore: stateStore(),
    ledgerService: {
      async get() {
        return { value: ledger };
      },
    },
    healthHandler: (_request, response) => response.json({ healthy: true }),
    staticRoot: null,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function parityRow(overrides = {}) {
  return {
    rootId: overrides.rootId || "PARITY-1",
    documentType: 85,
    documentNo: overrides.documentNo || "PARITY-1",
    documentDate: "2026-01-10T00:00:00.000Z",
    customerCode: "C-PARITY",
    customerName: "Parity müşterisi",
    productCode: overrides.productCode || "P-PARITY",
    productName: "Parity ürünü",
    quantity: 1,
    isSale: true,
    grossAmount: 1000,
    discountAmount: 0,
    netAmount: 1000,
    signedNetSales: 1000,
    lineCost: 400,
    costMethod: "priorPurchase",
    financeV2: {
      lineCostTryExVat: 400,
      costStatus: "covered",
      productCurrency: "TRY",
      reviewReason: null,
    },
    ...overrides,
  };
}

async function startParityApp() {
  const ledger = {
    rows: [
      parityRow(),
      parityRow({
        rootId: "PARITY-2",
        documentNo: "PARITY-2",
        documentDate: "2026-02-10T00:00:00.000Z",
        productCode: "P-PARITY-USD",
        financeV2: {
          lineCostTryExVat: 320,
          costStatus: "covered",
          productCurrency: "USD",
          reviewReason: null,
        },
        documentSellingRate: 40,
        signedNetSales: 800,
        netAmount: 800,
        grossAmount: 800,
        lineCost: 320,
      }),
    ],
    exchangeRates: [
      { rateDate: "2026-01-31", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2 },
      { rateDate: "2026-01-31", rateCurrency: "USD", halkbankBuyingRate: 80, halkbankSellingRate: 80.2 },
      { rateDate: "2026-02-28", rateCurrency: "EUR", halkbankBuyingRate: 50, halkbankSellingRate: 50.2 },
      { rateDate: "2026-02-28", rateCurrency: "USD", halkbankBuyingRate: 100, halkbankSellingRate: 100.2 },
    ],
    totals: { netSales: 1800 },
  };
  const app = createApp({
    auth: { secret: "parity-contract-test-secret", identityProvider: identityProvider() },
    stateStore: stateStore(),
    ledgerService: { async get() { return { value: ledger, ledgerVersion: "parity", generatedAt: "fixture", cache: { status: "hit" } }; } },
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
  assert.equal((await fetch(`${baseUrl}/API/overview`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/Api/build-info`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
  for (const route of ["/api/sales-cases", "/api/inventory-research"]) {
    assert.equal((await fetch(`${baseUrl}${route}`)).status, 401);
  }
  for (const route of ["/api/build-info", "/api/readiness?year=2026"]) {
    assert.equal((await fetch(`${baseUrl}${route}`)).status, 401);
  }

  const reporting = await login(baseUrl, "reporting");
  assert.equal(reporting.response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/overview`, { headers: { cookie: reporting.cookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/build-info`, { headers: { cookie: reporting.cookie } })).status, 200);
  const readiness = await fetch(`${baseUrl}/api/readiness?year=2026`, { headers: { cookie: reporting.cookie } });
  assert.equal(readiness.status, 200);
  assert.equal((await readiness.json()).ready, false);
  for (const route of ["/api/sales-cases", "/api/inventory-research", "/api/audit-ledger", "/api/audit-samples"]) {
    assert.equal((await fetch(`${baseUrl}${route}`, { headers: { cookie: reporting.cookie } })).status, 403);
  }
  assert.equal((await fetch(`${baseUrl}/api/approvals?year=2026`, { headers: { cookie: reporting.cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/app-state`, { headers: { cookie: reporting.cookie } })).status, 403);

  const operational = await login(baseUrl, "operational");
  assert.equal((await fetch(`${baseUrl}/api/overview`, { headers: { cookie: operational.cookie } })).status, 403);
  assert.notEqual((await fetch(`${baseUrl}/api/sales-cases`, { headers: { cookie: operational.cookie } })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/inventory-research`, { headers: { cookie: operational.cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/audit-ledger`, { headers: { cookie: operational.cookie } })).status, 403);

  const admin = await login(baseUrl, "admin");
  assert.equal((await fetch(`${baseUrl}/api/overview`, { headers: { cookie: admin.cookie } })).status, 200);
  for (const route of ["/api/sales-cases", "/api/inventory-research", "/api/audit-ledger", "/api/audit-samples"]) {
    const status = (await fetch(`${baseUrl}${route}`, { headers: { cookie: admin.cookie } })).status;
    assert.ok([403, 503].includes(status), `${route} fail-closed dönmeli`);
  }
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

test("inventory source contract reaches readiness and inventory research API boundaries", async (t) => {
  const { server, baseUrl } = await startInventoryContractApp();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const session = await login(baseUrl, "admin");
  const headers = { cookie: session.cookie };

  const readinessResponse = await fetch(`${baseUrl}/api/readiness?year=2026`, { headers });
  assert.equal(readinessResponse.status, 200);
  const readiness = await readinessResponse.json();
  assert.equal(readiness.inventorySource.status, "missing");
  assert.equal(readiness.inventorySource.financialStatus, "blocked");
  assert.equal(readiness.inventorySource.reviewReason, "inventory-movement-source-not-collected");
  assert.ok(readiness.blockers.includes("inventory-source-not-verified"));
  assert.ok(readiness.blockers.includes("official-cost-coverage-insufficient"));

  const inventoryResponse = await fetch(`${baseUrl}/api/inventory-research?year=2026`, { headers });
  assert.equal(inventoryResponse.status, 403);
  assert.deepEqual(await inventoryResponse.json(), { error: "Bu ürün yüzeyi geçici olarak devre dışıdır." });
});

test("overview and department API projections preserve multi-currency annual EUR parity", async (t) => {
  const { server, baseUrl } = await startParityApp();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const session = await login(baseUrl, "admin");
  const headers = { cookie: session.cookie };

  const [overviewResponse, departmentResponse] = await Promise.all([
    fetch(`${baseUrl}/api/overview?year=2026`, { headers }),
    fetch(`${baseUrl}/api/department-analysis?year=2026`, { headers }),
  ]);
  assert.equal(overviewResponse.status, 200);
  assert.equal(departmentResponse.status, 200);
  const overview = await overviewResponse.json();
  const department = await departmentResponse.json();

  assert.equal(overview.readOnly, true);
  assert.equal(department.readOnly, true);
  assert.equal(overview.ledgerVersion, department.ledgerVersion);
  assert.equal(overview.canonicalMetric.try.netSales, department.totals.canonicalMetric.try.netSales);
  assert.equal(overview.canonicalMetric.eur.netSales, 60);
  assert.equal(department.totals.canonicalMetric.eur.netSales, 60);
  assert.equal(department.totals.canonicalMetric.eur.profit, 36);
  assert.equal(department.totals.canonicalMetric.eur.margin, 60);
  assert.equal(department.reconciliation.difference, 0);
});
