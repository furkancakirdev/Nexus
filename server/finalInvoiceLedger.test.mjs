import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinalInvoiceLedger,
  finalInvoiceLedgerSql,
  isTerminalEconomicRow,
  selectPurchaseEvidence,
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

function purchase(documentType, documentNo, overrides = {}) {
  return {
    rootId: `${documentType}-${documentNo}`,
    documentType,
    documentNo,
    documentDate: "2026-06-01T00:00:00.000Z",
    productCode: "P-1",
    quantity: 10,
    grossAmount: 1000,
    discountAmount: 100,
    netAmount: 900,
    vatAmount: 180,
    documentLineCount: 2,
    active: true,
    accountCode: "TED-1",
    partyName: "Tedarikci A.S.",
    ...overrides,
  };
}

test("uses final purchase invoice net amount after discount for unit cost", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "A-1", {
      quantity: 10,
      grossAmount: 1000,
      discountAmount: 200,
      netAmount: undefined,
      vatAmount: 160,
    })],
  });

  assert.equal(result.costMethod, "priorPurchase");
  assert.equal(result.unitCost, 80);
  assert.deepEqual(result, {
    costMethod: "priorPurchase",
    purchaseType: 9,
    purchaseNo: "A-1",
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseAccountCode: "TED-1",
    purchasePartyName: "Tedarikci A.S.",
    purchaseQuantity: 10,
    purchaseGrossAmount: 1000,
    purchaseDiscountAmount: 200,
    purchaseNetAmount: 800,
    purchaseVatAmount: 160,
    purchaseEffectiveDiscountPct: 20,
    purchaseDocumentLineCount: 2,
    purchaseRemainingQuantity: 10,
    unitCost: 80,
    costValidationReason: "Satis tarihinden onceki son aktif nihai alim faturasi kullanildi.",
  });
});

test("rejects a final purchase invoice marked as an incoming return", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1" }),
    purchases: [purchase(9, "IADE-1")],
    returnDocuments: new Set(["IADE-1"]),
  });

  assert.equal(result.costMethod, "missingPurchase");
  assert.equal(result.unitCost, null);
  assert.equal(result.purchaseNo, null);
});

test("prefers a qualifying bulk purchase only when estimated stock remains", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", {
      documentDate: "2026-07-01T00:00:00.000Z",
      productCode: "P-1",
      quantity: 2,
    }),
    purchases: [
      purchase(9, "TOPLU", {
        documentDate: "2025-08-01T00:00:00.000Z",
        quantity: 20,
        grossAmount: 2000,
        discountAmount: 400,
        netAmount: 1600,
        documentLineCount: 10,
      }),
      purchase(609, "NORMAL", { documentDate: "2026-06-20T00:00:00.000Z" }),
    ],
    salesConsumption: [sale(17, "ESKI", {
      documentDate: "2026-01-10T00:00:00.000Z",
      productCode: "P-1",
      quantity: 17,
    })],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseNo, "TOPLU");
  assert.equal(result.purchaseRemainingQuantity, 3);
});

test("falls back from exhausted bulk stock to the latest ordinary prior invoice", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [
      purchase(9, "TOPLU", {
        documentDate: "2025-08-01T00:00:00.000Z",
        quantity: 20,
        discountAmount: 400,
        netAmount: 1600,
        documentLineCount: 10,
      }),
      purchase(609, "NORMAL", { documentDate: "2026-06-20T00:00:00.000Z" }),
    ],
    salesConsumption: [sale(17, "ESKI", {
      documentDate: "2026-01-10T00:00:00.000Z",
      productCode: "P-1",
      quantity: 19,
    })],
  });

  assert.equal(result.costMethod, "priorPurchase");
  assert.equal(result.purchaseNo, "NORMAL");
});

