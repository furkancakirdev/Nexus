import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildOverviewRows,
  aggregateDepartmentMetric,
  buildAuditReportProjections,
  filterAuditLedger,
} from "./ledgerApi.mjs";
import { buildDepartmentAnalysis } from "./departmentAnalysis.mjs";
import { aggregateFinancialMetric } from "../shared/financialMetric.mjs";

function row(overrides = {}) {
  return {
    rootId: overrides.rootId || "R-1",
    documentDate: "2026-01-10T00:00:00.000Z",
    documentType: 85,
    documentNo: "SF-1",
    customerCode: "C-1",
    productCode: "P-1",
    productName: "Parça",
    quantity: 2,
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
    department: "service",
    attributionConfidence: "confirmed",
    ...overrides,
  };
}

test("F-015 exposes the EUR-selected top month instead of sorting the TL fallback", async () => {
  const months = buildOverviewRows({ rows: [
    row({ documentDate: "2026-01-10", signedNetSales: 1000, netAmount: 1000 }),
    row({ rootId: "R-2", documentDate: "2026-02-10", signedNetSales: 900, netAmount: 900 }),
  ] });
  const decorated = months.map((item, index) => ({
    ...item,
    eurEquivalent: index === 0
      ? { netSales: 10, cost: 4, profit: 6 }
      : { netSales: 20, cost: 8, profit: 12 },
  }));
  const eurTop = [...decorated].sort((left, right) => right.eurEquivalent.netSales - left.eurEquivalent.netSales)[0];
  assert.equal(eurTop.month, 2);
  const salesSource = await readFile(new URL("../src/SalesPage.jsx", import.meta.url), "utf8");
  assert.match(salesSource, /topSalesMonth[\s\S]*totals\.eurHasAny[\s\S]*b\.eurNetSales - a\.eurNetSales/);
});

test("F-018 audit projections expose canonical calculated cost and signed gross profit", () => {
  const result = filterAuditLedger({ rows: [row({ quantity: 2, netAmount: 1000, signedNetSales: 1000 })] });
  assert.equal(result.rows[0].calculatedCost, 400);
  assert.equal(result.rows[0].grossProfit, 600);
});

test("F-019 department margin is null when canonical denominator is zero", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    ledger: { rows: [row({ signedNetSales: 0, netAmount: 0, grossAmount: 0, lineCost: 0, financeV2: { lineCostTryExVat: 0, costStatus: "covered", productCurrency: "TRY", reviewReason: null } })] },
  });
  const service = result.departments.find((item) => item.id === "service");
  assert.equal(service.margin, null);
  assert.equal(service.eurMargin, null);
});

test("F-020 department metrics preserve byCurrency and canonical evidence counts", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    ledger: { rows: [row({
      financeV2: { lineCostTryExVat: 400, costStatus: "covered", productCurrency: "EUR", reviewReason: null },
      documentSellingRate: 40,
    }), row({
      rootId: "R-2",
      financeV2: { lineCostTryExVat: null, costStatus: "review", productCurrency: "USD", reviewReason: "missing-rate" },
      documentSellingRate: null,
    })] },
  });
  const service = result.departments.find((item) => item.id === "service");
  assert.equal(service.byCurrency.EUR.lineCount, 1);
  assert.equal(service.byCurrency.INCELEME.lineCount, 1);
  assert.deepEqual(service.evidence, { coveredLines: 1, reviewLines: 1, excludedLines: 0 });
});

test("F-018 audit projections fail closed for review and excluded evidence", () => {
  const review = filterAuditLedger({ rows: [row({
    financeV2: { lineCostTryExVat: null, costStatus: "review", productCurrency: "TRY", reviewReason: "missing-cost" },
  })] });
  const excluded = filterAuditLedger({ rows: [row({ productCode: "KOMISYON" })] });
  assert.equal(review.rows[0].calculatedCost, null);
  assert.equal(review.rows[0].grossProfit, null);
  assert.equal(excluded.rows[0].calculatedCost, null);
  assert.equal(excluded.rows[0].grossProfit, null);
});

test("annual department EUR projection keeps exact period rates", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    ledger: { rows: [
      row({ documentDate: "2026-01-10", financeV2: { lineCostTryExVat: 400, costStatus: "covered", productCurrency: "USD", reviewReason: null }, documentSellingRate: 40 }),
      row({ rootId: "R-2", documentDate: "2026-02-10", financeV2: { lineCostTryExVat: 400, costStatus: "covered", productCurrency: "USD", reviewReason: null }, documentSellingRate: 40 }),
    ] },
  });
  const months = result.months.filter((item) => item.service.netSales);
  assert.equal(months.length, 2);
  const rateSets = {
    "1": { reportDate: "2026-01-31", eurTryBuyingRate: 40, rates: { USD: { buyingRate: 40 } } },
    "2": { reportDate: "2026-02-28", eurTryBuyingRate: 40, rates: { USD: { buyingRate: 80 } } },
  };
  const january = aggregateDepartmentMetric(months[0].all, rateSets);
  const february = aggregateDepartmentMetric(months[1].all, rateSets);
  assert.equal(january.try.netSales, 1000);
  assert.equal(february.try.netSales, 1000);
  assert.equal(january.eur.netSales, 25);
  assert.equal(february.eur.netSales, 50);
});

test("selected period and currency reconcile across overview, department, and reports projections", () => {
  const fixture = row({
    documentDate: "2026-02-10",
    financeV2: { lineCostTryExVat: 400, costStatus: "covered", productCurrency: "USD", reviewReason: null },
    documentSellingRate: 40,
  });
  const overview = buildOverviewRows({ rows: [fixture] })[0];
  const department = buildDepartmentAnalysis({ year: 2026, ledger: { rows: [fixture] } }).months[1].all;
  const report = buildAuditReportProjections(filterAuditLedger({ rows: [fixture] }).rows).brand[0];
  assert.equal(report.netSales, overview.canonicalMetric.try.netSales);
  assert.equal(report.margin, overview.canonicalMetric.scope.confirmed.margin);
  assert.equal(department.canonicalMetric.try.netSales, overview.canonicalMetric.try.netSales);
  const rates = { "2": { reportDate: "2026-02-28", eurTryBuyingRate: 40, rates: { USD: { buyingRate: 80 } } } };
  const overviewEur = aggregateFinancialMetric([{
    signedNetSalesTry: fixture.signedNetSales, period: "2", productCurrency: "USD",
    documentSellingRate: 40, financeV2: fixture.financeV2,
  }], { rateSets: rates });
  const departmentEur = aggregateDepartmentMetric(department, rates);
  assert.equal(departmentEur.eur.netSales, overviewEur.eur.netSales);
  assert.equal(departmentEur.eurMargin, overviewEur.eurMargin);
});

test("critical React consumers read canonical fields without local financial arithmetic", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/SalesPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/DepartmentAnalysisPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AuditPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SummaryPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ReportsPage.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(sources[0], /topSalesMonth[\s\S]*eurNetSales/);
  assert.match(sources[1], /item\.eurMargin/);
  assert.match(sources[2], /row\.calculatedCost/);
  assert.match(sources[4], /canonicalMetric/);
  assert.doesNotMatch(sources[4], /row\.calculatedCost/);
});
