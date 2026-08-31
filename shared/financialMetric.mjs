import {
  addToCurrencyBasket,
  classifyEurLine,
  convertToEur,
  emptyCurrencyBasket,
} from "./eurReporting.mjs";

const FOREIGN_CURRENCIES = new Set(["EUR", "USD", "GBP"]);
const METRIC_FIELDS = ["netSales", "cost", "profit"];
export const FINANCIAL_ROWS = Symbol.for("nexus.financialRows");

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function periodKey(row, fallback) {
  return text(row?.period || row?.periodKey || row?.month) || fallback;
}

function emptyScope() {
  return { lines: 0, netSales: 0, cost: 0, profit: 0, margin: null };
}

function addScope(scope, netSales, cost = 0) {
  scope.lines += 1;
  scope.netSales += netSales;
  scope.cost += cost;
  scope.profit = scope.netSales - scope.cost;
  scope.margin = scope.netSales === 0 ? null : scope.profit / scope.netSales * 100;
}

function createPeriodMetric() {
  return {
    byCurrency: emptyCurrencyBasket(),
    eur: { netSales: 0, cost: 0, profit: 0, margin: null, complete: true },
    evidence: { coveredLines: 0, reviewLines: 0, excludedLines: 0, manualCostLines: 0 },
  };
}

function selectRateSet(rateSets, period, fallback, singlePeriod) {
  if (rateSets instanceof Map) return rateSets.get(period) || null;
  if (rateSets && typeof rateSets === "object") return rateSets[period] || null;
  return singlePeriod && period === singlePeriod.period ? fallback || null : null;
}

function isExcluded(row) {
  return row?.excluded === true || row?.scope === "excluded" || row?.status === "EXCLUDED";
}

function classifyLine(row) {
  const currency = text(row?.productCurrency).toUpperCase();
  const documentSellingRate = numberOrNull(row?.documentSellingRate);
  const manualCostTry = row?.manualCostApproved === true ? numberOrNull(row?.manualCostTry) : null;
  const manualCostWasRejected = numberOrNull(row?.manualCostTry) !== null && manualCostTry === null;
  if (manualCostWasRejected && !row?.financeV2) {
    return { basket: "INCELEME", currency: null, netSales: numberOrZero(row?.signedNetSalesTry), cost: 0, covered: false, reason: "manual-cost-not-approved" };
  }
  if (FOREIGN_CURRENCIES.has(currency) && (documentSellingRate === null || documentSellingRate <= 0)) {
    return { basket: "INCELEME", currency: null, netSales: numberOrZero(row?.signedNetSalesTry), cost: 0, covered: false, reason: "missing-document-selling-rate" };
  }
  return classifyEurLine({
    productCurrency: row?.productCurrency,
    documentSellingRate,
    signedNetSales: numberOrZero(row?.signedNetSalesTry),
    financeV2: row?.financeV2 || null,
    manualCostTry,
  });
}

function signedTryCost(row) {
  if (row?.manualCostApproved === true && numberOrNull(row?.manualCostTry) !== null) {
    return numberOrZero(row.manualCostTry);
  }
  return numberOrZero(row?.financeV2?.lineCostTryExVat);
}

function addEur(metric, line, rateSet) {
  const sales = convertToEur(rateSet, line.currency, line.netSales);
  const cost = convertToEur(rateSet, line.currency, line.cost);
  if (sales.reviewReason || cost.reviewReason) return false;
  metric.eur.netSales += sales.amountEur;
  metric.eur.cost += cost.amountEur;
  metric.eur.profit = metric.eur.netSales - metric.eur.cost;
  return true;
}

function finishMetric(metric) {
  metric.eur.profit = metric.eur.netSales - metric.eur.cost;
  metric.eur.margin = metric.eur.netSales === 0 ? null : metric.eur.profit / metric.eur.netSales * 100;
  metric.eurMargin = metric.eur.margin;
  metric.status = metric.evidence.reviewLines > 0 || metric.evidence.eurReviewLines > 0 ? "INCELEME" : "TAMAM";
  return metric;
}

/**
 * Aggregates signed KDV-exclusive ledger rows into the canonical financial contract.
 * @param {Object[]} rows
 * @param {{rateSets?: Object|Map, rateSet?: Object, period?: string, basisId?: string}} options
 */
