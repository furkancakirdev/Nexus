import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildOverviewRows, decorateOverviewRowsEur } from "./ledgerApi.mjs";
import { buildDepartmentAnalysis } from "./departmentAnalysis.mjs";
import { aggregateFinancialMetric } from "../shared/financialMetric.mjs";
import { buildExchangeRateIndex, buildRateSet } from "../shared/eurReporting.mjs";

const rateSet = buildRateSet(buildExchangeRateIndex([
  { rateDate: "2026-01-31", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2 },
  { rateDate: "2026-01-31", rateCurrency: "USD", halkbankBuyingRate: 32, halkbankSellingRate: 32.2 },
]), "2026-01-31");

function ledgerRow(overrides = {}) {
  return {
    rootId: overrides.rootId || "R-1", documentDate: "2026-01-10", documentType: 85,
    documentNo: overrides.documentNo || "SF-1", customerCode: "C-1", productCode: "P-1",
    productName: "Parça", quantity: 2, isSale: true, grossAmount: 1000, discountAmount: 0,
    netAmount: 1000, signedNetSales: 1000, lineCost: 400, costMethod: "priorPurchase",
    department: "service", commercialOwner: "OWNER", attributionConfidence: "confirmed",
    financeV2: { lineCostTryExVat: 400, productCurrency: "EUR", reviewReason: null },
    documentSellingRate: 40, ...overrides,
  };
}

test("server projections expose one canonical metric with complete EUR evidence", () => {
  const ledger = { rows: [ledgerRow()] };
  const overview = decorateOverviewRowsEur(buildOverviewRows(ledger), {
    index: buildExchangeRateIndex([{ rateDate: "2026-01-31", rateCurrency: "EUR", halkbankBuyingRate: 40, halkbankSellingRate: 40.2 }]),
    year: 2026, reportDate: "2026-01-31",
  }).rows[0];
  const department = buildDepartmentAnalysis({ ledger, year: 2026 }).departments.find((item) => item.id === "service");
  assert.equal(overview.canonicalMetric.try.netSales, department.canonicalMetric.try.netSales);
  assert.equal(overview.canonicalMetric.try.profit, department.canonicalMetric.try.profit);
  assert.equal(overview.eurComplete, true);
  assert.equal(overview.eurMargin, 60);
  assert.equal(department.canonicalMetric.evidence.reviewLines, 0);
});

test("overview kur kanıtı mixed CPM/TCMB kaynağını ve iz kimliklerini UI sözleşmesine taşır", () => {
  const index = buildExchangeRateIndex([
    { rateDate: "2026-01-30", rateCurrency: "EUR", buyingRate: 40, sellingRate: 40.2, source: "CPM", sourceIdentifier: "DVZHAR:EUR:2026-01-30" },
    { rateDate: "2026-01-30", rateCurrency: "USD", buyingRate: 32, sellingRate: 32.2, source: "TCMB", sourceIdentifier: "TP.DK.USD.A", evidenceHash: "sha256:test", retrievalMode: "live" },
  ]);
  const { eurRateSets } = decorateOverviewRowsEur(buildOverviewRows({ rows: [ledgerRow()] }), {
    index,
    year: 2026,
    reportDate: "2026-01-30",
  });
  assert.deepEqual(eurRateSets[1].sourceKinds, ["BASE", "CPM", "TCMB"]);
  assert.equal(eurRateSets[1].sourcePolicy, "CPM_HALKBANK_THEN_TCMB_V1");
  assert.equal(eurRateSets[1].rateSources.USD.sourceIdentifier, "TP.DK.USD.A");
});

test("partial EUR evidence is unavailable while review and excluded scope remain observable", () => {
  const rows = [
    ledgerRow({ rootId: "R-1", financeV2: { lineCostTryExVat: 400, productCurrency: "EUR", reviewReason: null }, documentSellingRate: 40 }),
    ledgerRow({ rootId: "R-2", financeV2: { lineCostTryExVat: null, productCurrency: "USD", reviewReason: "missing-rate" }, documentSellingRate: null }),
    ledgerRow({ rootId: "R-3", productCode: "KOMISYON", signedNetSales: 500 }),
  ];
  const metric = aggregateFinancialMetric(rows.map((item) => ({
    signedNetSalesTry: item.signedNetSales, period: "2026-01", excluded: item.productCode === "KOMISYON",
    productCurrency: item.financeV2?.productCurrency, documentSellingRate: item.documentSellingRate, financeV2: item.financeV2,
  })), { rateSets: { "2026-01": rateSet } });
  assert.equal(metric.status, "INCELEME");
  assert.equal(metric.eur.complete, false);
  assert.equal(metric.evidence.reviewLines, 1);
  assert.equal(metric.evidence.excludedLines, 1);
  assert.equal(metric.scope.excluded.netSales, 500);
});

test("zero denominator keeps TRY and EUR margin null across canonical projections", () => {
  const metric = aggregateFinancialMetric([{ signedNetSalesTry: 0, period: "2026-01", productCurrency: "TRY", documentSellingRate: 1, financeV2: { lineCostTryExVat: 0, reviewReason: null } }], { rateSets: { "2026-01": rateSet } });
  assert.equal(metric.try.margin, null);
  assert.equal(metric.eurMargin, null);
});

test("critical consumers require complete canonical EUR data and do not calculate financial fields", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/SalesPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/DepartmentAnalysisPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ReportsPage.jsx", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.match(source, /eurComplete|canonicalMetric|projectDepartmentEurMetric/);
    assert.doesNotMatch(source, /profit\s*\/\s*.*netSales/);
  }
  assert.doesNotMatch(sources[0], /eurEquivalent\?\.netSales/);
});
