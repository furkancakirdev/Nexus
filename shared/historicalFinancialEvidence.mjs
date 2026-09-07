import { buildExchangeRateIndex, currencyCode, dateKey } from "./eurReporting.mjs";
import { createHistoricalRetailPriceSelector } from "./historicalPrice.mjs";
import { calculateProductMarginObservation, convertTryToProductCurrency } from "./financialCostModel.mjs";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function stockKey(movement) {
  return `${text(movement?.productCode)}\u001f${text(movement?.depotCode)}`;
}

function isVatExempt(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function sourcePriceRows(rows) {
  const canonicalCurrency = (value) => {
    const normalized = text(value).toUpperCase();
    return currencyCode(normalized === "TL" ? "TRY" : normalized);
  };
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    productCode: text(row?.productCode ?? row?.cardCode),
    cardCurrency: canonicalCurrency(row?.cardCurrency ?? row?.productCurrency),
    currency: canonicalCurrency(row?.priceCurrency ?? row?.currency),
    effectiveDate: dateKey(row?.effectiveDate ?? row?.date),
    priceExVat: number(row?.priceExVat ?? row?.price),
    priceVatExempt: isVatExempt(row?.priceVatExempt),
    ...(dateKey(row?.validUntil ?? row?.effectiveEnd) ? { validUntil: dateKey(row?.validUntil ?? row?.effectiveEnd) } : {}),
  })).filter((row) => row.productCode && row.cardCurrency && row.currency
    && row.cardCurrency === row.currency && row.effectiveDate
    && row.priceExVat !== null && row.priceExVat > 0 && row.priceVatExempt);
}

function productCurrencies(priceRows) {
  const byProduct = new Map();
  for (const row of priceRows) {
    const currencies = byProduct.get(row.productCode) || new Set();
    currencies.add(row.cardCurrency);
    byProduct.set(row.productCode, currencies);
  }
  return byProduct;
}

function sellingRateOnOrBefore(index, currency, date) {
  const target = currencyCode(currency);
  const day = dateKey(date);
  if (!target || !day) return null;
  if (target === "TRY") return { rate: 1, date: day, sourceId: "TRY-PARITY", lagDays: 0 };
  const entries = index.get(target) || [];
  let candidate = null;
  for (const entry of entries) {
    if (entry.date > day) break;
    if (Number.isFinite(entry.sellingRate) && entry.sellingRate > 0) candidate = entry;
  }
  if (!candidate || !Number.isFinite(candidate.sellingRate) || candidate.sellingRate <= 0) return null;
  return {
    rate: candidate.sellingRate,
    date: candidate.date,
    sourceId: candidate.sellingSourceId ?? candidate.sourceId,
    lagDays: Math.round((Date.parse(day) - Date.parse(candidate.date)) / 86_400_000),
  };
}

/**
 * Doğrulanmış fiyat/kur satırlarını WAC hareketlerine bağlayan saf kanıt katmanı.
 * Kaynak sözleşmesi açılmaz; eksik veya çelişkili kanıt yalnızca review döndürür.
 */
export function buildHistoricalFinancialEvidence({ movements = [], priceRows = [], exchangeRates = [] } = {}) {
  if (!Array.isArray(movements)) throw new TypeError("Finans hareketleri dizi olmalıdır.");
  const prices = sourcePriceRows(priceRows);
  const selectPrice = createHistoricalRetailPriceSelector(prices);
  const currencies = productCurrencies(prices);
  const rateIndex = buildExchangeRateIndex(Array.isArray(exchangeRates) ? exchangeRates : []);
  const enrichedMovements = movements.map((movement) => ({ ...movement }));
  const marginObservationsByStockKey = new Map();
  const observationByMovementId = new Map();
  const reviewReasons = {};
  const reviewCounts = { review: 0, covered: 0 };
  const costReviewReasons = {};
  const costReviewCounts = { review: 0, covered: 0 };
  const addReview = (reason) => {
    reviewCounts.review += 1;
    reviewReasons[reason] = (reviewReasons[reason] || 0) + 1;
  };
  const addCostReview = (reason) => {
    costReviewCounts.review += 1;
    costReviewReasons[reason] = (costReviewReasons[reason] || 0) + 1;
  };

  for (const movement of enrichedMovements) {
    const productCode = text(movement.productCode);
    const knownCurrencies = currencies.get(productCode) || new Set();
    if (knownCurrencies.size !== 1) {
      if (["opening", "purchase"].includes(movement.kind)) {
        const reason = knownCurrencies.size ? "ambiguous-product-currency" : "missing-historical-retail-price";
        addReview(reason);
        addCostReview(reason);
      }
      continue;
    }
    const productCurrency = [...knownCurrencies][0];
    movement.productCurrency = productCurrency;
    if (!["opening", "purchase"].includes(movement.kind)) continue;

    const rate = sellingRateOnOrBefore(rateIndex, productCurrency, movement.date);
    if (!rate) {
      addReview("missing-exchange-rate");
      addCostReview("missing-exchange-rate");
      continue;
    }
    const unitCostTryExVat = number(movement.unitCostTryExVat);
    if (unitCostTryExVat === null || unitCostTryExVat <= 0) {
      addReview("missing-source-cost-conversion");
      addCostReview("missing-source-cost-conversion");
      continue;
    }
    const costConversion = convertTryToProductCurrency({
      amountTry: unitCostTryExVat,
      productCurrency,
      halkbankSellingRate: rate.rate,
      exchangeDate: rate.date,
      exchangeSourceId: rate.sourceId,
    });
    if (costConversion.reviewReason) {
      addReview(costConversion.reviewReason);
      addCostReview(costConversion.reviewReason);
      continue;
    }
    movement.unitCostCurrencyExVat = costConversion.amountCurrency;
    movement.costExchangeEvidence = costConversion.exchangeEvidence;
    costReviewCounts.covered += 1;

    const price = selectPrice({
      productCode,
      productCurrency,
      asOfDate: movement.date,
      priceRows: prices,
    });
    if (price.reviewReason) {
      addReview(price.reviewReason);
      continue;
    }
    const observation = calculateProductMarginObservation({
      productCode,
      productCurrency,
      purchaseDate: movement.date,
      purchaseQuantity: movement.quantity,
      purchaseNetAmountTryExVat: unitCostTryExVat * Number(movement.quantity),
      retailUnitPriceCurrencyExVat: price.priceExVat,
      halkbankSellingRate: rate.rate,
      exchangeDate: rate.date,
      exchangeSourceId: rate.sourceId,
    });
    if (observation.reviewReason) {
      addReview(observation.reviewReason);
      continue;
    }
    movement.historicalPriceEvidence = {
      effectiveDate: price.effectiveDate,
      lagDays: price.lagDays,
      priceExVat: price.priceExVat,
      priceCurrency: price.currency,
    };
    const key = stockKey(movement);
    marginObservationsByStockKey.set(key, [
      ...(marginObservationsByStockKey.get(key) || []),
      observation,
    ]);
    observationByMovementId.set(String(movement.id), observation);
    reviewCounts.covered += 1;
  }

  return {
    movements: enrichedMovements,
    marginObservationsByStockKey,
    observationByMovementId,
    reviewCounts,
    reviewReasons,
    costReviewCounts,
    costReviewReasons,
    priceRowCount: prices.length,
    exchangeRateCount: Array.isArray(exchangeRates) ? exchangeRates.length : 0,
  };
}
