import { currencyCode, dateKey } from "../shared/eurReporting.mjs";

function plainRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedRateEntry(value, currency, reportDate) {
  if (!plainRecord(value)) throw new RangeError("EUR kur seti satırı geçersiz.");
  const rateDate = dateKey(value.rateDate);
  const buyingRate = finiteNumber(value.buyingRate);
  const sellingRate = value.sellingRate === null || value.sellingRate === undefined
    ? null
    : finiteNumber(value.sellingRate);
  const sourceId = typeof value.sourceId === "string" && value.sourceId.trim()
    ? value.sourceId.trim()
    : null;
  if (!currencyCode(currency) || !rateDate || rateDate > reportDate
    || buyingRate === null || buyingRate <= 0 || !sourceId
    || (sellingRate !== null && sellingRate <= 0)) {
    throw new RangeError("EUR kur seti satırı eksik veya geçersiz.");
  }
  const lagDays = value.lagDays === null || value.lagDays === undefined
    ? 0
    : finiteNumber(value.lagDays);
  if (lagDays === null || lagDays < 0) {
    throw new RangeError("EUR kur seti gecikme bilgisi geçersiz.");
  }
  return {
    buyingRate,
    sellingRate,
    rateDate,
    lagDays,
    weekendOrHoliday: Boolean(value.weekendOrHoliday),
    sourceId,
    source: typeof value.source === "string" && value.source.trim() ? value.source.trim() : "CPM",
    sourceIdentifier: typeof value.sourceIdentifier === "string" && value.sourceIdentifier.trim()
      ? value.sourceIdentifier.trim()
      : sourceId,
    selectionReason: typeof value.selectionReason === "string" && value.selectionReason.trim()
      ? value.selectionReason.trim()
      : null,
    ...(typeof value.sourceUrl === "string" && value.sourceUrl.trim() ? { sourceUrl: value.sourceUrl.trim() } : {}),
    ...(typeof value.evidenceHash === "string" && value.evidenceHash.trim() ? { evidenceHash: value.evidenceHash.trim() } : {}),
    ...(typeof value.retrievalMode === "string" && value.retrievalMode.trim() ? { retrievalMode: value.retrievalMode.trim() } : {}),
    ...(currency === "EUR" && value.tryBuyingRate !== undefined
      ? { tryBuyingRate: finiteNumber(value.tryBuyingRate) }
      : {}),
  };
}

/**
 * Approval snapshotına girecek Halkbank kur setini doğrular ve sabit sıraya
 * koyar. Hash'e giren nesne böylece kaynak satır sırasından etkilenmez.
 */
export function normalizeExchangeRateSet(rateSet, { expectedReportDate = null } = {}) {
  if (!plainRecord(rateSet) || rateSet.bank !== "HALKBANK") {
    throw new RangeError("EUR kur seti Halkbank kanıtı içermiyor.");
  }
  const reportDate = dateKey(rateSet.reportDate);
  if (!reportDate || (expectedReportDate && reportDate !== expectedReportDate)) {
    throw new RangeError("EUR kur seti rapor tarihi geçersiz.");
  }
  const eurTryBuyingRate = finiteNumber(rateSet.eurTryBuyingRate);
  if (eurTryBuyingRate === null || eurTryBuyingRate <= 0
    || !plainRecord(rateSet.rates)) {
    throw new RangeError("EUR alış kuru kanıtı eksik.");
  }
  const currencies = Object.keys(rateSet.rates).sort((left, right) => left.localeCompare(right, "en"));
  if (!currencies.includes("EUR") || !currencies.includes("TRY")) {
    throw new RangeError("EUR ve TRY temel kur satırları eksik.");
  }
  if (currencies.some((currency) => currencyCode(currency) !== currency)) {
    throw new RangeError("EUR kur setinde para birimi anahtarı geçersiz.");
  }
  const rates = Object.fromEntries(currencies.map((currency) => [
    currency,
    normalizedRateEntry(rateSet.rates[currency], currency, reportDate),
  ]));
  for (const entry of Object.values(rates)) {
    if (entry.source === "TCMB" && (!entry.sourceIdentifier.startsWith("TP.DK.")
      || !entry.evidenceHash || !["live", "validated-immutable-cache"].includes(entry.retrievalMode))) {
      throw new RangeError("TCMB kur kanıtı kaynak kimliği veya hash içermiyor.");
    }
  }
  const note = rateSet.weekendOrHolidayNote === null
    || rateSet.weekendOrHolidayNote === undefined
    ? null
    : String(rateSet.weekendOrHolidayNote);
  return {
    reportDate,
    bank: "HALKBANK",
    sourcePolicy: typeof rateSet.sourcePolicy === "string" && rateSet.sourcePolicy.trim()
      ? rateSet.sourcePolicy.trim()
      : "CPM_HALKBANK_V1",
    sourceKinds: Array.isArray(rateSet.sourceKinds)
      ? [...new Set(rateSet.sourceKinds.map((value) => String(value).trim()).filter(Boolean))].sort()
      : undefined,
    eurTryBuyingRate,
    rates,
    weekendOrHolidayNote: note,
  };
}