test("bulk purchase window includes exactly one year and excludes anything older", () => {
  const saleRow = sale(17, "F-1", {
    documentDate: "2026-07-01T00:00:00.000Z",
    productCode: "P-1",
    quantity: 1,
  });
  const exactBoundary = purchase(9, "SINIR", {
    documentDate: "2025-07-01T00:00:00.000Z",
    documentLineCount: 10,
    discountAmount: 200,
    netAmount: 800,
  });
  const tooOld = purchase(9, "ESKI", {
    documentDate: "2025-06-30T23:59:59.999Z",
    documentLineCount: 10,
    discountAmount: 300,
    netAmount: 700,
  });

  const result = selectPurchaseEvidence({ sale: saleRow, purchases: [tooOld, exactBoundary] });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseNo, "SINIR");
});

test("leap-day bulk window matches SQL Server DATEADD year semantics", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", {
      documentDate: "2024-02-29T12:00:00.000Z",
      productCode: "P-1",
      quantity: 1,
    }),
    purchases: [purchase(9, "SUBAT-28", {
      documentDate: "2023-02-28T12:00:00.000Z",
      documentLineCount: 10,
      discountAmount: 200,
      netAmount: 800,
    })],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseNo, "SUBAT-28");
});

test("duplicate final sales consumption is counted once for remaining bulk stock", () => {
  const movement = sale(17, "ESKI", {
    rootId: "tek-satir",
    documentDate: "2026-01-10T00:00:00.000Z",
    productCode: "P-1",
    quantity: 8,
  });
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z",
      quantity: 10,
      documentLineCount: 10,
      discountAmount: 200,
      netAmount: 800,
    })],
    salesConsumption: [movement, { ...movement }],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 2);
});

test("accepts only active type 9 or 609 invoices and then uses the earliest next invoice", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", {
      documentDate: "2026-07-01T00:00:00.000Z",
      productCode: "P-1",
    }),
    purchases: [
      purchase(8, "YANLIS-TIP", { documentDate: "2026-06-30T00:00:00.000Z" }),
      purchase(9, "PASIF", { active: false, documentDate: "2026-06-29T00:00:00.000Z" }),
      purchase(609, "SONRA-2", { documentDate: "2026-07-03T00:00:00.000Z" }),
      purchase(9, "SONRA-1", { documentDate: "2026-07-02T00:00:00.000Z" }),
    ],
  });

  assert.equal(result.costMethod, "nextPurchase");
  assert.equal(result.purchaseNo, "SONRA-1");
});

test("linked sales return inherits the original final invoice cost evidence", () => {
  const original = sale(17, "F-1", {
    rootId: "sale-1",
    productCode: "P-1",
    quantity: 2,
    purchaseType: 9,
    purchaseNo: "A-1",
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseAccountCode: "TED-1",
    purchasePartyName: "Tedarikci A.S.",
    purchaseQuantity: 10,
    purchaseGrossAmount: 1000,
    purchaseDiscountAmount: 200,
    purchaseNetAmount: 800,
    purchaseVatAmount: 160,
    purchaseEffectiveDiscountPct: 20,
    purchaseDocumentLineCount: 10,
    unitCost: 80,
    costMethod: "bulkPurchase",
    costValidationReason: "Toplu alim kaniti.",
  });
  const returned = sale(18, "I-1", {
    rootId: "return-1",
    productCode: "P-1",
    quantity: 1,
    sourceDocumentType: 17,
    sourceDocumentNo: "F-1",
    sourceCustomerCode: "C-1",
    sourceLineNo: 1,
  });

  const result = buildFinalInvoiceLedger({ economics: [original, returned] });
  const returnRow = result.rows.find((row) => row.documentType === 18);

  assert.equal(returnRow.costMethod, "originalSaleCost");
  assert.equal(returnRow.unitCost, 80);
  assert.equal(returnRow.purchaseNo, "A-1");
  assert.equal(returnRow.purchaseNetAmount, 800);
  assert.equal(returnRow.lineCost, -80);
  assert.equal(returnRow.costValidationReason, "Satis iadesi, bagli nihai satis faturasinin maliyet kanitini devraldi.");
});

