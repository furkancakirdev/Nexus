import assert from "node:assert/strict";
import test from "node:test";
import { buildDepartmentAnalysis, departmentAnalysisSql } from "./departmentAnalysis.mjs";

function economic(overrides = {}) {
  return {
    rootId: 1, documentType: 85, documentNo: "SF-1", documentDate: "2026-07-01T00:00:00.000Z",
    customerCode: "C-1", customerName: "Müşteri", productCode: "P-1", productName: "Parça",
    quantity: 1, grossSales: 1000, returns: 0, discounts: 100, signedNetSales: 900,
    resolvedCost: 500, costMethod: "priorPurchase", isSale: true, depotCode: "MRK",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  const row = {
    rootId: 1, documentType: 85, documentNo: "SF-1",
    documentDate: "2026-07-01T00:00:00.000Z", customerCode: "C-1", depth: 0,
    commercialOwner: null, preparerUser: "CAN", entryUser: "CAN",
    departmentCode: null, depotCode: "MRK", ...overrides,
  };
  return {
    ...row,
    lineageId: overrides.lineageId
      ?? `LINE|${row.rootId}|${row.documentType}|${row.documentNo}|${row.customerCode}`,
    headerId: overrides.headerId
      ?? `HEADER|${row.documentType}|${row.documentNo}|${row.customerCode}`,
  };
}

function actor(documentRow, actorCode, overrides = {}) {
  return {
    rootId: documentRow.rootId,
    lineageId: documentRow.lineageId,
    headerId: documentRow.headerId,
    documentKey: `${documentRow.documentType}|${documentRow.documentNo}|C-1`,
    documentType: documentRow.documentType,
    documentNo: documentRow.documentNo,
    customerCode: "C-1",
    actorCode,
    actorRole: "history-entry",
    sourceType: "MIREVRBAS",
    firstSeen: "2026-06-29T08:00:00.000Z",
    ...overrides,
  };
}

test("department details expose the selected ownership chain and confidence", () => {
  const source = evidence({
    documentType: 14,
    documentNo: "SSP-CHAIN",
    documentDate: "2026-06-29T00:00:00.000Z",
    depth: 2,
    entryUser: "MKARA",
  });
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence(), source],
    actorEvents: [actor(source, "MKARA")],
  });

  assert.equal(result.detailRows[0].commercialOwner, "MKARA");
  assert.equal(result.detailRows[0].commercialOwnerName, "Mehmet Kara");
  assert.equal(result.detailRows[0].attributionMethod, "upstream-history");
  assert.equal(result.detailRows[0].attributionConfidence, "inferred");
  assert.equal(result.detailRows[0].sourceOrderNo, "SSP-CHAIN");
  assert.equal(result.detailRows[0].evidenceDocuments.some((row) => row.documentNo === "SSP-CHAIN"), true);
  assert.equal(result.detailRows[0].actorEvents[0].actorCode, "MKARA");
});

test("source order department and owner override central fulfillment actor", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [
      evidence(),
      evidence({ documentType: 14, documentNo: "SSP-100", depth: 1, commercialOwner: "FURKAN", departmentCode: "SERVIS" }),
    ],
  });
  assert.equal(result.detailRows[0].department, "service");
  assert.equal(result.detailRows[0].commercialOwner, "FURKAN");
  assert.equal(result.detailRows[0].crossDepot, true);
  assert.equal(result.detailRows[0].attributionStatus, "confirmed");
});

test("Mehmet Kara remains service when material leaves central depot", () => {
  const source = evidence({
    documentType: 14, documentNo: "SSP-MK", depth: 2,
    documentDate: "2026-06-29T00:00:00.000Z", commercialOwner: null, preparerUser: "MKARA",
  });
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence(), source],
    actorEvents: [actor(source, "MKARA")],
  });
  assert.equal(result.detailRows[0].department, "service");
  assert.equal(result.detailRows[0].crossDepot, true);
  assert.equal(result.quality.inferredCoveragePct, 100);
});

test("historical user fallback is reported as inferred rather than confirmed", () => {
  const source = evidence({
    documentType: 13, documentNo: "TKL-F", depth: 3,
    documentDate: "2026-06-28T00:00:00.000Z", preparerUser: "FURKAN", entryUser: "FURKAN",
  });
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence(), source],
    actorEvents: [actor(source, "FURKAN")],
  });
  assert.equal(result.detailRows[0].attributionStatus, "inferred");
  assert.equal(result.quality.attributionCoveragePct, 0);
  assert.equal(result.quality.inferredCoveragePct, 100);
  assert.equal(result.quality.inferredAmount, 900);
});

