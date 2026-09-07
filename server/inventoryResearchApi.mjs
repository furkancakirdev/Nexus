import { summarizeOpeningEvidenceDiagnostics, summarizeOpeningEvidenceRows } from "./openingEvidenceMatcher.mjs";
import { buildComparableYearWac } from "../shared/financialCostModel.mjs";

const DEFAULT_COMPARABLE_YEARS = Object.freeze([2024, 2025]);

function comparableYearSummary(candidate) {
  return {
    year: candidate.year,
    dateRange: candidate.dateRange,
    status: candidate.status,
    financialStatus: candidate.financialStatus,
    eligibleForOfficialWac: false,
    officialWac: null,
    sourceRowCount: candidate.sourceRowCount,
    coveredRows: candidate.coveredRows,
    reviewRows: candidate.reviewRows,
    coveredRatio: candidate.coveredRatio,
    carriedClosingWacCount: candidate.carriedClosingWacCount,
    carriedClosingWacKeys: candidate.carriedClosingWacKeys,
    firstReliableCalculationDate: candidate.firstReliableCalculationDate,
    reviewCountByReason: candidate.reviewCountByReason,
  };
}

/**
 * 2024–2025 karşılaştırmalı WAC kanıtını yalnızca candidate olarak sunar.
 * Önceki yıl kapanışı aynı ürün-depo-döviz anahtarında taşınır; bu çıktı resmi
 * ledger maliyetine bağlanmaz ve eksik kanıtı kâr olarak sınıflandırmaz.
 */
export function buildComparableYearWacResearch({
  movements = [],
  years = DEFAULT_COMPARABLE_YEARS,
} = {}) {
  if (!Array.isArray(movements)) throw new TypeError("Karşılaştırmalı WAC hareketleri dizi olmalıdır.");
  const selectedYears = [...new Set((Array.isArray(years) ? years : DEFAULT_COMPARABLE_YEARS)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 2000))]
    .sort((left, right) => left - right);
  let priorClosingWac = new Map();
  const result = selectedYears.map((year) => {
    const candidate = buildComparableYearWac({ year, movements, priorClosingWac });
    priorClosingWac = new Map(Object.entries(candidate.closingWacByStockKey));
    return comparableYearSummary(candidate);
  });
  return {
    status: "candidate",
    financialStatus: "blocked",
    eligibleForOfficialWac: false,
    officialWac: null,
    years: result,
  };
}

export function buildInventoryResearchPayload({ year, source = null, rows = [] } = {}) {
  const inventorySource = source || { status: "missing", evidence: { reason: "source-contract-missing" } };
  const comparableYearWac = Array.isArray(inventorySource?.movements)
    ? buildComparableYearWacResearch({ movements: inventorySource.movements })
    : null;
  return {
    year,
    readOnly: true,
    mode: inventorySource?.status === "verified" ? "live" : "unavailable",
    inventorySource,
    comparableYearWac,
    openingEvidenceDiagnostics: Array.isArray(inventorySource?.evidence?.openingEvidenceRows)
      ? summarizeOpeningEvidenceRows(inventorySource.evidence.openingEvidenceRows)
      : summarizeOpeningEvidenceDiagnostics(inventorySource.evidence),
    currentStock: {
      status: "unavailable",
      reason: "current-stock-source-not-verified",
      rows: [],
    },
    rows: Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [],
  };
}
