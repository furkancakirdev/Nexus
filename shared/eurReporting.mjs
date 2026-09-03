// EUR raporlama katmanı: döviz sepetlerini Halkbank alış kurlarıyla EUR karşılığına çevirir.
// Kurallar spek'e bağlıdır: ürün dövizi EUR/USD/GBP/TRY doğrudan toplanmaz; sepetler
// rapor günü (veya dondurulmuş) alış kur setiyle EUR'ya çapraz dönüşür. Saf fonksiyonlar.

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function currencyCode(value) {
  const normalized = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function dateKey(value) {
  // CPM okuma katmanı tarihleri Date nesnesi olarak taşır; UTC takvim günü esas alınır.
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isFinite(timestamp)) return null;
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value));
  return match?.[1] || null;
}

const DAY_MS = 86_400_000;

/**
 * Ham kur kayıtlarından (tarih, döviz, alış/satış) para birimi bazında
 * tarihe göre sıralı kur haritası üretir. Aynı günün mükerrer kayıtlarında
 * son kayıt kazanır.
 *
 * @param {Object[]} rateRows DVZHAR kaynaklı ham kur satırları
 */
export function buildExchangeRateIndex(rateRows = []) {
  const rows = Array.isArray(rateRows) ? rateRows : [];
  const byCurrency = new Map();
  for (const row of rows) {
    const currency = currencyCode(row?.rateCurrency);
    const day = dateKey(row?.rateDate);
    if (!currency || !day) continue;
    const buyingRate = finiteNumber(row?.halkbankBuyingRate);
    const sellingRate = finiteNumber(row?.halkbankSellingRate);
    if (buyingRate === null && sellingRate === null) continue;
    const entry = {
      date: day,
      buyingRate,
      sellingRate,
      sourceId: text(row?.exchangeSourceId) || null,
    };
    const days = byCurrency.get(currency) || new Map();
    days.set(day, entry);
    byCurrency.set(currency, days);
  }
  const sorted = new Map();
  for (const [currency, days] of byCurrency) {
    sorted.set(currency, [...days.values()].sort((a, b) => a.date.localeCompare(b.date)));
  }
  return sorted;
}

/**
 * Bir döviz için istenen tarihte veya en yakın önceki tarihte kur bulur.
 * Hafta sonu/tatil günlerinde en son önceki iş günü kuru döner ve gecikme notu üretilir.
 */
export function findRateOnOrBefore(index, currency, requestedDate) {
  const normalizedCurrency = currencyCode(currency);
  const requestedDay = dateKey(requestedDate);
  if (!normalizedCurrency || !requestedDay) {
    return { currency: normalizedCurrency, requestedDate: requestedDay, reviewReason: "missing-exchange-rate" };
  }
  if (normalizedCurrency === "EUR") {
    return {
      currency: "EUR",
      requestedDate: requestedDay,
      rateDate: requestedDay,
      buyingRate: 1,
      sellingRate: 1,
      sourceId: "EUR-PARITY",
      lagDays: 0,
      weekendOrHoliday: false,
      reviewReason: null,
    };
  }
  const days = index?.get instanceof Function ? index.get(normalizedCurrency) : null;
  if (!days || !days.length) {
    return { currency: normalizedCurrency, requestedDate: requestedDay, reviewReason: "missing-exchange-rate" };
  }
  let candidate = null;
  for (const entry of days) {
    if (entry.date <= requestedDay) candidate = entry;
    else break;
  }
  if (!candidate) {
    return { currency: normalizedCurrency, requestedDate: requestedDay, reviewReason: "missing-exchange-rate" };
  }
  const lagDays = Math.round((Date.parse(requestedDay) - Date.parse(candidate.date)) / DAY_MS);
  return {
    currency: normalizedCurrency,
    requestedDate: requestedDay,
    rateDate: candidate.date,
    buyingRate: candidate.buyingRate,
    sellingRate: candidate.sellingRate,
    sourceId: candidate.sourceId,
    lagDays,
    weekendOrHoliday: lagDays > 0,
    reviewReason: null,
  };
}

/**
 * Rapor günü (veya dondurulmuş) kur setini üretir. Kurlar TL/1 döviz birimi
 * cinsindendir; EUR karşılığı çapraz dönüşümde EUR alış kuru bölen olarak kullanılır.
 * İndekste EUR kuru yoksa çapraz dönüşüm fail-closed kalır, uydurma kur üretilmez.
 */