test("gross sales and net sales remain separate reconciliation metrics", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ commercialOwner: "FURKAN" })],
  });
  assert.equal(result.totals.grossSales, 1000);
  assert.equal(result.totals.returns, 0);
  assert.equal(result.totals.discounts, 100);
  assert.equal(result.totals.netSales, 900);
});

test("former employee mappings remain available for historical attribution", () => {
  const source = evidence({
    documentType: 14, documentNo: "SSP-OLD", depth: 2,
    documentDate: "2024-06-30T00:00:00.000Z", commercialOwner: "OGENCOGLU",
  });
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ documentDate: "2024-06-30T00:00:00.000Z" })],
    lineage: [source],
    actorEvents: [actor(source, "OGENCOGLU", { firstSeen: "2024-06-30T08:00:00.000Z" })],
  });
  assert.equal(result.detailRows[0].department, "service");
  assert.equal(result.detailRows[0].commercialOwnerName, "Özlenen Gençoğlu");
  assert.equal(result.detailRows[0].ownerActive, false);
});

test("customer account-like actor codes are skipped before choosing a real user", () => {
  const employeeSource = evidence({
    documentType: 13, documentNo: "TKL-A", depth: 3,
    documentDate: "2026-06-28T00:00:00.000Z", preparerUser: "AERIMLI", entryUser: "AERIMLI",
  });
  const customerSource = evidence({
    documentType: 14, documentNo: "B2B-1", depth: 2,
    documentDate: "2026-06-29T00:00:00.000Z", preparerUser: "", entryUser: "DBS003",
  });
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence(), employeeSource, customerSource],
    actorEvents: [actor(customerSource, "DBS003"), actor(employeeSource, "AERIMLI", {
      firstSeen: "2026-06-28T08:00:00.000Z",
    })],
  });
  assert.equal(result.detailRows[0].commercialOwner, "AERIMLI");
  assert.equal(result.detailRows[0].commercialOwnerName, "Alperen Erimli");
  assert.equal(result.detailRows[0].department, "parts");
  assert.equal(result.topOwners.some((item) => item.id === "DBS003"), false);
});

test("customer account-only rows require review instead of defaulting to parts", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ depotCode: null })],
    lineage: [evidence({ preparerUser: "", entryUser: "S001", depotCode: null })],
    actorEvents: [actor(evidence(), "S001")],
  });
  assert.equal(result.detailRows[0].department, "review");
  assert.equal(result.detailRows[0].attributionStatus, "review");
  assert.equal(result.totals.reviewSales, 900);
});

test("accounting users and final modifiers do not take commercial ownership", () => {
  const source = evidence({
    documentType: 14, documentNo: "SSP-F", depth: 2,
    documentDate: "2026-06-29T00:00:00.000Z", preparerUser: "FURKAN", entryUser: "FURKAN",
  });
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ modifierUser: "BIRCAN" }), source],
    actorEvents: [actor(source, "FURKAN"), actor(evidence(), "BIRCAN", { actorRole: "history-change" })],
  });
  assert.equal(result.detailRows[0].commercialOwner, "FURKAN");
  assert.equal(result.detailRows[0].department, "service");

  const accountingOnly = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ depotCode: null })],
    lineage: [evidence({ preparerUser: "BIRCAN", entryUser: "BIRCAN", depotCode: null })],
    actorEvents: [actor(evidence(), "BIRCAN")],
  });
  assert.equal(accountingOnly.detailRows[0].department, "review");
  assert.equal(accountingOnly.detailRows[0].commercialOwner, null);
});

test("Tuğrul Semiz changes department after Alperen transition cutoff", () => {
  const beforeSource = evidence({
    documentType: 14, documentNo: "SSP-25", depth: 2,
    documentDate: "2026-05-25T00:00:00.000Z", preparerUser: "TSEMİZ", entryUser: "TSEMİZ", depotCode: "YTM",
  });
  const before = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ documentDate: "2026-05-25T00:00:00.000Z" })],
    lineage: [beforeSource],
    actorEvents: [actor(beforeSource, "TSEMİZ", { firstSeen: "2026-05-25T08:00:00.000Z" })],
  });
  assert.equal(before.detailRows[0].department, "service");
  assert.equal(before.detailRows[0].ownerLocation, "Yatmarin");

  const afterSource = evidence({
    documentType: 14, documentNo: "SSP-26", depth: 2,
    documentDate: "2026-05-26T00:00:00.000Z", preparerUser: "TSEMİZ", entryUser: "TSEMİZ", depotCode: "MRK",
  });
  const after = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ documentDate: "2026-05-26T00:00:00.000Z" })],
    lineage: [afterSource],
    actorEvents: [actor(afterSource, "TSEMİZ", { firstSeen: "2026-05-26T08:00:00.000Z" })],
  });
  assert.equal(after.detailRows[0].department, "parts");
  assert.equal(after.detailRows[0].ownerLocation, "Merkez Ofis");
});

