import express from "express";
import { buildDepartmentAnalysis } from "./departmentAnalysis.mjs";
import {
  buildDepartmentTargets,
  summarizeDepartmentTargets,
} from "../shared/targetPolicy.mjs";

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
const AUDIT_SORT_TIME = Symbol("auditSortTime");

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    costMethod: "final-invoice-ledger",
    source: "live",
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
    const cardKey = pilotCardKey(row.productCode);
    const isSale = Boolean(row.isSale);

    target.invoiceLineCount += 1;
    target.invoiceNetSales += number(row.signedNetSales);
    if (!isSale) {
      if (row.originalDocumentNo) target.linkedReturnLines += 1;
      else target.unlinkedReturnLines += 1;
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

    if (row.lineCost === null || row.lineCost === undefined) {
      target.uncoveredCostLines += 1;
      target.uncoveredNetSales += number(row.signedNetSales);
    } else {
      target.costCoveredLines += 1;
      target.estimatedCost += number(row.lineCost);
      if (row.costMethod === "bulkPurchase") target.bulkPurchaseCostLines += 1;
      else if (row.costMethod === "nextPurchase") target.nextPurchaseCostLines += 1;
      else target.lastPurchaseCostLines += 1;
    }
    months.set(month, target);
  }

  const rows = [...months.values()]
    .sort((left, right) => left.month - right.month)
    .map((row) => ({
      ...row,
      costCoveragePct: row.lineCount
        ? Number((100 * row.costCoveredLines / row.lineCount).toFixed(1))
        : 0,
    }));
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

function verificationStatus(row) {
  if (row.costMethod === "excludedIncome") return "excluded";
  if (String(row.costMethod || "").startsWith("configured")) return "configured";
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
  return {
    ...row,
    [AUDIT_SORT_TIME]: Date.parse(row.documentDate) || 0,
    id: row.rootId,
    revenueSource: row.isSale ? "invoice" : "return",
    customerCode: row.customerCode || "",
    cardCode: row.productCode || "",
    cardName: row.productName || row.productCode || "",
    brand: row.brandName || "",
    grossAmount,
    discountAmount: number(row.discountAmount),
    discountPct: grossAmount ? 100 * number(row.discountAmount) / grossAmount : 0,
    netAmount,
    vatAmount: number(row.vatAmount),
    vatRate: netAmount ? 100 * number(row.vatAmount) / netAmount : 0,
    invoiceTotalInclVat: number(row.invoiceTotalInclVat),
    originalSaleType: row.originalDocumentType ?? null,
    originalSaleNo: row.originalDocumentNo ?? null,
    originalSaleDate: row.originalSaleDate ?? null,
    costMethod: effectiveCostMethod,
    verificationStatus: verification,
    purchaseDocumentFound: Boolean(row.purchaseNo),
    costValidated: verification === "verified",
    returnRisk,
    costEvidenceClass: costEvidenceClass(effectiveRow),
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
  };
  for (const row of filteredRows) {
    if (row.verificationStatus === "verified") summary.verifiedRows += 1;
    else if (row.verificationStatus === "configured") summary.configuredRows += 1;
    else if (row.verificationStatus === "review") summary.reviewRows += 1;
    else if (row.verificationStatus === "excluded") summary.excludedRows += 1;
    if (row.returnRisk) summary.returnRiskRows += 1;
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
    }))
  ));
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
        buildDepartmentAnalysis({
          ledger: currentSnapshot.value,
          year,
          ...analysisOptions,
        }),
        buildDepartmentAnalysis({
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
      return {
        status: 200,
        payload: {
          year,
          previousYear: year - 1,
          rows,
          summary: summarizeDepartmentTargets(rows),
          mode: "live",
          ...metadata(currentSnapshot),
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
  logger = console,
} = {}) {
  if (!ledgerService || typeof ledgerService.get !== "function") {
    throw new TypeError("ledgerService zorunludur.");
  }
  const router = express.Router();
  const loadDepartmentTargets = departmentTargetLoader
    || createDepartmentTargetLoader({ ledgerService, getAppState, logger });

  router.get("/api/overview", async (request, response) => {
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
        return response.status(503).json({
          year, rows: [], mode: "unavailable", ...metadata(snapshot),
          error: "Gerçek CPM bağlantısı yapılandırılmadığı için satış özeti üretilemedi.",
        });
      }
      const rows = buildOverviewRows(snapshot.value);
      const responseNetSales = overviewNetSales(rows);
      const scopeNetSales = economicScopeNetSales(snapshot.value);
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        year,
        rows,
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
          mode: "unavailable", ...metadata(snapshot),
          error: "Gerçek CPM bağlantısı yapılandırılmadığı için departman analizi üretilemedi.",
        });
      }
      const analysis = buildDepartmentAnalysis({
        ledger: snapshot.value,
        year,
        pilotCardCostRates: state.settings?.pilotCardCostRates || {},
        costOverrides: Array.isArray(state.costOverrides) ? state.costOverrides : [],
        requireApproval: state.settings?.requireManagementApprovalForManualCost !== false,
      });
      const scopeNetSales = economicScopeNetSales(snapshot.value);
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        ...analysis,
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
      const snapshot = await ledgerService.get(year, {
        refresh: request.query.refresh === "1",
      });
      if (!snapshot.value) {
        return response.status(503).json({
          year, page: 1, pageSize: 50, rows: [], summary: { totalRows: 0 },
          mode: "unavailable", ...metadata(snapshot),
          error: "Gerçek CPM bağlantısı yapılandırılmadığı için denetim defteri üretilemedi.",
        });
      }
      const audit = filterAuditLedger(snapshot.value, request.query);
      const scopeNetSales = economicScopeNetSales(snapshot.value);
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        year,
        ...audit,
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

  return router;
}
