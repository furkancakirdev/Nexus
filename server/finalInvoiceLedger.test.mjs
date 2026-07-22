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

test("conflicting supplied purchase net is quarantined instead of becoming cost basis", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "A-1", {
      quantity: 10,
      grossAmount: 1000,
      discountAmount: 200,
      netAmount: 900,
    })],
  });

  assert.equal(result.costMethod, "missingPurchase");
  assert.equal(result.unitCost, null);
  assert.match(result.costValidationReason, /net tutar/i);
  assert.equal(result.rejectedPurchases[0].purchaseNo, "A-1");
  assert.equal(result.rejectedPurchases[0].reason, "inconsistent-purchase-net");
});

test("cost basis always derives from finite gross minus finite discount", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "A-1", {
      quantity: 10,
      grossAmount: 1000,
      discountAmount: 200,
      netAmount: 800,
      effectiveDiscountPct: 20,
    })],
  });

  assert.equal(result.purchaseNetAmount, 800);
  assert.equal(result.purchaseEffectiveDiscountPct, 20);
  assert.equal(result.unitCost, 80);
});

test("conflicting supplied effective discount is quarantined", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "A-1", {
      quantity: 10,
      grossAmount: 1000,
      discountAmount: 200,
      netAmount: 800,
      effectiveDiscountPct: 10,
    })],
  });

  assert.equal(result.costMethod, "missingPurchase");
  assert.equal(result.rejectedPurchases[0].reason, "inconsistent-purchase-discount-pct");
});

test("malformed supplied purchase totals remain audit evidence and are quarantined", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "A-1", {
      quantity: 10,
      grossAmount: 1000,
      discountAmount: 200,
      netAmount: Number.POSITIVE_INFINITY,
      effectiveDiscountPct: "not-a-percentage",
    })],
  });

  assert.equal(result.costMethod, "missingPurchase");
  assert.equal(result.rejectedPurchases[0].reason, "inconsistent-purchase-net");
  assert.equal(result.rejectedPurchases[0].reportedNetAmount, Number.POSITIVE_INFINITY);
  assert.equal(result.rejectedPurchases[0].reportedDiscountPct, "not-a-percentage");
});

test("malformed purchase fields produce explicit quarantine reasons", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 2 }),
    purchases: [
      purchase(9, "BAD-DATE", { documentDate: null }),
      purchase(9, "BAD-QUANTITY", { quantity: 0 }),
      purchase(9, "BAD-GROSS", { grossAmount: Number.POSITIVE_INFINITY, netAmount: undefined }),
      purchase(9, "BAD-DISCOUNT", { discountAmount: Number.NaN, netAmount: undefined }),
    ],
  });

  assert.equal(result.costMethod, "missingPurchase");
  assert.match(result.costValidationReason, /karantinaya/i);
  assert.deepEqual(
    result.rejectedPurchases.map(({ purchaseNo, reason }) => [purchaseNo, reason]),
    [
      ["BAD-DATE", "invalid-purchase-date"],
      ["BAD-QUANTITY", "invalid-purchase-quantity"],
      ["BAD-GROSS", "invalid-purchase-gross"],
      ["BAD-DISCOUNT", "invalid-purchase-discount"],
    ],
  );
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

test("incoming return identity can exclude one purchase type without hiding another", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1" }),
    purchases: [
      purchase(9, "AYNI-NO", { documentDate: "2026-06-20T00:00:00.000Z" }),
      purchase(609, "AYNI-NO", { documentDate: "2026-06-10T00:00:00.000Z" }),
    ],
    returnDocuments: new Set(["9|AYNI-NO"]),
  });

  assert.equal(result.purchaseType, 609);
  assert.equal(result.purchaseNo, "AYNI-NO");
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

test("reused purchase number on different dates remains two invoice identities", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1", quantity: 1 }),
    purchases: [
      purchase(9, "TEKRAR", {
        rootId: "purchase-2025",
        documentDate: "2025-06-01T00:00:00.000Z",
        documentLineCount: 5,
        discountAmount: 200,
        netAmount: 800,
      }),
      purchase(9, "TEKRAR", {
        rootId: "purchase-2026",
        documentDate: "2026-06-01T00:00:00.000Z",
        documentLineCount: 5,
        discountAmount: 200,
        netAmount: 800,
      }),
    ],
  });

  assert.equal(result.costMethod, "priorPurchase");
  assert.equal(result.purchaseDate, "2026-06-01T00:00:00.000Z");
  assert.equal(result.purchaseDocumentLineCount, 5);
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