export function aggregateFinancialMetric(rows = [], options = {}) {
  const metric = {
    status: "TAMAM",
    basisId: text(options.basisId) || null,
    scope: { included: emptyScope(), confirmed: emptyScope(), review: emptyScope(), costReview: emptyScope(), excluded: emptyScope() },
    try: { netSales: 0, cost: 0, profit: 0, margin: null },
    byCurrency: emptyCurrencyBasket(),
    byPeriod: {},
    eur: { netSales: 0, cost: 0, profit: 0, margin: null, complete: true },
    eurMargin: null,
    evidence: { coveredLines: 0, reviewLines: 0, eurReviewLines: 0, excludedLines: 0, manualCostLines: 0, periodCount: 0, currencyCount: 0 },
  };
  const inputRows = Array.isArray(rows) ? rows : [];
  const fallbackPeriod = text(options.period) || "TOTAL";
  const seenPeriods = new Set();
  const seenCurrencies = new Set();

  for (const row of inputRows) {
    const netSales = numberOrZero(row?.signedNetSalesTry);
    const period = periodKey(row, fallbackPeriod);
    seenPeriods.add(period);
    if (isExcluded(row)) {
      addScope(metric.scope.excluded, netSales);
      metric.evidence.excludedLines += 1;
      const periodMetric = metric.byPeriod[period] ||= createPeriodMetric();
      periodMetric.evidence.excludedLines += 1;
      continue;
    }

    const line = classifyLine(row);
    const periodMetric = metric.byPeriod[period] ||= createPeriodMetric();
    const rateSet = selectRateSet(options.rateSets, period, options.rateSet, options.rateSets == null && text(options.period) ? { period: text(options.period) } : null);
    const eurCovered = line.covered && addEur(periodMetric, line, rateSet);
    const review = !line.covered || !eurCovered;
    const knownTryCost = signedTryCost(row);
    const reviewLine = review && (!line.covered || !options.preserveCurrencyWhenRateMissing)
      ? { basket: "INCELEME", netSales, cost: knownTryCost, covered: false, reason: line.reason || "missing-exchange-rate" }
      : line;
    const cost = review ? knownTryCost : signedTryCost(row);
    addScope(metric.scope.included, netSales, cost);
    if (review) addScope(metric.scope.review, netSales, cost);
    if (!line.covered) addScope(metric.scope.costReview, netSales, cost);
    else addScope(metric.scope.confirmed, netSales, cost);
    metric.try.netSales += netSales;
    metric.try.cost += cost;
    metric.try.profit = metric.try.netSales - metric.try.cost;
    metric.try.margin = metric.try.netSales === 0 ? null : metric.try.profit / metric.try.netSales * 100;
    addToCurrencyBasket(metric.byCurrency, reviewLine.basket, { netSales, cost });
    addToCurrencyBasket(periodMetric.byCurrency, reviewLine.basket, { netSales, cost });
    if (review) {
      metric.evidence.eurReviewLines += 1;
      periodMetric.evidence.eurReviewLines += 1;
      if (!line.covered) {
        metric.evidence.reviewLines += 1;
        periodMetric.evidence.reviewLines += 1;
      }
    } else {
      metric.evidence.coveredLines += 1;
      periodMetric.evidence.coveredLines += 1;
      if (row?.manualCostApproved === true && numberOrNull(row?.manualCostTry) !== null) metric.evidence.manualCostLines += 1;
    }
    if (review) {
      periodMetric.eur.complete = false;
    }
    seenCurrencies.add(reviewLine.basket);
  }

  for (const periodMetric of Object.values(metric.byPeriod)) {
    periodMetric.eur.profit = periodMetric.eur.netSales - periodMetric.eur.cost;
    periodMetric.eur.margin = periodMetric.eur.netSales === 0 ? null : periodMetric.eur.profit / periodMetric.eur.netSales * 100;
  }
  metric.eur = Object.values(metric.byPeriod).reduce((total, current) => {
    total.netSales += current.eur.netSales;
    total.cost += current.eur.cost;
    total.complete = total.complete && current.eur.complete;
    return total;
  }, metric.eur);
  metric.evidence.periodCount = seenPeriods.size;
  metric.evidence.currencyCount = seenCurrencies.size;
  return finishMetric(metric);
}

/**
 * Compares the three signed metric fields without rounding deltas.
 * @param {Object} actual
 * @param {Object} expected
 * @param {{basisId?: string}} options
 */
export function reconcileFinancialMetrics(actual, expected, options = {}) {
  const deltas = Object.fromEntries(METRIC_FIELDS.map((field) => [field, numberOrNull(actual?.[field]) === null || numberOrNull(expected?.[field]) === null
    ? null
    : numberOrZero(actual[field]) - numberOrZero(expected[field])]));
  const status = Object.values(deltas).some((value) => value === null)
    ? "INCOMPLETE"
    : Object.values(deltas).some((value) => value !== 0) ? "MISMATCH" : "MATCH";
  return { status, basisId: text(options.basisId) || null, deltas };
}
