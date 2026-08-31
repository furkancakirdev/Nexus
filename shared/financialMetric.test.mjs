import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateFinancialMetric,
  reconcileFinancialMetrics,
} from "../shared/financialMetric.mjs";
import {
  buildExchangeRateIndex,
  buildRateSet,
} from "../shared/eurReporting.mjs";

const RATES = buildRateSet(buildExchangeRateIndex([
  { rateDate: "2026-01-15", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2, exchangeSourceId: "EUR-1" },
  { rateDate: "2026-01-15", rateCurrency: "USD", halkbankBuyingRate: 32, halkbankSellingRate: 32.2, exchangeSourceId: "USD-1" },
  { rateDate: "2026-02-15", rateCurrency: "EUR", halkbankBuyingRate: 50, halkbankSellingRate: 50.2, exchangeSourceId: "EUR-2" },
  { rateDate: "2026-02-15", rateCurrency: "USD", halkbankBuyingRate: 35, halkbankSellingRate: 35.2, exchangeSourceId: "USD-2" },
]), "2026-02-15");

const RATE_SETS = {
  "2026-01": buildRateSet(buildExchangeRateIndex([
    { rateDate: "2026-01-15", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2 },
    { rateDate: "2026-01-15", rateCurrency: "USD", halkbankBuyingRate: 32, halkbankSellingRate: 32.2 },
  ]), "2026-01-15"),
  "2026-02": RATES,
};

function coveredRow(overrides = {}) {
  return {
    id: "sale-1",
    period: "2026-02",
    department: "Service",
    signedNetSalesTry: 500,
    productCurrency: "USD",
    documentSellingRate: 25,
    financeV2: {
      reviewReason: null,
      lineCostTryExVat: 200,
      lineCostCurrencyExVat: 8,
    },
    ...overrides,
  };
}

test("identical ledger aggregation has one stable overview and department shape", () => {
  const rows = [coveredRow(), coveredRow({ id: "sale-2", signedNetSalesTry: -100, financeV2: { reviewReason: null, lineCostTryExVat: -40, lineCostCurrencyExVat: -1.6 } })];
  const overview = aggregateFinancialMetric(rows, { rateSets: RATE_SETS, basisId: "ledger-1" });
  const department = aggregateFinancialMetric(rows.filter((row) => row.department === "Service"), { rateSets: RATE_SETS, basisId: "ledger-1" });

  assert.deepEqual(department, overview);
  assert.equal(overview.try.netSales, 400);
  assert.equal(overview.try.cost, 160);
  assert.equal(overview.try.profit, 240);
  assert.equal(overview.eur.netSales, 11.2);
  assert.ok(Math.abs(overview.eur.cost - 4.48) < 1e-12);
  assert.equal(overview.eur.profit, 6.72);
  assert.equal(overview.eur.margin, 60);
  assert.equal(overview.eurMargin, 60);
});

test("missing cost and missing document rate are fail-closed review rows", () => {
  const result = aggregateFinancialMetric([
    coveredRow({ id: "missing-cost", financeV2: null }),
    coveredRow({ id: "missing-rate", documentSellingRate: null }),
  ], { rateSets: RATE_SETS });

  assert.equal(result.status, "INCELEME");
  assert.equal(result.scope.review.lines, 2);
  assert.equal(result.scope.review.netSales, 1000);
  assert.equal(result.eur.netSales, 0);
  assert.equal(result.eur.complete, false);
  assert.equal(result.evidence.coveredLines, 0);
  assert.equal(result.evidence.reviewLines, 2);
});

test("missing period rate evidence is fail-closed review without EUR leakage", () => {
  const result = aggregateFinancialMetric([coveredRow({ period: "2026-03" })], { rateSets: RATE_SETS });
  assert.equal(result.status, "INCELEME");
  assert.equal(result.scope.review.netSales, 500);
  assert.equal(result.eur.netSales, 0);
  assert.equal(result.eur.complete, false);
  assert.equal(result.byCurrency.INCELEME.netSales, 500);
});

