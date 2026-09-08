import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { buildExchangeRateIndex, buildRateSet } from "../shared/eurReporting.mjs";
import { createUnifiedLedgerRouter, resolveMonthRateSet } from "./ledgerApi.mjs";

const index = buildExchangeRateIndex([
  {
    rateDate: "2026-01-31",
    rateCurrency: "EUR",
    halkbankBuyingRate: 40,
    halkbankSellingRate: 40.2,
    exchangeSourceId: "DVZHAR-EUR-JAN",
  },
  {
    rateDate: "2026-07-28",
    rateCurrency: "EUR",
    halkbankBuyingRate: 45,
    halkbankSellingRate: 45.2,
    exchangeSourceId: "DVZHAR-EUR-JUL",
  },
]);

const januaryRateSet = buildRateSet(index, "2026-01-31");

function ledgerFixture(exchangeRates) {
  return {
    rows: [{
      rootId: "RATE-1",
      documentDate: "2026-01-10T10:00:00.000Z",
      productCode: "P-1",
      isSale: true,
      grossAmount: 100,
      discountAmount: 0,
      netAmount: 100,
      signedNetSales: 100,
      lineCost: null,
    }],
    totals: { netSales: 100, rowCount: 1 },
    exchangeRates,
  };
}

async function withApiServer(router, run) {
  const app = express();
  app.use(router);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

function routeFixture({ approval = null, exchangeRates = [] } = {}) {
  return {
    ledgerService: { get: async () => ({
      value: ledgerFixture(exchangeRates),
      ledgerVersion: "rate-characterization",
      generatedAt: "2026-09-08T00:00:00.000Z",
      cache: { status: "hit" },
    }) },
    getAppState: async () => ({ approvals: { "2026": approval ? { "1": approval } : {} } }),
    logger: { error() {} },
  };
}

test("locked V2 approval uses its stored frozen rate set", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: {
      locked: true,
      snapshotSchemaVersion: 2,
      exchangeRateSet: januaryRateSet,
    },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, true);
  assert.equal(resolved.rateSet.eurTryBuyingRate, 40);
});

test("locked V2 approval with malformed rate evidence fails closed", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: {
      locked: true,
      snapshotSchemaVersion: 2,
      exchangeRateSet: { bank: "HALKBANK" },
    },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, true);
  assert.equal(resolved.rateSet, null);
});

test("legacy locked approval without stored rate evidence retains month-end fallback", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: { locked: true },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, true);
  assert.equal(resolved.rateSet.eurTryBuyingRate, 40);
});

test("open approval uses report-date rate dynamically", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: { locked: false },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, false);
  assert.equal(resolved.rateSet.eurTryBuyingRate, 45);
});

test("overview direct flow uses report-date rates for an open period", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const router = createUnifiedLedgerRouter(routeFixture({
    approval: { locked: false },
    exchangeRates: [
      { rateDate: "2026-01-31", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2 },
      { rateDate: today, rateCurrency: "EUR", halkbankBuyingRate: 55, halkbankSellingRate: 55.2 },
    ],
  }));

  await withApiServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/overview?year=2026`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.eurRateSets[1].frozen, false);
    assert.equal(payload.eurRateSets[1].reportDate, today);
    assert.equal(payload.eurRateSets[1].eurTryBuyingRate, 55);
  });
});

test("overview direct flow preserves the frozen snapshot for a locked period", async () => {
  const router = createUnifiedLedgerRouter(routeFixture({
    approval: {
      locked: true,
      snapshotSchemaVersion: 2,
      exchangeRateSet: januaryRateSet,
    },
    exchangeRates: [
      { rateDate: "2026-01-31", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2 },
      { rateDate: "2026-09-08", rateCurrency: "EUR", halkbankBuyingRate: 55, halkbankSellingRate: 55.2 },
    ],
  }));

  await withApiServer(router, async (baseUrl) => {
    const payload = await fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json());
    assert.equal(payload.eurRateSets[1].frozen, true);
    assert.equal(payload.eurRateSets[1].reportDate, "2026-01-31");
    assert.equal(payload.eurRateSets[1].eurTryBuyingRate, 40);
  });
});

test("overview direct flow fails closed when locked rate evidence is malformed", async () => {
  const router = createUnifiedLedgerRouter(routeFixture({
    approval: {
      locked: true,
      snapshotSchemaVersion: 2,
      exchangeRateSet: { bank: "HALKBANK" },
    },
    exchangeRates: [
      { rateDate: "2026-01-31", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2 },
      { rateDate: "2026-09-08", rateCurrency: "EUR", halkbankBuyingRate: 55, halkbankSellingRate: 55.2 },
    ],
  }));

  await withApiServer(router, async (baseUrl) => {
    const payload = await fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json());
    assert.equal(payload.eurRateSets[1].frozen, true);
    assert.equal(payload.eurRateSets[1].reportDate, null);
    assert.equal(payload.eurRateSets[1].eurTryBuyingRate, null);
    assert.equal(payload.rows[0].eurRevenueComplete, false);
  });
});
