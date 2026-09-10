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
import { aggregateFinancialMetric, formatCanonicalValue, projectCanonicalMetric, selectCanonicalTopPeriod } from "../shared/financialMetric.mjs";

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
  assert.match(salesSource, /selectCanonicalTopPeriod/);
  assert.match(salesSource, /eurComplete:\s*row\.eurAvailable/);
});

test("F-015 complete EUR rows select the top period through the canonical field contract", () => {
  const canonical = { status: "TAMAM", eur: { complete: true } };
  const selected = selectCanonicalTopPeriod([
    { month: 1, eurAvailable: true, eurEquivalent: { netSales: 100 } },
    { month: 2, eurAvailable: true, eurEquivalent: { netSales: 200 } },
  ].map((item) => ({ ...item, eurComplete: item.eurAvailable })), canonical);
  assert.equal(selected.month, 2);
});

test("F-018 audit projections expose canonical calculated cost and signed gross profit", () => {
  const result = filterAuditLedger({ rows: [row({ quantity: 2, netAmount: 1000, signedNetSales: 1000 })] });
  assert.equal(result.rows[0].calculatedCost, 400);
  assert.equal(result.rows[0].grossProfit, 600);
});

test("audit primary row projection uses the period EUR rate set and keeps TRY as source evidence", () => {
  const result = filterAuditLedger({ rows: [row({
    financeV2: { lineCostTryExVat: 400, costStatus: "covered", productCurrency: "USD", reviewReason: null },
    documentSellingRate: 40,
  })] }, {}, {
    rateSets: {
      "1": { reportDate: "2026-01-31", eurTryBuyingRate: 40, rates: { USD: { buyingRate: 80 } } },
    },
  });
  assert.equal(result.rows[0].eurAvailable, true);
  assert.equal(result.rows[0].eurEquivalent.netSales, 50);
  assert.equal(result.summary.filteredEurNetAmount, 50);
  assert.equal(result.summary.filteredNetAmount, 1000);
});

test("audit rows expose the same attribution status contract used by owner totals", () => {
  const result = filterAuditLedger({ rows: [row({ attributionConfidence: "inferred" })] });
  assert.equal(result.rows[0].attributionStatus, "inferred");
});

test("audit source filters distinguish final invoices, transferred sales, and returns", () => {
  const result = filterAuditLedger({ rows: [
    row({ rootId: "final", documentType: 85, documentNo: "SF-FINAL" }),
    row({ rootId: "transferred", documentType: 17, documentNo: "SF-TRANSFERRED" }),
    row({ rootId: "return", documentType: 18, documentNo: "SR-RETURN", isSale: false, signedNetSales: -100 }),
  ] });

  assert.equal(result.rows.filter((item) => item.revenueSource === "invoice").length, 1);
  assert.equal(result.rows.filter((item) => item.revenueSource === "provisional").length, 1);
  assert.equal(result.rows.filter((item) => item.revenueSource === "return").length, 1);
  assert.equal(filterAuditLedger({ rows: [
    row({ rootId: "final", documentType: 85, documentNo: "SF-FINAL" }),
    row({ rootId: "transferred", documentType: 17, documentNo: "SF-TRANSFERRED" }),
    row({ rootId: "return", documentType: 18, documentNo: "SR-RETURN", isSale: false, signedNetSales: -100 }),
  ] }, { source: "provisional" }).summary.totalRows, 1);
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

test("F-018 audit projections fail closed for review while old income codes remain financial rows", () => {
  const review = filterAuditLedger({ rows: [row({
    financeV2: { lineCostTryExVat: null, costStatus: "review", productCurrency: "TRY", reviewReason: "missing-cost" },
  })] });
  const includedIncome = filterAuditLedger({ rows: [row({ productCode: "KOMISYON" })] });
  assert.equal(review.rows[0].calculatedCost, null);
  assert.equal(review.rows[0].grossProfit, null);
  assert.equal(includedIncome.rows[0].calculatedCost, 400);
  assert.equal(includedIncome.rows[0].grossProfit, 600);
});

test("overview does not count an explicit review cost as covered V2 evidence", () => {
  const result = buildOverviewRows({ rows: [row({
    financeV2: { costStatus: "review", reviewReason: null, lineCostTryExVat: 400, productCurrency: "TRY" },
  })] })[0];

  assert.equal(result.canonicalMetric.status, "INCELEME");
  assert.equal(result.canonicalMetric.scope.confirmed.lines, 0);
  assert.equal(result.v2CostCoveredLines, 0);
  assert.equal(result.v2ReviewLines, 1);
});

test("department does not count an explicit review cost as covered evidence", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    ledger: { rows: [row({
      financeV2: { costStatus: "review", reviewReason: null, lineCostTryExVat: 400, productCurrency: "TRY" },
    })] },
  });
  const service = result.departments.find((item) => item.id === "service");
  assert.equal(service.evidence.coveredLines, 0);
  assert.equal(service.evidence.reviewLines, 1);
  assert.equal(service.canonicalMetric.scope.confirmed.lines, 0);
  assert.equal(service.canonicalMetric.scope.costReview.lines, 1);
  assert.equal(projectCanonicalMetric(service.canonicalMetric).profit, null);
});

