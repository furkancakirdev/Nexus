import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExchangeRateSet } from "./exchangeRateSet.mjs";

function rateSet(overrides = {}) {
  return {
    bank: "HALKBANK",
    reportDate: "2026-01-31",
    eurTryBuyingRate: 40,
    rates: {
      TRY: {
        buyingRate: 1,
        sellingRate: 1,
        rateDate: "2026-01-31",
        lagDays: 0,
        sourceId: "TRY-BASE",
      },
      EUR: {
        buyingRate: 1,
        sellingRate: 1,
        rateDate: "2026-01-31",
        lagDays: 0,
        sourceId: "DVZHAR-EUR-1",
        tryBuyingRate: 40,
      },
      USD: {
        buyingRate: 32,
        sellingRate: 32.2,
        rateDate: "2026-01-30",
        lagDays: 1,
        weekendOrHoliday: true,
        sourceId: "DVZHAR-USD-1",
      },
    },
    weekendOrHolidayNote: "Önceki iş günü kuru kullanıldı.",
    ...overrides,
  };
}

test("kur snapshotı Halkbank kanıtını ve kaynak kimliklerini normalize eder", () => {
  const normalized = normalizeExchangeRateSet(rateSet(), {
    expectedReportDate: "2026-01-31",
  });

  assert.equal(normalized.bank, "HALKBANK");
  assert.equal(normalized.reportDate, "2026-01-31");
  assert.equal(normalized.eurTryBuyingRate, 40);
  assert.deepEqual(Object.keys(normalized.rates), ["EUR", "TRY", "USD"]);
  assert.equal(normalized.rates.USD.sourceId, "DVZHAR-USD-1");
  assert.equal(normalized.rates.USD.rateDate, "2026-01-30");
});

test("kur snapshotı Halkbank dışı banka veya rapor tarihi uyuşmazlığında reddedilir", () => {
  assert.throws(
    () => normalizeExchangeRateSet(rateSet({ bank: "TCMB" })),
    /Halkbank kanıtı/,
  );
  assert.throws(
    () => normalizeExchangeRateSet(rateSet(), { expectedReportDate: "2026-02-28" }),
    /rapor tarihi/,
  );
});

test("kur snapshotı ileri tarihli veya kaynaksız satırı resmi kanıt saymaz", () => {
  assert.throws(
    () => normalizeExchangeRateSet(rateSet({
      rates: {
        ...rateSet().rates,
        USD: { ...rateSet().rates.USD, rateDate: "2026-02-01" },
      },
    })),
    /eksik veya geçersiz/,
  );
  assert.throws(
    () => normalizeExchangeRateSet(rateSet({
      rates: {
        ...rateSet().rates,
        USD: { ...rateSet().rates.USD, sourceId: "" },
      },
    })),
    /eksik veya geçersiz/,
  );
});

test("TCMB fallback satırı kaynak kimliği, hash ve retrieval kanıtı olmadan onaylanmaz", () => {
  const tcmb = {
    ...rateSet(),
    sourcePolicy: "CPM_HALKBANK_THEN_TCMB_V1",
    rates: {
      ...rateSet().rates,
      USD: {
        ...rateSet().rates.USD,
        source: "TCMB",
        sourceIdentifier: "TP.DK.USD.A",
        evidenceHash: "sha256:" + "a".repeat(64),
        retrievalMode: "validated-immutable-cache",
      },
    },
  };
  const normalized = normalizeExchangeRateSet(tcmb, { expectedReportDate: "2026-01-31" });
  assert.equal(normalized.rates.USD.source, "TCMB");
  assert.equal(normalized.rates.USD.sourceIdentifier, "TP.DK.USD.A");
  assert.throws(
    () => normalizeExchangeRateSet({
      ...tcmb,
      rates: { ...tcmb.rates, USD: { ...tcmb.rates.USD, evidenceHash: null } },
    }),
    /TCMB kur kanıtı/,
  );
});
