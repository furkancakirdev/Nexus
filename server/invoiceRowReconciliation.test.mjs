import assert from "node:assert/strict";
import test from "node:test";
import { reconcileInvoiceRows } from "./invoiceRowReconciliation.mjs";

const row = (id, overrides = {}) => ({
  rootId: id,
  documentType: 85,
  documentDate: "2026-01-02T00:00:00.000Z",
  productCode: "P-1",
  quantity: 2,
  netAmount: 100.1,
  isSale: true,
  ...overrides,
});

test("row reconciliation matches exact rows independent of order and decimal representation", () => {
  const result = reconcileInvoiceRows({
    sourceRows: [row(2, { netAmount: "50.10" }), row(1, { netAmount: 100 })],
    canonicalRows: [row(1, { netAmount: "100.00" }), row(2, { netAmount: 50.1 })],
  });
  assert.equal(result.status, "verified");
  assert.equal(result.counts.matched, 2);
  assert.equal(result.counts.reviewOnly, 0);
});

test("row reconciliation distinguishes missing and extra IDs", () => {
  const result = reconcileInvoiceRows({ sourceRows: [row(1), row(2)], canonicalRows: [row(1), row(3)] });
  assert.equal(result.status, "mismatch");
  assert.equal(result.counts.missing, 1);
  assert.equal(result.counts.extra, 1);
});

test("row reconciliation classifies economic and identity conflicts separately", () => {
  const result = reconcileInvoiceRows({
    sourceRows: [row(1, { quantity: 3 }), row(2, { netAmount: 99 }), row(3, { isSale: false })],
    canonicalRows: [row(1), row(2), row(3)],
  });
  assert.equal(result.counts.economicMismatch, 3);
  assert.equal(result.counts.identityConflict, 0);

  const identity = reconcileInvoiceRows({
    sourceRows: [row(4, { productCode: "P-OTHER" })],
    canonicalRows: [row(4)],
  });
  assert.equal(identity.counts.identityConflict, 1);
  assert.equal(identity.counts.economicMismatch, 0);
});

test("row reconciliation fails closed for null, malformed, and duplicate IDs", () => {
  const result = reconcileInvoiceRows({
    sourceRows: [row(null), row(1), row(1), row(2, { quantity: "not-a-number" })],
    canonicalRows: [row(1), row(2)],
  });
  assert.equal(result.status, "mismatch");
  assert.equal(result.counts.duplicateSourceIds, 1);
  assert.equal(result.counts.nullOrMalformedSource, 2);
  assert.equal(result.counts.reviewOnly >= 3, true);
});

test("return rows are never promoted to ordinary matches without lineage proof", () => {
  const result = reconcileInvoiceRows({
    sourceRows: [row(1, { documentType: 18, isSale: false })],
    canonicalRows: [row(1, { documentType: 18, isSale: false, originalRootId: "77" })],
  });
  assert.equal(result.status, "review-required");
  assert.equal(result.counts.returnLineage, 1);
  assert.equal(result.counts.matched, 0);
  assert.equal(result.samples.returnLineage[0].reviewRequired, true);
});

test("aggregate-shaped input is not accepted as row evidence", () => {
  const result = reconcileInvoiceRows({
    sourceRows: [{ netAmount: 100 }],
    canonicalRows: [{ netAmount: 100 }],
  });
  assert.equal(result.status, "mismatch");
  assert.equal(result.counts.reviewOnly, 2);
  assert.equal(result.counts.matched, 0);
});
