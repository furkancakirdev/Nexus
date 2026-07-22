import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinalInvoiceLedger,
  finalInvoiceLedgerSql,
  isTerminalEconomicRow,
} from "./finalInvoiceLedger.mjs";

function sale(documentType, documentNo = `DOC-${documentType}`, overrides = {}) {
  return {
    rootId: `${documentType}-${documentNo}`,
    documentType,
    documentNo,
    documentDate: "2026-07-01T00:00:00.000Z",
    customerCode: "C-1",
    lineNo: 1,
    productCode: "P-1",
    quantity: 1,
    grossAmount: 120,
    discountAmount: 20,
    netAmount: 100,
    vatAmount: 20,
    invoiceTotalInclVat: 120,
    isSale: documentType !== 18,
    ...overrides,
  };
}

test("excludes provisional documents from economic rows", () => {
  const result = buildFinalInvoiceLedger({ economics: [sale(13), sale(14), sale(17)] });

  assert.deepEqual(result.rows.map((row) => row.documentType), [17]);
  assert.equal(result.quality.provisionalRowsExcluded, 2);
});

test("counts standalone retail type 91 once", () => {
  const result = buildFinalInvoiceLedger({ economics: [sale(91, "P-1")] });

  assert.equal(result.totals.netSales, 100);
  assert.equal(result.totals.invoiceTotalInclVat, 120);
});

test("keeps converted retail as trace and counts final invoice only", () => {
  const retail = sale(91, "P-1");
  const invoice = sale(85, "F-1", {
    sourceDocumentType: 91,
    sourceDocumentNo: "P-1",
  });

  const result = buildFinalInvoiceLedger({ economics: [retail, invoice] });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["F-1"]);
  assert.equal(result.totals.netSales, 100);
  assert.equal(result.quality.convertedRetailRowsExcluded, 1);
});

test("does not deduplicate the same retail number across different customers", () => {
  const retail = sale(91, "P-1", { customerCode: "C-1" });
  const invoice = sale(85, "F-1", {
    customerCode: "C-2",
    sourceDocumentType: 91,
    sourceDocumentNo: "P-1",
    sourceCustomerCode: "C-2",
  });

  const result = buildFinalInvoiceLedger({ economics: [retail, invoice] });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["P-1", "F-1"]);
  assert.equal(result.totals.netSales, 200);
});

test("excludes retail converted through intermediate order and dispatch lineage", () => {
  const result = buildFinalInvoiceLedger({
    economics: [sale(91, "P-1"), sale(85, "F-1")],
    lineage: [
      {
        rootId: "85-F-1",
        documentType: 85,
        documentNo: "F-1",
        customerCode: "C-1",
        sourceDocumentType: 15,
        sourceDocumentNo: "I-1",
        sourceCustomerCode: "C-1",
      },
      {
        rootId: "85-F-1",
        documentType: 15,
        documentNo: "I-1",
        customerCode: "C-1",
        sourceDocumentType: 64,
        sourceDocumentNo: "O-1",
        sourceCustomerCode: "C-1",
      },
      {
        rootId: "85-F-1",
        documentType: 64,
        documentNo: "O-1",
        customerCode: "C-1",
        sourceDocumentType: 91,
        sourceDocumentNo: "P-1",
        sourceCustomerCode: "C-1",
      },
    ],
  });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["F-1"]);
  assert.equal(result.totals.netSales, 100);
});

test("linked return reduces sales and references original invoice", () => {
  const invoice = sale(17, "F-1");
  const returned = sale(18, "I-1", {
    isSale: false,
    sourceDocumentType: 17,
    sourceDocumentNo: "F-1",
  });

  const result = buildFinalInvoiceLedger({ economics: [invoice, returned] });

  assert.equal(result.totals.netSales, 0);
  assert.equal(result.rows[1].originalInvoiceNo, "F-1");
  assert.equal(result.quality.linkedReturnRows, 1);
});

test("terminal row predicate accepts only final sales, standalone retail, and returns", () => {
  assert.equal(isTerminalEconomicRow(sale(17), []), true);
  assert.equal(isTerminalEconomicRow(sale(85), []), true);
  assert.equal(isTerminalEconomicRow(sale(18), []), true);
  assert.equal(isTerminalEconomicRow(sale(14), []), false);
  assert.equal(isTerminalEconomicRow(sale(91, "P-1"), [
    sale(85, "F-1", { sourceDocumentType: 91, sourceDocumentNo: "P-1" }),
  ]), false);
});

test("does not mutate CPM source rows and preserves pilot order input", () => {
  const economic = Object.freeze(sale(17, "F-1"));
  const pilotOrder = Object.freeze({ documentType: 14, documentNo: "SSP-100" });
  const pilotOrders = Object.freeze([pilotOrder]);

  const result = buildFinalInvoiceLedger({ economics: [economic], pilotOrders });

  assert.notStrictEqual(result.rows[0], economic);
  assert.notStrictEqual(result.pilotOrders, pilotOrders);
  assert.deepEqual(result.pilotOrders, [pilotOrder]);
});

test("treats null ERP recordsets as empty validated inputs", () => {
  const result = buildFinalInvoiceLedger({
    economics: null,
    lineage: null,
    actorEvents: null,
    pilotOrders: null,
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.totals.netSales, 0);
  assert.deepEqual(result.pilotOrders, []);
});

test("final invoice SQL exposes four read-only recordsets with separate invoice amounts", () => {
  const selectMarkers = finalInvoiceLedgerSql.match(/\/\*\s*recordset:\s*\d\s*\*\//gi) || [];

  assert.equal(selectMarkers.length, 4);
  assert.match(finalInvoiceLedgerSql, /EVRAKTIP\s+IN\s*\(17,85,91,18\)/i);
  assert.doesNotMatch(finalInvoiceLedgerSql, /provisionalSales/i);
  assert.match(finalInvoiceLedgerSql, /grossAmount/i);
  assert.match(finalInvoiceLedgerSql, /discountAmount/i);
  assert.match(finalInvoiceLedgerSql, /netAmount/i);
  assert.match(finalInvoiceLedgerSql, /vatAmount/i);
  assert.match(finalInvoiceLedgerSql, /invoiceTotalInclVat/i);
  assert.match(finalInvoiceLedgerSql, /MIREVRBAS/i);
  assert.match(finalInvoiceLedgerSql, /EVRONY/i);
  assert.match(finalInvoiceLedgerSql, /EVRAKTIP\s*=\s*14/i);
  assert.match(finalInvoiceLedgerSql, /downstream\.SONKAYNAKEVRAKTIP\s*=\s*l\.documentType/i);
});