test("sales return inherits cost through an intermediate source document", () => {
  const original = sale(17, "F-1", {
    productCode: "P-1",
    purchaseType: 9,
    purchaseNo: "A-1",
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10,
    purchaseNetAmount: 800,
    unitCost: 80,
    costMethod: "priorPurchase",
  });
  const returned = sale(18, "I-1", {
    productCode: "P-1",
    sourceDocumentType: 64,
    sourceDocumentNo: "S-1",
    sourceCustomerCode: "C-1",
    sourceLineNo: 1,
  });
  const result = buildFinalInvoiceLedger({
    economics: [original, returned],
    lineage: [{
      documentType: 64,
      documentNo: "S-1",
      customerCode: "C-1",
      lineNo: 1,
      sourceDocumentType: 17,
      sourceDocumentNo: "F-1",
      sourceCustomerCode: "C-1",
      sourceLineNo: 1,
    }],
  });

  const returnRow = result.rows.find((row) => row.documentType === 18);
  assert.equal(returnRow.originalInvoiceNo, "F-1");
  assert.equal(returnRow.costMethod, "originalSaleCost");
  assert.equal(returnRow.unitCost, 80);
  assert.equal(returnRow.lineCost, -80);
});

test("unlinked sales return keeps revenue effect but does not invent purchase cost", () => {
  const returned = sale(18, "I-1", {
    purchaseType: 9,
    purchaseNo: "YANLIS-KANIT",
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10,
    purchaseNetAmount: 800,
    unitCost: 80,
    costMethod: "priorPurchase",
  });

  const result = buildFinalInvoiceLedger({ economics: [returned] });

  assert.equal(result.totals.netSales, -100);
  assert.equal(result.rows[0].costMethod, "missingPurchase");
  assert.equal(result.rows[0].purchaseNo, null);
  assert.equal(result.rows[0].unitCost, null);
  assert.equal(result.rows[0].lineCost, null);
});

test("missing SQL purchase amounts never fall back to sale financial fields", () => {
  const result = buildFinalInvoiceLedger({
    economics: [sale(17, "F-1", {
      purchaseType: 9,
      purchaseNo: "EKSIK",
      purchaseDate: "2026-06-01T00:00:00.000Z",
      purchaseQuantity: null,
      purchaseGrossAmount: null,
      purchaseDiscountAmount: null,
      purchaseNetAmount: null,
      purchaseVatAmount: null,
    })],
  });

  assert.equal(result.rows[0].costMethod, "missingPurchase");
  assert.equal(result.rows[0].purchaseNetAmount, null);
  assert.equal(result.rows[0].unitCost, null);
  assert.equal(result.rows[0].lineCost, null);
});

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
    sourceLineNo: null,
  });

  const result = buildFinalInvoiceLedger({ economics: [retail, invoice] });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["F-1"]);
  assert.equal(result.totals.netSales, 100);
  assert.equal(result.quality.convertedRetailRowsExcluded, 1);
  assert.equal(result.quality.reconciledRetailRowsExcluded, 1);
  assert.equal(result.quality.ambiguousRetailDocuments, 0);
  assert.equal(result.quality.ambiguousRetailNetAmount, 0);
  assert.deepEqual(result.reviewRequiredRows, []);
});

test("missing direct source line quarantines every unproven line in a multi-line retail document", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(91, "P-1", { rootId: "91-P-1-1", lineNo: 1, productCode: "P-A" }),
      sale(91, "P-1", { rootId: "91-P-1-2", lineNo: 2, productCode: "P-B" }),
      sale(85, "F-1", {
        sourceDocumentType: 91,
        sourceDocumentNo: "P-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: "",
      }),
    ],
  });

  assert.deepEqual(result.rows.map((row) => `${row.documentNo}:${row.lineNo}`), ["F-1:1"]);
  assert.equal(result.totals.netSales, 100);
  assert.equal(result.quality.convertedRetailRowsExcluded, 0);
  assert.equal(result.quality.ambiguousRetailDocuments, 1);
  assert.equal(result.quality.ambiguousRetailRowsQuarantined, 2);
  assert.equal(result.quality.ambiguousRetailNetAmount, 200);
  assert.deepEqual(result.reviewRequiredRows.map((row) => row.rootId), ["91-P-1-1", "91-P-1-2"]);
});

