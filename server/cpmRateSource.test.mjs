import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HALK_BANK_CODE,
  buildCpmExchangeRateCandidates,
} from "./cpmRateSource.mjs";

test("CPM Halkbank varsayılanı canlı banka kimliğini kullanır", () => {
  assert.equal(DEFAULT_HALK_BANK_CODE, 6);
});

test("CPM banka master adı modül etiketini geçersiz kılar", () => {
  const result = buildCpmExchangeRateCandidates({
    rows: [
      { rateSourceId: 11, bankCode: 3, bankName: "İLLER BANKASI", rateType: 0, rateDate: "2026-09-03", rateCurrency: "EUR", rateValue: 55.5364 },
      { rateSourceId: 12, bankCode: 3, bankName: "İLLER BANKASI", rateType: 1, rateDate: "2026-09-03", rateCurrency: "EUR", rateValue: 56.673 },
    ],
    bankCode: 3,
    semanticsVerified: true,
  });

  assert.equal(result.status, "candidate");
  assert.equal(result.exchangeRates.length, 0);
  assert.equal(result.reviewReason, "rate-bank-identity-mismatch");
});

test("DVZHAR adayları aynı gün alış ve satış kurlarını tek kayıt sözleşmesine bağlar", () => {
  const result = buildCpmExchangeRateCandidates({
    rows: [
      { rateSourceId: 11, bankCode: 6, bankName: "HALK BANKASI", rateType: 0, rateDate: "2026-08-28", rateCurrency: "EUR", rateValue: 47.1 },
      { rateSourceId: 12, bankCode: 6, bankName: "HALK BANKASI", rateType: 1, rateDate: "2026-08-28", rateCurrency: "EUR", rateValue: 47.3 },
    ],
    buyingRateType: 0,
    sellingRateType: 1,
    bankCode: 6,
    semanticsVerified: true,
  });

  assert.equal(result.status, "verified");
  assert.deepEqual(result.exchangeRates, [{
    exchangeSourceId: "DVZHAR-11/12",
    rateDate: "2026-08-28",
    rateCurrency: "EUR",
    halkbankBuyingRate: 47.1,
    halkbankSellingRate: 47.3,
  }]);
});

test("DVZHAR banka veya tip sözleşmesi doğrulanmamışsa kur adayı finansı açmaz", () => {
  const result = buildCpmExchangeRateCandidates({
    rows: [{ rateSourceId: 11, bankCode: 3, bankName: "İLLER BANKASI", rateType: 1, rateDate: "2026-08-28", rateCurrency: "EUR", rateValue: 47.3 }],
    bankCode: 6,
    semanticsVerified: false,
  });

  assert.equal(result.status, "candidate");
  assert.equal(result.exchangeRates.length, 0);
  assert.equal(result.reviewReason, "rate-source-contract-unverified");
});

test("aynı gün yinelenen alış veya satış kuru belirsiz olarak karantinaya alınır", () => {
  const result = buildCpmExchangeRateCandidates({
    rows: [
      { rateSourceId: 11, bankCode: 6, bankName: "HALK BANKASI", rateType: 0, rateDate: "2026-08-28", rateCurrency: "EUR", rateValue: 47.1 },
      { rateSourceId: 12, bankCode: 6, bankName: "HALK BANKASI", rateType: 0, rateDate: "2026-08-28", rateCurrency: "EUR", rateValue: 47.2 },
      { rateSourceId: 13, bankCode: 6, bankName: "HALK BANKASI", rateType: 1, rateDate: "2026-08-28", rateCurrency: "EUR", rateValue: 47.3 },
    ],
    bankCode: 6,
    buyingRateType: 0,
    sellingRateType: 1,
    semanticsVerified: true,
  });

  assert.equal(result.status, "candidate");
  assert.equal(result.exchangeRates.length, 0);
  assert.equal(result.reviewReason, "duplicate-rate-source");
});
