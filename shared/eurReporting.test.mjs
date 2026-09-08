import test from "node:test";
import assert from "node:assert/strict";
import {
  addToCurrencyBasket,
  buildExchangeRateIndex,
  buildRateSet,
  classifyEurLine,
  classifyEurRevenueLine,
  convertToEur,
  CURRENCY_BASKETS,
  decorateBasketEur,
  emptyCurrencyBasket,
  findRateOnOrBefore,
} from "../shared/eurReporting.mjs";

// 2026-08-28 Cuma, 2026-08-29 Cumartesi, 2026-08-30 Pazar, 2026-08-31 Pazartesi
const SAMPLE_RATES = [
  { rateDate: new Date("2026-08-26T00:00:00Z"), rateCurrency: "USD", halkbankBuyingRate: 40.8, halkbankSellingRate: 40.9, exchangeSourceId: "DVZHAR-1" },
  { rateDate: new Date("2026-08-27T00:00:00Z"), rateCurrency: "USD", halkbankBuyingRate: 41.0, halkbankSellingRate: 41.1, exchangeSourceId: "DVZHAR-2" },
  { rateDate: new Date("2026-08-28T00:00:00Z"), rateCurrency: "USD", halkbankBuyingRate: 41.2, halkbankSellingRate: 41.3, exchangeSourceId: "DVZHAR-3" },
  { rateDate: new Date("2026-08-26T00:00:00Z"), rateCurrency: "GBP", halkbankBuyingRate: 54.5, halkbankSellingRate: 54.7, exchangeSourceId: "DVZHAR-4" },
  { rateDate: new Date("2026-08-28T00:00:00Z"), rateCurrency: "GBP", halkbankBuyingRate: 55.0, halkbankSellingRate: 55.2, exchangeSourceId: "DVZHAR-5" },
  { rateDate: new Date("2026-08-28T00:00:00Z"), rateCurrency: "EUR", halkbankBuyingRate: 47.1, halkbankSellingRate: 47.3, exchangeSourceId: "DVZHAR-6" },
];

test("kur indeksi aynı günün mükerrer kaydında son kaydı kullanır", () => {
  const index = buildExchangeRateIndex([
    { rateDate: "2026-08-28", rateCurrency: "USD", halkbankBuyingRate: 40, exchangeSourceId: "A" },
    { rateDate: "2026-08-28", rateCurrency: "USD", halkbankBuyingRate: 41.2, exchangeSourceId: "B" },
  ]);
  const days = index.get("USD");
  assert.equal(days.length, 1);
  assert.equal(days[0].buyingRate, 41.2);
  assert.equal(days[0].sourceId, "B");
});

test("geçersiz kur satırları sessizce elenir", () => {
  const index = buildExchangeRateIndex([
    { rateDate: null, rateCurrency: "USD", halkbankBuyingRate: 40 },
    { rateDate: "2026-08-28", rateCurrency: "", halkbankBuyingRate: 40 },
    { rateDate: "2026-08-28", rateCurrency: "USD", halkbankBuyingRate: null, halkbankSellingRate: null },
  ]);
  assert.equal(index.size, 0);
});

test("USD alış kuru istenen tarihte bulunur", () => {
  const index = buildExchangeRateIndex(SAMPLE_RATES);
  const found = findRateOnOrBefore(index, "USD", "2026-08-28");
  assert.equal(found.buyingRate, 41.2);
  assert.equal(found.lagDays, 0);
  assert.equal(found.weekendOrHoliday, false);
});

test("hafta sonunda en son önceki iş günü kuru seçilir ve gecikme notu üretilir", () => {
  const index = buildExchangeRateIndex(SAMPLE_RATES);
  const found = findRateOnOrBefore(index, "USD", "2026-08-30");
  assert.equal(found.rateDate, "2026-08-28");
  assert.equal(found.lagDays, 2);
  assert.equal(found.weekendOrHoliday, true);
});

test("kur bulunamadığında fail-closed inceleme nedeni döner", () => {
  const index = buildExchangeRateIndex(SAMPLE_RATES);
  const found = findRateOnOrBefore(index, "CHF", "2026-08-28");
  assert.equal(found.reviewReason, "missing-exchange-rate");
  const tooEarly = findRateOnOrBefore(index, "GBP", "2026-08-25");
  assert.equal(tooEarly.reviewReason, "missing-exchange-rate");
});

