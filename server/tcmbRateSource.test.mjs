import assert from "node:assert/strict";
import test from "node:test";
import { collectHistoricalFallbackDates, createTcmbRateSource, parseTcmbDailyXml, planTcmbFallbackDates, tcmbDailyXmlUrl } from "./tcmbRateSource.mjs";

const XML = `<?xml version="1.0"?><Tarih_Date Tarih="07.09.2026" Date="09/07/2026"><Currency Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>48.3465</ForexBuying><ForexSelling>48.4336</ForexSelling></Currency><Currency Kod="GBP" CurrencyCode="GBP"><Unit>1</Unit><ForexBuying>65.3185</ForexBuying><ForexSelling>65.6590</ForexSelling></Currency><Currency Kod="JPY" CurrencyCode="JPY"><Unit>100</Unit><ForexBuying>31.1238</ForexBuying><ForexSelling>31.3299</ForexSelling></Currency></Tarih_Date>`;
const PREVIOUS_XML = XML.replace(/07\.09\.2026/g, "06.09.2026").replace(/09\/07\/2026/g, "09/06/2026");

test("TCMB günlük XML'i tarih, alış/satış ve birim kanıtını normalize eder", () => {
  const rows = parseTcmbDailyXml(XML, { requestedDate: "2026-09-07", sourceUrl: "https://example.test/07092026.xml" });
  assert.deepEqual(rows.map((row) => row.rateCurrency), ["USD", "GBP"]);
  assert.equal(rows[0].buyingRate, 48.3465);
  assert.equal(rows[0].sellingRate, 48.4336);
  assert.equal(rows[0].source, "TCMB");
  assert.equal(rows[0].buyingSourceIdentifier, "TP.DK.USD.A");
  assert.equal(rows[0].sellingSourceIdentifier, "TP.DK.USD.S");
  assert.match(rows[0].evidenceHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(rows[0].rateDate, "2026-09-07");
});

test("TCMB URL'i gün-ay-yıl XML sözleşmesini üretir", () => {
  assert.equal(tcmbDailyXmlUrl("2026-09-07"), "https://www.tcmb.gov.tr/kurlar/202609/07092026.xml");
});

test("TCMB fallback tarih planı benzersiz tarihleri sınırlar ve atlananları görünür bırakır", () => {
  assert.deepEqual(planTcmbFallbackDates({
    requestedDates: ["2026-09-03", "2026-09-02", "2026-09-03", "2026-09-01"],
    maxRequestedDates: 2,
  }), {
    selectedDates: ["2026-09-03", "2026-09-02"],
    skippedDates: ["2026-09-01"],
  });
});

test("tarihsel fallback yalnız kesin yabancı para opening/purchase günlerini toplar", () => {
  assert.deepEqual(collectHistoricalFallbackDates({
    movements: [
      { kind: "opening", productCode: "A", date: "2026-01-03", productCurrency: "USD" },
      { kind: "purchase", productCode: "B", date: "2026-01-02", productCurrency: null },
      { kind: "sale", productCode: "C", date: "2026-01-01", productCurrency: "GBP" },
    ],
    priceRows: [{ productCode: "B", cardCurrency: "GBP" }],
  }), ["2026-01-02", "2026-01-03"]);
});

test("TCMB sağlayıcısı önceki geçerli tarihe düşer ve ağ hatasında fail-closed kalır", async () => {
  const calls = [];
  const source = createTcmbRateSource({
    maxLagDays: 2,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("/07092026.xml")) return { ok: false };
      return { ok: true, text: async () => PREVIOUS_XML };
    },
  });
  const rows = await source.load("2026-09-07");
  assert.equal(rows[0].requestedDate, "2026-09-07");
  assert.equal(rows[0].selectionReason, "tcmb-previous-valid-date");
  assert.deepEqual(calls, [
    "https://www.tcmb.gov.tr/kurlar/202609/07092026.xml",
    "https://www.tcmb.gov.tr/kurlar/202609/06092026.xml",
  ]);
  assert.equal(source.stats.httpAttemptCount, 2);
});

test("TCMB sağlayıcısı HTTP deneme bütçesini aşınca fail-closed kalır", async () => {
  const source = createTcmbRateSource({
    maxLagDays: 7,
    maxHttpAttempts: 1,
    fetchImpl: async () => ({ ok: false }),
  });
  assert.deepEqual(await source.load("2026-09-07"), []);
  assert.equal(source.stats.httpAttemptCount, 1);
  assert.equal(source.stats.attemptCapReached, true);
});