test("same-date purchase ties use numeric IDs for bulk prior and next paths", () => {
  const numericPair = (documentDate, documentLineCount = 2, discountAmount = 100) => [
    purchase(9, "ID-9", { rootId: 9, documentDate, documentLineCount, discountAmount, netAmount: 1000 - discountAmount }),
    purchase(9, "ID-10", { rootId: 10, documentDate, documentLineCount, discountAmount, netAmount: 1000 - discountAmount }),
  ];
  const bulk = selectPurchaseEvidence({
    sale: sale(17, "F-BULK", { documentDate: "2026-07-01T00:00:00.000Z" }),
    purchases: numericPair("2026-06-01T00:00:00.000Z", 10, 200),
  });
  const prior = selectPurchaseEvidence({
    sale: sale(17, "F-PRIOR", { documentDate: "2026-07-01T00:00:00.000Z" }),
    purchases: numericPair("2026-06-01T00:00:00.000Z"),
  });
  const next = selectPurchaseEvidence({
    sale: sale(17, "F-NEXT", { documentDate: "2026-05-01T00:00:00.000Z" }),
    purchases: numericPair("2026-06-01T00:00:00.000Z"),
  });

  assert.equal(bulk.purchaseNo, "ID-10");
  assert.equal(prior.purchaseNo, "ID-10");
  assert.equal(next.purchaseNo, "ID-9");
});

test("nonnumeric same-date purchase IDs use deterministic ordinal fallback", () => {
  const candidates = [
    purchase(9, "TEXT-A", { rootId: "A-2" }),
    purchase(9, "TEXT-B", { rootId: "A-10" }),
  ];
  const prior = selectPurchaseEvidence({ sale: sale(17, "F-1"), purchases: candidates });
  const next = selectPurchaseEvidence({
    sale: sale(17, "F-2", { documentDate: "2026-05-01T00:00:00.000Z" }),
    purchases: candidates,
  });

  assert.equal(prior.purchaseNo, "TEXT-A");
  assert.equal(next.purchaseNo, "TEXT-B");
});

test("equal numeric purchase IDs use ordinal text as the final tie breaker", () => {
  const candidates = [
    purchase(9, "ID-9", { rootId: "9" }),
    purchase(9, "ID-09", { rootId: "09" }),
  ];
  const prior = selectPurchaseEvidence({ sale: sale(17, "F-1"), purchases: candidates });
  const next = selectPurchaseEvidence({
    sale: sale(17, "F-2", { documentDate: "2026-05-01T00:00:00.000Z" }),
    purchases: candidates,
  });

  assert.equal(prior.purchaseNo, "ID-9");
  assert.equal(next.purchaseNo, "ID-09");
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

test("converted retail and its final invoice consume bulk stock once", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 6 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z",
      quantity: 10,
      documentLineCount: 10,
      discountAmount: 200,
      netAmount: 800,
    })],
    salesConsumption: [
      sale(91, "P-1", {
        rootId: "retail-1",
        documentDate: "2026-01-10T00:00:00.000Z",
        productCode: "P-1",
        quantity: 4,
      }),
      sale(85, "F-1", {
        rootId: "invoice-1",
        documentDate: "2026-01-20T00:00:00.000Z",
        productCode: "P-1",
        quantity: 4,
        sourceDocumentType: 91,
        sourceDocumentNo: "P-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: 1,
      }),
    ],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 6);
});

test("multi-step converted retail consumes bulk stock once", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 6 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z",
      quantity: 10,
      documentLineCount: 10,
      discountAmount: 200,
      netAmount: 800,
    })],
    salesConsumption: [
      sale(91, "P-1", {
        rootId: "retail-1",
        documentDate: "2026-01-10T00:00:00.000Z",
        productCode: "P-1",
        quantity: 4,
      }),
      {
        rootId: "dispatch-1",
        documentType: 64,
        documentNo: "S-1",
        documentDate: "2026-01-15T00:00:00.000Z",
        customerCode: "C-1",
        lineNo: 1,
        productCode: "P-1",
        quantity: 4,
        active: 1,
        sourceDocumentType: 91,
        sourceDocumentNo: "P-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: 1,
      },
      sale(85, "F-1", {
        rootId: "invoice-1",
        documentDate: "2026-01-20T00:00:00.000Z",
        productCode: "P-1",
        quantity: 4,
        sourceDocumentType: 64,
        sourceDocumentNo: "S-1",
        sourceCustomerCode: "C-1",
        sourceLineNo: 1,
      }),
    ],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 6);
});