export function buildRateSet(index, reportDate) {
  const reportDay = dateKey(reportDate);
  if (!reportDay) return null;
  const daysFor = (currency) => (index instanceof Map ? index.get(currency) : null) || [];
  const latestOnOrBefore = (currency) => {
    let candidate = null;
    for (const entry of daysFor(currency)) {
      if (entry.date <= reportDay) candidate = entry;
      else break;
    }
    return candidate;
  };
  const eurEntry = latestOnOrBefore("EUR");
  const eurTryBuyingRate = eurEntry ? finiteNumber(eurEntry.buyingRate) : null;
  const currencies = index instanceof Map ? [...index.keys()] : [];
  const rates = {
    EUR: {
      buyingRate: 1,
      sellingRate: 1,
      rateDate: eurEntry?.date ?? reportDay,
      lagDays: eurEntry
        ? Math.round((Date.parse(reportDay) - Date.parse(eurEntry.date)) / DAY_MS)
        : 0,
      weekendOrHoliday: false,
      sourceId: eurEntry?.sourceId ?? "EUR-PARITY",
      tryBuyingRate: eurTryBuyingRate,
    },
    // TRY temel para birimidir; EUR karşılığı doğrudan EUR alış kuruna bölünerek bulunur.
    TRY: {
      buyingRate: 1,
      sellingRate: 1,
      rateDate: reportDay,
      lagDays: 0,
      weekendOrHoliday: false,
      sourceId: "TRY-BASE",
    },
  };
  for (const currency of currencies) {
    if (currency === "EUR") continue;
    const found = findRateOnOrBefore(index, currency, reportDay);
    if (found.reviewReason) continue;
    rates[currency] = {
      buyingRate: found.buyingRate,
      sellingRate: found.sellingRate,
      rateDate: found.rateDate,
      lagDays: found.lagDays,
      weekendOrHoliday: found.weekendOrHoliday,
      sourceId: found.sourceId,
    };
  }
  const maxLag = Object.values(rates).reduce((max, rate) => Math.max(max, rate.lagDays || 0), 0);
  return {
    reportDate: reportDay,
    bank: "HALKBANK",
    eurTryBuyingRate,
    rates,
    weekendOrHolidayNote: maxLag > 0
      ? `Hafta sonu/tatil: en son önceki iş günü kuru kullanıldı (en fazla ${maxLag} gün geriden).`
      : null,
  };
}

/**
 * Ürün dövizi tutarını kur setiyle EUR karşılığına çevirir.
 * Çapraz dönüşüm: EUR = tutar × alış(döviz) ÷ alış(EUR).
 */
export function convertToEur(rateSet, currency, amount) {
  const normalizedCurrency = currencyCode(currency);
  const normalizedAmount = finiteNumber(amount);
  if (!rateSet || normalizedAmount === null || !normalizedCurrency) {
    return { amountEur: null, reviewReason: "missing-exchange-rate" };
  }
  if (normalizedCurrency === "EUR") {
    return { amountEur: normalizedAmount, rateUsed: 1, rateDate: rateSet.reportDate, reviewReason: null };
  }
  const entry = rateSet.rates?.[normalizedCurrency];
  const buyingRate = finiteNumber(entry?.buyingRate);
  if (buyingRate === null || buyingRate <= 0) {
    return { amountEur: null, reviewReason: "missing-exchange-rate" };
  }
  const eurTryBuyingRate = finiteNumber(rateSet.eurTryBuyingRate)
    ?? finiteNumber(rateSet.rates?.EUR?.tryBuyingRate);
  if (eurTryBuyingRate === null || eurTryBuyingRate <= 0) {
    return { amountEur: null, reviewReason: "missing-exchange-rate" };
  }
  return {
    amountEur: normalizedAmount * buyingRate / eurTryBuyingRate,
    rateUsed: buyingRate,
    rateDate: entry.rateDate ?? rateSet.reportDate,
    reviewReason: null,
  };
}

export const CURRENCY_BASKETS = Object.freeze(["EUR", "USD", "GBP", "TRY", "INCELEME"]);

/**
 * Bir ekonomik satırı döviz sepetine sınıflandırır. Spek kuralı: TRY net satış,
 * belge tarihindeki Halkbank satış kuru ile ürünün kart dövizine çevrilir; kur
 * veya maliyet kanıtı eksikse satır INCELEME sepetine düşer (fail-closed).
 * Onaylı manuel maliyet (`manualCostTry`) belge tarihi kuruyla ürün dövizine çevrilir.
 *
 * @param {Object} line
 * @param {string|null} line.productCurrency stok kartı döviz cinsi
 * @param {number|null} line.documentSellingRate belge tarihi satış kuru (TL/1 döviz)
 * @param {number} line.signedNetSales KDV hariç işaretli net satış (TL)
 * @param {Object|null} line.financeV2 V2 maliyet kanıtı
 * @param {number|null} [line.manualCostTry] onaylı manuel birim maliyet toplamı (TL, işaretli)
 */
