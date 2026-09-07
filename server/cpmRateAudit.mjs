import { currencyCode, dateKey } from "../shared/eurReporting.mjs";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedBankName(value) {
  return text(value).toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}

function normalizedRateRow(row) {
  return {
    sourceId: text(row?.rateSourceId ?? row?.sourceId ?? row?.ID),
    bankCode: number(row?.bankCode ?? row?.bankId ?? row?.BANKA),
    bankName: normalizedBankName(row?.bankName ?? row?.BANKAAD),
    rateType: number(row?.rateType ?? row?.DOVIZTIP),
    rateDate: dateKey(row?.rateDate ?? row?.DOVIZTARIH),
    rateCurrency: currencyCode(row?.rateCurrency ?? row?.currency ?? row?.DOVIZCINS),
    rateValue: number(row?.rateValue ?? row?.DOVIZKUR),
  };
}

function rateGroupKey(row) {
  return `${row.bankCode}|${row.rateType}|${row.rateCurrency}|${row.rateDate}`;
}

/**
 * DVZHAR satırlarını gün/tip/döviz/banka tanecikliğinde özetler.
 * Bu yardımcı yalnız kanıt üretir; hiçbir oranı seçmez veya varsayılan üretmez.
 */
export function summarizeCpmRateRows(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("CPM kur satırları dizi olmalıdır.");
  const normalizedRows = rows.map(normalizedRateRow).filter((row) => (
    row.bankCode !== null && row.rateType !== null && row.rateDate
    && row.rateCurrency && row.rateValue !== null && row.rateValue > 0
  ));
  const groups = new Map();
  for (const row of normalizedRows) {
    const key = rateGroupKey(row);
    const group = groups.get(key) || {
      bankCode: row.bankCode,
      bankName: row.bankName,
      rateType: row.rateType,
      rateCurrency: row.rateCurrency,
      rateDate: row.rateDate,
      sourceIds: [],
      values: [],
    };
    if (row.sourceId) group.sourceIds.push(row.sourceId);
    group.values.push(row.rateValue);
    groups.set(key, group);
  }
  const dayGroups = [...groups.values()].map((group) => {
    const distinctValues = [...new Set(group.values.map((value) => String(value)))];
    return {
      ...group,
      rowCount: group.values.length,
      distinctRateCount: distinctValues.length,
      minRate: Math.min(...group.values),
      maxRate: Math.max(...group.values),
      duplicate: group.values.length > 1,
      conflict: distinctValues.length > 1,
    };
  }).sort((left, right) => (
    left.bankCode - right.bankCode
    || left.rateDate.localeCompare(right.rateDate)
    || left.rateCurrency.localeCompare(right.rateCurrency)
    || left.rateType - right.rateType
  ));
  return {
    inputRowCount: rows.length,
    usableRowCount: normalizedRows.length,
    bankCodes: [...new Set(normalizedRows.map((row) => row.bankCode))].sort((a, b) => a - b),
    rateTypes: [...new Set(normalizedRows.map((row) => row.rateType))].sort((a, b) => a - b),
    currencies: [...new Set(normalizedRows.map((row) => row.rateCurrency))].sort(),
    dayGroups,
    duplicateGroups: dayGroups.filter((group) => group.duplicate),
    conflictGroups: dayGroups.filter((group) => group.conflict),
  };
}

/**
 * Fatura günlerinin alış/satış çiftleriyle kapsamasını hesaplar.
 * TRY/boş satırları CPM kuru istemeyen açık parite olarak raporlar.
 */