test("direct missing source line reconciles one retail line for consumption", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 6 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z", quantity: 10,
      documentLineCount: 10, discountAmount: 200, netAmount: 800,
    })],
    salesConsumption: [
      sale(91, "P-1", { rootId: "retail-1", documentDate: "2026-01-10T00:00:00.000Z", quantity: 4 }),
      sale(85, "F-1", {
        rootId: "invoice-1", documentDate: "2026-01-20T00:00:00.000Z", quantity: 4,
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: null,
      }),
    ],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 6);
});

test("multi-step missing source line reconciles one retail line for consumption", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 6 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z", quantity: 10,
      documentLineCount: 10, discountAmount: 200, netAmount: 800,
    })],
    salesConsumption: [
      sale(91, "P-1", { rootId: "retail-1", documentDate: "2026-01-10T00:00:00.000Z", quantity: 4 }),
      {
        rootId: "dispatch-1", documentType: 64, documentNo: "S-1",
        documentDate: "2026-01-15T00:00:00.000Z", customerCode: "C-1", lineNo: 1,
        productCode: "P-1", quantity: 4, grossAmount: 120, discountAmount: 20, netAmount: 100,
        active: 1, sourceDocumentType: 91, sourceDocumentNo: "P-1",
        sourceCustomerCode: "C-1", sourceLineNo: null,
      },
      sale(85, "F-1", {
        rootId: "invoice-1", documentDate: "2026-01-20T00:00:00.000Z", quantity: 4,
        sourceDocumentType: 64, sourceDocumentNo: "S-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      }),
    ],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 6);
});

test("missing-line reconciliation compares retail with final rather than intermediate economics", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 6 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z", quantity: 10,
      documentLineCount: 10, discountAmount: 200, netAmount: 800,
    })],
    salesConsumption: [
      sale(91, "P-1", { rootId: "retail-1", documentDate: "2026-01-10T00:00:00.000Z", quantity: 4 }),
      {
        rootId: "dispatch-1", documentType: 64, documentNo: "S-1",
        documentDate: "2026-01-15T00:00:00.000Z", customerCode: "C-1", lineNo: 1,
        productCode: "TRANSIT", quantity: 1, grossAmount: 0, discountAmount: 0, netAmount: 0,
        active: 1, sourceDocumentType: 91, sourceDocumentNo: "P-1",
        sourceCustomerCode: "C-1", sourceLineNo: null,
      },
      sale(85, "F-1", {
        rootId: "invoice-1", documentDate: "2026-01-20T00:00:00.000Z", quantity: 4,
        sourceDocumentType: 64, sourceDocumentNo: "S-1", sourceCustomerCode: "C-1", sourceLineNo: 1,
      }),
    ],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 6);
  assert.match(finalInvoiceLedgerSql, /missingLineReconciliationCandidates/i);
  assert.match(finalInvoiceLedgerSql, /sourceCandidateCount\s*=\s*1/i);
  assert.match(finalInvoiceLedgerSql, /finalCandidateCount\s*=\s*1/i);
  assert.match(
    finalInvoiceLedgerSql,
    /PARTITION BY\s+candidate\.retailDocumentNo,\s*candidate\.retailCustomerCode,\s*candidate\.finalMovementId/i,
  );
});

test("ambiguous missing source line quarantines source retail consumption", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 6 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z", quantity: 10,
      documentLineCount: 10, discountAmount: 200, netAmount: 800,
    })],
    salesConsumption: [
      sale(91, "P-1", { rootId: "retail-1", lineNo: 1, documentDate: "2026-01-10T00:00:00.000Z", quantity: 4 }),
      sale(91, "P-1", { rootId: "retail-2", lineNo: 2, documentDate: "2026-01-10T00:00:00.000Z", quantity: 4 }),
      sale(85, "F-1", {
        rootId: "invoice-1", documentDate: "2026-01-20T00:00:00.000Z", quantity: 4,
        sourceDocumentType: 91, sourceDocumentNo: "P-1", sourceCustomerCode: "C-1", sourceLineNo: null,
      }),
    ],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 6);
});

