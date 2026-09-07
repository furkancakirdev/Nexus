import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInventoryMovements,
  resolveCpmMovementCandidates,
  resolveInventoryMovementSource,
  summarizeInventoryMovementEvidence,
  summarizeCpmMovementCandidates,
  summarizeMovementImpact,
  buildAnnualOpeningStates,
  summarizeCostCoverage,
  buildCpmWacMovementCandidates,
} from "./inventoryMovementSource.mjs";

test("hareket etkisi ürün-depo anahtarında iadeleri ve bilinmeyen türleri ayırır", () => {
  const result = summarizeMovementImpact([
    { id: "O", productCode: "P", depotCode: "M", kind: "opening", quantity: 10, unitCostTryExVat: 100 },
    { id: "P1", productCode: "P", depotCode: "M", kind: "purchase", quantity: 5, unitCostTryExVat: 120 },
    { id: "S1", productCode: "P", depotCode: "M", kind: "sale", quantity: 3 },
    { id: "SR1", productCode: "P", depotCode: "M", kind: "saleReturn", quantity: 1, originalSaleId: "S1" },
    { id: "PR1", productCode: "P", depotCode: "M", kind: "purchaseReturn", quantity: 1, originalPurchaseId: "P1" },
    { id: "U", productCode: "P", depotCode: "M", kind: "unknown", quantity: 2 },
  ]);
  assert.deepEqual(result.byStockKey, {
    "P\u001fM": {
      productCode: "P", depotCode: "M", openingQuantity: 10, purchaseQuantity: 5,
      saleQuantity: 3, saleReturnQuantity: 1, purchaseReturnQuantity: 1,
      netQuantityImpact: 12, rowCount: 5, quarantineCount: 0,
    },
  });
  assert.deepEqual(result.unmappedKinds, ["unknown"]);
  assert.equal(result.official, false);
});

test("maliyet kapsamı yalnız maliyet gerektiren terminal satırları ölçer", () => {
  const result = summarizeCostCoverage([
    { isSale: true, netAmount: 100, costMethod: "priorPurchase", financeV2: { costStatus: "covered" } },
    { isSale: true, netAmount: 50, costMethod: "missingPurchase", financeV2: { costStatus: "review" } },
    { isSale: true, netAmount: 20, costMethod: "excludedIncome", financeV2: { costStatus: "review" } },
  ]);
  assert.deepEqual(result, { lineCount: 2, coveredLines: 1, reviewLines: 1, netSales: 150, coveredNetSales: 100, netSalesCoveragePct: 66.7, lineCoveragePct: 50, byReviewReason: { "unspecified-review": 1 }, affectedProductCount: 0, reviewNetSalesByReason: { "unspecified-review": 50 } });
});

test("maliyet kapsamı inceleme nedenlerini ve etkilenen ürünleri özetler", () => {
  const result = summarizeCostCoverage([
    { productCode: "P-1", netAmount: 100, costMethod: "priorPurchase", financeV2: { costStatus: "review", reviewReason: "missing-opening-or-purchase-cost" } },
    { productCode: "P-1", netAmount: 50, costMethod: "priorPurchase", financeV2: { costStatus: "review", reviewReason: "missing-opening-or-purchase-cost" } },
    { productCode: "P-2", netAmount: 25, costMethod: "priorPurchase", financeV2: { costStatus: "review", reviewReason: "missing-line-currency" } },
    { productCode: "P-3", netAmount: 75, costMethod: "priorPurchase", financeV2: { costStatus: "covered" } },
  ]);
  assert.deepEqual(result.byReviewReason, {
    "missing-opening-or-purchase-cost": 2,
    "missing-line-currency": 1,
  });
  assert.equal(result.affectedProductCount, 2);
  assert.deepEqual(result.reviewNetSalesByReason, {
    "missing-opening-or-purchase-cost": 150,
    "missing-line-currency": 25,
  });
});

