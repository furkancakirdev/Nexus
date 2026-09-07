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
    const buyingRate = finiteNumber(row?.buyingRate) ?? finiteNumber(row?.halkbankBuyingRate);
    const sellingRate = finiteNumber(row?.sellingRate) ?? finiteNumber(row?.halkbankSellingRate);
    if (buyingRate === null && sellingRate === null) continue;
    const source = text(row?.source) || "CPM";
    const entry = {
      date: day,
      buyingRate,
      sellingRate,
      sourceId: text(row?.exchangeSourceId) || null,
      source,
      sourceIdentifier: text(row?.sourceIdentifier) || text(row?.exchangeSourceId) || null,
      requestedDate: dateKey(row?.requestedDate) || day,
      selectionReason: text(row?.selectionReason) || (source === "TCMB" ? "cpm-rate-unavailable" : "cpm-primary"),
      sourceUrl: text(row?.sourceUrl) || null,
      evidenceHash: text(row?.evidenceHash) || null,
      retrievalMode: text(row?.retrievalMode) || null,
    };
    const days = byCurrency.get(currency) || new Map();
    const previous = days.get(day);
    if (!previous) {
      days.set(day, {
        ...entry,
        buyingSourceId: buyingRate === null ? null : entry.sourceId,
        buyingSource: buyingRate === null ? null : entry.source,
        buyingSourceIdentifier: buyingRate === null ? null : entry.sourceIdentifier,
        buyingSelectionReason: buyingRate === null ? null : entry.selectionReason,
        buyingSourceUrl: buyingRate === null ? null : entry.sourceUrl,
        buyingEvidenceHash: buyingRate === null ? null : entry.evidenceHash,
        buyingRetrievalMode: buyingRate === null ? null : entry.retrievalMode,
        sellingSourceId: sellingRate === null ? null : entry.sourceId,
        sellingSource: sellingRate === null ? null : entry.source,
        sellingSourceIdentifier: sellingRate === null ? null : entry.sourceIdentifier,
        sellingSelectionReason: sellingRate === null ? null : entry.selectionReason,
        sellingSourceUrl: sellingRate === null ? null : entry.sourceUrl,
        sellingEvidenceHash: sellingRate === null ? null : entry.evidenceHash,
        sellingRetrievalMode: sellingRate === null ? null : entry.retrievalMode,
      });
    } else {
      const merged = { ...previous };
      if (buyingRate !== null || sellingRate !== null) {
        merged.sourceId = entry.sourceId;
        merged.source = entry.source;
        merged.sourceIdentifier = entry.sourceIdentifier;
        merged.selectionReason = entry.selectionReason;
        merged.sourceUrl = entry.sourceUrl;
        merged.evidenceHash = entry.evidenceHash;
        merged.retrievalMode = entry.retrievalMode;
      }
      if (buyingRate !== null) {
        merged.buyingRate = buyingRate;
        merged.buyingSourceId = entry.sourceId;
        merged.buyingSource = entry.source;
        merged.buyingSourceIdentifier = entry.sourceIdentifier;
        merged.buyingSelectionReason = entry.selectionReason;
        merged.buyingSourceUrl = entry.sourceUrl;
        merged.buyingEvidenceHash = entry.evidenceHash;
        merged.buyingRetrievalMode = entry.retrievalMode;
      }
      if (sellingRate !== null) {
        merged.sellingRate = sellingRate;
        merged.sellingSourceId = entry.sourceId;
        merged.sellingSource = entry.source;
        merged.sellingSourceIdentifier = entry.sourceIdentifier;
        merged.sellingSelectionReason = entry.selectionReason;
        merged.sellingSourceUrl = entry.sourceUrl;
        merged.sellingEvidenceHash = entry.evidenceHash;
        merged.sellingRetrievalMode = entry.retrievalMode;
      }
      days.set(day, merged);
    }
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
      source: "PARITY",
      sourceIdentifier: "EUR-PARITY",
      selectionReason: "eur-parity",
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
    if (entry.date > requestedDay) break;
    if (finiteNumber(entry.buyingRate) !== null && finiteNumber(entry.buyingRate) > 0) candidate = entry;
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
    sourceId: candidate.buyingSourceId ?? candidate.sourceId,
    source: candidate.buyingSource ?? candidate.source,
    sourceIdentifier: candidate.buyingSourceIdentifier ?? candidate.sourceIdentifier,
    selectionReason: candidate.buyingSelectionReason ?? candidate.selectionReason,
    sourceUrl: candidate.buyingSourceUrl ?? candidate.sourceUrl,
    evidenceHash: candidate.buyingEvidenceHash ?? candidate.evidenceHash,
    retrievalMode: candidate.buyingRetrievalMode ?? candidate.retrievalMode,
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
      source: eurEntry?.source ?? "CPM",
      sourceIdentifier: eurEntry?.sourceIdentifier ?? eurEntry?.sourceId ?? "EUR-PARITY",
      selectionReason: eurEntry?.selectionReason ?? "eur-parity",
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
      source: "BASE",
      sourceIdentifier: "TRY-BASE",
      selectionReason: "try-base",
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
      source: found.source,
      sourceIdentifier: found.sourceIdentifier,
      selectionReason: found.selectionReason,
      sourceUrl: found.sourceUrl,
      evidenceHash: found.evidenceHash,
      retrievalMode: found.retrievalMode,
    };
  }
  const maxLag = Object.values(rates).reduce((max, rate) => Math.max(max, rate.lagDays || 0), 0);
  const sourceKinds = [...new Set(Object.values(rates).map((rate) => rate.source).filter(Boolean))].sort();
  return {
    reportDate: reportDay,
    bank: "HALKBANK",
    sourcePolicy: sourceKinds.includes("TCMB") ? "CPM_HALKBANK_THEN_TCMB_V1" : "CPM_HALKBANK_V1",
    sourceKinds,
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
    const entry = rateSet.rates?.EUR || {};
    return {
      amountEur: normalizedAmount,
      rateUsed: 1,
      rateDate: entry.rateDate ?? rateSet.reportDate,
      rateSource: entry.source ?? "PARITY",
      rateSourceIdentifier: entry.sourceIdentifier ?? "EUR-PARITY",
      reviewReason: null,
    };
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
    rateSource: entry.source ?? "CPM",
    rateSourceIdentifier: entry.sourceIdentifier ?? entry.sourceId ?? null,
    selectionReason: entry.selectionReason ?? null,
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

/**
 * Satış tutarının EUR raporuna çevrilebilirliğini maliyet kanıtından bağımsız
 * değerlendirir. Maliyet eksik olsa bile kaynak döviz + belge kuru + rapor
 * günü kur seti mevcutsa gelir EUR olarak gösterilebilir; maliyet/kâr yine
 * ayrı bir kanıt kapısından geçer.
 */
export function classifyEurRevenueLine({
  productCurrency = null,
  documentSellingRate = null,
  signedNetSales = 0,
} = {}) {
  const netSalesTry = finiteNumber(signedNetSales) ?? 0;
  const sellingRate = finiteNumber(documentSellingRate);
  // CPM satırında döviz cinsi boş olup FIYATDOVIZKUR=1 ise kaynak satır
  // kendi TRY-parite kanıtını taşır. Bu durum eksik döviz kanıtı değildir;
  // yabancı dövizli satırı sessizce TRY'ye çevirmemek için yalnızca bu açık
  // satır koşulunda TRY olarak yorumlanır.
  const currency = currencyCode(productCurrency) || (sellingRate === 1 ? "TRY" : null);
  if (!currency) {
    return { currency: null, netSales: null, covered: false, reason: "missing-product-currency" };
  }
  if (["EUR", "USD", "GBP"].includes(currency)) {
    if (sellingRate === null || sellingRate <= 0) {
      return { currency, netSales: null, covered: false, reason: "missing-document-selling-rate" };
    }
    return { currency, netSales: netSalesTry / sellingRate, covered: true, reason: null };
  }
  if (currency === "TRY") {
    return { currency, netSales: netSalesTry, covered: true, reason: null };
  }
  return { currency, netSales: null, covered: false, reason: "unsupported-product-currency" };
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
  const eurEquivalent = { netSales: 0, cost: 0, profit: 0, costComplete: true };
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
    if (costConverted.reviewReason) {
      eurEquivalent.costComplete = false;
      missingCurrencies.push(currency);
    } else {
      eurEquivalent.cost += costConverted.amountEur;
    }
    convertedCurrencies.push(currency);
  }
  eurEquivalent.profit = eurEquivalent.costComplete ? eurEquivalent.netSales - eurEquivalent.cost : null;
  return {
    byCurrency: source,
    eurEquivalent,
    convertedCurrencies,
    missingCurrencies,
    eurComplete: missingCurrencies.length === 0 && eurEquivalent.costComplete,
    costComplete: eurEquivalent.costComplete,
    rateSet: rateSet || null,
  };
}