export function classifyEurLine({
  productCurrency = null,
  documentSellingRate = null,
  signedNetSales = 0,
  financeV2 = null,
  manualCostTry = null,
} = {}) {
  const netSalesTry = finiteNumber(signedNetSales) ?? 0;
  const currency = currencyCode(productCurrency);
  const sellingRate = finiteNumber(documentSellingRate);
  const manualCost = finiteNumber(manualCostTry);
  if (manualCost !== null) {
    if (["EUR", "USD", "GBP"].includes(currency) && sellingRate !== null && sellingRate > 0) {
      return {
        basket: currency,
        currency,
        netSales: netSalesTry / sellingRate,
        cost: manualCost / sellingRate,
        covered: true,
        reason: null,
      };
    }
    return {
      basket: "TRY",
      currency: "TRY",
      netSales: netSalesTry,
      cost: manualCost,
      covered: true,
      reason: null,
    };
  }
  const covered = Boolean(financeV2)
    && financeV2.reviewReason == null
    && (financeV2.costStatus == null || financeV2.costStatus === "covered")
    && finiteNumber(financeV2.lineCostTryExVat) !== null;
  if (!covered) {
    return {
      basket: "INCELEME",
      currency: null,
      netSales: netSalesTry,
      cost: 0,
      covered: false,
      reason: financeV2?.reviewReason || "missing-cost-evidence",
    };
  }
  if (["EUR", "USD", "GBP"].includes(currency) && sellingRate !== null && sellingRate > 0) {
    const currencyCost = finiteNumber(financeV2.lineCostCurrencyExVat);
    return {
      basket: currency,
      currency,
      netSales: netSalesTry / sellingRate,
      cost: currencyCost ?? (finiteNumber(financeV2.lineCostTryExVat) / sellingRate),
      covered: true,
      reason: null,
    };
  }
  return {
    basket: "TRY",
    currency: "TRY",
    netSales: netSalesTry,
    cost: finiteNumber(financeV2.lineCostTryExVat) ?? 0,
    covered: true,
    reason: null,
  };
}

export function emptyCurrencyBasket() {
  return Object.fromEntries(CURRENCY_BASKETS.map((currency) => [
    currency,
    { netSales: 0, cost: 0, profit: 0, lineCount: 0 },
  ]));
}

export function addToCurrencyBasket(basket, currency, { netSales = 0, cost = 0, lineCount = 1 } = {}) {
  const key = CURRENCY_BASKETS.includes(currency) ? currency : "INCELEME";
  const target = basket[key];
  target.netSales += Number(netSales) || 0;
  target.cost += Number(cost) || 0;
  target.profit = target.netSales - target.cost;
  target.lineCount += Number(lineCount) || 0;
  return basket;
}

/**
 * Döviz sepetini kur setiyle EUR karşılığına süsler. INCELEME sepeti çevrilmez;
 * kapsam dışı tutar olarak raporlanır. Yuvarlama yalnız görüntü sınırında yapılır,
 * burada tam hassasiyet korunur.
 */
export function decorateBasketEur(basket, rateSet) {
  const source = basket && typeof basket === "object" ? basket : {};
  const eurEquivalent = { netSales: 0, cost: 0, profit: 0 };
  const convertedCurrencies = [];
  const missingCurrencies = [];
  for (const currency of CURRENCY_BASKETS) {
    const item = source[currency] || { netSales: 0, cost: 0, profit: 0, lineCount: 0 };
    if (currency === "INCELEME") {
      eurEquivalent.reviewNetSales = item.netSales;
      eurEquivalent.reviewLines = item.lineCount;
      continue;
    }
    if (!item.lineCount && !item.netSales && !item.cost) continue;
    const converted = convertToEur(rateSet, currency, item.netSales);
    if (converted.reviewReason) {
      missingCurrencies.push(currency);
      continue;
    }
    const costConverted = convertToEur(rateSet, currency, item.cost);
    eurEquivalent.netSales += converted.amountEur;
    eurEquivalent.cost += costConverted.reviewReason ? 0 : costConverted.amountEur;
    convertedCurrencies.push(currency);
  }
  eurEquivalent.profit = eurEquivalent.netSales - eurEquivalent.cost;
  return {
    byCurrency: source,
    eurEquivalent,
    convertedCurrencies,
    missingCurrencies,
    eurComplete: missingCurrencies.length === 0,
    rateSet: rateSet || null,
  };
}
