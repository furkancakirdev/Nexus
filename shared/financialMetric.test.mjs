import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateFinancialMetric,
  reconcileFinancialMetrics,
} from "../shared/financialMetric.mjs";
import {
  buildExchangeRateIndex,
  buildRateSet,
  decorateBasketEur,
} from "../shared/eurReporting.mjs";
import { buildOverviewRows, decorateOverviewRowsEur } from "../server/ledgerApi.mjs";
import { buildDepartmentAnalysis } from "../server/departmentAnalysis.mjs";

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

test("existing overview and department boundaries reconcile with the canonical contract", () => {
  const ledger = {
    rows: [
      { documentDate: "2026-02-15", documentNo: "S-1", documentType: 17, productCode: "P-1", isSale: true, grossAmount: 500, discountAmount: 0, netAmount: 500, signedNetSales: 500, signedVatAmount: 0, signedInvoiceTotalInclVat: 500, financeV2: { productCurrency: "USD", reviewReason: null, lineCostTryExVat: 200, lineCostCurrencyExVat: 8 }, documentSellingRate: 25, department: "service", attributionConfidence: "confirmed", commercialOwner: "OWNER", productCurrency: "USD", lineCost: 200, purchaseNo: "P-1", customerCode: "C-1", rootId: "S-1" },
      { documentDate: "2026-02-16", documentNo: "R-1", documentType: 18, productCode: "P-1", isSale: false, grossAmount: 0, discountAmount: 0, netAmount: 100, signedNetSales: -100, signedVatAmount: 0, signedInvoiceTotalInclVat: -100, financeV2: { productCurrency: "USD", reviewReason: null, lineCostTryExVat: -40, lineCostCurrencyExVat: -1.6 }, documentSellingRate: 25, department: "service", attributionConfidence: "confirmed", commercialOwner: "OWNER", productCurrency: "USD", lineCost: -40, purchaseNo: "P-1", customerCode: "C-1", rootId: "R-1" },
      { documentDate: "2026-02-17", documentNo: "Q-1", documentType: 17, productCode: "P-1", isSale: true, grossAmount: 50, discountAmount: 0, netAmount: 50, signedNetSales: 50, signedVatAmount: 0, signedInvoiceTotalInclVat: 50, financeV2: { productCurrency: "USD", reviewReason: "missing-cost" }, documentSellingRate: 25, department: "service", attributionConfidence: "confirmed", commercialOwner: "OWNER", productCurrency: "USD", customerCode: "C-1", rootId: "Q-1" },
      { documentDate: "2026-02-18", documentNo: "X-1", documentType: 17, productCode: "KOMISYON", isSale: true, grossAmount: 900, discountAmount: 0, netAmount: 900, signedNetSales: 900, signedVatAmount: 0, signedInvoiceTotalInclVat: 900, financeV2: { productCurrency: "USD", reviewReason: null, lineCostTryExVat: 300, lineCostCurrencyExVat: 12 }, documentSellingRate: 25, department: "service", attributionConfidence: "confirmed", commercialOwner: "OWNER", productCurrency: "USD", lineCost: 300, purchaseNo: "X-1", customerCode: "C-1", rootId: "X-1" },
    ],
  };
  const index = buildExchangeRateIndex([
    { rateDate: "2026-02-28", rateCurrency: "EUR", halkbankBuyingRate: 50, halkbankSellingRate: 50.2 },
    { rateDate: "2026-02-28", rateCurrency: "USD", halkbankBuyingRate: 35, halkbankSellingRate: 35.2 },
  ]);
  const rateSet = buildRateSet(index, "2026-02-28");
  const overview = decorateOverviewRowsEur(buildOverviewRows(ledger), { index, year: 2026, reportDate: "2026-02-28" }).rows[0];
  const department = buildDepartmentAnalysis({ ledger, year: 2026 }).totals;
  const departmentEur = decorateBasketEur(department.byCurrency, rateSet).eurEquivalent;
  const canonical = aggregateFinancialMetric(ledger.rows.map((row) => ({
    period: "2026-02",
    signedNetSalesTry: row.signedNetSales,
    productCurrency: row.financeV2.productCurrency,
    documentSellingRate: row.documentSellingRate,
    financeV2: row.financeV2,
    excluded: row.productCode === "KOMISYON",
  })), { rateSets: { "2026-02": rateSet }, basisId: "cross-path-1" });
  const canonicalCovered = aggregateFinancialMetric(ledger.rows.slice(0, 2).map((row) => ({
    period: "2026-02",
    signedNetSalesTry: row.signedNetSales,
    productCurrency: row.financeV2.productCurrency,
    documentSellingRate: row.documentSellingRate,
    financeV2: row.financeV2,
  })), { rateSets: { "2026-02": rateSet }, basisId: "cross-path-covered-1" });

  for (const field of ["netSales", "cost", "profit"]) {
    assert.equal(overview[field === "netSales" ? "coveredNetSales" : field], canonicalCovered.try[field]);
    assert.equal(department[field], field === "profit"
      ? canonical.try[field] - canonical.scope.review.netSales
      : canonical.try[field]);
    assert.ok(Math.abs(departmentEur[field] - canonical.eur[field]) < 1e-12);
    assert.ok(Math.abs(overview.eurEquivalent[field] - canonicalCovered.eur[field]) < 1e-12);
  }
  assert.equal(overview.margin, canonicalCovered.try.profit / canonicalCovered.try.netSales * 100);
  assert.equal(department.margin, department.profit / department.netSales * 100);
  assert.equal(overview.reviewNetSales, canonical.scope.review.netSales);
  assert.equal(canonical.scope.excluded.lines, 1);
  assert.equal(canonical.scope.excluded.netSales, 900);
  assert.equal(overview.byCurrency.USD.lineCount, canonicalCovered.byCurrency.USD.lineCount);
  assert.equal(department.byCurrency.USD.lineCount, canonical.byCurrency.USD.lineCount);
  assert.deepEqual(reconcileFinancialMetrics(
    { netSales: overview.coveredNetSales, cost: overview.cost, profit: overview.profit },
    canonicalCovered.try,
    { basisId: canonicalCovered.basisId },
  ), { status: "MATCH", basisId: "cross-path-covered-1", deltas: { netSales: 0, cost: 0, profit: 0 } });
  assert.deepEqual(reconcileFinancialMetrics(
    { netSales: department.netSales, cost: department.cost, profit: department.profit },
    canonical.try,
    { basisId: canonical.basisId },
  ), { status: "MISMATCH", basisId: "cross-path-1", deltas: { netSales: 0, cost: 0, profit: -50 } });
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

test("an exact-period rate set cannot fall back to a single rate set", () => {
  const result = aggregateFinancialMetric([coveredRow({ period: "2026-03" })], {
    rateSets: RATE_SETS,
    rateSet: RATES,
  });
  assert.equal(result.status, "INCELEME");
  assert.equal(result.eur.netSales, 0);
  assert.equal(result.eur.complete, false);
});

test("review rows preserve known signed TRY cost and profit while excluding EUR", () => {
  const result = aggregateFinancialMetric([coveredRow({
    period: "2026-03",
    financeV2: { reviewReason: null, lineCostTryExVat: 200, lineCostCurrencyExVat: 8 },
  })], { rateSets: RATE_SETS });
  assert.equal(result.status, "INCELEME");
  assert.equal(result.scope.review.netSales, 500);
  assert.equal(result.scope.review.cost, 200);
  assert.equal(result.scope.review.profit, 300);
  assert.equal(result.try.netSales, 500);
  assert.equal(result.try.cost, 200);
  assert.equal(result.try.profit, 300);
  assert.equal(result.eur.netSales, 0);
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
  const baseline = aggregateFinancialMetric([coveredRow()], { rateSets: RATE_SETS });
  const result = aggregateFinancialMetric([
    coveredRow(),
    coveredRow({ id: "excluded", excluded: true, signedNetSalesTry: 900 }),
  ], { rateSets: RATE_SETS });

  assert.equal(result.try.netSales, 500);
  assert.equal(result.scope.excluded.lines, 1);
  assert.equal(result.scope.excluded.netSales, 900);
  assert.equal(result.evidence.excludedLines, 1);
  assert.equal(result.eur.netSales, baseline.eur.netSales);
  assert.equal(result.eur.profit, baseline.eur.profit);
  assert.equal(result.eur.complete, baseline.eur.complete);
  assert.deepEqual(result.byCurrency, baseline.byCurrency);
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