test("signed returns reverse cost and profit without losing the negative sign", () => {
  const result = aggregateFinancialMetric([
    coveredRow({ signedNetSalesTry: -500, financeV2: { reviewReason: null, lineCostTryExVat: -200, lineCostCurrencyExVat: -8 } }),
  ], { rateSets: RATE_SETS });

  assert.equal(result.try.netSales, -500);
  assert.equal(result.try.cost, -200);
  assert.equal(result.try.profit, -300);
  assert.equal(result.eur.netSales, -14);
  assert.equal(result.eur.cost, -5.6);
});

test("excluded rows remain observable but are outside comparable totals", () => {
  const result = aggregateFinancialMetric([
    coveredRow(),
    coveredRow({ id: "excluded", excluded: true, signedNetSalesTry: 900 }),
  ], { rateSets: RATE_SETS });

  assert.equal(result.try.netSales, 500);
  assert.equal(result.scope.excluded.lines, 1);
  assert.equal(result.scope.excluded.netSales, 900);
  assert.equal(result.evidence.excludedLines, 1);
});

test("zero EUR denominator produces a null margin", () => {
  const result = aggregateFinancialMetric([
    coveredRow({ signedNetSalesTry: 0, financeV2: { reviewReason: null, lineCostTryExVat: 0, lineCostCurrencyExVat: 0 } }),
  ], { rateSets: RATE_SETS });
  assert.equal(result.eur.margin, null);
  assert.equal(result.eurMargin, null);
});

test("same period and currency share one basket while different periods use their own rates", () => {
  const result = aggregateFinancialMetric([
    coveredRow({ id: "jan-1", period: "2026-01", signedNetSalesTry: 100, financeV2: { reviewReason: null, lineCostTryExVat: 0, lineCostCurrencyExVat: 0 } }),
    coveredRow({ id: "jan-2", period: "2026-01", signedNetSalesTry: 100, financeV2: { reviewReason: null, lineCostTryExVat: 0, lineCostCurrencyExVat: 0 } }),
    coveredRow({ id: "feb-1", period: "2026-02", signedNetSalesTry: 100, financeV2: { reviewReason: null, lineCostTryExVat: 0, lineCostCurrencyExVat: 0 } }),
  ], { rateSets: RATE_SETS });

  assert.equal(result.byPeriod["2026-01"].byCurrency.USD.lineCount, 2);
  assert.equal(result.byPeriod["2026-02"].byCurrency.USD.lineCount, 1);
  assert.equal(result.eur.netSales, (4 * 32 / 40) * 2 + 4 * 35 / 50);
});

test("approved manual cost overrides finance evidence but unapproved manual cost does not", () => {
  const result = aggregateFinancialMetric([
    coveredRow({ id: "approved", manualCostTry: 100, manualCostApproved: true }),
    coveredRow({ id: "unapproved", manualCostTry: 1, manualCostApproved: false, financeV2: null }),
  ], { rateSets: RATE_SETS });

  assert.equal(result.try.cost, 100);
  assert.equal(result.scope.review.lines, 1);
  assert.equal(result.evidence.manualCostLines, 1);
});

test("reconciliation reports unrounded mismatch and incomplete evidence", () => {
  const mismatch = reconcileFinancialMetrics(
    { netSales: 100.125, cost: 40, profit: 60.125 },
    { netSales: 100, cost: 40, profit: 60 },
    { basisId: "basis-7" },
  );
  assert.equal(mismatch.status, "MISMATCH");
  assert.equal(mismatch.basisId, "basis-7");
  assert.deepEqual(mismatch.deltas, { netSales: 0.125, cost: 0, profit: 0.125 });

  const incomplete = reconcileFinancialMetrics({ netSales: null }, { netSales: 1 }, { basisId: "basis-8" });
  assert.equal(incomplete.status, "INCOMPLETE");
  assert.equal(incomplete.basisId, "basis-8");
});
