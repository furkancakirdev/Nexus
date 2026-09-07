import assert from "node:assert/strict";
import test from "node:test";
import { resolveOfficialRateRows } from "./officialRateResolver.mjs";

test("CPM aynı tarih-döviz-taraf anahtarında TCMB fallback'ini geçersiz kılar", () => {
  const result = resolveOfficialRateRows({
    cpmRows: [{ rateDate: "2026-09-07", rateCurrency: "USD", halkbankBuyingRate: 48, halkbankSellingRate: 49, exchangeSourceId: "CPM-1" }],
    tcmbRows: [{ rateDate: "2026-09-07", rateCurrency: "USD", buyingRate: 48.3, sellingRate: 48.4, source: "TCMB", sourceIdentifier: "TP.DK.USD.A/S" }],
  });
  assert.equal(result.rows.find((row) => row.side === "buying").rate, 48);
  assert.equal(result.rows.find((row) => row.side === "buying").source, "CPM");
  assert.equal(result.fallbackRowCount, 0);
});

test("TCMB yalnız CPM'de olmayan anahtarı doldurur ve mixed kaynak durumunu açıklar", () => {
  const result = resolveOfficialRateRows({
    cpmRows: [{ rateDate: "2026-09-07", rateCurrency: "USD", halkbankBuyingRate: 48, halkbankSellingRate: 49 }],
    tcmbRows: [{ rateDate: "2026-09-07", rateCurrency: "GBP", buyingRate: 65, sellingRate: 66, source: "TCMB" }],
  });
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows.filter((row) => row.source === "TCMB").length, 2);
  assert.equal(result.mixedSources, true);
});

test("boş veya ileri tarihli satırlar seçilmez", () => {
  const result = resolveOfficialRateRows({
    cpmRows: [{ rateDate: "2026-09-07", rateCurrency: "USD", halkbankBuyingRate: 0, halkbankSellingRate: null }],
    tcmbRows: [{ rateDate: "2026-09-08", rateCurrency: "USD", buyingRate: 48, sellingRate: 49, source: "TCMB" }],
    requestedDates: ["2026-09-07"],
  });
  assert.deepEqual(result.rows, []);
});

test("önceki TCMB tarihi istenen rapor tarihine bağlanır", () => {
  const result = resolveOfficialRateRows({
    tcmbRows: [{
      rateDate: "2026-09-06",
      requestedDate: "2026-09-07",
      rateCurrency: "USD",
      buyingRate: 48,
      sellingRate: 49,
      source: "TCMB",
      buyingSourceIdentifier: "TP.DK.USD.A",
      sellingSourceIdentifier: "TP.DK.USD.S",
    }],
    requestedDates: ["2026-09-07"],
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].rateDate, "2026-09-06");
  assert.equal(result.rows[0].sourceIdentifier, "TP.DK.USD.A");
});