test("keeps an unconverted retail line when another line is partially invoiced", () => {
  const convertedRetailLine = sale(91, "P-1", { rootId: "91-P-1-1", lineNo: 1, productCode: "P-A" });
  const standaloneRetailLine = sale(91, "P-1", { rootId: "91-P-1-2", lineNo: 2, productCode: "P-B" });
  const invoice = sale(85, "F-1", {
    sourceDocumentType: 91,
    sourceDocumentNo: "P-1",
    sourceCustomerCode: "C-1",
    sourceLineNo: 1,
  });

  const result = buildFinalInvoiceLedger({ economics: [convertedRetailLine, standaloneRetailLine, invoice] });

  assert.deepEqual(result.rows.map((row) => `${row.documentNo}:${row.lineNo}`), ["P-1:2", "F-1:1"]);
  assert.equal(result.totals.netSales, 200);
  assert.equal(result.quality.convertedRetailRowsExcluded, 1);
  assert.equal(result.quality.ambiguousRetailDocuments, 0);
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
        lineNo: 1,
        sourceDocumentType: 15,
        sourceDocumentNo: "I-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: 1,
      },
      {
        rootId: "85-F-1",
        documentType: 15,
        documentNo: "I-1",
        customerCode: "C-1",
        lineNo: 1,
        sourceDocumentType: 64,
        sourceDocumentNo: "O-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: 1,
      },
      {
        rootId: "85-F-1",
        documentType: 64,
        documentNo: "O-1",
        customerCode: "C-1",
        lineNo: 1,
        sourceDocumentType: 91,
        sourceDocumentNo: "P-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: 1,
      },
    ],
  });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["F-1"]);
  assert.equal(result.totals.netSales, 100);
});

test("missing intermediate source line safely reconciles a unique single-line retail document", () => {
  const result = buildFinalInvoiceLedger({
    economics: [sale(91, "P-1"), sale(85, "F-1")],
    lineage: [
      {
        rootId: "85-F-1", documentType: 85, documentNo: "F-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 15, sourceDocumentNo: "I-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1", documentType: 15, documentNo: "I-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 64, sourceDocumentNo: "O-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1", documentType: 64, documentNo: "O-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: null,
      },
    ],
  });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["F-1"]);
  assert.equal(result.totals.netSales, 100);
  assert.equal(result.quality.reconciledRetailRowsExcluded, 1);
  assert.equal(result.quality.ambiguousRetailDocuments, 0);
  assert.equal(result.quality.ambiguousRetailNetAmount, 0);
});

test("missing intermediate source line preserves the unmatched line after unique reconciliation", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(91, "P-1", { rootId: "91-P-1-1", lineNo: 1, productCode: "P-A" }),
      sale(91, "P-1", { rootId: "91-P-1-2", lineNo: 2, productCode: "P-B" }),
      sale(85, "F-1", { rootId: "85-F-1-1", lineNo: 1, productCode: "P-A" }),
    ],
    lineage: [
      {
        rootId: "85-F-1-1", documentType: 85, documentNo: "F-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 15, sourceDocumentNo: "I-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1-1", documentType: 15, documentNo: "I-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 64, sourceDocumentNo: "O-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1-1", documentType: 64, documentNo: "O-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: "",
      },
    ],
  });

  assert.deepEqual(result.rows.map((row) => `${row.documentNo}:${row.lineNo}`), ["P-1:2", "F-1:1"]);
  assert.equal(result.totals.netSales, 200);
  assert.equal(result.quality.reconciledRetailRowsExcluded, 1);
  assert.equal(result.quality.ambiguousRetailDocuments, 0);
  assert.equal(result.quality.ambiguousRetailNetAmount, 0);
});