test("yıllık açılış kanıtı önceki kapanış ile seçili yıl açılışını uzlaştırır", () => {
  const result = buildAnnualOpeningStates({
    year: 2026,
    priorClosingRows: [{ id: "C-1", productCode: "P-1", quantity: 10, unitCostTryExVat: 100, productCurrency: "TRY" }],
    openingRows: [
      { id: "O-1", productCode: "P-1", quantity: 6, unitCostTryExVat: 100, productCurrency: "TRY" },
      { id: "O-2", productCode: "P-1", quantity: 4, unitCostTryExVat: 100, productCurrency: "TRY" },
    ],
  });
  assert.deepEqual(result, [{
    productCode: "P-1", year: 2026, quantity: 10, valueTryExVat: 1000,
    unitCostTryExVat: 100, productCurrency: "TRY", method: "cpm-opening",
    sourceRows: ["O-1", "O-2"],
    reconciliation: { previousClosingQuantity: 10, cpmOpeningQuantity: 10, difference: 0, status: "matched", official: true },
  }]);
});

test("açılış uzlaşmıyorsa ürün review durumunda kalır", () => {
  const result = buildAnnualOpeningStates({
    year: 2026,
    priorClosingRows: [{ id: "C-1", productCode: "P-2", quantity: 10, unitCostTryExVat: 100, productCurrency: "TRY" }],
    openingRows: [{ id: "O-1", productCode: "P-2", quantity: 8, unitCostTryExVat: 100, productCurrency: "TRY" }],
  });
  assert.equal(result[0].reconciliation.status, "review");
  assert.equal(result[0].reconciliation.difference, -2);
  assert.equal(result[0].reconciliation.official, false);
});

test("hareket kaynağı kanıt özeti açılış katmanı belirsizliğini görünür kılar", () => {
  const result = summarizeInventoryMovementEvidence([
    { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 1, unitCostTryExVat: 10 },
    { id: "O-2", productCode: "P-1", kind: "opening", date: "2026-02-01", quantity: 1, unitCostTryExVat: 12 },
    { id: "P-1", productCode: "P-1", kind: "purchase", date: "2026-02-02", quantity: 1, unitCostTryExVat: 13, productCurrency: "EUR", unitCostCurrencyExVat: 1 },
  ]);
  assert.deepEqual(result, {
    rowCount: 3,
    productCount: 1,
    openingProductCount: 1,
    duplicateOpeningProductCount: 1,
    economicDuplicateOpeningProductCount: 0,
    foreignCostEvidenceRows: 1,
    dateMin: "2026-01-01",
    dateMax: "2026-02-02",
    openingEvidenceStatus: "ambiguous",
  });
});

test("hareket kanıtı ekonomik etkili mükerrer açılışları ayrı sayar", () => {
  const result = summarizeInventoryMovementEvidence([
    { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 1, unitCostTryExVat: 10 },
    { id: "O-2", productCode: "P-1", kind: "opening", date: "2026-02-01", quantity: 1, unitCostTryExVat: 12 },
    { id: "O-3", productCode: "P-2", kind: "opening", date: "2026-01-01", quantity: 1, unitCostTryExVat: 8 },
    { id: "O-4", productCode: "P-2", kind: "opening", date: "2026-02-01", quantity: 1, unitCostTryExVat: 9 },
    { id: "S-1", productCode: "P-1", kind: "sale", date: "2026-02-03", quantity: 1 },
  ]);
  assert.equal(result.duplicateOpeningProductCount, 2);
  assert.equal(result.economicDuplicateOpeningProductCount, 1);
});

test("doğrulanmamış stok kaynağı resmi harekete kapalı kalır", () => {
  const result = resolveInventoryMovementSource({
    source: { status: "missing" },
    rows: [{ id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 }],
  });

  assert.deepEqual(result, {
    status: "missing",
    movements: [],
    reviewReason: "source-contract-missing",
    evidence: {},
  });
});

test("doğrulanmış hareket satırları resmi motorun sözleşmesine dönüştürülür", () => {
  const result = resolveInventoryMovementSource({
    source: {
      status: "verified",
      contractVersion: 1,
      evidence: { table: "STKHAR", verifiedAt: "2026-08-31" },
    },
    rows: [{
      movementId: "M-1",
      cardCode: "P-1",
      movementType: "purchase",
      documentDate: "2026-01-01",
      quantity: 10,
      unitCost: 100,
      sourceSequence: 7,
    }],
  });

  assert.equal(result.status, "verified");
  assert.deepEqual(result.movements, [{
    id: "M-1",
    productCode: "P-1",
    kind: "purchase",
    date: "2026-01-01",
    quantity: 10,
    unitCostTryExVat: 100,
    unitCostCurrencyExVat: null,
    productCurrency: null,
    sourceSequence: 7,
    originalSaleId: null,
    originalPurchaseId: null,
  }]);
  assert.equal(result.evidence.table, "STKHAR");
});