test("alış ve satış tarafları farklı günlerde olsa bile kendi kanıtlı tarafını seçer", () => {
  const index = buildExchangeRateIndex([
    { rateDate: "2026-08-26", rateCurrency: "USD", buyingRate: 40, sellingRate: null, source: "CPM", sourceIdentifier: "CPM-BUY" },
    { rateDate: "2026-08-27", rateCurrency: "USD", buyingRate: null, sellingRate: 41, source: "TCMB", sourceIdentifier: "TP.DK.USD.S" },
  ]);
  const buying = findRateOnOrBefore(index, "USD", "2026-08-28");
  assert.equal(buying.buyingRate, 40);
  assert.equal(buying.rateDate, "2026-08-26");
  assert.equal(buying.sourceIdentifier, "CPM-BUY");
  assert.equal(index.get("USD").find((entry) => entry.date === "2026-08-27").sellingRate, 41);
});

test("raporlama dönüşümü satış kurunu kullanmaz ve yanlış yönü fail-closed tutar", () => {
  const index = buildExchangeRateIndex([
    { rateDate: "2026-08-28", rateCurrency: "EUR", halkbankBuyingRate: 47.1, halkbankSellingRate: 47.3 },
    { rateDate: "2026-08-28", rateCurrency: "USD", halkbankBuyingRate: null, halkbankSellingRate: 41.3 },
  ]);
  const rateSet = buildRateSet(index, "2026-08-28");
  const converted = convertToEur(rateSet, "USD", 100);

  assert.equal(converted.amountEur, null);
  assert.equal(converted.reviewReason, "missing-exchange-rate");
  assert.equal(rateSet.rates.USD, undefined);
});

test("Halkbank kaynağı ve rapor tarihindeki önceki iş günü kanıtı korunur", () => {
  const rateSet = buildRateSet(buildExchangeRateIndex([
    {
      rateDate: "2026-08-28",
      rateCurrency: "EUR",
      halkbankBuyingRate: 47.1,
      halkbankSellingRate: 47.3,
      source: "CPM",
      sourceIdentifier: "DVZHAR-6",
    },
  ]), "2026-08-30");

  assert.equal(rateSet.bank, "HALKBANK");
  assert.equal(rateSet.sourcePolicy, "CPM_HALKBANK_V1");
  assert.equal(rateSet.rates.EUR.sourceIdentifier, "DVZHAR-6");
  assert.equal(rateSet.rates.EUR.rateDate, "2026-08-28");
  assert.match(rateSet.weekendOrHolidayNote, /önceki iş günü/);
});

test("EUR paritesi kur setinde birebir sabittir", () => {
  const rateSet = buildRateSet(buildExchangeRateIndex(SAMPLE_RATES), "2026-08-28");
  const converted = convertToEur(rateSet, "EUR", 123.45);
  assert.equal(converted.amountEur, 123.45);
  assert.equal(converted.rateUsed, 1);
});

test("çapraz dönüşüm alış kurları üzerinden hesaplanır", () => {
  // USD tutar → TL karşılık (USD alış) → EUR (EUR alış bölerek)
  const rateSet = buildRateSet(buildExchangeRateIndex(SAMPLE_RATES), "2026-08-28");
  const converted = convertToEur(rateSet, "USD", 100);
  assert.ok(Math.abs(converted.amountEur - (100 * 41.2 / 47.1)) < 1e-9);
  assert.equal(converted.reviewReason, null);
});

test("hafta sonu rapor gününde kur seti gecikme notu taşır", () => {
  const rateSet = buildRateSet(buildExchangeRateIndex(SAMPLE_RATES), "2026-08-30");
  assert.equal(rateSet.rates.USD.rateDate, "2026-08-28");
  assert.equal(rateSet.weekendOrHolidayNote.includes("iş günü"), true);
});

test("döviz sepetleri ayrı tutulur ve doğrudan toplanmaz", () => {
  const basket = emptyCurrencyBasket();
  addToCurrencyBasket(basket, "EUR", { netSales: 100, cost: 40 });
  addToCurrencyBasket(basket, "USD", { netSales: 50, cost: 20 });
  addToCurrencyBasket(basket, "TRY", { netSales: 500, cost: 300 });
  assert.equal(basket.EUR.netSales, 100);
  assert.equal(basket.USD.netSales, 50);
  assert.equal(basket.TRY.netSales, 500);
  assert.deepEqual(CURRENCY_BASKETS, ["EUR", "USD", "GBP", "TRY", "INCELEME"]);
});

test("tanımsız döviz sepeti inceleme sepetine düşer", () => {
  const basket = emptyCurrencyBasket();
  addToCurrencyBasket(basket, "CHF", { netSales: 10 });
  assert.equal(basket.INCELEME.netSales, 10);
});