test("reused document number and line still consume stock when stable identity differs", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "SHARED", {
      rootId: "current-sale", customerCode: "CURRENT", documentDate: "2026-07-01T00:00:00.000Z",
      productCode: "P-1", quantity: 6,
    }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z", quantity: 10,
      documentLineCount: 10, discountAmount: 200, netAmount: 800,
    })],
    salesConsumption: [sale(85, "SHARED", {
      rootId: "prior-sale", customerCode: "OTHER", lineNo: 1,
      documentDate: "2026-01-10T00:00:00.000Z", productCode: "P-1", quantity: 8,
    })],
  });

  assert.equal(result.costMethod, "priorPurchase");
  assert.equal(result.purchaseRemainingQuantity, 2);
});

test("numeric inactive sales do not consume bulk stock", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z",
      quantity: 10,
      documentLineCount: 10,
      discountAmount: 200,
      netAmount: 800,
    })],
    salesConsumption: [sale(17, "PASIF", {
      rootId: "inactive-1",
      active: 0,
      documentDate: "2026-01-10T00:00:00.000Z",
      productCode: "P-1",
      quantity: 9,
    })],
  });

  assert.equal(result.costMethod, "bulkPurchase");
  assert.equal(result.purchaseRemainingQuantity, 10);
});

test("conservative stock policy does not restore quantity for sales returns", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-2", { productCode: "P-1", quantity: 2 }),
    purchases: [purchase(9, "TOPLU", {
      documentDate: "2025-08-01T00:00:00.000Z",
      quantity: 10,
      documentLineCount: 10,
      discountAmount: 200,
      netAmount: 800,
    })],
    salesConsumption: [
      sale(17, "ESKI", {
        rootId: "sale-1",
        documentDate: "2026-01-10T00:00:00.000Z",
        productCode: "P-1",
        quantity: 9,
      }),
      sale(18, "IADE", {
        rootId: "return-1",
        active: 1,
        documentDate: "2026-02-10T00:00:00.000Z",
        productCode: "P-1",
        quantity: 5,
      }),
    ],
  });

  assert.equal(result.costMethod, "priorPurchase");
  assert.equal(result.purchaseRemainingQuantity, 1);
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

test("strict date parsing rejects null blank boolean and invalid values", () => {
  for (const invalidDate of [null, undefined, "", "   ", true, false, "not-a-date"]) {
    const invalidSale = selectPurchaseEvidence({
      sale: sale(17, "F-1", { documentDate: invalidDate, productCode: "P-1" }),
      purchases: [purchase(9, "A-1")],
    });
    assert.equal(invalidSale.costMethod, "missingPurchase");
  }

  const invalidPurchases = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P-1" }),
    purchases: [
      purchase(9, "NULL", { documentDate: null }),
      purchase(9, "BLANK", { documentDate: " " }),
      purchase(9, "BOOL", { documentDate: true }),
      purchase(9, "INVALID", { documentDate: "not-a-date" }),
    ],
  });
  assert.equal(invalidPurchases.costMethod, "missingPurchase");
});

test("timezone offsets are ordered by the same UTC instant", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", {
      documentDate: "2026-07-01T00:30:00+03:00",
      productCode: "P-1",
    }),
    purchases: [purchase(9, "UTC-SONRA", { documentDate: "2026-06-30T22:00:00Z" })],
  });

  assert.equal(result.costMethod, "nextPurchase");
  assert.equal(result.purchaseNo, "UTC-SONRA");
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
    purchaseGrossAmount: 800,
    purchaseDiscountAmount: 0,
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

test("same-number cross-type return uses the exact original document type", () => {
  const wrongFirst = sale(85, "F-1", {
    rootId: "sale-85",
    productCode: "P-1",
    purchaseType: 9,
    purchaseNo: "A-100",
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10,
    purchaseGrossAmount: 1000,
    purchaseDiscountAmount: 0,
    purchaseNetAmount: 1000,
    unitCost: 100,
    costMethod: "priorPurchase",
  });
  const correct = sale(17, "F-1", {
    rootId: "sale-17",
    productCode: "P-1",
    purchaseType: 9,
    purchaseNo: "A-80",
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10,
    purchaseGrossAmount: 800,
    purchaseDiscountAmount: 0,
    purchaseNetAmount: 800,
    unitCost: 80,
    costMethod: "priorPurchase",
  });
  const returned = sale(18, "I-1", {
    rootId: "return-1",
    productCode: "P-1",
    sourceDocumentType: 17,
    sourceDocumentNo: "F-1",
    sourceCustomerCode: "C-1",
    sourceLineNo: 1,
  });

  const result = buildFinalInvoiceLedger({ economics: [wrongFirst, correct, returned] });
  const returnRow = result.rows.find((row) => row.documentType === 18);

  assert.equal(returnRow.originalDocumentType, 17);
  assert.equal(returnRow.originalRootId, "sale-17");
  assert.equal(returnRow.originalLineNo, 1);
  assert.equal(returnRow.unitCost, 80);
  assert.equal(returnRow.purchaseNo, "A-80");
});