test("nearby document hint can move review rows to a department without ranking the owner", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({
      candidateAttributionActor: "FURKAN",
      candidateAttributionField: "EVRAKHAZIRLAYAN",
      candidateAttributionDocumentType: 64,
      candidateAttributionDocumentNo: "SP-1",
    })],
    lineage: [evidence({ preparerUser: "BIRCAN", entryUser: "BIRCAN" })],
  });
  assert.equal(result.detailRows[0].department, "service");
  assert.equal(result.detailRows[0].commercialOwner, null);
  assert.equal(result.detailRows[0].attributionStatus, "review");
  assert.equal(result.detailRows[0].attributionMethod, "b2b-candidate-hint");
  assert.equal(result.topOwners.some((item) => item.id === "FURKAN"), false);
  assert.equal(result.quality.hintedReviewAmount, 900);
});

test("test order and every descendant are excluded", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence(), evidence({ documentType: 14, documentNo: "SSP-00979", depth: 1 })],
  });
  assert.equal(result.detailRows.length, 0);
  assert.equal(result.quality.excludedTestLines, 1);
});

test("active standalone pilot keeps explicit service owner while test order stays excluded", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    pilotOrders: [
      {
        documentType: 14,
        documentNo: "SSP-PILOT-LIVE",
        documentDate: "2026-07-21T10:00:00+03:00",
        customerCode: "C-PILOT",
        commercialOwner: "FURKAN",
        departmentCode: "SERVIS",
        depotCode: "MRK",
        lineCount: 2,
        active: true,
        isTest: false,
      },
      {
        documentType: 14,
        documentNo: "ssp-00979",
        documentDate: "2026-07-21T10:00:00+03:00",
        customerCode: "C-TEST",
        commercialOwner: "FURKAN",
        departmentCode: "SERVIS",
        depotCode: "YTM",
        lineCount: 1,
        active: true,
        isTest: false,
      },
    ],
  });

  assert.equal(result.pilotOrders.length, 1);
  assert.equal(result.pilotOrders[0].documentNo, "SSP-PILOT-LIVE");
  assert.equal(result.pilotOrders[0].ownerCode, "FURKAN");
  assert.equal(result.pilotOrders[0].ownerName, "Furkan Çakır");
  assert.equal(result.pilotOrders[0].department, "service");
  assert.equal(result.pilotOrders[0].depot.code, "MRK");
  assert.equal(result.pilotOrders[0].status, "ready");
});

test("pilot SQL emits only active type 14 rows with an explicit active flag", () => {
  const pilotQuery = departmentAnalysisSql.match(
    /SELECT TOP \(100\)[\s\S]*?ORDER BY b\.EVRAKTARIH DESC, b\.EVRAKNO DESC;/i,
  )?.[0] || "";

  assert.match(pilotQuery, /CAST\(1 AS bit\) active/i);
  assert.match(pilotQuery, /b\.KAYITDURUM\s*=\s*1/i);
  assert.match(pilotQuery, /b\.EVRAKTIP\s*=\s*14/i);
});

test("approved manual cost resolves uncovered profit without changing net sales", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ resolvedCost: null, costMethod: "missingPurchase" })],
    lineage: [evidence({ commercialOwner: "NTOKER" })],
    costOverrides: [{ rowId: 1, unitCost: 300, status: "approved" }],
    requireApproval: true,
  });
  assert.equal(result.totals.netSales, 900);
  assert.equal(result.totals.cost, 300);
  assert.equal(result.totals.profit, 600);
  assert.equal(result.totals.costCoveragePct, 100);
});

test("default labor pilot cost matches the Nexus zero-percent setting", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ productCode: "İŞÇİLİK", productName: "İşçilik", grossSales: 1000, discounts: 0, signedNetSales: 1000, resolvedCost: null, costMethod: "configuredLabor" })],
    lineage: [evidence({ preparerUser: "FURKAN", entryUser: "FURKAN" })],
  });
  assert.equal(result.totals.cost, 0);
  assert.equal(result.totals.profit, 1000);
  assert.equal(result.totals.costCoveragePct, 100);
});
