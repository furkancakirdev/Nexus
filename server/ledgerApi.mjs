import express from "express";
import { buildDepartmentAnalysis } from "./departmentAnalysis.mjs";
import {
  buildDepartmentTargets,
  summarizeDepartmentTargets,
} from "../shared/targetPolicy.mjs";
import {
  buildExchangeRateIndex,
  buildRateSet,
} from "../shared/eurReporting.mjs";
import { buildInventoryResearchPayload } from "./inventoryResearchApi.mjs";
import { buildInventoryOpeningResearchPayload } from "./inventoryOpeningResearch.mjs";
import { aggregateFinancialMetric, FINANCIAL_ROWS } from "../shared/financialMetric.mjs";
import { normalizeExchangeRateSet } from "./exchangeRateSet.mjs";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const AUDIT_METHODS = new Set([
  "bulkPurchase", "priorPurchase", "nextPurchase", "originalSaleCost",
  "configuredLabor", "configuredSrf", "configuredTsr", "configuredRoad",
  "missingPurchase", "excludedIncome",
]);
const AUDIT_VERIFICATIONS = new Set(["verified", "configured", "review", "excluded"]);
const AUDIT_SOURCES = new Set(["invoice", "provisional", "return"]);
const EXCLUDED_INCOME_CODES = new Set(["KOMISYON", "GD-0187", "GD-0079", "PDI"]);
const overviewRowsCache = new WeakMap();
const auditRowsCache = new WeakMap();
const departmentAnalysisCache = new WeakMap();
const departmentDetailRowsCache = new WeakMap();
const AUDIT_SORT_TIME = Symbol("auditSortTime");

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalEurEquivalent(metric) {
  const revenue = metric?.eurRevenue;
  const revenueComplete = revenue ? revenue.complete === true : metric?.eur?.complete === true;
  const costComplete = metric?.eur?.complete === true && metric?.status === "TAMAM";
  return {
    ...(metric?.eur || {}),
    netSales: revenueComplete ? revenue?.netSales ?? metric?.eur?.netSales ?? null : null,
    cost: costComplete ? metric?.eur?.cost ?? null : null,
    profit: costComplete ? metric?.eur?.profit ?? null : null,
    margin: costComplete ? metric?.eur?.margin ?? null : null,
    revenueComplete,
    costComplete,
    reviewNetSales: revenue?.reviewNetSales ?? null,
    reviewLines: revenue?.reviewLines ?? 0,
    grossSales: metric?.eurBreakdown?.complete ? metric.eurBreakdown.grossSales : null,
    returns: metric?.eurBreakdown?.complete ? metric.eurBreakdown.returns : null,
    discounts: metric?.eurBreakdown?.complete ? metric.eurBreakdown.discounts : null,
    breakdownComplete: metric?.eurBreakdown?.present ? metric.eurBreakdown.complete === true : false,
  };
}

function minorUnits(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return 0n;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^-?(?:\d+|\d+\.\d+)$/.test(normalized)) return 0n;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  let units = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (fraction[2] && Number(fraction[2]) >= 5) units += 1n;
  return negative ? -units : units;
}

function sumMinorUnits(rows, selector) {
  return rows.reduce((total, row) => total + minorUnits(selector(row)), 0n);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function monthOf(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12 ? month : 0;
  }
  const parsed = new Date(value);
  const month = parsed.getUTCMonth() + 1;
  return Number.isFinite(parsed.getTime()) && month >= 1 && month <= 12 ? month : 0;
}