test("return with corrected account matches preserved original customer and root", () => {
  const original = sale(17, "F-1", {
    rootId: "sale-17", customerCode: "C-ORIG", productCode: "P-1",
    purchaseType: 9, purchaseNo: "A-80", purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10, purchaseGrossAmount: 800, purchaseDiscountAmount: 0,
    purchaseNetAmount: 800, unitCost: 80, costMethod: "priorPurchase",
  });
  const returned = sale(18, "I-1", {
    rootId: "return-1", customerCode: "C-RETURN", productCode: "P-1",
    originalDocumentType: 17, originalDocumentNo: "F-1", originalRootId: "sale-17",
    originalCustomerCode: "C-ORIG", originalLineNo: 1, originalQuantity: 1,
  });

  const result = buildFinalInvoiceLedger({ economics: [original, returned] });
  const returnRow = result.rows.find((row) => row.documentType === 18);

  assert.equal(returnRow.costMethod, "originalSaleCost");
  assert.equal(returnRow.originalCustomerCode, "C-ORIG");
  assert.equal(returnRow.purchaseNo, "A-80");
  assert.equal(returnRow.unitCost, 80);
});

test("return root conflicting with preserved original customer is quarantined", () => {
  const original = sale(17, "F-1", {
    rootId: "sale-17", customerCode: "C-ORIG", productCode: "P-1",
    purchaseType: 9, purchaseNo: "A-80", purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10, purchaseGrossAmount: 800, purchaseDiscountAmount: 0,
    purchaseNetAmount: 800, unitCost: 80, costMethod: "priorPurchase",
  });
  const returned = sale(18, "I-1", {
    rootId: "return-1", customerCode: "C-RETURN", productCode: "P-1",
    originalDocumentType: 17, originalDocumentNo: "F-1", originalRootId: "sale-17",
    originalCustomerCode: "C-CONFLICT", originalLineNo: 1, originalQuantity: 1,
  });

  const result = buildFinalInvoiceLedger({ economics: [original, returned] });
  const returnRow = result.rows.find((row) => row.documentType === 18);

  assert.equal(returnRow.costMethod, "missingPurchase");
  assert.equal(returnRow.costReviewStatus, "quarantined");
  assert.equal(result.quality.ambiguousReturnCostRows, 1);
});

test("current return customer is validated only as missing-original-customer fallback", () => {
  const original = sale(17, "F-1", {
    rootId: "sale-17", customerCode: "C-ORIG", productCode: "P-1",
    purchaseType: 9, purchaseNo: "A-80", purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10, purchaseGrossAmount: 800, purchaseDiscountAmount: 0,
    purchaseNetAmount: 800, unitCost: 80, costMethod: "priorPurchase",
  });
  const returned = sale(18, "I-1", {
    rootId: "return-1", customerCode: "C-CONFLICT", productCode: "P-1",
    originalDocumentType: 17, originalDocumentNo: "F-1", originalRootId: "sale-17",
    originalCustomerCode: null, originalLineNo: 1, originalQuantity: 1,
  });

  const result = buildFinalInvoiceLedger({ economics: [original, returned] });
  const returnRow = result.rows.find((row) => row.documentType === 18);

  assert.equal(returnRow.costReviewStatus, "quarantined");
  assert.equal(returnRow.unitCost, null);
});