test("CPM recordset movementKind alanı resmi WAC türüne çevrilir", () => {
  const result = resolveInventoryMovementSource({
    source: { status: "verified", contractVersion: 1 },
    rows: [{ id: "M-2", productCode: "P-2", movementKind: "purchase", movementDate: "2026-01-01", quantity: 1, unitCostTryExVat: 10 }],
  });
  assert.equal(result.status, "verified");
  assert.equal(result.movements[0].kind, "purchase");
});

test("CPM aday belge türü açık hareket eşlemesi olmadan resmi WAC'a girmez", () => {
  const result = resolveCpmMovementCandidates({
    source: { status: "verified", contractVersion: 1 },
    rows: [{ id: "M-3", productCode: "P-3", documentType: 9, movementDate: "2026-01-01", quantity: 1, unitCost: 10 }],
  });
  assert.deepEqual(result, {
    status: "missing",
    movements: [],
    reviewReason: "movement-kind-unverified",
    evidence: { unmappedRowCount: 1 },
  });
});

test("CPM hareket adayları belge türü eşlemesini ve doğrulama sınırını görünür kılar", () => {
  const result = summarizeCpmMovementCandidates({
    rows: [
      { id: "O-1", documentType: 81, productCode: "P-1" },
      { id: "P-1", documentType: 9, productCode: "P-1" },
      { id: "S-1", documentType: 85, productCode: "P-1" },
      { id: "R-1", documentType: 18, productCode: "P-1" },
      { id: "U-1", documentType: 82, productCode: "P-1" },
    ],
  });

  assert.equal(result.status, "candidate");
  assert.deepEqual(result.kindCounts, { opening: 1, purchase: 1, sale: 1, saleReturn: 1 });
  assert.deepEqual(result.unmappedDocumentTypes, [82]);
  assert.equal(result.reviewReason, "movement-kind-unverified");
  assert.equal(result.mappedRowCount, 4);
  assert.equal(result.rowCount, 5);
});

test("CPM aday satırı yalnız açık tür eşlemesi ve kaynak kanıtıyla doğrulanır", () => {
  const result = resolveCpmMovementCandidates({
    source: { status: "verified", contractVersion: 1 },
    rows: [{ id: "M-4", productCode: "P-4", documentType: 9, movementDate: "2026-01-01", quantity: 1, unitCost: 10 }],
    kindById: { "M-4": "purchase" },
  });
  assert.equal(result.status, "verified");
  assert.equal(result.movements[0].kind, "purchase");
});

test("eksik kimlik veya geçersiz miktar kaynak sözleşmesini geçersiz kılar", () => {
  assert.throws(
    () => normalizeInventoryMovements([{ id: "M-1", productCode: "P-1", kind: "sale", date: "2026-01-01", quantity: 0 }]),
    /miktarı pozitif/i,
  );
});

test("CPM hareket adayları net alış maliyetini üretir ve iadeyi benzersiz kaynak satırına bağlar", () => {
  const result = buildCpmWacMovementCandidates({
    rows: [
      {
        id: "O-1", productCode: "P-1", depotCode: "D-1", movementDate: "2022-12-31",
        documentType: 81, quantity: 10, grossAmount: 1_000, discountAmount: 100,
      },
      {
        id: "P-1", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-02",
        documentType: 9, quantity: 5, grossAmount: 600, discountAmount: 100,
      },
      {
        id: "S-1", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-03",
        documentType: 85, documentNumber: "F-1", lineNumber: 1, quantity: 2,
      },
      {
        id: "R-1", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-04",
        documentType: 18, quantity: 1, sourceDocumentType: 85,
        sourceDocumentNumber: "F-1", sourceLineNumber: 1,
      },
    ],
  });

  assert.equal(result.status, "candidate");
  assert.equal(result.movements[0].unitCostTryExVat, 90);
  assert.equal(result.movements[1].unitCostTryExVat, 100);
  assert.equal(result.movements[2].kind, "sale");
  assert.equal(result.movements[2].netAmountTryExVat, undefined);
  assert.equal(result.movements[3].kind, "saleReturn");
  assert.equal(result.movements[3].originalSaleId, "S-1");
  assert.equal(result.reviewCounts.invalidCostRows, 0);
  assert.equal(result.reviewCounts.unlinkedReturnRows, 0);
});