function normalizedCode(value) {
  const trimmed = String(value || "").trim();
  if (/^[\x00-\x7F]*$/.test(trimmed)) return trimmed.toUpperCase();
  return trimmed.toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pilotCardKey(productCode) {
  const code = normalizedCode(productCode);
  if (code === "ISCILIK") return "labor";
  if (code === "SRF" || code === "BARNACLE") return "srf";
  if (code === "TSR") return "tsr";
  if (code === "YOL") return "road";
  return null;
}

function isExcludedIncome(productCode) {
  return EXCLUDED_INCOME_CODES.has(normalizedCode(productCode));
}

function configuredCostMethod(productCode) {
  if (isExcludedIncome(productCode)) return "excludedIncome";
  const methods = {
    labor: "configuredLabor",
    srf: "configuredSrf",
    tsr: "configuredTsr",
    road: "configuredRoad",
  };
  return methods[pilotCardKey(productCode)] || null;
}

function emptyPilotCards() {
  return {
    labor: { sales: 0, returns: 0, discounts: 0 },
    srf: { sales: 0, returns: 0, discounts: 0 },
    tsr: { sales: 0, returns: 0, discounts: 0 },
    road: { sales: 0, returns: 0, discounts: 0 },
  };
}

function emptyOverviewMonth(month) {
  return {
    month,
    monthName: MONTH_NAMES[month - 1],
    sales: 0,
    returns: 0,
    discounts: 0,
    estimatedCost: 0,
    cost: 0,
    coveredNetSales: 0,
    reviewNetSales: 0,
    profit: 0,
    margin: 0,
    averageProductListGrossMarginPct: null,
    v2CostCoveredLines: 0,
    v2ReviewLines: 0,
    v2CostCoveragePct: 0,
    _v2MarginObservations: new Map(),
    lineCount: 0,
    costCoveredLines: 0,
    costCoveragePct: 0,
    masterCostLines: 0,
    bulkPurchaseCostLines: 0,
    lastPurchaseCostLines: 0,
    nextPurchaseCostLines: 0,
    uncoveredCostLines: 0,
    uncoveredNetSales: 0,
    pilotCardLines: 0,
    pilotCards: emptyPilotCards(),
    invoiceLineCount: 0,
    provisionalLineCount: 0,
    invoiceNetSales: 0,
    provisionalNetSales: 0,
    linkedReturnLines: 0,
    unlinkedReturnLines: 0,
    legacyEstimatedCost: 0,
    legacyCostLines: 0,
    costMethod: "final-invoice-ledger",
    source: "live",
    byCurrency: null,
    [FINANCIAL_ROWS]: [],
  };
}

export function buildOverviewRows(ledger) {
  if (ledger && typeof ledger === "object" && overviewRowsCache.has(ledger)) {
    return overviewRowsCache.get(ledger);
  }
  const months = new Map();
  for (const row of ledger?.rows || []) {
    if (isExcludedIncome(row.productCode)) continue;
    const month = monthOf(row.documentDate);
    if (!month) continue;
    const target = months.get(month) || emptyOverviewMonth(month);
    target[FINANCIAL_ROWS].push({
      signedNetSalesTry: row.signedNetSales,
      grossSalesTry: row.isSale ? row.grossAmount : 0,
      returnsTry: row.isSale ? 0 : row.netAmount,
      discountsTry: row.isSale ? row.discountAmount : 0,
      period: String(month),
      productCurrency: row.financeV2?.productCurrency ?? row.productCurrency,
      documentSellingRate: row.documentSellingRate,
      financeV2: row.financeV2,
    });
    const cardKey = pilotCardKey(row.productCode);
    const isSale = Boolean(row.isSale);

    target.invoiceLineCount += 1;
    target.invoiceNetSales += number(row.signedNetSales);
    if (!isSale) {
      if (row.originalDocumentNo) target.linkedReturnLines += 1;
      else target.unlinkedReturnLines += 1;
    }

    const financeV2 = row.financeV2;
    const v2LineCost = financeV2?.lineCostTryExVat;
    const v2Covered = financeV2?.reviewReason == null
      && (financeV2?.costStatus == null || financeV2?.costStatus === "covered")
      && typeof v2LineCost === "number"
      && Number.isFinite(v2LineCost);
    if (v2Covered) {
      target.cost += v2LineCost;
      target.coveredNetSales += number(row.signedNetSales);
      target.v2CostCoveredLines += 1;
      if (financeV2.observationKey
        && typeof financeV2.productListGrossMarginPct === "number"
        && Number.isFinite(financeV2.productListGrossMarginPct)) {
        target._v2MarginObservations.set(
          financeV2.observationKey,
          financeV2.productListGrossMarginPct,
        );
      }
    } else {
      target.reviewNetSales += number(row.signedNetSales);
      target.v2ReviewLines += 1;
    }

    if (cardKey) {
      target.pilotCardLines += 1;
      target.pilotCards[cardKey][isSale ? "sales" : "returns"] += isSale
        ? number(row.grossAmount)
        : number(row.netAmount);
      if (isSale) target.pilotCards[cardKey].discounts += number(row.discountAmount);
      months.set(month, target);
      continue;
    }

    if (isSale) {
      target.sales += number(row.grossAmount);
      target.discounts += number(row.discountAmount);
    } else {
      target.returns += number(row.netAmount);
    }
    target.lineCount += 1;

    const officialWacRow = financeV2?.schemaVersion === 2
      && financeV2?.costMethod === "movingWeightedAverage";
    if (officialWacRow) {
      // WAC resmi yolunda legacy lineCost yalnız denetim karşılaştırmasıdır.
      if (v2Covered) target.costCoveredLines += 1;
      else target.uncoveredCostLines += 1;
    } else if (row.lineCost === null || row.lineCost === undefined) {
      target.uncoveredCostLines += 1;
      target.uncoveredNetSales += number(row.signedNetSales);
    } else {
      // Eski alım seçimi yalnızca karşılaştırma kanıtıdır; resmi maliyet,
      // kâr veya havuz tüketicilerine aktarılmaz.
      target.legacyCostLines += 1;
      target.legacyEstimatedCost += number(row.lineCost);
    }
    months.set(month, target);
  }

  const rows = [...months.values()]
    .sort((left, right) => left.month - right.month)
    .map((row) => {
      const canonicalMetric = aggregateFinancialMetric(row[FINANCIAL_ROWS], { period: String(row.month), basisId: `overview:${row.month}`, preserveCurrencyWhenRateMissing: true });
      const marginObservations = [...row._v2MarginObservations.values()];
      const { _v2MarginObservations, [FINANCIAL_ROWS]: financialRows, ...publicRow } = row;
      const confirmed = canonicalMetric.scope.confirmed;
      return {
      ...publicRow,
      [FINANCIAL_ROWS]: financialRows,
      netSales: canonicalMetric.try.netSales,
      cost: confirmed.cost,
      coveredNetSales: confirmed.netSales,
      reviewNetSales: canonicalMetric.scope.costReview.netSales,
      byCurrency: canonicalMetric.byCurrency,
      canonicalMetric,
      profit: confirmed.profit,
      margin: confirmed.margin,
      averageProductListGrossMarginPct: marginObservations.length
        ? marginObservations.reduce((sum, value) => sum + value, 0) / marginObservations.length
        : null,
      v2CostCoveragePct: row.v2CostCoveredLines + row.v2ReviewLines
        ? Number((100 * row.v2CostCoveredLines
          / (row.v2CostCoveredLines + row.v2ReviewLines)).toFixed(1))
        : 0,
      costCoveragePct: canonicalMetric.evidence.coveredLines + canonicalMetric.evidence.reviewLines
        ? Number((100 * canonicalMetric.evidence.coveredLines / (canonicalMetric.evidence.coveredLines + canonicalMetric.evidence.reviewLines)).toFixed(1))
        : 0,
      };
    });
  if (ledger && typeof ledger === "object") overviewRowsCache.set(ledger, rows);
  return rows;
}

function overviewNetSales(rows) {
  return rows.reduce((total, row) => {
    const pilotNet = Object.values(row.pilotCards || {}).reduce((sum, card) => (
      sum + number(card.sales) - number(card.returns) - number(card.discounts)
    ), 0);
    return total + number(row.sales) - number(row.returns) - number(row.discounts) + pilotNet;
  }, 0);
}

/**
 * CPM canonical fatura satırları ile Nexus özet görünümünü karşılaştırır.
 * Kaynak tutarlar KDV hariç net ve KDV dahil fatura toplamı olarak ayrı tutulur;
 * inceleme/kapsam dışı satırlar sessizce toplamdan düşürülmez, ayrıca raporlanır.
 */
export function buildInvoiceReconciliation(ledger, overviewRows = buildOverviewRows(ledger)) {
  const sourceRows = Array.isArray(ledger?.rows) ? ledger.rows : [];
  const excludedIncomeRows = sourceRows.filter((row) => isExcludedIncome(row.productCode));
  const includedRows = sourceRows.filter((row) => !isExcludedIncome(row.productCode));
  const sumSource = (rows) => rows.reduce((total, row) => ({
    grossSales: total.grossSales + (row.isSale ? number(row.grossAmount) : 0),
    returns: total.returns + (row.isSale ? 0 : number(row.netAmount)),
    discounts: total.discounts + (row.isSale ? number(row.discountAmount) : 0),
    netSales: total.netSales + number(row.signedNetSales),
    vatAmount: total.vatAmount + number(row.signedVatAmount),
    invoiceTotalInclVat: total.invoiceTotalInclVat + number(row.signedInvoiceTotalInclVat),
    rows: total.rows + 1,
  }), {
    grossSales: 0, returns: 0, discounts: 0, netSales: 0, vatAmount: 0,
    invoiceTotalInclVat: 0, rows: 0,
  });
  const source = sumSource(includedRows);
  const excludedIncome = sumSource(excludedIncomeRows);
  const nexus = (overviewRows || []).reduce((total, row) => {
    const pilotEntries = Object.values(row.pilotCards || {});
    const pilotSales = pilotEntries.reduce((sum, card) => sum + number(card.sales), 0);
    const pilotReturns = pilotEntries.reduce((sum, card) => sum + number(card.returns), 0);
    const pilotDiscounts = pilotEntries.reduce((sum, card) => sum + number(card.discounts), 0);
    return {
    grossSales: total.grossSales + number(row.sales) + pilotSales,
    returns: total.returns + number(row.returns) + pilotReturns,
    discounts: total.discounts + number(row.discounts) + pilotDiscounts,
    netSales: total.netSales + number(row.sales) + pilotSales - number(row.returns) - pilotReturns - number(row.discounts) - pilotDiscounts,
    rows: total.rows + number(row.invoiceLineCount || row.lineCount),
    };
  }, { grossSales: 0, returns: 0, discounts: 0, netSales: 0, rows: 0 });
  const differences = {
    grossSales: source.grossSales - nexus.grossSales,
    returns: source.returns - nexus.returns,
    discounts: source.discounts - nexus.discounts,
    netSales: source.netSales - nexus.netSales,
  };
  const sourceMinor = {
    grossSales: sumMinorUnits(includedRows, (row) => row.isSale ? row.grossAmount : 0),
    returns: sumMinorUnits(includedRows, (row) => row.isSale ? 0 : row.netAmount),
    discounts: sumMinorUnits(includedRows, (row) => row.isSale ? row.discountAmount : 0),
    netSales: sumMinorUnits(includedRows, (row) => row.signedNetSales),
  };
  const nexusMinor = {
    grossSales: sumMinorUnits(overviewRows || [], (row) => number(row.sales) + Object.values(row.pilotCards || {}).reduce((sum, card) => sum + number(card.sales), 0)),
    returns: sumMinorUnits(overviewRows || [], (row) => number(row.returns) + Object.values(row.pilotCards || {}).reduce((sum, card) => sum + number(card.returns), 0)),
    discounts: sumMinorUnits(overviewRows || [], (row) => number(row.discounts) + Object.values(row.pilotCards || {}).reduce((sum, card) => sum + number(card.discounts), 0)),
    netSales: (overviewRows || []).reduce((total, row) => {
      const pilotNet = Object.values(row.pilotCards || {}).reduce((sum, card) => (
        sum + minorUnits(card.sales) - minorUnits(card.returns) - minorUnits(card.discounts)
      ), 0n);
      if (row.netSales !== undefined) return total + minorUnits(row.netSales);
      return total + minorUnits(row.sales) - minorUnits(row.returns) - minorUnits(row.discounts) + pilotNet;
    }, 0n),
  };
  const exactMinorUnitDifferences = Object.fromEntries(
    Object.keys(sourceMinor).map((key) => [key, Number(sourceMinor[key] - nexusMinor[key])]),
  );
  const breakdown = (overviewRows || []).map((row) => ({
    month: row.month,
    monthName: row.monthName,
    sourceNetSales: sourceRows
      .filter((item) => monthOf(item.documentDate) === row.month)
      .reduce((sum, item) => sum + number(item.signedNetSales), 0),
    nexusNetSales: number(row.sales) - number(row.returns) - number(row.discounts)
      + Object.values(row.pilotCards || {}).reduce((sum, card) => sum + number(card.sales) - number(card.returns) - number(card.discounts), 0),
  })).map((row) => ({ ...row, difference: row.sourceNetSales - row.nexusNetSales }));
  const maxDifference = Math.max(...Object.values(differences).map((value) => Math.abs(value)), 0);
  return {
    tolerance: 0.01,
    status: maxDifference <= 0.01 ? "matched" : "review-required",
    source,
    rawSource: sumSource(sourceRows),
    excludedIncome,
    nexus,
    differences,
    exactMinorUnitDifferences,
    breakdown,
    excludedIncomeCodes: [...EXCLUDED_INCOME_CODES],
    note: "KDV hariç net ciro ve KDV dahil fatura toplamı ayrı tutulur; kapsam dışı ve inceleme satırları ayrıca izlenir.",
  };
}

/**
 * Kaynak satırı izlenebilirliğini raporlar; canonical ledger satırını bağımsız
 * CPM recordset'i gibi sunmaz. Ham CPM export'u ayrıca verilmediği sürece
 * sonuç bilinçli olarak "unverified" kalır.
 */
export function buildSourceRowProvenanceDiagnostic(ledger) {
  const sourceRows = Array.isArray(ledger?.rows) ? ledger.rows : [];
  const sourceIds = sourceRows.map((row) => row?.rootId ?? null);
  const counts = new Map();
  for (const sourceId of sourceIds) {
    if (sourceId === null || sourceId === undefined || String(sourceId).trim() === "") continue;
    const key = String(sourceId);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicateIds = new Set([...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sourceId]) => sourceId));
  const nullSourceRowIds = sourceIds.filter((sourceId) => (
    sourceId === null || sourceId === undefined || String(sourceId).trim() === ""
  )).length;
  const duplicateSourceRowIds = duplicateIds.size;
  const quarantinedIds = new Set((ledger?.quarantinedRows || [])
    .map((row) => row?.rootId)
    .filter((sourceId) => sourceId !== null && sourceId !== undefined)
    .map(String));
  const excludedTestIds = new Set((ledger?.excludedTestRows || [])
    .map((row) => row?.rootId)
    .filter((sourceId) => sourceId !== null && sourceId !== undefined)
    .map(String));
  const dispositionOf = (row) => {
    const sourceId = row?.rootId === null || row?.rootId === undefined ? null : String(row.rootId);
    if (sourceId && quarantinedIds.has(sourceId)) return { disposition: "quarantined", reason: "ledger-quarantine" };
    if (sourceId && excludedTestIds.has(sourceId)) return { disposition: "excluded-test", reason: "test-document" };
    if (row?.convertedToFinal || row?.convertedRetail || row?.isConvertedRetail) {
      return { disposition: "converted", reason: "converted-to-final" };
    }
    if (isExcludedIncome(row?.productCode)) return { disposition: "excluded-income", reason: "excluded-income-code" };
    return { disposition: "included", reason: null };
  };
  const scopeClassificationOf = ({ disposition }) => ({
    included: "commercial-revenue",
    converted: "converted-economic-case",
    "excluded-income": "non-commercial-income",
    "excluded-test": "test-document",
    quarantined: "quarantined-evidence",
  }[disposition] || "review-required");
  const rows = sourceRows.map((row) => {
    const sourceRowId = row?.rootId ?? null;
    const disposition = dispositionOf(row);
    const netAmount = number(row?.netAmount);
    const signedNetAmount = row?.isSale ? netAmount : -netAmount;
    return {
      sourceTable: "STKHAR",
      sourceKeyField: "ID",
      sourceRowId,
      canonicalRowId: sourceRowId,
      documentType: row?.documentType ?? null,
      documentNo: row?.documentNo ?? null,
      documentDate: row?.documentDate ?? null,
      lineNo: row?.lineNo ?? null,
      productCode: row?.productCode ?? null,
      quantity: row?.quantity ?? null,
      grossAmount: row?.grossAmount ?? null,
      discountAmount: row?.discountAmount ?? null,
      netAmount,
      vatAmount: row?.vatAmount ?? null,
      invoiceTotalInclVat: row?.invoiceTotalInclVat ?? null,
      isSale: row?.isSale ?? null,
      signedNetAmount,
      ...disposition,
      scopeClassification: scopeClassificationOf(disposition),
      matchStatus: "not-independently-verified",
    };
  });
  return {
    status: nullSourceRowIds || duplicateSourceRowIds ? "unavailable" : "unverified",
    evidenceMode: "canonical-ledger-only",
    independentSourceRowsAvailable: false,
    sourceTable: "STKHAR",
    sourceKeyField: "ID",
    summary: {
      rows: sourceRows.length,
      nullSourceRowIds,
      duplicateSourceRowIds,
      includedRows: rows.filter((row) => row.disposition === "included").length,
      excludedIncomeRows: rows.filter((row) => row.disposition === "excluded-income").length,
      unmatchedRows: rows.length,
    },
    rows,
    note: "Bağımsız CPM SELECT/export satırları verilmediği için bu çıktı canonical ledger provenance'ıdır; ham CPM satır eşleşmesi doğrulanmamıştır.",
  };
}

