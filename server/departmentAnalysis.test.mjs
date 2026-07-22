import assert from "node:assert/strict";
import test from "node:test";
import { buildDepartmentAnalysis } from "./departmentAnalysis.mjs";

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
  return {
    rootId: 1, documentType: 85, documentNo: "SF-1", depth: 0,
    commercialOwner: null, preparerUser: "CAN", entryUser: "CAN",
    departmentCode: null, depotCode: "MRK", ...overrides,
  };
}

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
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ commercialOwner: "MKARA", preparerUser: "CAN" })],
  });
  assert.equal(result.detailRows[0].department, "service");
  assert.equal(result.detailRows[0].crossDepot, true);
  assert.equal(result.quality.inferredCoveragePct, 0);
});

test("historical user fallback is reported as inferred rather than confirmed", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ preparerUser: "FURKAN", entryUser: "FURKAN" })],
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
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ commercialOwner: "OGENCOGLU" })],
  });
  assert.equal(result.detailRows[0].department, "service");
  assert.equal(result.detailRows[0].commercialOwnerName, "Özlenen Gençoğlu");
  assert.equal(result.detailRows[0].ownerActive, false);
});

test("customer account-like actor codes are skipped before choosing a real user", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [
      evidence({ preparerUser: "AERIMLI", entryUser: "AERIMLI" }),
      evidence({ documentType: 14, documentNo: "B2B-1", depth: 1, preparerUser: "", entryUser: "DBS003" }),
    ],
  });
  assert.equal(result.detailRows[0].commercialOwner, "AERIMLI");
  assert.equal(result.detailRows[0].commercialOwnerName, "Alperen Erimli");
  assert.equal(result.detailRows[0].department, "parts");
  assert.equal(result.topOwners.some((item) => item.id === "DBS003"), false);
});

test("customer account-only rows require review instead of defaulting to parts", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ preparerUser: "", entryUser: "S001" })],
  });
  assert.equal(result.detailRows[0].department, "review");
  assert.equal(result.detailRows[0].attributionStatus, "review");
  assert.equal(result.totals.reviewSales, 900);
});

test("accounting users and final modifiers do not take commercial ownership", () => {
  const result = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ preparerUser: "FURKAN", entryUser: "FURKAN", modifierUser: "BIRCAN" })],
  });
  assert.equal(result.detailRows[0].commercialOwner, "FURKAN");
  assert.equal(result.detailRows[0].department, "service");

  const accountingOnly = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic()],
    lineage: [evidence({ preparerUser: "BIRCAN", entryUser: "BIRCAN" })],
  });
  assert.equal(accountingOnly.detailRows[0].department, "review");
  assert.equal(accountingOnly.detailRows[0].commercialOwner, null);
});

test("Tuğrul Semiz changes department after Alperen transition cutoff", () => {
  const before = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ documentDate: "2026-05-25T00:00:00.000Z" })],
    lineage: [evidence({ preparerUser: "TSEMİZ", entryUser: "TSEMİZ", depotCode: "YTM" })],
  });
  assert.equal(before.detailRows[0].department, "service");
  assert.equal(before.detailRows[0].ownerLocation, "Yatmarin");

  const after = buildDepartmentAnalysis({
    year: 2026,
    economics: [economic({ documentDate: "2026-05-26T00:00:00.000Z" })],
    lineage: [evidence({ preparerUser: "TSEMİZ", entryUser: "TSEMİZ", depotCode: "MRK" })],
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
  assert.equal(result.detailRows[0].commercialOwner, "FURKAN");
  assert.equal(result.detailRows[0].attributionStatus, "review");
  assert.equal(result.detailRows[0].attributionMethod, "nearby-document-hint");
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
