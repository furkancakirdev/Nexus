import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCpmInvoiceDateCoverage,
  evaluateCpmRateContract,
  summarizeCpmRateRows,
} from "./cpmRateAudit.mjs";

const pair = (bankCode, date, currency = "EUR", buy = 40, sell = 41) => [
  { bankCode, bankName: bankCode === 6 ? "HALK BANKASI" : "İLLER BANKASI", rateType: 0, rateDate: date, rateCurrency: currency, rateValue: buy, rateSourceId: `${bankCode}-b-${date}` },
  { bankCode, bankName: bankCode === 6 ? "HALK BANKASI" : "İLLER BANKASI", rateType: 1, rateDate: date, rateCurrency: currency, rateValue: sell, rateSourceId: `${bankCode}-s-${date}` },
];

test("DVZHAR özeti aynı gün duplicate ve conflict gruplarını ayırır", () => {
  const result = summarizeCpmRateRows([
    ...pair(6, "2026-08-28"),
    { bankCode: 6, bankName: "HALK BANKASI", rateType: 0, rateDate: "2026-08-28", rateCurrency: "EUR", rateValue: 40, rateSourceId: "duplicate" },
    { bankCode: 6, bankName: "HALK BANKASI", rateType: 1, rateDate: "2026-08-29", rateCurrency: "EUR", rateValue: 42, rateSourceId: "conflict-a" },
    { bankCode: 6, bankName: "HALK BANKASI", rateType: 1, rateDate: "2026-08-29", rateCurrency: "EUR", rateValue: 43, rateSourceId: "conflict-b" },
  ]);

  assert.equal(result.duplicateGroups.length, 2);
  assert.equal(result.conflictGroups.length, 1);
  assert.equal(result.conflictGroups[0].rateDate, "2026-08-29");
});

test("fatura günleri banka bazında tam çift ve eksik günleri listeler", () => {
  const result = buildCpmInvoiceDateCoverage({
    invoiceRows: [
      { invoiceDate: "2026-08-28", currency: "EUR" },
      { invoiceDate: "2026-08-29", currency: "EUR" },
      { invoiceDate: "2026-08-28", currency: "TRY" },
    ],
    rateRows: pair(3, "2026-08-28"),
    bankCodes: [3, 6],
  });

  const eur = result.find((row) => row.currency === "EUR");
  const tryRow = result.find((row) => row.currency === "TRY");
  assert.deepEqual(eur.bankCoverage["3"], { completePairDays: 1, missingPairDays: 1, missingDates: ["2026-08-29"] });
  assert.equal(eur.bankCoverage["6"].missingPairDays, 2);
  assert.equal(tryRow.parity, true);
});

test("Halkbank master kimliği rate satırı yoksa sözleşmeyi açmaz", () => {
  const result = evaluateCpmRateContract({
    bankRows: [{ bankId: 6, bankCode: "012", bankName: "HALK BANKASI" }],
    rateRows: pair(3, "2026-08-28"),
    invoiceRows: [{ invoiceDate: "2026-08-28", currency: "EUR" }],
    expectedBankCode: 6,
  });

  assert.equal(result.bankIdentityVerified, true);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.reasons, ["missing-rate-rows-for-expected-bank", "missing-required-rate-days"]);
});

test("banka adı Halkbank değilse aynı sayısal kod güvenilir kabul edilmez", () => {
  const result = evaluateCpmRateContract({
    bankRows: [{ bankId: 6, bankCode: "012", bankName: "BAŞKA BANKA" }],
    rateRows: pair(6, "2026-08-28"),
    invoiceRows: [{ invoiceDate: "2026-08-28", currency: "EUR" }],
  });

  assert.equal(result.status, "blocked");
  assert.ok(result.reasons.includes("bank-identity-unverified"));
});
