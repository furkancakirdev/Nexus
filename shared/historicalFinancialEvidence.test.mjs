import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoricalFinancialEvidence } from "./historicalFinancialEvidence.mjs";

const purchase = {
  id: "P-1",
  productCode: "CARD-1",
  depotCode: "D1",
  kind: "purchase",
  date: "2026-02-10",
  quantity: 10,
  unitCostTryExVat: 700,
};

test("tarihsel fiyat ve satış kuru aynı alım hareketine ürün dövizi ve marj kanıtı bağlar", () => {
  const result = buildHistoricalFinancialEvidence({
    movements: [purchase],
    priceRows: [{
      productCode: "CARD-1", cardCurrency: "EUR", priceCurrency: "EUR",
      effectiveDate: "2026-02-01", priceExVat: 25, priceVatExempt: 1,
    }],
    exchangeRates: [{
      exchangeSourceId: "DVZHAR-BUY/SELL", rateDate: "2026-02-10", rateCurrency: "EUR",
      halkbankBuyingRate: 37, halkbankSellingRate: 40,
    }],
  });

  assert.equal(result.movements[0].productCurrency, "EUR");
  assert.equal(result.movements[0].unitCostCurrencyExVat, 17.5);
  assert.equal(result.marginObservationsByStockKey.get("CARD-1\u001fD1").length, 1);
  assert.equal(result.marginObservationsByStockKey.get("CARD-1\u001fD1")[0].productListGrossMarginPct, 30);
  assert.equal(result.observationByMovementId.get("P-1").exchangeEvidence.method, "halkbank-selling");
  assert.equal(result.reviewCounts.review, 0);
});

test("fiyat KDV niteliği veya geçmiş kur yoksa maliyet ve marj kanıtı review kalır", () => {
  const result = buildHistoricalFinancialEvidence({
    movements: [{ ...purchase, id: "P-2", productCode: "CARD-2" }],
    priceRows: [{
      productCode: "CARD-2", cardCurrency: "USD", priceCurrency: "USD",
      effectiveDate: "2026-02-01", priceExVat: 25, priceVatExempt: 0,
    }],
    exchangeRates: [],
  });

  assert.equal(result.movements[0].unitCostCurrencyExVat, undefined);
  assert.equal(result.marginObservationsByStockKey.size, 0);
  assert.equal(result.observationByMovementId.size, 0);
  assert.deepEqual(result.reviewCounts, { review: 1, covered: 0 });
});

test("aynı ürün için çelişkili kart dövizi resmi kanıt üretmez", () => {
  const result = buildHistoricalFinancialEvidence({
    movements: [{ ...purchase, id: "P-3", productCode: "CARD-3" }],
    priceRows: [
      { productCode: "CARD-3", cardCurrency: "EUR", priceCurrency: "EUR", effectiveDate: "2026-02-01", priceExVat: 25, priceVatExempt: 1 },
      { productCode: "CARD-3", cardCurrency: "USD", priceCurrency: "USD", effectiveDate: "2026-02-01", priceExVat: 25, priceVatExempt: 1 },
    ],
    exchangeRates: [],
  });

  assert.equal(result.movements[0].productCurrency, undefined);
  assert.equal(result.reviewCounts.review, 1);
  assert.equal(result.reviewReasons["ambiguous-product-currency"], 1);
});