test("many-to-one consolidation quarantines all unproven retail rows in direct and recursive flows", () => {
  const retailRows = [
    sale(91, "P-1", { rootId: "91-P-1-1", lineNo: 1, productCode: "P-A" }),
    sale(91, "P-1", { rootId: "91-P-1-2", lineNo: 2, productCode: "P-B" }),
  ];
  const finalRow = sale(85, "F-1", {
    rootId: "85-F-1-1",
    lineNo: 1,
    productCode: "BUNDLE",
    quantity: 2,
    grossAmount: 240,
    discountAmount: 40,
    netAmount: 200,
    vatAmount: 40,
    invoiceTotalInclVat: 240,
  });
  const direct = buildFinalInvoiceLedger({
    economics: [...retailRows, {
      ...finalRow,
      sourceDocumentType: 91,
      sourceDocumentNo: "P-1",
      sourceCustomerCode: "C-1",
      sourceLineNo: null,
    }],
  });
  const recursive = buildFinalInvoiceLedger({
    economics: [...retailRows, finalRow],
    lineage: [
      {
        rootId: "85-F-1-1", documentType: 85, documentNo: "F-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 15, sourceDocumentNo: "I-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1-1", documentType: 15, documentNo: "I-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 64, sourceDocumentNo: "O-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1-1", documentType: 64, documentNo: "O-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: null,
      },
    ],
  });

  for (const result of [direct, recursive]) {
    assert.deepEqual(result.rows.map((row) => `${row.documentNo}:${row.lineNo}`), ["F-1:1"]);
    assert.equal(result.totals.netSales, 200);
    assert.equal(result.quality.ambiguousRetailNetAmount, 200);
    assert.equal(result.quality.ambiguousRetailRowsQuarantined, 2);
    assert.equal(result.reviewRequiredRows.length, 2);
    assert.equal(result.quality.retailLineageAmbiguities[0].confirmedFinalAmount, 200);
    assert.equal(result.quality.retailLineageAmbiguities[0].quarantinedSourceAmount, 200);
  }
});

test("one-to-many split keeps final lines confirmed and source economics quarantined", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(91, "P-1", {
        rootId: "91-P-1-1", lineNo: 1, productCode: "P-A", quantity: 2,
        grossAmount: 240, discountAmount: 40, netAmount: 200, vatAmount: 40, invoiceTotalInclVat: 240,
      }),
      sale(85, "F-1", {
        rootId: "85-F-1-1", lineNo: 1, productCode: "P-A",
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: null,
      }),
      sale(85, "F-1", {
        rootId: "85-F-1-2", lineNo: 2, productCode: "P-A",
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: "",
      }),
    ],
  });

  assert.deepEqual(result.rows.map((row) => `${row.documentNo}:${row.lineNo}`), ["F-1:1", "F-1:2"]);
  assert.equal(result.totals.netSales, 200);
  assert.equal(result.quality.ambiguousRetailNetAmount, 200);
  assert.equal(result.reviewRequiredRows[0].netAmount, 200);
  assert.deepEqual(
    result.quality.retailLineageAmbiguities[0].connectedFinalRows.map((row) => row.lineNo),
    [1, 2],
  );
});

test("mixed-source final invoice audits only the connected ambiguous branch", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(91, "P-1", { rootId: "91-P-1-1", lineNo: 1, productCode: "P-A" }),
      sale(91, "P-1", { rootId: "91-P-1-2", lineNo: 2, productCode: "P-A" }),
      sale(85, "F-1", {
        rootId: "85-F-1-1", lineNo: 1, productCode: "P-A",
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: null,
      }),
      sale(85, "F-1", {
        rootId: "85-F-1-2", lineNo: 2, productCode: "P-X",
        sourceDocumentType: 64, sourceDocumentNo: "OTHER", sourceCustomerCode: "C-1", sourceLineNo: 1,
      }),
    ],
  });

  assert.deepEqual(result.rows.map((row) => `${row.documentNo}:${row.lineNo}`), ["F-1:1", "F-1:2"]);
  assert.equal(result.totals.netSales, 200);
  assert.equal(result.quality.ambiguousRetailNetAmount, 200);
  const ambiguity = result.quality.retailLineageAmbiguities[0];
  assert.deepEqual(ambiguity.sourceRows.map((row) => row.rootId), ["91-P-1-1", "91-P-1-2"]);
  assert.deepEqual(ambiguity.connectedFinalRows.map((row) => `${row.documentNo}:${row.lineNo}`), ["F-1:1"]);
  assert.deepEqual(ambiguity.sourceRows[0], {
    rootId: "91-P-1-1",
    documentNo: "P-1",
    lineNo: 1,
    productCode: "P-A",
    quantity: 1,
    netAmount: 100,
  });
  assert.deepEqual(ambiguity.connectedFinalRows[0], {
    rootId: "85-F-1-1",
    documentNo: "F-1",
    lineNo: 1,
    productCode: "P-A",
    quantity: 1,
    netAmount: 100,
  });
  assert.equal(ambiguity.matchReason, "document-descendant-without-safe-line-mapping");
  assert.equal(ambiguity.reconciliationReason, "no-unique-product-quantity-net-match");
  assert.equal(ambiguity.confirmedFinalAmount, 100);
  assert.equal(ambiguity.quarantinedSourceAmount, 200);
});

