import test from "node:test";
import assert from "node:assert/strict";
import { createHistoricalRetailPriceSelector, selectHistoricalRetailPrice } from "./historicalPrice.mjs";

test("tarihsel fiyat işlem tarihinden önceki son kart kaydını seçer", () => {
  const result = selectHistoricalRetailPrice({
    productCode: "P-1",
    productCurrency: "EUR",
    asOfDate: "2026-02-10",
    priceRows: [
      { productCode: "P-1", effectiveDate: "2026-02-01", currency: "EUR", priceExVat: 120 },
      { productCode: "P-1", effectiveDate: "2026-02-15", currency: "EUR", priceExVat: 130 },
    ],
  });
  assert.deepEqual(result, {
    productCode: "P-1", currency: "EUR", priceExVat: 120,
    effectiveDate: "2026-02-01", lagDays: 9, reviewReason: null,
  });
});

test("gelecek tarihli fiyatı kullanmaz ve fiyat yoksa review döner", () => {
  const result = selectHistoricalRetailPrice({
    productCode: "P-2",
    productCurrency: "USD",
    asOfDate: "2026-02-10",
    priceRows: [{ productCode: "P-2", effectiveDate: "2026-02-15", currency: "USD", priceExVat: 80 }],
  });
  assert.equal(result.priceExVat, null);
  assert.equal(result.reviewReason, "missing-historical-retail-price");
});

test("geçerlilik sonu geçmiş fiyatı işlem tarihinde seçmez", () => {
  const result = selectHistoricalRetailPrice({
    productCode: "P-3",
    productCurrency: "EUR",
    asOfDate: "2026-02-10",
    priceRows: [
      { productCode: "P-3", effectiveDate: "2026-01-01", validUntil: "2026-02-01", currency: "EUR", priceExVat: 80 },
    ],
  });
  assert.equal(result.priceExVat, null);
  assert.equal(result.reviewReason, "missing-historical-retail-price");
});

test("tarihsel fiyat seçici ürün ve döviz indeksini tek kez oluşturur", () => {
  const select = createHistoricalRetailPriceSelector([
    { productCode: "P-4", effectiveDate: "2026-01-01", currency: "EUR", priceExVat: 80 },
    { productCode: "P-4", effectiveDate: "2026-02-01", currency: "EUR", priceExVat: 90 },
  ]);
  assert.deepEqual(select({ productCode: "P-4", productCurrency: "EUR", asOfDate: "2026-02-10" }), {
    productCode: "P-4", currency: "EUR", priceExVat: 90,
    effectiveDate: "2026-02-01", lagDays: 9, reviewReason: null,
  });
});
