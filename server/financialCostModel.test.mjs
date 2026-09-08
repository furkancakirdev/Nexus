import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficialMovementCosts,
  buildMovingWeightedAverageCosts,
  attachOfficialMovementCosts,
  calculateNegativeStockMarginFallback,
  calculateProductMarginObservation,
  convertTryToProductCurrency,
  resolveLineCurrency,
  buildComparableYearWac,
} from "../shared/financialCostModel.mjs";

test("karşılaştırmalı yıl bilinmeyen açılışı covered yapmaz", () => {
  const result = buildComparableYearWac({
    year: 2025,
    movements: [
      {
        id: "O-UNKNOWN", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR",
        kind: "opening", date: "2025-01-01", quantity: 10,
      },
      {
        id: "S-BEFORE", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR",
        kind: "sale", date: "2025-01-02", quantity: 2,
      },
    ],
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].costStatus, "review");
  assert.equal(result.rows[0].financialStatus, "blocked");
  assert.equal(result.rows[0].reviewReason, "opening-cost-unknown");
  assert.equal(result.rows[1].costStatus, "review");
  assert.equal(result.coveredRows, 0);
});

test("karşılaştırmalı yıl kapanış WAC'ı yalnız ürün-depo-döviz anahtarında taşır", () => {
  const result = buildComparableYearWac({
    year: 2025,
    priorClosingWac: new Map([
      ["P-1\u001fD-1\u001fEUR", {
        quantity: 10, unitCostTryExVat: 100, unitCostCurrencyExVat: 2.5,
        productCurrency: "EUR", closingDate: "2024-12-31",
      }],
    ]),
    movements: [
      { id: "S-EUR", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR", kind: "sale", date: "2025-01-02", quantity: 2 },
      { id: "S-DEPOT", productCode: "P-1", depotCode: "D-2", productCurrency: "EUR", kind: "sale", date: "2025-01-02", quantity: 2 },
      { id: "S-CURRENCY", productCode: "P-1", depotCode: "D-1", productCurrency: "USD", kind: "sale", date: "2025-01-02", quantity: 2 },
    ],
  });

  assert.equal(result.carriedClosingWacCount, 1);
  assert.equal(result.firstReliableCalculationDate, "2025-01-01");
  assert.equal(result.rows.find((row) => row.id === "S-EUR").costStatus, "covered");
  assert.equal(result.rows.find((row) => row.id === "S-EUR").officialLineCostTryExVat, 200);
  assert.equal(result.rows.find((row) => row.id === "S-DEPOT").reviewReason, "opening-cost-unknown");
  assert.equal(result.rows.find((row) => row.id === "S-CURRENCY").reviewReason, "opening-cost-unknown");
});

test("karşılaştırmalı yıl negatif stok marjı tahminini covered kapsamına almaz", () => {
  const result = buildComparableYearWac({
    year: 2025,
    movements: [{
      id: "S-NEGATIVE", productCode: "P-1", depotCode: "D-1", productCurrency: "TRY",
      kind: "sale", date: "2025-01-02", quantity: 2, netAmountTryExVat: 500,
    }],
  });

  const row = result.rows[0];
  assert.equal(row.costStatus, "review");
  assert.equal(row.costMethod, null);
  assert.equal(row.financialStatus, "blocked");
  assert.equal(row.reviewReason, "opening-cost-unknown");
});

test("doğrulanmış WAC hareket maliyeti ekonomik satıra bağlanır", () => {
  const rows = attachOfficialMovementCosts({
    source: { status: "verified", contractVersion: 1, financialStatus: "ready" },
    economicRows: [{ rootId: "S-1", productCode: "P-1", quantity: 2, financeV2: { costStatus: "review" } }],
    movements: [
      { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
      { id: "S-1", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 2 },
    ],
  });
  assert.equal(rows[0].financeV2.costMethod, "movingWeightedAverage");
  assert.equal(rows[0].financeV2.lineCostTryExVat, 200);
  assert.equal(rows[0].financeV2.costStatus, "covered");
});

test("aday CPM hareketleri doğrulanmadan resmi WAC maliyetine bağlanmaz", () => {
  const legacy = {
    costMethod: "priorPurchase",
    costStatus: "review",
    reviewReason: "movement-source-not-verified",
  };
  const rows = attachOfficialMovementCosts({
    source: {
      status: "candidate",
      financialStatus: "blocked",
      reviewReason: "movement-source-not-verified",
    },
    economicRows: [{ rootId: "S-CANDIDATE", productCode: "P-1", quantity: 2, financeV2: legacy }],
    movements: [
      { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
      { id: "S-CANDIDATE", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 2 },
    ],
  });

  assert.deepEqual(rows[0].financeV2, legacy);
  assert.equal(rows[0].financeV2.costMethod, "priorPurchase");
  assert.equal(rows[0].financeV2.lineCostTryExVat, undefined);
});

test("resmi WAC satırı bağlı tarihsel liste marjı ve kur kanıtını korur", () => {
  const rows = attachOfficialMovementCosts({
    source: { status: "verified", contractVersion: 1, financialStatus: "ready" },
    movements: [{
      id: "M-PRICE-1", productCode: "P-PRICE", depotCode: "D1", kind: "purchase",
      date: "2026-02-01", quantity: 2, unitCostTryExVat: 400,
      unitCostCurrencyExVat: 10, productCurrency: "EUR",
    }],
    economicRows: [{ rootId: "M-PRICE-1", inventoryMovementId: "M-PRICE-1", quantity: 2 }],
    marginObservationsByStockKey: new Map([["P-PRICE\u001fD1", [{
      observationKey: "P-PRICE|2026-02-01|FX-1",
      productListGrossMarginPct: 20,
      retailUnitPriceCurrencyExVat: 12.5,
      exchangeEvidence: { rate: 40, date: "2026-02-01", sourceId: "FX-1", method: "halkbank-selling" },
    }]]]),
  });

  assert.equal(rows[0].financeV2.productListGrossMarginPct, 20);
  assert.equal(rows[0].financeV2.retailUnitPriceCurrencyExVat, 12.5);
  assert.equal(rows[0].financeV2.exchangeEvidence.sourceId, "FX-1");
});

test("WAC ekleme sözleşme sürümü olmadan verified durumunu kabul etmez", () => {
  const legacy = { costStatus: "review", costMethod: "priorPurchase" };
  const rows = attachOfficialMovementCosts({
    source: { status: "verified" },
    economicRows: [{ rootId: "S-UNCONTRACTED", financeV2: legacy }],
    movements: [
      { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 1, unitCostTryExVat: 10 },
      { id: "S-UNCONTRACTED", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 1 },
    ],
  });

  assert.deepEqual(rows[0].financeV2, legacy);
});

test("finansal kanıt kapalıysa verified hareket kaynağı resmi WAC'a bağlanmaz", () => {
  const legacy = { costStatus: "review", costMethod: "priorPurchase" };
  const rows = attachOfficialMovementCosts({
    source: { status: "verified", contractVersion: 1, financialStatus: "blocked" },
    economicRows: [{ rootId: "S-BLOCKED", productCode: "P-1", financeV2: legacy }],
    movements: [
      { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 1, unitCostTryExVat: 10 },
      { id: "S-BLOCKED", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 1 },
    ],
  });

  assert.deepEqual(rows[0].financeV2, legacy);
});

test("financialStatus eksik, null veya blocked ise verified hareket kaynağı fail-closed kalır", () => {
  const legacy = { costStatus: "review", costMethod: "priorPurchase" };
  for (const financialStatus of [undefined, null, "blocked"]) {
    const source = { status: "verified", contractVersion: 1 };
    if (financialStatus !== undefined) source.financialStatus = financialStatus;
    const rows = attachOfficialMovementCosts({
      source,
      economicRows: [{ rootId: `S-NOT-READY-${String(financialStatus)}`, financeV2: legacy }],
      movements: [
        { id: "O-NOT-READY", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 1, unitCostTryExVat: 10 },
        { id: `S-NOT-READY-${String(financialStatus)}`, productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 1 },
      ],
    });

    assert.deepEqual(rows[0].financeV2, legacy, `financialStatus=${String(financialStatus)}`);
  }
});

test("ledger adaptörü satış tarihine göre WAC katmanını seçer", () => {
  const rows = attachOfficialMovementCosts({
    source: { status: "verified", contractVersion: 1, financialStatus: "ready" },
    economicRows: [
      { rootId: "S-BEFORE", productCode: "P-1" },
      { rootId: "S-AFTER", productCode: "P-1" },
    ],
    movements: [
      { id: "O-2", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
      { id: "S-BEFORE", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 2 },
      { id: "P-2", productCode: "P-1", kind: "purchase", date: "2026-01-03", quantity: 10, unitCostTryExVat: 120 },
      { id: "S-AFTER", productCode: "P-1", kind: "sale", date: "2026-01-04", quantity: 2 },
    ],
  });
  assert.equal(rows[0].financeV2.lineCostTryExVat, 200);
  assert.equal(rows[1].financeV2.lineCostTryExVat, 222.22222222222223);
});

test("boş satır dövizi açık kur bir ile TRY paritesi olarak çözülür", () => {
  assert.deepEqual(resolveLineCurrency({ lineCurrency: null, lineFxRate: 1 }), { currency: "TRY", method: "try-parity", reviewReason: null });
});

test("yabancı satır dövizi ürün kartını TRY'ye zorlamaz", () => {
  assert.deepEqual(resolveLineCurrency({ lineCurrency: null, lineFxRate: 1, productCurrency: "EUR" }), { currency: "TRY", method: "try-parity", reviewReason: "line-product-currency-mismatch" });
});

test("resmi hareket maliyeti gelecekteki alımı geçmiş satışa uygulamaz", () => {
  const result = buildOfficialMovementCosts([
    { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "S-1", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 4 },
    { id: "P-1", productCode: "P-1", kind: "purchase", date: "2026-01-03", quantity: 10, unitCostTryExVat: 120 },
  ]);

  assert.deepEqual(result.map((row) => ({
    id: row.id,
    officialLineCostTryExVat: row.officialLineCostTryExVat,
    officialCostStatus: row.officialCostStatus,
    stockQuantity: row.stockQuantity,
    weightedUnitCostTryExVat: row.weightedUnitCostTryExVat,
  })), [
    { id: "O-1", officialLineCostTryExVat: null, officialCostStatus: "covered", stockQuantity: 10, weightedUnitCostTryExVat: 100 },
    { id: "S-1", officialLineCostTryExVat: 400, officialCostStatus: "covered", stockQuantity: 6, weightedUnitCostTryExVat: 100 },
    { id: "P-1", officialLineCostTryExVat: null, officialCostStatus: "covered", stockQuantity: 16, weightedUnitCostTryExVat: 112.5 },
  ]);
});

test("resmi hareket maliyeti ürün stoklarını birbirine karıştırmaz", () => {
  const result = buildOfficialMovementCosts([
    { id: "A-O", productCode: "A", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "B-O", productCode: "B", kind: "opening", date: "2026-01-01", quantity: 20, unitCostTryExVat: 200 },
    { id: "A-S", productCode: "A", kind: "sale", date: "2026-01-02", quantity: 4 },
  ]);

  const sale = result.find((row) => row.id === "A-S");
  assert.equal(sale.officialLineCostTryExVat, 400);
  assert.equal(sale.stockQuantity, 6);
  assert.equal(sale.weightedUnitCostTryExVat, 100);
});

test("resmi WAC aynı ürünü farklı depolarda birbirine karıştırmaz", () => {
  const result = buildOfficialMovementCosts([
    { id: "D1-O", productCode: "P-1", depotCode: "D-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "D2-O", productCode: "P-1", depotCode: "D-2", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 200 },
    { id: "D1-S", productCode: "P-1", depotCode: "D-1", kind: "sale", date: "2026-01-02", quantity: 2 },
  ]);

  const sale = result.find((row) => row.id === "D1-S");
  assert.equal(sale.officialLineCostTryExVat, 200);
  assert.equal(sale.stockQuantity, 8);
  assert.equal(sale.weightedUnitCostTryExVat, 100);
});

test("resmi WAC aynı ürün ve depoda farklı para birimlerini birbirine karıştırmaz", () => {
  const result = buildOfficialMovementCosts([
    { id: "EUR-O", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100, unitCostCurrencyExVat: 2.5 },
    { id: "USD-P", productCode: "P-1", depotCode: "D-1", productCurrency: "USD", kind: "purchase", date: "2026-01-02", quantity: 10, unitCostTryExVat: 200, unitCostCurrencyExVat: 5 },
    { id: "EUR-S", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR", kind: "sale", date: "2026-01-03", quantity: 2 },
  ]);

  const sale = result.find((row) => row.id === "EUR-S");
  assert.equal(sale.officialLineCostTryExVat, 200);
  assert.equal(sale.officialLineCostCurrencyExVat, 5);
  assert.equal(sale.stockQuantity, 8);
});

test("eksik açılış maliyeti sıfıra çevrilmez ve satırı incelemeye bırakır", () => {
  assert.throws(
    () => buildOfficialMovementCosts([
      { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10 },
    ]),
    /açılış.*birim maliyet/i,
  );
});

test("aynı gün hareketlerinde kaynak sırası kimlik sırasının önüne geçer", () => {
  const result = buildOfficialMovementCosts([
    { id: "S-1", productCode: "P-1", kind: "sale", date: "2026-01-01", sourceSequence: 2, quantity: 4 },
    { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", sourceSequence: 1, quantity: 10, unitCostTryExVat: 100 },
  ]);

  assert.equal(result[0].id, "O-1");
  assert.equal(result[1].officialLineCostTryExVat, 400);
});

test("resmi hareket maliyeti eksik açılışta sıfır maliyet üretmeden inceleme döndürür", () => {
  const [sale] = buildOfficialMovementCosts([
    { id: "S-1", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 4 },
  ]);

  assert.equal(sale.officialLineCostTryExVat, null);
  assert.equal(sale.officialCostStatus, "review");
  assert.equal(sale.reviewReason, "missing-opening-or-purchase-cost");
});

test("resmi hareket maliyeti satış iadesini orijinal satış maliyetiyle tersler", () => {
  const result = buildOfficialMovementCosts([
    { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "S-1", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 4 },
    { id: "R-1", productCode: "P-1", kind: "saleReturn", date: "2026-01-03", quantity: 4, originalSaleId: "S-1" },
  ]);

  assert.equal(result[2].officialLineCostTryExVat, -400);
  assert.equal(result[2].officialCostStatus, "covered");
  assert.equal(result[2].stockQuantity, 10);
  assert.equal(result[2].weightedUnitCostTryExVat, 100);
});

test("WAC her alım katmanının tarihsel ürün dövizi maliyetini taşır", () => {
  const result = buildOfficialMovementCosts([
    { id: "O-FX", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 400, unitCostCurrencyExVat: 10, productCurrency: "EUR" },
    { id: "S-FX", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 2, productCurrency: "EUR" },
  ]);
  assert.equal(result[1].officialLineCostTryExVat, 800);
  assert.equal(result[1].officialLineCostCurrencyExVat, 20);
  assert.equal(result[1].weightedUnitCostCurrencyExVat, 10);
});

test("eşleşmeyen satış iadesi ledgerı düşürmeden incelemeye alınır", () => {
  const [row] = buildOfficialMovementCosts([
    { id: "R-1", productCode: "P-1", kind: "saleReturn", date: "2026-01-03", quantity: 1, originalSaleId: "missing-sale" },
  ]);
  assert.equal(row.officialCostStatus, "review");
  assert.equal(row.officialLineCostTryExVat, null);
  assert.equal(row.reviewReason, "missing-original-sale-cost");
});

test("kısmi satış iadesi yalnız iade edilen miktarın maliyetini tersler", () => {
  const result = buildOfficialMovementCosts([
    { id: "O-1", productCode: "P-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "S-1", productCode: "P-1", kind: "sale", date: "2026-01-02", quantity: 4 },
    { id: "R-1", productCode: "P-1", kind: "saleReturn", date: "2026-01-03", quantity: 1, originalSaleId: "S-1" },
  ]);

  assert.equal(result[2].officialLineCostTryExVat, -100);
  assert.equal(result[2].stockQuantity, 7);
});

test("bağlı alış iadesi alım katmanını miktarı kadar tersler", () => {
  const result = buildOfficialMovementCosts([
    { id: "P-1", productCode: "P-1", kind: "purchase", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "R-1", productCode: "P-1", kind: "purchaseReturn", date: "2026-01-02", quantity: 2, originalPurchaseId: "P-1" },
  ]);

  assert.equal(result[1].officialLineCostTryExVat, -200);
  assert.equal(result[1].stockQuantity, 8);
  assert.equal(result[1].weightedUnitCostTryExVat, 100);
});

test("fatura tarihindeki Halkbank satış kuruyla TRY maliyetini ürün dövizine çevirir", () => {
  const result = convertTryToProductCurrency({
    amountTry: 100,
    productCurrency: "EUR",
    halkbankSellingRate: 40,
    exchangeDate: "2026-08-01",
    exchangeSourceId: "CPM-FX-42",
  });

  assert.deepEqual(result, {
    amountCurrency: 2.5,
    productCurrency: "EUR",
    exchangeEvidence: {
      rate: 40,
      date: "2026-08-01",
      sourceId: "CPM-FX-42",
      method: "halkbank-selling",
    },
    reviewReason: null,
  });
});

test("dövizli üründe Halkbank satış kuru eksikse sıfır maliyet üretmez", () => {
  const result = convertTryToProductCurrency({
    amountTry: 100,
    productCurrency: "USD",
    halkbankSellingRate: null,
    exchangeDate: "2026-08-01",
    exchangeSourceId: null,
  });

  assert.equal(result.amountCurrency, null);
  assert.equal(result.reviewReason, "missing-exchange-rate");
  assert.equal(result.exchangeEvidence, null);
});

test("TRY ürün kartında kur paritesini bir olarak denetlenebilir biçimde taşır", () => {
  const result = convertTryToProductCurrency({
    amountTry: 125,
    productCurrency: "TRY",
  });

  assert.equal(result.amountCurrency, 125);
  assert.deepEqual(result.exchangeEvidence, {
    rate: 1,
    date: null,
    sourceId: "TRY",
    method: "try-parity",
  });
});

test("KDV hariç perakende fiyat ile döviz maliyetinden ürün liste brüt marjını hesaplar", () => {
  const input = {
    productCode: "GD-0060",
    productCurrency: "EUR",
    retailUnitPriceCurrencyExVat: 10,
    purchaseDate: "2026-08-01",
    purchaseQuantity: 10,
    purchaseNetAmountTryExVat: 1_000,
    halkbankSellingRate: 40,
    exchangeDate: "2026-08-01",
    exchangeSourceId: "CPM-FX-42",
  };

  const result = calculateProductMarginObservation(input);

  assert.equal(result.unitCostTryExVat, 100);
  assert.equal(result.unitCostCurrencyExVat, 2.5);
  assert.equal(result.unitDiscountCurrencyExVat, 7.5);
  assert.equal(result.productListGrossMarginPct, 75);
  assert.equal(result.observationKey, "GD-0060|2026-08-01|CPM-FX-42");
  assert.equal(result.reviewReason, null);
  assert.deepEqual(input, {
    productCode: "GD-0060",
    productCurrency: "EUR",
    retailUnitPriceCurrencyExVat: 10,
    purchaseDate: "2026-08-01",
    purchaseQuantity: 10,
    purchaseNetAmountTryExVat: 1_000,
    halkbankSellingRate: 40,
    exchangeDate: "2026-08-01",
    exchangeSourceId: "CPM-FX-42",
  });
});

test("fatura tarihi ile kur tarihi farklıysa marjı incelemeye bırakır", () => {
  const result = calculateProductMarginObservation({
    productCode: "GD-0060",
    productCurrency: "EUR",
    retailUnitPriceCurrencyExVat: 10,
    purchaseDate: "2026-08-01",
    purchaseQuantity: 10,
    purchaseNetAmountTryExVat: 1_000,
    halkbankSellingRate: 40,
    exchangeDate: "2026-08-02",
    exchangeSourceId: "CPM-FX-43",
  });

  assert.equal(result.productListGrossMarginPct, null);
  assert.equal(result.reviewReason, "exchange-date-mismatch");
});

test("hareketli ağırlıklı ortalama satıştan sonra kalan stok değerini korur", () => {
  const movements = [
    { id: "P-1", kind: "purchase", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "S-1", kind: "sale", date: "2026-01-02", quantity: 4 },
    { id: "P-2", kind: "purchase", date: "2026-01-03", quantity: 10, unitCostTryExVat: 120 },
  ];

  const result = buildMovingWeightedAverageCosts(movements);

  assert.deepEqual(result.map((row) => ({
    id: row.id,
    stockQuantity: row.stockQuantity,
    stockValueTryExVat: row.stockValueTryExVat,
    weightedUnitCostTryExVat: row.weightedUnitCostTryExVat,
    negativeQuantity: row.negativeQuantity,
  })), [
    { id: "P-1", stockQuantity: 10, stockValueTryExVat: 1_000, weightedUnitCostTryExVat: 100, negativeQuantity: 0 },
    { id: "S-1", stockQuantity: 6, stockValueTryExVat: 600, weightedUnitCostTryExVat: 100, negativeQuantity: 0 },
    { id: "P-2", stockQuantity: 16, stockValueTryExVat: 1_800, weightedUnitCostTryExVat: 112.5, negativeQuantity: 0 },
  ]);
  assert.equal(Object.hasOwn(movements[0], "stockQuantity"), false);
});

test("negatif stokta benzersiz ürün marjlarının aritmetik ortalamasını tüm satışa uygular", () => {
  const result = calculateNegativeStockMarginFallback({
    soldQuantity: 14,
    availableQuantity: 10,
    weightByQuantity: false,
    observations: [
      { observationKey: "A|2026-01-01|FX-1", productListGrossMarginPct: 20, purchaseQuantity: 5 },
      { observationKey: "A|2026-01-01|FX-1", productListGrossMarginPct: 20, purchaseQuantity: 5 },
      { observationKey: "A|2026-02-01|FX-2", productListGrossMarginPct: 40, purchaseQuantity: 8 },
    ],
  });

  assert.deepEqual(result, {
    applied: true,
    method: "negative-stock-average-product-list-margin",
    appliedMarginPct: 30,
    appliedQuantity: 14,
    negativeQuantity: 4,
    observationCount: 2,
    purchaseEvidenceQuantity: 13,
    reviewReason: null,
  });
});

test("negatif stokta alım faturalarındaki adetler dikkate alınarak ağırlıklı marj ortalaması hesaplanır", () => {
  const result = calculateNegativeStockMarginFallback({
    soldQuantity: 14,
    availableQuantity: 10,
    weightByQuantity: true,
    observations: [
      { observationKey: "A|2026-01-01|FX-1", productListGrossMarginPct: 20, purchaseQuantity: 5 },
      { observationKey: "A|2026-02-01|FX-2", productListGrossMarginPct: 40, purchaseQuantity: 15 },
    ],
  });

  // (5 * 20 + 15 * 40) / 20 = (100 + 600) / 20 = 35%
  assert.equal(result.appliedMarginPct, 35);
  assert.equal(result.appliedQuantity, 14);
  assert.equal(result.purchaseEvidenceQuantity, 20);
});

test("negatif stokta geçerli marj kanıtı yoksa oran uydurmaz", () => {
  const result = calculateNegativeStockMarginFallback({
    soldQuantity: 5,
    availableQuantity: 2,
    observations: [{ observationKey: "A|X", productListGrossMarginPct: null, purchaseQuantity: 2 }],
  });

  assert.equal(result.applied, false);
  assert.equal(result.appliedMarginPct, null);
  assert.equal(result.reviewReason, "missing-margin-observation");
});

test("resmi negatif stok fallback marjını tüm satış adedine uygular", () => {
  const result = buildOfficialMovementCosts([
    { id: "O-1", productCode: "P-1", depotCode: "D-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
    { id: "S-1", productCode: "P-1", depotCode: "D-1", kind: "sale", date: "2026-01-02", quantity: 14, netAmountTryExVat: 1_400 },
  ], {
    marginObservationsByStockKey: new Map([[
      "P-1\u001fD-1",
      [
        { observationKey: "P-1|2026-01-01|FX-1", productListGrossMarginPct: 20, purchaseQuantity: 10 },
        { observationKey: "P-1|2026-02-01|FX-2", productListGrossMarginPct: 40, purchaseQuantity: 10 },
      ],
    ]]),
  });

  const sale = result.find((row) => row.id === "S-1");
  assert.ok(Math.abs(sale.officialLineCostTryExVat - 980) < 1e-9);
  assert.equal(sale.officialCostStatus, "covered");
  assert.equal(sale.costMethod, "negativeStockMarginFallback");
  assert.equal(sale.appliedMarginPct, 30);
  assert.equal(sale.appliedQuantity, 14);
  assert.equal(sale.negativeQuantity, 4);
});

test("resmi fallback alanları ekonomik ledger financeV2 alanlarına taşınır", () => {
  const rows = attachOfficialMovementCosts({
    source: { status: "verified", contractVersion: 1, financialStatus: "ready" },
    economicRows: [{ rootId: "S-1", productCode: "P-1", quantity: 14 }],
    movements: [
      { id: "O-1", productCode: "P-1", depotCode: "D-1", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
      { id: "S-1", productCode: "P-1", depotCode: "D-1", kind: "sale", date: "2026-01-02", quantity: 14, netAmountTryExVat: 1_400 },
    ],
    marginObservationsByStockKey: new Map([["P-1\u001fD-1", [
      { observationKey: "P-1|2026-01-01|FX-1", productListGrossMarginPct: 20, purchaseQuantity: 10 },
      { observationKey: "P-1|2026-02-01|FX-2", productListGrossMarginPct: 40, purchaseQuantity: 10 },
    ]]]),
  });

  assert.equal(rows[0].financeV2.costMethod, "negativeStockMarginFallback");
  assert.equal(rows[0].financeV2.appliedMarginPct, 30);
  assert.equal(rows[0].financeV2.appliedQuantity, 14);
  assert.ok(Math.abs(rows[0].financeV2.lineCostTryExVat - 980) < 1e-9);
});
