import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesCaseModel, filterSalesCases } from "./salesCases.mjs";

function document(overrides) {
  return {
    documentKey: "13|T-1|C-1",
    documentType: 13,
    documentNo: "T-1",
    customerCode: "C-1",
    documentDate: "2026-01-05T00:00:00.000Z",
    lineCount: 1,
    grossAmount: 100,
    discountAmount: 0,
    netAmount: 100,
    vatAmount: 20,
    isActiveDocument: true,
    inScopeYear: true,
    headerId: 1,
    historyVersionCount: 1,
    approvalCount: 0,
    terminalApprovalCount: 0,
    ...overrides,
  };
}

test("91 to 85 flow becomes one case and does not double count revenue", () => {
  const model = buildSalesCaseModel({
    year: 2026,
    documents: [
      document({ documentKey: "91|P-1|C-1", documentType: 91, documentNo: "P-1", netAmount: 90, isActiveDocument: false, inScopeYear: false }),
      document({ documentKey: "85|F-1|C-1", documentType: 85, documentNo: "F-1", netAmount: 100 }),
    ],
    edges: [{ sourceKey: "91|P-1|C-1", targetKey: "85|F-1|C-1", sourceResolved: true }],
    actors: [],
  });
  assert.equal(model.summary.totalCases, 1);
  assert.equal(model.summary.netSales, 100);
  assert.equal(model.summary.prepaidDeduplicatedDocuments, 1);
  assert.equal(model.summary.casesWith91And85, 1);
});

test("unresolved source and missing history lower case confidence", () => {
  const model = buildSalesCaseModel({
    year: 2026,
    documents: [document({ historyVersionCount: 0 })],
    edges: [{ sourceKey: "13|MISSING|C-1", targetKey: "13|T-1|C-1", sourceResolved: false }],
    actors: [],
  });
  assert.equal(model.cases[0].confidence, "low");
  assert.deepEqual(model.cases[0].issues.sort(), ["missing-history", "unresolved-source"]);
  assert.equal(model.quality.personScoringAllowed, false);
});

test("case filters are bounded and deterministic", () => {
  const model = buildSalesCaseModel({ year: 2026, documents: [document({ entryUser: "USR-1" })], edges: [], actors: [] });
  assert.equal(filterSalesCases(model.cases, { search: "USR-1" }).total, 1);
  assert.equal(filterSalesCases(model.cases, { stage: "invoiced" }).total, 0);
  assert.equal(filterSalesCases(model.cases, { confidence: "high" }).total, 1);
});