test("legacy purchase cost is audit-only and cannot be labelled as verified V2 evidence", () => {
  const result = filterAuditLedger({ rows: [row({
    lineCost: 55,
    purchaseNo: "PUR-1",
    costMethod: "priorPurchase",
    financeV2: { schemaVersion: 2, costStatus: "review", lineCostTryExVat: null, reviewReason: "movement-source-not-verified" },
  })] });
  assert.equal(result.rows[0].verificationStatus, "review");
  assert.equal(result.rows[0].calculatedCost, null);
  assert.equal(result.rows[0].grossProfit, null);
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

test("department Tümü keeps a canonical all projection with EUR evidence", () => {
  const result = buildDepartmentAnalysis({ year: 2026, ledger: { rows: [row()] } });
  const all = result.months.find((item) => item.month === 1)?.all;
  assert.equal(all.canonicalMetric.try.netSales, 1000);
  assert.equal(all.evidence.coveredLines, 1);
  assert.equal(all.canonicalMetric.try.netSales, 1000);
});

test("department monthly review profit stays unavailable instead of becoming zero", async () => {
  const result = buildDepartmentAnalysis({ year: 2026, ledger: { rows: [row({
    financeV2: { lineCostTryExVat: null, costStatus: "review", productCurrency: "TRY", reviewReason: "missing-cost" },
  })] } });
  const service = result.months[0].service;
  assert.equal(service.canonicalMetric.status, "INCELEME");
  assert.equal(service.canonicalMetric.scope.costReview.lines, 1);
  const source = await readFile(new URL("../src/DepartmentAnalysisPage.jsx", import.meta.url), "utf8");
  assert.match(source, /projectDepartmentEurMetric/);
  assert.doesNotMatch(source, /Number\(item\.(service|parts|review)\?\.profit \|\| 0\)/);
  assert.doesNotMatch(source, /net - Number\(row\.cost/);
});

test("canonical UI projection preserves review nulls and complete totals", () => {
  const review = projectCanonicalMetric({
    status: "INCELEME", try: { netSales: 1000, cost: 400, profit: 600, margin: 60 },
  });
  const complete = projectCanonicalMetric({
    status: "TAMAM", try: { netSales: 1000, cost: 400, profit: 600, margin: 60 },
  });
  assert.equal(review.netSales, 1000);
  assert.equal(review.profit, null);
  assert.equal(complete.profit, 600);
  assert.equal(formatCanonicalValue(review.profit), "—");
  assert.equal(formatCanonicalValue(complete.profit, (value) => `${value} TL`), "600 TL");
});

test("Reports consumes server projections without consumer-side financial reduce", async () => {
  const projection = buildAuditReportProjections(filterAuditLedger({ rows: [row()] }).rows);
  assert.equal(projection.brand[0].netSales, 1000);
  assert.equal(projection.summary.dealerNetSales, 0);
  const source = await readFile(new URL("../src/ReportsPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.reduce\(/);
  assert.match(source, /projections\.summary\?\.dealerEurNetSales/);
});

test("Reports projection carries the canonical EUR metric for the same invoice-date evidence", () => {
  const projection = buildAuditReportProjections(filterAuditLedger({ rows: [row({
    financeV2: { lineCostTryExVat: 400, costStatus: "covered", productCurrency: "USD", reviewReason: null },
    documentSellingRate: 40,
  })] }).rows, {
    rateSets: { "1": { reportDate: "2026-01-31", eurTryBuyingRate: 40, rates: { USD: { buyingRate: 80 } } } },
  });
  const brand = projection.brand[0];
  assert.equal(brand.canonicalMetric.status, "TAMAM");
  assert.equal(brand.canonicalMetric.eur.netSales, 50);
  assert.equal(brand.canonicalMetric.eur.cost, 20);
  assert.equal(brand.eurEquivalent.profit, 30);
  assert.equal(brand.eurComplete, true);
});

test("Reports shows review totals and keeps source-currency baskets separate", async () => {
  const source = await readFile(new URL("../src/ReportsPage.jsx", import.meta.url), "utf8");
  assert.match(source, /scope\?\.costReview\?\.netSales/);
  assert.match(source, /canonicalMetric\?\.byCurrency/);
  assert.match(source, /İnceleme tutarı.*Gerçek kâr ve marj kapsamı dışında/s);
  assert.match(source, /Kaynak dövizi/);
});

test("Reports receives EUR rate sets from App wiring", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /<ReportsPage[\s\S]*eurRateSets=\{eurRateSets\}/);
});

test("overview failure clears stale canonical EUR state before fallback rows", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /\.catch\(\(\) => \{[\s\S]*setEurRateSets\(\{\}\);[\s\S]*setCanonicalMetric\(null\);/);
});

test("Sales EUR top month fails closed when any period lacks complete evidence", () => {
  const canonical = { status: "TAMAM", eur: { complete: true } };
  const rows = [
    { month: 1, eurComplete: true, eurEquivalent: { netSales: 10 } },
    { month: 2, eurComplete: false, eurEquivalent: { netSales: 100 } },
  ];
  assert.equal(selectCanonicalTopPeriod(rows, canonical), null);
  assert.equal(selectCanonicalTopPeriod([{ ...rows[0] }], canonical).month, 1);
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

test("department EUR projection exposes the canonical EUR margin", async () => {
  const source = await readFile(new URL("./ledgerApi.mjs", import.meta.url), "utf8");
  const decorator = source.slice(source.indexOf("const decorateMetricEur"), source.indexOf("analysis.eurRateSet"));
  assert.match(decorator, /eurEquivalent:\s*canonicalEurEquivalent\(canonicalMetric\),[\s\S]{0,180}eurMargin:\s*canonicalMetric\.eurMargin/);
});

test("critical React consumers read canonical fields without local financial arithmetic", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/SalesPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/DepartmentAnalysisPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AuditPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SummaryPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ReportsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(sources[0], /topSalesMonth[\s\S]*eurNetSales/);
  assert.match(sources[1], /item\.eurMargin/);
  assert.match(sources[2], /row\.calculatedCost/);
  assert.match(sources[4], /canonicalMetric/);
  assert.doesNotMatch(sources[4], /row\.calculatedCost/);
  assert.doesNotMatch(sources[3], /estimatedCost/);
  assert.doesNotMatch(sources[3], /row\.sales\s*-\s*row\.returns/);
  assert.doesNotMatch(sources[5], /const profit = row\.sales\s*-\s*row\.returns/);
  assert.match(sources[5], /sumNullable/);
  assert.doesNotMatch(sources[5], /profit:\s*acc\.profit\s*\+\s*row\.profit/);
  const auditSource = await readFile(new URL("../src/AuditPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(auditSource, /row\.calculatedCost\|\|0/);
});

test("Sales totals do not expose review-only TRY profit as official KPI", async () => {
  const source = await readFile(new URL("../src/SalesPage.jsx", import.meta.url), "utf8");
  assert.match(source, /const canonicalTotals = projectCanonicalMetric\(canonicalMetric, "TRY"\);/);
  assert.match(source, /v2Cost:\s*canonicalTotals\.cost/);
  assert.match(source, /profit:\s*canonicalTotals\.profit/);
  assert.match(source, /const overallMargin = canonicalTotals\.margin/);
});