test("ambiguous original sale lines quarantine return cost instead of using array order", () => {
  const duplicate = (rootId, purchaseNo, unitCost) => sale(17, "F-1", {
    rootId,
    productCode: "P-1",
    purchaseType: 9,
    purchaseNo,
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10,
    purchaseGrossAmount: unitCost * 10,
    purchaseDiscountAmount: 0,
    purchaseNetAmount: unitCost * 10,
    unitCost,
    costMethod: "priorPurchase",
  });
  const returned = sale(18, "I-1", {
    productCode: "P-1",
    sourceDocumentType: 17,
    sourceDocumentNo: "F-1",
    sourceCustomerCode: "C-1",
    sourceLineNo: 1,
  });

  const result = buildFinalInvoiceLedger({
    economics: [duplicate("sale-a", "A-80", 80), duplicate("sale-b", "A-90", 90), returned],
  });
  const returnRow = result.rows.find((row) => row.documentType === 18);

  assert.equal(returnRow.costMethod, "missingPurchase");
  assert.equal(returnRow.costReviewStatus, "quarantined");
  assert.equal(returnRow.unitCost, null);
  assert.equal(result.quality.ambiguousReturnCostRows, 1);
  assert.ok(result.quarantinedRows.some((row) => row.quarantineReason === "ambiguous-original-sale-cost"));
});

test("SQL trace candidate count overrides an arbitrary ranked original root", () => {
  const original = sale(17, "F-1", {
    rootId: "ranked-root",
    productCode: "P-1",
    purchaseType: 9,
    purchaseNo: "A-80",
    purchaseDate: "2026-06-01T00:00:00.000Z",
    purchaseQuantity: 10,
    purchaseGrossAmount: 800,
    purchaseDiscountAmount: 0,
    purchaseNetAmount: 800,
    unitCost: 80,
    costMethod: "priorPurchase",
  });
  const returned = sale(18, "I-1", {
    rootId: "return-1",
    productCode: "P-1",
    originalDocumentType: 17,
    originalDocumentNo: "F-1",
    originalRootId: "ranked-root",
    originalLineNo: 1,
    originalQuantity: 1,
    originalCandidateCount: 2,
  });

  const result = buildFinalInvoiceLedger({ economics: [original, returned] });
  const returnRow = result.rows.find((row) => row.documentType === 18);

  assert.equal(returnRow.costMethod, "missingPurchase");
  assert.equal(returnRow.costReviewStatus, "quarantined");
  assert.equal(result.quality.ambiguousReturnCostRows, 1);
});