test("recursive lineage does not cross into another line of the same retail document", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(91, "P-1", { rootId: "91-P-1-1", lineNo: 1, productCode: "P-A" }),
      sale(91, "P-1", { rootId: "91-P-1-2", lineNo: 2, productCode: "P-B" }),
      sale(85, "F-1", { rootId: "85-F-1-1", lineNo: 1, productCode: "P-A" }),
    ],
    lineage: [
      {
        rootId: "85-F-1-1", documentType: 85, documentNo: "F-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 15, sourceDocumentNo: "I-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1-1", documentType: 15, documentNo: "I-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 64, sourceDocumentNo: "O-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
      {
        rootId: "85-F-1-1", documentType: 64, documentNo: "O-1", customerCode: "C-1", lineNo: 1,
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      },
    ],
  });

  assert.deepEqual(result.rows.map((row) => `${row.documentNo}:${row.lineNo}`), ["P-1:2", "F-1:1"]);
  assert.equal(result.totals.netSales, 200);
  assert.equal(result.quality.ambiguousRetailDocuments, 0);
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

test("return through an intermediate document reports the connected final invoice", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(17, "F-1"),
      sale(18, "R-1", {
        isSale: false,
        sourceDocumentType: 64,
        sourceDocumentNo: "O-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: 1,
      }),
    ],
    lineage: [{
      documentType: 64,
      documentNo: "O-1",
      customerCode: "C-1",
      lineNo: 1,
      sourceDocumentType: 17,
      sourceDocumentNo: "F-1",
      sourceCustomerCode: "C-1",
      sourceLineNo: 1,
    }],
  });

  assert.equal(result.rows[1].originalInvoiceNo, "F-1");
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

test("terminal row predicate preserves a retail line that does not match a valid direct source line", () => {
  const unconvertedLine = sale(91, "P-1", { lineNo: 2 });
  const convertedLineInvoice = sale(85, "F-1", {
    sourceDocumentType: 91,
    sourceDocumentNo: "P-1",
    sourceCustomerCode: "C-1",
    sourceLineNo: 1,
  });

  assert.equal(isTerminalEconomicRow(unconvertedLine, [convertedLineInvoice]), true);
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

test("quarantines malformed gross net and VAT values outside financial totals", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(17, "VALID"),
      sale(17, "BAD-GROSS", { grossAmount: "not-a-number" }),
      sale(17, "BAD-NET", { netAmount: "not-a-number" }),
      sale(17, "BAD-VAT", { vatAmount: Number.POSITIVE_INFINITY }),
    ],
  });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["VALID"]);
  assert.equal(result.totals.netSales, 100);
  assert.equal(result.totals.vatAmount, 20);
  assert.equal(result.quality.invalidFinancialRows, 3);
  assert.equal(result.quality.invalidRowsExcluded, 3);
  assert.deepEqual(result.quality.invalidFinancialFieldCounts, {
    grossAmount: 1,
    discountAmount: 0,
    netAmount: 1,
    vatAmount: 1,
    invoiceTotalInclVat: 0,
  });
  assert.deepEqual(
    result.quarantinedRows.map((row) => ({ documentNo: row.documentNo, invalidFields: row.invalidFields })),
    [
      { documentNo: "BAD-GROSS", invalidFields: ["grossAmount"] },
      { documentNo: "BAD-NET", invalidFields: ["netAmount"] },
      { documentNo: "BAD-VAT", invalidFields: ["vatAmount"] },
    ],
  );
});

