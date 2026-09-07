import { currencyCode, dateKey } from "../shared/eurReporting.mjs";

/** 01-Döviz Kart modülünde görünen 03-Halk Bankası banka kodu. */
export const DEFAULT_HALK_BANK_CODE = 3;
export const DEFAULT_HALK_MODULE_BANK_NAME = "03-HALK BANKASI";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalizedBankName(value) {
  return text(value).toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}

/**
 * DVZHAR adaylarını EUR raporlamanın alış/satış çiftine dönüştürür.
 *
 * Tip semantiği ve banka kimliği dış kaynak kanıtıyla doğrulanmadıkça yalnızca
 * inceleme sonucu döner; aday kur satırları resmi EUR hesabına sokulmaz.
 */
export function buildCpmExchangeRateCandidates({
  rows = [],
  bankCode = DEFAULT_HALK_BANK_CODE,
  moduleBankName = DEFAULT_HALK_MODULE_BANK_NAME,
  buyingRateType = 0,
  sellingRateType = 1,
  semanticsVerified = false,
} = {}) {
  if (!Array.isArray(rows)) throw new TypeError("CPM kur adayları dizi olmalıdır.");
  const expectedBankCode = number(bankCode);
  const expectedBuyingType = number(buyingRateType);
  const expectedSellingType = number(sellingRateType);
  if (expectedBankCode === null || expectedBuyingType === null || expectedSellingType === null
    || expectedBuyingType === expectedSellingType) {
    return { status: "candidate", exchangeRates: [], reviewReason: "rate-source-contract-unverified", rowCount: rows.length };
  }

  const configuredModuleBankName = normalizedBankName(moduleBankName);
  const usableRows = rows.map((row) => ({
    sourceId: text(row?.rateSourceId),
    bankCode: number(row?.bankCode),
    bankName: normalizedBankName(row?.moduleBankName || configuredModuleBankName || row?.bankName),
    rateType: number(row?.rateType),
    rateDate: dateKey(row?.rateDate),
    rateCurrency: currencyCode(row?.rateCurrency),
    rateValue: number(row?.rateValue),
  })).filter((row) => row.bankCode === expectedBankCode
    && row.rateDate && row.rateCurrency && row.rateValue !== null && row.rateValue > 0
    && [expectedBuyingType, expectedSellingType].includes(row.rateType));

  if (!semanticsVerified) {
    return {
      status: "candidate",
      exchangeRates: [],
      reviewReason: "rate-source-contract-unverified",
      rowCount: rows.length,
      usableRowCount: usableRows.length,
    };
  }

  const mismatchedBankNames = usableRows.some((row) => !/(HALK|TÜRKİYE HALK|TURKIYE HALK)/.test(row.bankName));
  if (mismatchedBankNames || usableRows.length === 0) {
    return {
      status: "candidate",
      exchangeRates: [],
      reviewReason: mismatchedBankNames ? "rate-bank-identity-mismatch" : "missing-rate-rows",
      rowCount: rows.length,
      usableRowCount: usableRows.length,
    };
  }

  const groups = new Map();
  for (const row of usableRows) {
    const key = `${row.rateDate}|${row.rateCurrency}`;
    const group = groups.get(key) || { date: row.rateDate, currency: row.rateCurrency, buying: [], selling: [] };
    if (row.rateType === expectedBuyingType) group.buying.push(row);
    if (row.rateType === expectedSellingType) group.selling.push(row);
    groups.set(key, group);
  }

  const exchangeRates = [];
  for (const group of groups.values()) {
    if (group.buying.length !== 1 || group.selling.length !== 1) {
      return {
        status: "candidate",
        exchangeRates: [],
        reviewReason: "duplicate-rate-source",
        rowCount: rows.length,
        usableRowCount: usableRows.length,
      };
    }
    exchangeRates.push({
      exchangeSourceId: `DVZHAR-${group.buying[0].sourceId || "?"}/${group.selling[0].sourceId || "?"}`,
      rateDate: group.date,
      rateCurrency: group.currency,
      halkbankBuyingRate: group.buying[0].rateValue,
      halkbankSellingRate: group.selling[0].rateValue,
    });
  }
  exchangeRates.sort((left, right) => left.rateDate.localeCompare(right.rateDate, "en")
    || left.rateCurrency.localeCompare(right.rateCurrency, "en"));
  return {
    status: "verified",
    exchangeRates,
    reviewReason: null,
    rowCount: rows.length,
    usableRowCount: usableRows.length,
  };
}