test("sepet EUR süslemesi kur setiyle uzlaşır ve INCELEME çevrilmez", () => {
  const rateSet = buildRateSet(buildExchangeRateIndex(SAMPLE_RATES), "2026-08-28");
  const basket = emptyCurrencyBasket();
  addToCurrencyBasket(basket, "EUR", { netSales: 100, cost: 40 });
  addToCurrencyBasket(basket, "USD", { netSales: 50, cost: 20 });
  addToCurrencyBasket(basket, "TRY", { netSales: 471, cost: 200 });
  addToCurrencyBasket(basket, "INCELEME", { netSales: 999, lineCount: 3 });
  const decorated = decorateBasketEur(basket, rateSet);
  assert.equal(decorated.eurEquivalent.reviewNetSales, 999);
  assert.equal(decorated.eurEquivalent.reviewLines, 3);
  const expected = 100 + 50 * 41.2 / 47.1 + 471 / 47.1;
  assert.ok(Math.abs(decorated.eurEquivalent.netSales - expected) < 1e-9);
  assert.equal(decorated.eurComplete, true);
  assert.deepEqual(decorated.convertedCurrencies, ["EUR", "USD", "TRY"]);
});

test("kur setinde eksik döviz EUR toplamına karışmaz ve eksik listelenir", () => {
  const rateSet = buildRateSet(buildExchangeRateIndex(SAMPLE_RATES), "2026-08-28");
  delete rateSet.rates.GBP;
  const basket = emptyCurrencyBasket();
  addToCurrencyBasket(basket, "GBP", { netSales: 10 });
  addToCurrencyBasket(basket, "EUR", { netSales: 5 });
  const decorated = decorateBasketEur(basket, rateSet);
  assert.equal(decorated.eurEquivalent.netSales, 5);
  assert.equal(decorated.eurComplete, false);
  assert.deepEqual(decorated.missingCurrencies, ["GBP"]);
});

test("onaylı dönem için dondurulmuş kur seti açık dönemden bağımsızdır", () => {
  const index = buildExchangeRateIndex(SAMPLE_RATES);
  const frozen = buildRateSet(index, "2026-08-28");
  const open = buildRateSet(index, "2026-08-29");
  assert.equal(frozen.reportDate, "2026-08-28");
  assert.equal(open.reportDate, "2026-08-29");
  // Donmuş set, rapor günü ilerledikçe değişmez.
  assert.deepEqual(frozen.rates.USD.rateDate, open.rates.USD.rateDate);
  assert.equal(frozen.rates.USD.buyingRate, open.rates.USD.buyingRate);
});

test("EUR kartlı satır TRY neti belge satış kuruyla EUR sepetine çevirir", () => {
  const classified = classifyEurLine({
    productCurrency: "EUR",
    documentSellingRate: 47.1,
    signedNetSales: 47_100,
    financeV2: {
      reviewReason: null,
      lineCostTryExVat: 30_000,
      lineCostCurrencyExVat: 636.9,
    },
  });
  assert.equal(classified.basket, "EUR");
  assert.ok(Math.abs(classified.netSales - 1_000) < 1e-9);
  assert.equal(classified.cost, 636.9);
});

test("maliyet kanıtı eksik satır INCELEME sepetine düşer", () => {
  const classified = classifyEurLine({
    productCurrency: "EUR",
    documentSellingRate: 47.1,
    signedNetSales: 47_100,
    financeV2: { reviewReason: "missing-retail-price", lineCostTryExVat: null },
  });
  assert.equal(classified.basket, "INCELEME");
  assert.equal(classified.reason, "missing-retail-price");
});

test("TRY kartlı satır kur aramadan TRY sepetinde kalır", () => {
  const classified = classifyEurLine({
    productCurrency: "TRY",
    documentSellingRate: null,
    signedNetSales: 5_000,
    financeV2: { reviewReason: null, lineCostTryExVat: 3_000, lineCostCurrencyExVat: 3_000 },
  });
  assert.equal(classified.basket, "TRY");
  assert.equal(classified.netSales, 5_000);
  assert.equal(classified.cost, 3_000);
});

test("döviz cinsi boş ve FIYATDOVIZKUR 1 olan satır TRY-parite kanıtıyla EUR gelire girer", () => {
  const classified = classifyEurRevenueLine({
    productCurrency: null,
    documentSellingRate: 1,
    signedNetSales: 5_000,
  });
  assert.deepEqual(classified, {
    currency: "TRY",
    netSales: 5_000,
    covered: true,
    reason: null,
  });
});