test("derives net and VAT-inclusive totals only when those values are absent", () => {
  const result = buildFinalInvoiceLedger({
    economics: [sale(17, "FALLBACK", { netAmount: null, invoiceTotalInclVat: null })],
  });

  assert.equal(result.rows[0].netAmount, 100);
  assert.equal(result.rows[0].invoiceTotalInclVat, 120);
  assert.equal(result.totals.netSales, 100);
  assert.equal(result.quality.invalidFinancialRows, 0);
});

test("does not replace a present malformed derived total with a fallback", () => {
  const result = buildFinalInvoiceLedger({
    economics: [sale(17, "BAD-INVOICE-TOTAL", { invoiceTotalInclVat: "broken" })],
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.totals.netSales, 0);
  assert.equal(result.quality.invalidFinancialRows, 1);
  assert.deepEqual(result.quarantinedRows[0].invalidFields, ["invoiceTotalInclVat"]);
});

test("quarantines values that throw during numeric conversion", () => {
  const result = buildFinalInvoiceLedger({
    economics: [sale(17, "BAD-CONVERSION", { grossAmount: Symbol("bad") })],
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.quality.invalidFinancialRows, 1);
  assert.deepEqual(result.quarantinedRows[0].invalidFields, ["grossAmount"]);
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
  assert.match(finalInvoiceLedgerSql, /EFAGLN/i);
  assert.match(finalInvoiceLedgerSql, /#incomingReturnDocuments/i);
  assert.match(finalInvoiceLedgerSql, /p\.KAYITDURUM\s*=\s*1/i);
  assert.match(finalInvoiceLedgerSql, /p\.EVRAKTIP\s+IN\s*\(9,609\)/i);
  assert.match(finalInvoiceLedgerSql, /DATEADD\(year,\s*-1,\s*COALESCE\(originalSale\.originalSaleDate,\s*h\.EVRAKTARIH\)\)/i);
  assert.match(finalInvoiceLedgerSql, /purchaseDocumentLineCount\s*>=\s*10/i);
  assert.match(finalInvoiceLedgerSql, /purchaseEffectiveDiscountPct\s*>=\s*15/i);
  assert.match(finalInvoiceLedgerSql, /purchaseQuantity\s*-\s*ISNULL\(consumption\.consumedQuantity,\s*0\)\s*>=\s*ABS\(h\.MIKTAR\)/i);
  assert.match(finalInvoiceLedgerSql, /'bulkPurchase'[\s\S]*'priorPurchase'[\s\S]*'nextPurchase'/i);
  assert.match(finalInvoiceLedgerSql, /'originalSaleCost'/i);
  assert.match(finalInvoiceLedgerSql, /WITH\s+returnLineage\s+AS/i);
  assert.match(finalInvoiceLedgerSql, /lineage\.depth\s*<\s*8/i);
  assert.match(finalInvoiceLedgerSql, /INTO\s+#returnOriginalSales/i);
  assert.match(finalInvoiceLedgerSql, /COALESCE\(originalSale\.originalSaleDate,\s*h\.EVRAKTARIH\)/i);
  assert.match(finalInvoiceLedgerSql, /purchaseRemainingQuantity/i);
  assert.match(finalInvoiceLedgerSql, /unitCost/i);
  assert.match(finalInvoiceLedgerSql, /costValidationReason/i);
  assert.match(finalInvoiceLedgerSql, /MIREVRBAS/i);
  assert.match(finalInvoiceLedgerSql, /EVRONY/i);
  assert.match(finalInvoiceLedgerSql, /EVRAKTIP\s*=\s*14/i);
  assert.match(finalInvoiceLedgerSql, /downstream\.SONKAYNAKEVRAKTIP\s*=\s*l\.documentType/i);
  assert.match(finalInvoiceLedgerSql, /source\.SIRANO\s*=\s*l\.sourceLineNo/i);
  assert.match(finalInvoiceLedgerSql, /downstream\.SONKAYNAKSIRANO\s*=\s*l\.lineNo/i);
  assert.doesNotMatch(
    finalInvoiceLedgerSql,
    /(?:source\.SIRANO\s*=\s*l\.sourceLineNo|downstream\.SONKAYNAKSIRANO\s*=\s*l\.lineNo)\s+OR\b/i,
  );
  assert.match(
    finalInvoiceLedgerSql,
    /CASE\s+WHEN\s+l\.sourceLineNo\s+IS\s+NULL\s+THEN\s+'document'\s+ELSE\s+'line'\s+END\s+lineageMatchScope/i,
  );
  assert.doesNotMatch(finalInvoiceLedgerSql, /\b(?:UPDATE|DELETE\s+FROM|MERGE|TRUNCATE)\b/i);
  assert.doesNotMatch(finalInvoiceLedgerSql, /\bINSERT\s+INTO\s+(?!#)/i);
});

test("SQL and JavaScript expose the same auditable purchase evidence fields", () => {
  const expectedFields = [
    "purchaseType",
    "purchaseNo",
    "purchaseDate",
    "purchaseAccountCode",
    "purchasePartyName",
    "purchaseGrossAmount",
    "purchaseDiscountAmount",
    "purchaseNetAmount",
    "purchaseVatAmount",
    "purchaseEffectiveDiscountPct",
    "costValidationReason",
  ];
  const result = buildFinalInvoiceLedger({
    economics: [sale(17, "F-1", {
      purchaseType: 609,
      purchaseNo: "A-609",
      purchaseDate: "2026-06-01T00:00:00.000Z",
      purchaseAccountCode: "TED-1",
      purchasePartyName: "Tedarikci A.S.",
      purchaseQuantity: 4,
      purchaseGrossAmount: 400,
      purchaseDiscountAmount: 40,
      purchaseNetAmount: 360,
      purchaseVatAmount: 72,
      purchaseEffectiveDiscountPct: 10,
      purchaseDocumentLineCount: 4,
      purchaseRemainingQuantity: 3,
      unitCost: 90,
      costMethod: "priorPurchase",
      costValidationReason: "Dogrulandi.",
    })],
  });

  for (const field of expectedFields) {
    assert.ok(Object.hasOwn(result.rows[0], field), `JavaScript evidence is missing ${field}`);
    assert.match(finalInvoiceLedgerSql, new RegExp(`\\b${field}\\b`, "i"));
  }
  assert.equal(result.rows[0].purchaseType, 609);
  assert.equal(result.rows[0].purchaseNetAmount, 360);
  assert.equal(result.rows[0].costValidationReason, "Dogrulandi.");
});

test("actor history is scoped through the selected active company header id", () => {
  assert.match(finalInvoiceLedgerSql, /JOIN\s+EVRBAS\s+historyHeader\s+ON\s+historyHeader\.SIRKETNO\s*=\s*@company/i);
  assert.match(finalInvoiceLedgerSql, /historyHeader\.KAYITDURUM\s*=\s*1/i);
  assert.match(finalInvoiceLedgerSql, /JOIN\s+MIREVRBAS\s+history\s+ON\s+history\.RECID\s*=\s*historyHeader\.ID/i);
  assert.doesNotMatch(finalInvoiceLedgerSql, /JOIN\s+MIREVRBAS\s+history\s+ON\s+history\.EVRAKTIP/i);
});

test("lineage ownership headers require an active company EVRBAS record", () => {
  const ownerHeaderApply = finalInvoiceLedgerSql.match(
    /OUTER APPLY\s*\(\s*SELECT TOP \(1\) header\.\*[\s\S]*?\) b\s*ORDER BY l\.rootId/i,
  )?.[0] || "";

  assert.match(ownerHeaderApply, /header\.SIRKETNO\s*=\s*@company/i);
  assert.match(ownerHeaderApply, /header\.KAYITDURUM\s*=\s*1/i);
});

test("pilot orders require an active type 14 header", () => {
  assert.match(
    finalInvoiceLedgerSql,
    /WHERE\s+b\.SIRKETNO\s*=\s*@company\s+AND\s+b\.KAYITDURUM\s*=\s*1\s+AND\s+b\.EVRAKTIP\s*=\s*14/i,
  );
});