export function buildCpmInvoiceDateCoverage({
  invoiceRows = [],
  rateRows = [],
  bankCodes = [3, 6],
  buyingRateType = 0,
  sellingRateType = 1,
} = {}) {
  if (!Array.isArray(invoiceRows) || !Array.isArray(rateRows)) {
    throw new TypeError("Fatura ve kur kanıtları dizi olmalıdır.");
  }
  const required = new Map();
  for (const row of invoiceRows) {
    const currency = currencyCode(row?.currency ?? row?.invoiceCurrency ?? row?.DOVIZCINS) || "TRY";
    const date = dateKey(row?.invoiceDate ?? row?.date ?? row?.EVRAKTARIH);
    if (!date) continue;
    const entry = required.get(currency) || { dates: new Set(), rowCount: 0 };
    entry.dates.add(date);
    entry.rowCount += 1;
    required.set(currency, entry);
  }
  const rateSummary = summarizeCpmRateRows(rateRows);
  const rateDayByKey = new Map(rateSummary.dayGroups.map((group) => [
    rateGroupKey(group), group,
  ]));
  return [...required.entries()].map(([currency, entry]) => {
    const dates = [...entry.dates].sort();
    const bankCoverage = {};
    for (const bankCode of bankCodes) {
      const missingDates = [];
      let completePairDays = 0;
      for (const date of dates) {
        const buying = rateDayByKey.get(`${bankCode}|${buyingRateType}|${currency}|${date}`);
        const selling = rateDayByKey.get(`${bankCode}|${sellingRateType}|${currency}|${date}`);
        if (buying && selling) completePairDays += 1;
        else missingDates.push(date);
      }
      bankCoverage[String(bankCode)] = {
        completePairDays,
        missingPairDays: missingDates.length,
        missingDates,
      };
    }
    const parity = currency === "TRY";
    return {
      currency,
      rowCount: entry.rowCount,
      requiredInvoiceDays: dates.length,
      minInvoiceDate: dates[0] || null,
      maxInvoiceDate: dates.at(-1) || null,
      parity,
      bankCoverage,
    };
  }).sort((left, right) => left.currency.localeCompare(right.currency));
}

/**
 * 01-Döviz Kart modülünün banka kimliği ile DVZHAR kapsamını birlikte değerlendirir.
 * Modül etiketi verilmişse ayrı BNKKRT master adından önceliklidir.
 */
export function evaluateCpmRateContract({
  bankRows = [],
  rateRows = [],
  invoiceRows = [],
  expectedBankCode = 3,
  expectedBankNamePattern = /HALK BANKASI|TÜRKİYE HALK|TURKIYE HALK/i,
  moduleBankName = "",
  buyingRateType = 0,
  sellingRateType = 1,
} = {}) {
  const bank = (Array.isArray(bankRows) ? bankRows : []).find((row) => (
    Number(row?.bankId ?? row?.ID) === Number(expectedBankCode)
  ));
  const bankIdentityVerified = Boolean(bank && expectedBankNamePattern.test(text(moduleBankName || rowName(bank))));
  const summary = summarizeCpmRateRows(rateRows);
  const coverage = buildCpmInvoiceDateCoverage({
    invoiceRows,
    rateRows,
    bankCodes: [expectedBankCode],
    buyingRateType,
    sellingRateType,
  });
  const reasons = [];
  if (!bankIdentityVerified) reasons.push("bank-identity-unverified");
  if (!summary.dayGroups.some((row) => row.bankCode === Number(expectedBankCode))) {
    reasons.push("missing-rate-rows-for-expected-bank");
  }
  if (summary.duplicateGroups.length) reasons.push("duplicate-rate-source");
  if (summary.conflictGroups.length) reasons.push("conflicting-rate-source");
  if (coverage.some((row) => !row.parity && row.bankCoverage[String(expectedBankCode)]?.missingPairDays > 0)) {
    reasons.push("missing-required-rate-days");
  }
  return {
    status: reasons.length === 0 ? "verified" : "blocked",
    bankIdentityVerified,
    expectedBankCode: Number(expectedBankCode),
    rateRowCount: summary.usableRowCount,
    duplicateGroupCount: summary.duplicateGroups.length,
    conflictGroupCount: summary.conflictGroups.length,
    coverage,
    reasons,
  };
}

function rowName(row) {
  return row?.bankName ?? row?.name ?? row?.BANKAAD ?? "";
}