test("prior-period partial return retains trace evidence selected with original sale quantity", () => {
  const returned = sale(18, "I-1", {
    rootId: "return-1",
    productCode: "P-1",
    quantity: 1,
    originalDocumentType: 17,
    originalDocumentNo: "F-2025",
    originalRootId: "sale-2025",
    originalLineNo: 1,
    originalQuantity: 10,
    purchaseType: 609,
    purchaseNo: "NORMAL-2025",
    purchaseDate: "2025-05-01T00:00:00.000Z",
    purchaseQuantity: 20,
    purchaseGrossAmount: 1600,
    purchaseDiscountAmount: 0,
    purchaseNetAmount: 1600,
    purchaseVatAmount: 320,
    purchaseEffectiveDiscountPct: 0,
    purchaseDocumentLineCount: 2,
    purchaseRemainingQuantity: 20,
    unitCost: 80,
    costMethod: "originalSaleCost",
    costValidationReason: "Satis iadesi, bagli nihai satis faturasinin maliyet kanitini devraldi.",
  });

  const result = buildFinalInvoiceLedger({ economics: [returned] });
  const returnRow = result.rows[0];

  assert.equal(returnRow.originalRootId, "sale-2025");
  assert.equal(returnRow.originalQuantity, 10);
  assert.equal(returnRow.costMethod, "originalSaleCost");
  assert.equal(returnRow.purchaseNo, "NORMAL-2025");
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

test("invalid economic quantities are quarantined with the positive return convention", () => {
  const result = buildFinalInvoiceLedger({
    economics: [
      sale(17, "NAN", { quantity: Number.NaN }),
      sale(17, "INFINITY", { quantity: Number.POSITIVE_INFINITY }),
      sale(17, "ZERO", { quantity: 0 }),
      sale(17, "NEGATIVE", { quantity: -1 }),
      sale(18, "RETURN", { quantity: 1 }),
    ],
  });

  assert.deepEqual(result.rows.map((row) => row.documentNo), ["RETURN"]);
  assert.equal(result.quality.invalidQuantityRows, 4);
  assert.equal(result.quality.invalidRowsExcluded, 4);
  assert.deepEqual(
    result.quarantinedRows.filter((row) => row.invalidFields?.includes("quantity")).map((row) => row.documentNo),
    ["NAN", "INFINITY", "ZERO", "NEGATIVE"],
  );
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
    quantity: 0,
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
  assert.match(finalInvoiceLedgerSql, /p\.TUTAR\s+IS\s+NOT\s+NULL/i);
  assert.match(finalInvoiceLedgerSql, /p\.ISKONTO\s+IS\s+NOT\s+NULL/i);
  assert.match(finalInvoiceLedgerSql, /CAST\(p\.TUTAR\s*-\s*p\.ISKONTO\s+AS\s+decimal\(28,\s*4\)\)\s+purchaseNetAmount/i);
  assert.doesNotMatch(finalInvoiceLedgerSql, /purchaseNetAmount[\s\S]{0,120}ISNULL\(p\.(?:TUTAR|ISKONTO)/i);
  assert.match(finalInvoiceLedgerSql, /DATEADD\(year,\s*-1,\s*costSubject\.costDate\)/i);
  assert.match(finalInvoiceLedgerSql, /purchaseDocumentLineCount\s*>=\s*10/i);
  assert.match(finalInvoiceLedgerSql, /purchaseEffectiveDiscountPct\s*>=\s*15/i);
  assert.match(finalInvoiceLedgerSql, /purchaseQuantity\s*-\s*ISNULL\(consumption\.consumedQuantity,\s*0\)\s*>=\s*costSubject\.costQuantity/i);
  assert.match(finalInvoiceLedgerSql, /'bulkPurchase'[\s\S]*'priorPurchase'[\s\S]*'nextPurchase'/i);
  assert.match(finalInvoiceLedgerSql, /'originalSaleCost'/i);
  assert.match(finalInvoiceLedgerSql, /WITH\s+returnLineage\s+AS/i);
  assert.match(finalInvoiceLedgerSql, /lineage\.depth\s*<\s*8/i);
  assert.match(finalInvoiceLedgerSql, /INTO\s+#returnOriginalSales/i);
  assert.match(finalInvoiceLedgerSql, /originalSale\.originalSaleDate\s+ELSE\s+h\.EVRAKTARIH\s+END\s+costDate/i);
  assert.match(finalInvoiceLedgerSql, /#terminalSales/i);
  assert.match(finalInvoiceLedgerSql, /WITH\s+activeConsumptionEvidence\s+AS/i);
  assert.match(finalInvoiceLedgerSql, /documentLineCount/i);
  assert.match(finalInvoiceLedgerSql, /hasMissingSourceLine/i);
  assert.match(finalInvoiceLedgerSql, /missingLineReconciliationCandidates/i);
  assert.match(finalInvoiceLedgerSql, /sourceCandidateCount/i);
  assert.match(finalInvoiceLedgerSql, /finalCandidateCount/i);
  assert.match(finalInvoiceLedgerSql, /ambiguousRetailConsumption/i);
  assert.match(finalInvoiceLedgerSql, /excludedRetailConsumption/i);
  assert.match(finalInvoiceLedgerSql, /sourceLineNo\s*=\s*lineage\.lineNo\s+OR\s+downstream\.sourceLineNo\s+IS\s+NULL/i);
  assert.match(finalInvoiceLedgerSql, /originalSale\.originalQuantity/i);
  assert.doesNotMatch(finalInvoiceLedgerSql, /purchaseQuantity\s*-\s*ISNULL\(consumption\.consumedQuantity,\s*0\)\s*>=\s*ABS\(h\.MIKTAR\)/i);
  assert.match(finalInvoiceLedgerSql, /PARTITION BY[\s\S]{0,240}p\.EVRAKTARIH/i);
  assert.match(finalInvoiceLedgerSql, /purchaseNumericId/i);
  assert.match(finalInvoiceLedgerSql, /purchaseTextId/i);
  assert.match(finalInvoiceLedgerSql, /ORDER BY\s+p\.purchaseDate\s+DESC[\s\S]{0,180}purchaseNumericId\s+DESC[\s\S]{0,180}purchaseTextId\s+DESC/i);
  assert.match(finalInvoiceLedgerSql, /ORDER BY\s+p\.purchaseDate\s+ASC[\s\S]{0,180}purchaseNumericId\s+ASC[\s\S]{0,180}purchaseTextId\s+ASC/i);
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
