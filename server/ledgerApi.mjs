import express from "express";
import { buildDepartmentAnalysis } from "./departmentAnalysis.mjs";

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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function monthOf(value) {
  const parsed = new Date(value);
  const month = parsed.getUTCMonth() + 1;
  return Number.isFinite(parsed.getTime()) && month >= 1 && month <= 12 ? month : 0;
}

function normalizedCode(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
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

  return [...months.values()]
    .sort((left, right) => left.month - right.month)
    .map((row) => ({
      ...row,
      costCoveragePct: row.lineCount
        ? Number((100 * row.costCoveredLines / row.lineCount).toFixed(1))
        : 0,
    }));
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
  const allRows = (ledger?.rows || []).map(auditRow);
  const filteredRows = allRows.filter((row) => (
    (!month || monthOf(row.documentDate) === month)
    && (!documentType || number(row.documentType) === documentType)
    && (!source || row.revenueSource === source)
    && (!method || row.costMethod === method)
    && (!verification || row.verificationStatus === verification)
    && (returnRisk === null || row.returnRisk === returnRisk)
    && (!search || auditSearchText(row).includes(search))
  )).sort((left, right) => (
    new Date(right.documentDate).getTime() - new Date(left.documentDate).getTime()
    || String(right.id).localeCompare(String(left.id), "tr")
  ));
  const summary = {
    totalRows: filteredRows.length,
    verifiedRows: filteredRows.filter((row) => row.verificationStatus === "verified").length,
    configuredRows: filteredRows.filter((row) => row.verificationStatus === "configured").length,
    reviewRows: filteredRows.filter((row) => row.verificationStatus === "review").length,
    excludedRows: filteredRows.filter((row) => row.verificationStatus === "excluded").length,
    returnRiskRows: filteredRows.filter((row) => row.returnRisk).length,
    filteredNetAmount: filteredRows.reduce((sum, row) => (
      sum + (row.isSale ? number(row.netAmount) : -number(row.netAmount))
    ), 0),
  };
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    rows: filteredRows.slice(offset, offset + pageSize),
    summary,
  };
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

function metadata(snapshot) {
  return {
    ledgerVersion: snapshot.ledgerVersion,
    generatedAt: snapshot.generatedAt,
    cacheStatus: snapshot.cache.status,
    readOnly: true,
  };
}

function validYear(value) {
  const year = Number(value || 2026);
  return Number.isInteger(year) && year >= 2023 && year <= 2030 ? year : null;
}

/**
 * Aynı ledger snapshot'ını kullanan salt-okunur Nexus API uçlarını oluşturur.
 */
export function createUnifiedLedgerRouter({
  ledgerService,
  getAppState = async () => ({}),
  logger = console,
} = {}) {
  if (!ledgerService || typeof ledgerService.get !== "function") {
    throw new TypeError("ledgerService zorunludur.");
  }
  const router = express.Router();

  router.get("/api/overview", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl." });
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
        year, rows: [], mode: "error", readOnly: true,
        error: "Satış özeti birleşik defterden okunamadı.",
      });
    }
  });

  router.get("/api/department-analysis", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl." });
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
        mode: "error", readOnly: true,
        error: "Departman analizi birleşik defterden okunamadı.",
      });
    }
  });

  router.get("/api/audit-ledger", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl." });
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
      response.setHeader("Cache-Control", "no-store");
      return response.json({
        year,
        ...audit,
        mode: "live",
        ...metadata(snapshot),
        reconciliation: reconciliation(
          snapshot.value.totals?.netSales,
          audit.summary.filteredNetAmount,
          audit.summary.filteredNetAmount,
        ),
      });
    } catch (error) {
      logger.error("Marlin Nexus audit ledger read failed:", error);
      return response.status(500).json({
        year, page: 1, pageSize: 50, rows: [], summary: { totalRows: 0 },
        mode: "error", readOnly: true,
        error: "Denetim defteri birleşik defterden okunamadı.",
      });
    }
  });

  return router;
}