test("CPM yabancı kaynak maliyetini TRY diye etiketlemez ve ham döviz kanıtını korur", () => {
  const result = buildCpmWacMovementCandidates({
    rows: [{
      id: "P-EUR", productCode: "P-EUR", depotCode: "D-1", movementDate: "2026-01-02",
      documentType: 9, quantity: 2, grossAmount: 200, discountAmount: 20,
      unitPrice: 90, currency: "EUR", currencyRate: 35,
      transactionCurrency: null, transactionCurrencyRate: null,
    }],
  });

  assert.equal(result.movements[0].unitCostTryExVat, null);
  assert.deepEqual(result.movements[0].costEvidence, {
    sourceAmount: 180,
    sourceUnitPrice: 90,
    sourceCurrency: "EUR",
    sourceRate: 35,
    transactionCurrency: null,
    transactionRate: null,
    documentDate: "2026-01-02",
    rateEvidence: {
      source: null,
      status: "review_required",
      reason: "foreign-cost-awaiting-halkbank-rate",
    },
  });
  assert.equal(result.reviewReasons["foreign-cost-awaiting-halkbank-rate"], 1);
  assert.equal(result.reviewCounts.invalidCostRows, 0);
  assert.equal(result.reviewCounts.pendingForeignCostRows, 1);
});

test("CPM satış adayı net KDV hariç tutarı negatif stok fallback'ine taşır", () => {
  const result = buildCpmWacMovementCandidates({
    rows: [{
      id: "S-1", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-03",
      documentType: 85, quantity: 2, grossAmount: 100, discountAmount: 10,
    }],
  });

  assert.equal(result.movements[0].netAmountTryExVat, 90);
});

test("CPM satış adayı geçersiz net tutarı fallback girdisi yapmaz", () => {
  const result = buildCpmWacMovementCandidates({
    rows: [{
      id: "S-1", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-03",
      documentType: 85, quantity: 2, grossAmount: "not-a-number", discountAmount: 10,
    }],
  });

  assert.equal(Object.hasOwn(result.movements[0], "netAmountTryExVat"), false);
});

test("CPM SQL sayısal hareket kimliğini metin kimliği olarak korur", () => {
  const result = buildCpmWacMovementCandidates({
    rows: [{
      id: 184288,
      productCode: "P-1",
      depotCode: "D-1",
      movementDate: new Date("2022-12-31T00:00:00.000Z"),
      documentType: 81,
      quantity: 1,
      grossAmount: 100,
      discountAmount: 0,
    }],
  });

  assert.equal(result.movements[0].id, "184288");
  assert.equal(result.reviewCounts.invalidMovementRows, 0);
});

test("CPM hareket adayları hatalı maliyeti ve belirsiz iadeyi resmi harekete sokmaz", () => {
  const result = buildCpmWacMovementCandidates({
    rows: [
      {
        id: "P-BAD", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-01",
        documentType: 9, quantity: 2, grossAmount: 100, discountAmount: 100,
      },
      {
        id: "R-BAD", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-02",
        documentType: 18, quantity: 1, sourceDocumentType: 85,
        sourceDocumentNumber: "MISSING", sourceLineNumber: 1,
      },
    ],
  });

  assert.equal(result.movements.some((row) => row.id === "P-BAD"), false);
  assert.equal(result.movements.some((row) => row.id === "R-BAD"), false);
  assert.equal(result.reviewCounts.invalidCostRows, 1);
  assert.equal(result.reviewCounts.unlinkedReturnRows, 1);
  assert.equal(result.reviewReason, "movement-evidence-incomplete");
});

test("CPM hareket adayları çoklu depo ürünlerini resmi WAC için incelemeye ayırır", () => {
  const result = buildCpmWacMovementCandidates({
    rows: [
      { id: "O-1", productCode: "P-1", depotCode: "D-1", movementDate: "2022-12-31", documentType: 81, quantity: 1, grossAmount: 100, discountAmount: 0 },
      { id: "O-2", productCode: "P-1", depotCode: "D-2", movementDate: "2022-12-31", documentType: 81, quantity: 1, grossAmount: 120, discountAmount: 0 },
    ],
  });

  assert.equal(result.reviewCounts.multiDepotProductCount, 1);
  assert.equal(result.reviewReason, "depot-grain-not-resolved");
  assert.equal(result.status, "candidate");
});