/**
 * Ayın son takvim gününün tarih anahtarını üretir.
 */
export function lastDayOfMonthKey(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0));
  return `${year}-${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}-${String(lastDay.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Bir ay için kullanılacak EUR kur setini çözer. Onaylı dönemlerde dondurulmuş
 * kur seti (yoksa dönemin son günü kuru) kullanılır; açık dönemler rapor günü
 * kuruyla dinamik değerlendirilir. Hafta sonu/tatil günlerinde kur indeksi
 * çözümleyicisi en son önceki iş gününe düşer.
 */
export function resolveMonthRateSet({ index, year, month, approval = null, reportDate }) {
  const locked = Boolean(approval) && approval.locked !== false;
  const hasStoredRateSet = locked && Object.hasOwn(approval || {}, "exchangeRateSet");
  if (hasStoredRateSet && approval.exchangeRateSet && typeof approval.exchangeRateSet === "object") {
    try {
      const normalized = normalizeExchangeRateSet(approval.exchangeRateSet, {
        expectedReportDate: lastDayOfMonthKey(year, month),
      });
      return {
        rateSet: approval.snapshotSchemaVersion === 2
          ? normalized
          : approval.exchangeRateSet,
        frozen: true,
      };
    } catch {
      return { rateSet: null, frozen: true };
    }
  }
  if (locked && (approval.snapshotSchemaVersion === 2 || hasStoredRateSet)) {
    return { rateSet: null, frozen: true };
  }
  if (locked) {
    const rateSet = buildRateSet(index, lastDayOfMonthKey(year, month));
    if (rateSet) return { rateSet, frozen: true };
  }
  return { rateSet: buildRateSet(index, reportDate), frozen: false };
}

/**
 * Overview satırlarını kur setleriyle EUR karşılığına süsler. Her ay kendi
 * kur setiyle değerlendirilir; onaylı aylar dondurulmuş kurla değişmez.
 */
export function decorateOverviewRowsEur(rows, { index, year, approvals = {}, reportDate }) {
  const yearApprovals = approvals && typeof approvals === "object" ? approvals : {};
  const eurRateSets = {};
  const decorated = (rows || []).map((row) => {
    const approval = yearApprovals[String(row.month)] || null;
    const { rateSet, frozen } = resolveMonthRateSet({
      index, year, month: row.month, approval, reportDate,
    });
    const canonicalMetric = aggregateFinancialMetric(row[FINANCIAL_ROWS] || [], {
      period: String(row.month), rateSet, basisId: `overview:${row.month}`,
    });
    eurRateSets[row.month] = {
      reportDate: rateSet?.reportDate ?? null,
      frozen,
      eurTryBuyingRate: rateSet?.eurTryBuyingRate ?? null,
      weekendOrHolidayNote: rateSet?.weekendOrHolidayNote ?? null,
      sourcePolicy: rateSet?.sourcePolicy ?? null,
      sourceKinds: Array.isArray(rateSet?.sourceKinds) ? rateSet.sourceKinds : [],
      rateSources: Object.fromEntries(Object.entries(rateSet?.rates || {}).map(([currency, entry]) => [currency, {
        source: entry?.source ?? null,
        sourceIdentifier: entry?.sourceIdentifier ?? entry?.sourceId ?? null,
        rateDate: entry?.rateDate ?? null,
        evidenceHash: entry?.evidenceHash ?? null,
        retrievalMode: entry?.retrievalMode ?? null,
      }])),
    };
    return {
      ...row,
      canonicalMetric,
      eurEquivalent: canonicalEurEquivalent(canonicalMetric),
      eurMargin: canonicalMetric.eurMargin,
      eurComplete: canonicalMetric.eur.complete && canonicalMetric.status === "TAMAM",
      eurRevenueComplete: canonicalMetric.eurRevenue?.complete === true,
      eurMissingCurrencies: canonicalMetric.eur.complete ? [] : ["INCELEME"],
      eurFrozen: frozen,
    };
  });
  return { rows: decorated, eurRateSets };
}

export function aggregateDepartmentMetric(metric, rateSets) {
  return aggregateFinancialMetric(metric?.[FINANCIAL_ROWS] || [], {
    rateSets,
    basisId: `department:${metric?.id || "total"}`,
  });
}

function verificationStatus(row) {
  if (row.costMethod === "excludedIncome") return "excluded";
  if (String(row.costMethod || "").startsWith("configured")) return "configured";
  // V2 satırı review ise legacy alım belgesi varlığı bunu doğrulanmış yapamaz.
  if (Number(row.financeV2?.schemaVersion) >= 2) {
    return row.financeV2?.costStatus === "covered" ? "verified" : "review";
  }
  if (["review", "quarantined"].includes(row.costReviewStatus)) return "review";
  if (row.lineCost !== null && row.lineCost !== undefined && row.purchaseNo) return "verified";
  return "review";
}

function costEvidenceClass(row) {
  if (["bulkPurchase", "priorPurchase", "nextPurchase", "originalSaleCost"].includes(
    row.costMethod,
  )) return "genuinePurchase";
  if (String(row.costMethod || "").startsWith("configured")) return "configuredRate";
  if (row.costMethod === "excludedIncome") return "excluded";
  return "missing";
}

function isConvertedRetail(row) {
  return Number(row?.documentType) === 91 && Boolean(
    row?.convertedRetail
    || row?.convertedToFinal
    || row?.retailConverted
    || row?.isConvertedRetail,
  );
}

function auditRow(row) {
  const netAmount = number(row.netAmount);
  const grossAmount = number(row.grossAmount);
  const purchaseNetAmount = row.purchaseNetAmount === null
    || row.purchaseNetAmount === undefined
    ? null
    : number(row.purchaseNetAmount);
  const returnRisk = Boolean(
    row.returnRisk
    || row.rejectedReturnNo
    || (Array.isArray(row.excludedReturnDocuments) && row.excludedReturnDocuments.length),
  );
  const effectiveCostMethod = configuredCostMethod(row.productCode) || row.costMethod;
  const effectiveRow = { ...row, costMethod: effectiveCostMethod };
  const verification = verificationStatus(effectiveRow);
  const signedNetAmount = (row.isSale ? 1 : -1) * netAmount;
  const canonicalMetric = aggregateFinancialMetric([{
      signedNetSalesTry: signedNetAmount,
      grossSalesTry: row.isSale ? row.grossAmount : 0,
      returnsTry: row.isSale ? 0 : row.netAmount,
      discountsTry: row.isSale ? row.discountAmount : 0,
      period: String(monthOf(row.documentDate)),
    productCurrency: row.financeV2?.productCurrency ?? row.productCurrency,
    documentSellingRate: row.documentSellingRate,
    financeV2: row.financeV2,
  }], { basisId: `audit:${row.rootId}` });
  return {
    ...row,
    [AUDIT_SORT_TIME]: Date.parse(row.documentDate) || 0,
    id: row.rootId,
    revenueSource: !row.isSale
      ? "return"
      : Number(row.documentType) === 17
        ? "provisional"
        : "invoice",
    provisionalEconomic: row.revenueSource === "provisional" || row.provisional === true,
    customerCode: row.customerCode || "",
    cardCode: row.productCode || "",
    cardName: row.productName || row.productCode || "",
    brand: row.brandName || "",
    grossAmount,
    discountAmount: number(row.discountAmount),
    discountPct: grossAmount ? 100 * number(row.discountAmount) / grossAmount : 0,
    netAmount,
    signedNetAmount,
    canonicalMetric,
    vatAmount: number(row.vatAmount),
    vatRate: netAmount ? 100 * number(row.vatAmount) / netAmount : 0,
    invoiceTotalInclVat: number(row.invoiceTotalInclVat),
    originalSaleType: row.originalDocumentType ?? null,
    originalSaleNo: row.originalDocumentNo ?? null,
    originalSaleDate: row.originalSaleDate ?? null,
    costMethod: effectiveCostMethod,
    verificationStatus: verification,
    attributionStatus: ["confirmed", "inferred", "review"].includes(row.attributionConfidence)
      ? row.attributionConfidence
      : "review",
    purchaseDocumentFound: Boolean(row.purchaseNo),
    costValidated: verification === "verified",
    returnRisk,
    costEvidenceClass: costEvidenceClass(effectiveRow),
    calculatedCost: effectiveCostMethod === "excludedIncome" || canonicalMetric.scope.costReview.lines > 0
      ? null
      : canonicalMetric.try.cost,
    grossProfit: effectiveCostMethod === "excludedIncome" || canonicalMetric.scope.costReview.lines > 0
      ? null
      : canonicalMetric.try.profit,
    purchaseVatRate: purchaseNetAmount
      ? 100 * number(row.purchaseVatAmount) / purchaseNetAmount
      : null,
    purchaseDiscountRate1: row.purchaseDiscountRate1 ?? null,
    purchaseDiscountRate2: row.purchaseDiscountRate2 ?? null,
    rejectedReturnType: row.rejectedReturnType ?? null,
    rejectedReturnNo: row.rejectedReturnNo ?? null,
    rejectedReturnDate: row.rejectedReturnDate ?? null,
    rejectedReturnAccountCode: row.rejectedReturnAccountCode ?? null,
    rejectedReturnPartyName: row.rejectedReturnPartyName ?? null,
  };
}

function auditSearchText(row) {
  return [
    row.documentNo, row.customerCode, row.cardCode, row.cardName, row.brand,
    row.purchaseNo, row.purchasePartyName, row.purchaseAccountCode,
    row.commercialOwner, row.commercialOwnerName,
  ].map(normalizedCode).join("|");
}

export function filterAuditLedger(ledger, query = {}) {
  const page = positiveInteger(query.page, 1);
  const pageSize = query.export === "1"
    ? 50_000
    : Math.min(100, Math.max(10, positiveInteger(query.pageSize, 50)));
  const month = Math.min(12, Math.max(0, number(query.month)));
  const documentType = number(query.documentType);
  const source = AUDIT_SOURCES.has(query.source) ? query.source : "";
  const method = AUDIT_METHODS.has(query.method) ? query.method : "";
  const verification = AUDIT_VERIFICATIONS.has(query.verification)
    ? query.verification
    : "";
  const returnRisk = query.returnRisk === "1" ? true
    : query.returnRisk === "0" ? false : null;
  const search = normalizedCode(String(query.search || "").trim().slice(0, 80));
  let allRows = ledger && typeof ledger === "object" ? auditRowsCache.get(ledger) : null;
  if (!allRows) {
    allRows = (ledger?.rows || []).map(auditRow).sort((left, right) => (
      right[AUDIT_SORT_TIME] - left[AUDIT_SORT_TIME]
      || String(right.id).localeCompare(String(left.id), "tr")
    ));
    if (ledger && typeof ledger === "object") auditRowsCache.set(ledger, allRows);
  }
  const filteredRows = allRows.filter((row) => (
    (!month || monthOf(row.documentDate) === month)
    && (!documentType || number(row.documentType) === documentType)
    && (!source || row.revenueSource === source)
    && (!method || row.costMethod === method)
    && (!verification || row.verificationStatus === verification)
    && (returnRisk === null || row.returnRisk === returnRisk)
    && (!search || auditSearchText(row).includes(search))
  ));
  const summary = {
    totalRows: filteredRows.length,
    verifiedRows: 0,
    configuredRows: 0,
    reviewRows: 0,
    excludedRows: 0,
    returnRiskRows: 0,
    filteredNetAmount: 0,
    analysisNetAmount: 0,
    excludedNetAmount: 0,
    provisionalEconomicRows: 0,
    convertedRetailEconomicRows: 0,
  };
  for (const row of filteredRows) {
    if (row.verificationStatus === "verified") summary.verifiedRows += 1;
    else if (row.verificationStatus === "configured") summary.configuredRows += 1;
    else if (row.verificationStatus === "review") summary.reviewRows += 1;
    else if (row.verificationStatus === "excluded") summary.excludedRows += 1;
    if (row.returnRisk) summary.returnRiskRows += 1;
    if (row.provisionalEconomic) summary.provisionalEconomicRows += 1;
    if (isConvertedRetail(row)) summary.convertedRetailEconomicRows += 1;
    const signedNetAmount = row.isSale ? number(row.netAmount) : -number(row.netAmount);
    summary.filteredNetAmount += signedNetAmount;
    if (row.verificationStatus === "excluded") {
      summary.excludedNetAmount += signedNetAmount;
    } else {
      summary.analysisNetAmount += signedNetAmount;
    }
  }
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    rows: filteredRows.slice(offset, offset + pageSize),
    summary,
  };
}

function reportGroup(rows, name, { rateSets = null } = {}) {
  const canonical = aggregateFinancialMetric(rows.map((row) => row[FINANCIAL_ROWS] || {
    signedNetSalesTry: row.signedNetAmount,
    grossSalesTry: row.isSale ? row.grossAmount : 0,
    returnsTry: row.isSale ? 0 : row.netAmount,
    discountsTry: row.isSale ? row.discountAmount : 0,
    period: String(monthOf(row.documentDate)),
    productCurrency: row.financeV2?.productCurrency ?? row.productCurrency,
    documentSellingRate: row.documentSellingRate,
    financeV2: row.financeV2,
  }), { rateSets, basisId: `audit-report:${name}` });
  const review = canonical.scope.costReview.lines > 0 || canonical.scope.excluded.lines > 0;
  return { name, lines: rows.length, netSales: canonical.try.netSales,
    cost: review ? null : canonical.try.cost, profit: review ? null : canonical.try.profit,
    margin: review ? null : canonical.try.margin, status: canonical.status, evidence: canonical.evidence,
    canonicalMetric: canonical,
    eurEquivalent: canonicalEurEquivalent(canonical),
    eurMargin: canonical.eurMargin,
    eurComplete: canonical.eur.complete === true && canonical.status === "TAMAM",
    eurRevenueComplete: canonical.eurRevenue?.complete === true,
  };
}

export function buildAuditReportProjections(rows = [], options = {}) {
  const dimensions = {
    brand: (row) => row.brand || "Tanımsız",
    dealer: (row) => String(row.customerCode || "").startsWith("DBS") ? row.customerCode : null,
    channel: (row) => row.sourceDocumentType === 64 ? "Teknik Servis" : row.documentType === 91 ? "Perakende Satış" : row.documentType === 85 ? "İrsaliyesiz Fatura" : row.revenueSource === "provisional" ? "Kapanmış / aktarılmış" : "Satış Faturası",
    service: (row) => row.sourceDocumentType === 64 ? (row.brand || "Tanımsız") : null,
    cost: (row) => ({ bulkPurchase: "Toplu alım stoku", priorPurchase: "Önceki son alım", nextPurchase: "Sonradan girilen alım", configuredLabor: "İşçilik oranı", configuredSrf: "SRF / BARNACLE", configuredTsr: "TSR oranı", configuredRoad: "YOL oranı", missingPurchase: "İnceleme gerekli", excludedIncome: "Kapsam dışı" }[row.costMethod] || row.costMethod),
    confidence: (row) => ({ verified: "Faturayla doğrulandı", configured: "Oranla hesaplandı", review: "İnceleme gerekli", excluded: "Kapsam dışı" }[row.verificationStatus] || row.verificationStatus),
  };
  const projections = Object.fromEntries(Object.entries(dimensions).map(([dimension, keyFn]) => {
    const groups = new Map();
    rows.forEach((row) => { const name = keyFn(row); if (name) groups.set(name, [...(groups.get(name) || []), row]); });
    return [dimension, [...groups.entries()].map(([name, group]) => reportGroup(group, name, options))
      .sort((left, right) => (right.netSales ?? 0) - (left.netSales ?? 0))];
  }));
  const overall = reportGroup(rows, "report-total", options);
  const dealer = reportGroup(rows.filter((row) => String(row.customerCode || "").startsWith("DBS")), "dealer-total", options);
  const service = reportGroup(rows.filter((row) => row.sourceDocumentType === 64), "service-total", options);
  projections.summary = {
    dealerNetSales: dealer.netSales,
    dealerEurNetSales: dealer.eurEquivalent.netSales,
    serviceNetSales: service.netSales,
    serviceEurNetSales: service.eurEquivalent.netSales,
    discounts: rows.reduce((sum, row) => sum + (row.isSale ? Number(row.discountAmount || 0) : 0), 0),
    returns: rows.reduce((sum, row) => sum + (row.isSale ? 0 : Number(row.netAmount || 0)), 0),
    discountsEur: overall.eurEquivalent.discounts,
    returnsEur: overall.eurEquivalent.returns,
  };
  return projections;
}

const AUDIT_SAMPLE_CATEGORY_ORDER = [
  "priorPurchase",
  "nextPurchase",
  "configuredSrf",
  "excludedIncome",
];

function auditSampleCategory(row) {
  if (!row.isSale) return null;
  const method = configuredCostMethod(row.productCode) || row.costMethod;
  if (method === "excludedIncome") return "excludedIncome";
  if (method === "configuredSrf") return "configuredSrf";
  if (method === "nextPurchase") return "nextPurchase";
  if (["bulkPurchase", "priorPurchase", "originalSaleCost"].includes(method)) {
    return row.purchaseNo ? "priorPurchase" : null;
  }
  return null;
}

/**
 * Eski kanıt örneği alanlarını birleşik nihai fatura defterinden üretir.
 */
export function buildAuditSamples(ledger) {
  const buckets = new Map();
  for (const row of ledger?.rows || []) {
    const category = auditSampleCategory(row);
    if (!category) continue;
    const sample = {
      category,
      saleType: row.documentType,
      saleNo: row.documentNo,
      saleDate: row.documentDate,
      cardCode: row.productCode,
      cardName: row.productName || row.productCode || "",
      quantity: number(row.quantity),
      netSales: number(row.netAmount),
      purchaseType: row.purchaseType ?? null,
      purchaseNo: row.purchaseNo ?? null,
      purchaseDate: row.purchaseDate ?? null,
      unitCost: row.unitCost ?? null,
      lineCost: row.lineCost ?? null,
    };
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(sample);
  }

  const categories = [
    ...AUDIT_SAMPLE_CATEGORY_ORDER,
    ...[...buckets.keys()].filter((category) => (
      !AUDIT_SAMPLE_CATEGORY_ORDER.includes(category)
    )).sort(),
  ];
  return categories.flatMap((category) => (
    (buckets.get(category) || [])
      .sort((left, right) => (
        right.netSales - left.netSales
        || new Date(right.saleDate).getTime() - new Date(left.saleDate).getTime()
      ))
      .slice(0, 4)
  ));
}

function normalizedDifference(value) {
  return Math.abs(value) < 0.000001 ? 0 : value;
}

function economicScopeNetSales(ledger) {
  return (ledger?.rows || [])
    .filter((row) => !isExcludedIncome(row.productCode))
    .reduce((sum, row) => sum + number(row.signedNetSales), 0);
}

function reconciliation(
  ledgerNetSales,
  responseNetSales,
  scopeNetSales = ledgerNetSales,
  excludedNetSales = 0,
) {
  return {
    ledgerNetSales: number(ledgerNetSales),
    scopeNetSales: number(scopeNetSales),
    excludedNetSales: number(excludedNetSales),
    responseNetSales: number(responseNetSales),
    difference: normalizedDifference(number(responseNetSales) - number(scopeNetSales)),
    balanced: Math.abs(number(responseNetSales) - number(scopeNetSales)) < 0.000001,
  };
}

function metadata(snapshot, fallbackStatus = "error") {
  return {
    ledgerVersion: snapshot?.ledgerVersion ?? null,
    generatedAt: snapshot?.generatedAt ?? null,
    cacheStatus: snapshot?.cache?.status || fallbackStatus,
    readOnly: true,
  };
}

function retainedMetadata(ledgerService, year) {
  if (!year || typeof ledgerService.inspect !== "function") return metadata(null);
  return metadata(ledgerService.inspect(year));
}

const INVALID_METADATA = Object.freeze(metadata(null, "invalid"));

function validYear(value) {
  const year = Number(value || 2026);
  return Number.isInteger(year) && year >= 2023 && year <= 2030 ? year : null;
}

function targetSourceRows(analysis) {
  return (analysis?.months || []).flatMap((month) => (
    ["service", "parts"].map((department) => ({
      month: month.month,
      department,
      netSales: month[department]?.netSales || 0,
      cost: month[department]?.cost || 0,
      uncoveredNetSales: month[department]?.uncoveredNetSales || 0,
      eurNetSales: month[department]?.eurEquivalent?.netSales ?? null,
      eurCost: month[department]?.eurEquivalent?.cost ?? null,
      eurProfit: month[department]?.eurEquivalent?.profit ?? null,
    }))
  ));
}

export function buildCachedDepartmentAnalysis(options = {}) {
  const {
    ledger,
    year,
    pilotCardCostRates = {},
    costOverrides = [],
    requireApproval = true,
  } = options;
  if (!ledger || typeof ledger !== "object") {
    return buildDepartmentAnalysis(options);
  }

  let variants = departmentAnalysisCache.get(ledger);
  if (!variants) {
    variants = new Map();
    departmentAnalysisCache.set(ledger, variants);
  }
  const policyKey = JSON.stringify([
    year,
    pilotCardCostRates,
    costOverrides,
    requireApproval,
  ]);
  if (variants.has(policyKey)) return variants.get(policyKey);

  const analysis = buildDepartmentAnalysis({
    ...options,
    pilotCardCostRates,
    costOverrides,
    requireApproval,
  });
  if (variants.size >= 8) variants.clear();
  variants.set(policyKey, analysis);
  return analysis;
}

const DEPARTMENT_DETAIL_CHUNK_SIZE = 500;

function completeDepartmentDetailRows({ ledger, analysisOptions, analysis }) {
  if (!ledger || !Array.isArray(ledger.rows)) return analysis?.detailRows || [];
  let cached = departmentDetailRowsCache.get(analysis);
  if (cached) return cached;
  if (ledger.rows.length <= DEPARTMENT_DETAIL_CHUNK_SIZE) {
    cached = analysis?.detailRows || [];
  } else {
    cached = [];
    for (let start = 0; start < ledger.rows.length; start += DEPARTMENT_DETAIL_CHUNK_SIZE) {
      const chunk = buildDepartmentAnalysis({
        ...analysisOptions,
        ledger: { ...ledger, rows: ledger.rows.slice(start, start + DEPARTMENT_DETAIL_CHUNK_SIZE) },
      });
      cached.push(...(chunk.detailRows || []));
    }
    cached.sort((left, right) => (
      Date.parse(right.documentDate) - Date.parse(left.documentDate)
      || number(right.netSales) - number(left.netSales)
      || String(right.id).localeCompare(String(left.id), "tr")
    ));
  }
  departmentDetailRowsCache.set(analysis, cached);
  return cached;
}

function filterDepartmentDetailRows(rows, query = {}) {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(100, Math.max(10, positiveInteger(query.pageSize, 50)));
  const department = ["service", "parts", "review"].includes(query.department)
    ? query.department
    : "";
  const month = Math.min(12, Math.max(0, number(query.month)));
  const status = ["confirmed", "inferred", "review"].includes(query.status)
    ? query.status
    : "";
  const depot = ["MRK", "YTM", "—"].includes(query.depot) ? query.depot : "";
  const search = normalizedCode(String(query.search || "").trim().slice(0, 80));
  const filtered = rows.filter((row) => {
    const haystack = normalizedCode([
      row.documentNo, row.customerCode, row.customerName, row.productCode,
      row.productName, row.commercialOwner, row.commercialOwnerName,
    ].join(" "));
    return (!department || row.department === department)
      && (!month || row.month === month)
      && (!status || row.attributionStatus === status)
      && (!depot || row.fulfillmentDepotCode === depot)
      && (!search || haystack.includes(search));
  });
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalRows: filtered.length,
    totalPages: Math.ceil(filtered.length / pageSize),
    rows: filtered.slice(offset, offset + pageSize),
  };
}

/**
 * Hedef API'si ve yönetim onayları için aynı nihai-defter sonucunu üretir.
 */
export function createDepartmentTargetLoader({
  ledgerService,
  getAppState = async () => ({}),
  logger = console,
} = {}) {
  if (!ledgerService || typeof ledgerService.get !== "function") {
    throw new TypeError("ledgerService zorunludur.");
  }
  return async function loadDepartmentTargets(yearValue, { refresh = false } = {}) {
    const year = validYear(yearValue);
    if (!year) {
      return {
        status: 400,
        payload: {
          error: "Geçersiz yıl.",
          ...INVALID_METADATA,
          previousLedgerVersion: null,
          previousGeneratedAt: null,
          previousCacheStatus: "invalid",
        },
      };
    }
    try {
      const [currentSnapshot, previousSnapshot, state] = await Promise.all([
        ledgerService.get(year, { refresh }),
        ledgerService.get(year - 1, { refresh }),
        getAppState(),
      ]);
      const previousMetadata = metadata(previousSnapshot);
      if (!currentSnapshot.value || !previousSnapshot.value) {
        return {
          status: 503,
          payload: {
            year,
            previousYear: year - 1,
            rows: [],
            summary: { departments: [], totalPool: 0 },
            mode: "unavailable",
            ...metadata(currentSnapshot),
            previousLedgerVersion: previousMetadata.ledgerVersion,
            previousGeneratedAt: previousMetadata.generatedAt,
            previousCacheStatus: previousMetadata.cacheStatus,
            error: "Cari veya önceki yıl nihai defteri hazır olmadığı için hedefler üretilemedi.",
          },
        };
      }
      const analysisOptions = {
        pilotCardCostRates: state.settings?.pilotCardCostRates || {},
        costOverrides: Array.isArray(state.costOverrides)
          ? state.costOverrides
          : [],
        requireApproval:
          state.settings?.requireManagementApprovalForManualCost !== false,
      };
      const [currentAnalysis, previousAnalysis] = [
        buildCachedDepartmentAnalysis({
          ledger: currentSnapshot.value,
          year,
          ...analysisOptions,
        }),
        buildCachedDepartmentAnalysis({
          ledger: previousSnapshot.value,
          year: year - 1,
          ...analysisOptions,
        }),
      ];
      let rows;
      try {
        rows = buildDepartmentTargets({
          year,
          currentRows: targetSourceRows(currentAnalysis),
          previousRows: targetSourceRows(previousAnalysis),
          settings: state.settings,
        });
      } catch (error) {
        if (!(error instanceof TypeError || error instanceof RangeError)) {
          throw error;
        }
        return {
          status: 400,
          payload: {
            year,
            previousYear: year - 1,
            rows: [],
            summary: { departments: [], totalPool: 0 },
            mode: "invalid",
            ...metadata(currentSnapshot),
            previousLedgerVersion: previousMetadata.ledgerVersion,
            previousGeneratedAt: previousMetadata.generatedAt,
            previousCacheStatus: previousMetadata.cacheStatus,
            error: "Geçersiz departman hedef ayarı.",
          },
        };
      }
      const rateIndex = buildExchangeRateIndex(currentSnapshot.value.exchangeRates);
      const exchangeRateSets = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return [String(month), buildRateSet(rateIndex, lastDayOfMonthKey(year, month))];
      }));
      return {
        status: 200,
        payload: {
          year,
          previousYear: year - 1,
          rows,
          exchangeRateSets,
          summary: summarizeDepartmentTargets(rows),
          mode: "live",
          ...metadata(currentSnapshot),
          inventorySource: currentSnapshot.value.inventorySource || null,
          previousLedgerVersion: previousMetadata.ledgerVersion,
          previousGeneratedAt: previousMetadata.generatedAt,
          previousCacheStatus: previousMetadata.cacheStatus,
          source: "CPM salt okunur nihai fatura defteri + Nexus hedef kuralları",
        },
      };
    } catch (error) {
      logger.error("Marlin Nexus department target read failed:", error);
      const previousMetadata = retainedMetadata(ledgerService, year - 1);
      return {
        status: 500,
        payload: {
          year,
          previousYear: year - 1,
          rows: [],
          summary: { departments: [], totalPool: 0 },
          mode: "error",
          ...retainedMetadata(ledgerService, year),
          previousLedgerVersion: previousMetadata.ledgerVersion,
          previousGeneratedAt: previousMetadata.generatedAt,
          previousCacheStatus: previousMetadata.cacheStatus,
          error: "Departman hedefleri birleşik defterden üretilemedi.",
        },
      };
    }
  };
}

/**
 * Aynı ledger snapshot'ını kullanan salt-okunur Nexus API uçlarını oluşturur.
 */
export function createUnifiedLedgerRouter({
  ledgerService,
  getAppState = async () => ({}),
  departmentTargetLoader,
  sourceProvenanceLoader,
  inventoryOpeningResearchLoader,
  logger = console,
} = {}) {
  if (!ledgerService || typeof ledgerService.get !== "function") {
    throw new TypeError("ledgerService zorunludur.");
  }
  const router = express.Router();
  const loadDepartmentTargets = departmentTargetLoader
    || createDepartmentTargetLoader({ ledgerService, getAppState, logger });

  router.post("/api/ledger-refresh", async (request, response) => {
    const year = validYear(request.body?.year || request.query.year);
    if (!year) return response.status(400).json({ status: "failed", readOnly: true, error: "Geçersiz yıl." });
    try {
      const results = typeof ledgerService.refreshMany === "function"
        ? await ledgerService.refreshMany([year, year - 1])
        : await Promise.all([year, year - 1].map(async (item) => ({ year: item, status: "fulfilled", value: await ledgerService.get(item, { refresh: true }) })));
      const years = Object.fromEntries(results.map((item) => [String(item.year), item.status === "fulfilled"
        ? { ledgerVersion: item.value.ledgerVersion, generatedAt: item.value.generatedAt, cacheStatus: item.value.cache.status }
        : { ledgerVersion: null, generatedAt: null, cacheStatus: "refresh-error", error: item.reason?.message || "Yenileme başarısız." }]));
      const failed = results.filter((item) => item.status !== "fulfilled");
      response.setHeader("Cache-Control", "no-store");
      return response.status(failed.length === results.length ? 503 : 200).json({
        readOnly: true,
        status: failed.length ? "partial" : "completed",
        year,
        years,
      });
    } catch (error) {
      logger.error("Marlin Nexus ledger refresh failed:", error);
      return response.status(503).json({ readOnly: true, status: "failed", year, error: "CPM verisi yenilenemedi." });
    }
  });

  router.get("/api/overview", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) {
      return response.status(400).json({
        error: "Geçersiz yıl.",
        ...INVALID_METADATA,
      });
    }
    try {
      const [snapshot, state] = await Promise.all([
        ledgerService.get(year, {
          refresh: request.query.refresh === "1",
        }),
        getAppState(),
      ]);
      if (!snapshot.value) {
        return response.status(503).json({
          year, rows: [], mode: "unavailable", ...metadata(snapshot),
          error: "Gerçek CPM bağlantısı yapılandırılmadığı için satış özeti üretilemedi.",
        });
      }
      const rows = buildOverviewRows(snapshot.value);
      const responseNetSales = overviewNetSales(rows);
      const scopeNetSales = economicScopeNetSales(snapshot.value);
      // EUR raporlama katmanı: açık aylar rapor günü, onaylı aylar dondurulmuş kur setiyle.
      const rateIndex = buildExchangeRateIndex(snapshot.value.exchangeRates);
      const eurDecorated = decorateOverviewRowsEur(rows, {
        index: rateIndex,
        year,
        approvals: state.approvals?.[String(year)] || {},
        reportDate: new Date(),
      });
      const annualRateSets = Object.fromEntries(Object.entries(eurDecorated.eurRateSets).map(([month]) => {
        const resolved = resolveMonthRateSet({
          index: rateIndex,
          year,
          month: Number(month),
          approval: (state.approvals?.[String(year)] || {})[month] || null,
          reportDate: new Date(),
        });
        return [month, resolved.rateSet];
      }));
      const annualCanonicalMetric = aggregateFinancialMetric(
        (snapshot.value.rows || []).filter((row) => !isExcludedIncome(row.productCode)).map((row) => ({
          signedNetSalesTry: row.signedNetSales,
          grossSalesTry: row.isSale ? row.grossAmount : 0,
          returnsTry: row.isSale ? 0 : row.netAmount,
          discountsTry: row.isSale ? row.discountAmount : 0,
          period: String(monthOf(row.documentDate)),
          productCurrency: row.financeV2?.productCurrency ?? row.productCurrency,
          documentSellingRate: row.documentSellingRate,
          financeV2: row.financeV2,
        })),
        { rateSets: annualRateSets, basisId: `overview:${year}` },
      );
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        year,
        rows: eurDecorated.rows,
        eurRateSets: eurDecorated.eurRateSets,
        canonicalMetric: annualCanonicalMetric,
        mode: "live",
        ...metadata(snapshot),
        reconciliation: reconciliation(
          snapshot.value.totals?.netSales,
          responseNetSales,
          scopeNetSales,
          number(snapshot.value.totals?.netSales) - scopeNetSales,
        ),
      });
    } catch (error) {
      logger.error("Marlin Nexus overview ledger read failed:", error);
      return response.status(500).json({
        year, rows: [], mode: "error", ...retainedMetadata(ledgerService, year),
        error: "Satış özeti birleşik defterden okunamadı.",
      });
    }
  });

  router.get("/api/reconciliation/invoices/source-rows", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl.", ...INVALID_METADATA });
    try {
      if (typeof sourceProvenanceLoader === "function") {
        const provenance = await sourceProvenanceLoader(year, {
          refresh: request.query.refresh === "1",
        });
        response.setHeader("Cache-Control", "no-store");
        return response.json({ year, ...provenance, mode: "live" });
      }
      const snapshot = await ledgerService.get(year, { refresh: request.query.refresh === "1" });
      if (!snapshot.value) {
        return response.status(503).json({
          year,
          mode: "unavailable",
          ...metadata(snapshot),
          error: "CPM kaynak satır provenance teşhisi üretilemedi.",
        });
      }
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        year,
        ...buildSourceRowProvenanceDiagnostic(snapshot.value),
        mode: "live",
        ...metadata(snapshot),
      });
    } catch (error) {
      logger.error("Marlin Nexus source-row provenance diagnostic failed:", error);
      return response.status(500).json({
        year,
        mode: "error",
        ...retainedMetadata(ledgerService, year),
        error: "CPM kaynak satır provenance teşhisi okunamadı.",
      });
    }
  });

  router.get("/api/reconciliation/invoices", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl.", ...INVALID_METADATA });
    try {
      const snapshot = await ledgerService.get(year, { refresh: request.query.refresh === "1" });
      if (!snapshot.value) {
        return response.status(503).json({ year, mode: "unavailable", ...metadata(snapshot), error: "CPM fatura uzlaştırması üretilemedi." });
      }
      const overviewRows = buildOverviewRows(snapshot.value);
      const reconciliation = buildInvoiceReconciliation(snapshot.value, overviewRows);
      response.setHeader("Cache-Control", "no-store");
      return response.json({ year, ...reconciliation, mode: "live", ...metadata(snapshot) });
    } catch (error) {
      logger.error("Marlin Nexus invoice reconciliation failed:", error);
      return response.status(500).json({ year, mode: "error", ...retainedMetadata(ledgerService, year), error: "CPM fatura uzlaştırması okunamadı." });
    }
  });

  router.get("/api/department-analysis", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) {
      return response.status(400).json({
        error: "Geçersiz yıl.",
        ...INVALID_METADATA,
      });
    }
    try {
      const [snapshot, state] = await Promise.all([
        ledgerService.get(year, { refresh: request.query.refresh === "1" }),
        getAppState(),
      ]);
      if (!snapshot.value) {
        return response.status(503).json({
          year, departments: [], months: [], detailRows: [], pilotOrders: [],
          detailPagination: { page: 1, pageSize: 50, totalRows: 0, totalPages: 0 },
          mode: "unavailable", ...metadata(snapshot),
          error: "Gerçek CPM bağlantısı yapılandırılmadığı için departman analizi üretilemedi.",
        });
      }
      const analysisOptions = {
        ledger: snapshot.value,
        year,
        pilotCardCostRates: state.settings?.pilotCardCostRates || {},
        costOverrides: Array.isArray(state.costOverrides) ? state.costOverrides : [],
        requireApproval: state.settings?.requireManagementApprovalForManualCost !== false,
      };
      const analysis = buildCachedDepartmentAnalysis(analysisOptions);
      const detailPage = filterDepartmentDetailRows(
        completeDepartmentDetailRows({ ledger: snapshot.value, analysisOptions, analysis }),
        request.query,
      );
      const scopeNetSales = economicScopeNetSales(snapshot.value);
      // EUR raporlama katmanı: departman, ay ve toplam sepetleri kur setiyle süslenir.
      const rateIndex = buildExchangeRateIndex(snapshot.value.exchangeRates);
      const approvals = state.approvals?.[String(year)] || {};
      const reportDate = new Date();
      const periodRateSets = {};
      for (let month = 1; month <= 12; month += 1) {
        const resolved = resolveMonthRateSet({
          index: rateIndex,
          year,
          month,
          approval: approvals[String(month)] || null,
          reportDate,
        });
        periodRateSets[String(month)] = resolved.rateSet;
      }
      const decorateMetricEur = (metric) => {
        if (!metric || typeof metric !== "object") return metric;
        const resolved = metric.month
          ? resolveMonthRateSet({ index: rateIndex, year, month: metric.month, approval: approvals[String(metric.month)] || null, reportDate })
          : { rateSet: buildRateSet(rateIndex, reportDate), frozen: false };
        const canonicalMetric = aggregateDepartmentMetric(
          metric,
          metric.month ? { [String(metric.month)]: resolved.rateSet } : periodRateSets,
        );
        return {
          ...metric,
          canonicalMetric,
          eurEquivalent: canonicalEurEquivalent(canonicalMetric),
          eurMargin: canonicalMetric.eurMargin,
          eurComplete: canonicalMetric.eur.complete && canonicalMetric.status === "TAMAM",
          eurRevenueComplete: canonicalMetric.eurRevenue?.complete === true,
          eurStatus: canonicalMetric.status,
          eurFrozen: resolved.frozen,
        };
      };
      analysis.eurRateSet = buildRateSet(rateIndex, reportDate);
      analysis.totals = decorateMetricEur({ ...analysis.totals, month: null });
      analysis.departments = (analysis.departments || []).map(decorateMetricEur);
      analysis.months = (analysis.months || []).map((item) => ({
        ...item,
        service: decorateMetricEur(item.service),
        parts: decorateMetricEur(item.parts),
        review: decorateMetricEur(item.review),
        all: decorateMetricEur(item.all),
      }));
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        ...analysis,
        detailRows: detailPage.rows,
        detailPagination: {
          page: detailPage.page,
          pageSize: detailPage.pageSize,
          totalRows: detailPage.totalRows,
          totalPages: detailPage.totalPages,
        },
        mode: "live",
        ...metadata(snapshot),
        source: "CPM salt okunur + Nexus yönetilen kurallar",
        reconciliation: reconciliation(
          snapshot.value.totals?.netSales,
          analysis.totals?.netSales,
          scopeNetSales,
          number(snapshot.value.totals?.netSales) - scopeNetSales,
        ),
      });
    } catch (error) {
      logger.error("Marlin Nexus department ledger read failed:", error);
      return response.status(500).json({
        year, departments: [], months: [], detailRows: [], pilotOrders: [],
        detailPagination: { page: 1, pageSize: 50, totalRows: 0, totalPages: 0 },
        mode: "error", ...retainedMetadata(ledgerService, year),
        error: "Departman analizi birleşik defterden okunamadı.",
      });
    }
  });

  router.get("/api/department-targets", async (request, response) => {
    const result = await loadDepartmentTargets(request.query.year, {
      refresh: request.query.refresh === "1",
    });
    response.setHeader("Cache-Control", "no-store");
    return response.status(result.status).json(result.payload);
  });

  router.get("/api/audit-ledger", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) {
      return response.status(400).json({
        error: "Geçersiz yıl.",
        ...INVALID_METADATA,
      });
    }
    try {
      const [snapshot, state] = await Promise.all([
        ledgerService.get(year, { refresh: request.query.refresh === "1" }),
        getAppState(),
      ]);
      if (!snapshot.value) {
        return response.status(503).json({
          year, page: 1, pageSize: 50, rows: [], summary: { totalRows: 0 },
          mode: "unavailable", ...metadata(snapshot),
          error: "Gerçek CPM bağlantısı yapılandırılmadığı için denetim defteri üretilemedi.",
        });
      }
      const audit = filterAuditLedger(snapshot.value, request.query);
      const rateIndex = buildExchangeRateIndex(snapshot.value.exchangeRates);
      const approvals = state.approvals?.[String(year)] || {};
      const reportDate = new Date();
      const reportRateSets = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const resolved = resolveMonthRateSet({
          index: rateIndex,
          year,
          month,
          approval: approvals[String(month)] || null,
          reportDate,
        });
        return [String(month), resolved.rateSet];
      }));
      const projections = buildAuditReportProjections(audit.rows, { rateSets: reportRateSets });
      const scopeNetSales = economicScopeNetSales(snapshot.value);
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        year,
        ...audit,
        projections,
        mode: "live",
        ...metadata(snapshot),
        reconciliation: reconciliation(
          snapshot.value.totals?.netSales,
          audit.summary.analysisNetAmount,
          scopeNetSales,
          number(snapshot.value.totals?.netSales) - scopeNetSales,
        ),
      });
    } catch (error) {
      logger.error("Marlin Nexus audit ledger read failed:", error);
      return response.status(500).json({
        year, page: 1, pageSize: 50, rows: [], summary: { totalRows: 0 },
        mode: "error", ...retainedMetadata(ledgerService, year),
        error: "Denetim defteri birleşik defterden okunamadı.",
      });
    }
  });

  router.get("/api/audit-samples", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) {
      return response.status(400).json({
        error: "Geçersiz yıl.",
        ...INVALID_METADATA,
      });
    }
    try {
      const snapshot = await ledgerService.get(year, {
        refresh: request.query.refresh === "1",
      });
      if (!snapshot.value) {
        return response.json({
          year, rows: [], mode: "demo", ...metadata(snapshot),
        });
      }
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        year,
        rows: buildAuditSamples(snapshot.value),
        mode: "live",
        ...metadata(snapshot),
      });
    } catch (error) {
      logger.error("Marlin Nexus audit samples ledger read failed:", error);
      return response.status(500).json({
        year, rows: [], mode: "error", ...retainedMetadata(ledgerService, year),
        error: "Kanıt örnekleri birleşik defterden okunamadı.",
      });
    }
  });

  router.get("/api/inventory-research", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl." });
    try {
      const snapshot = await ledgerService.get(year, { refresh: request.query.refresh === "1" });
      if (!snapshot.value) {
        return response.status(503).json(buildInventoryResearchPayload({
          year,
          source: { status: "missing", evidence: { reason: "cpm-not-connected" } },
        }));
      }
      const audit = filterAuditLedger(snapshot.value, {
        ...request.query,
        page: 1,
        pageSize: 200,
      });
      const search = String(request.query.search || "").trim().toLocaleUpperCase("tr-TR");
      const rows = search
        ? audit.rows.filter((row) => `${row.cardCode || ""} ${row.cardName || ""}`.toLocaleUpperCase("tr-TR").includes(search))
        : audit.rows;
      response.setHeader("Cache-Control", "no-store");
      return response.json(buildInventoryResearchPayload({
        year,
        source: snapshot.value.inventorySource,
        rows,
      }));
    } catch (error) {
      logger.error("Marlin Nexus inventory research read failed:", error);
      return response.status(500).json(buildInventoryResearchPayload({
        year,
        source: { status: "invalid", evidence: { reason: "inventory-research-read-failed" } },
      }));
    }
  });

  router.get("/api/research/inventory-opening-evidence", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl." });
    const sampleLimit = request.query.sampleLimit === undefined ? 20 : Number(request.query.sampleLimit);
    if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 100) {
      return response.status(400).json({ error: "sampleLimit 1 ile 100 arasında olmalıdır." });
    }
    try {
      const payload = typeof inventoryOpeningResearchLoader === "function"
        ? await inventoryOpeningResearchLoader(year, sampleLimit)
        : buildInventoryOpeningResearchPayload({ year, sampleLimit });
      response.setHeader("Cache-Control", "no-store");
      return response.status(payload?.status === "missing" ? 503 : 200).json(payload);
    } catch (error) {
      logger.error("Marlin Nexus inventory opening research read failed:", error);
      return response.status(503).json(buildInventoryOpeningResearchPayload({ year, sampleLimit }));
    }
  });

  return router;
}
