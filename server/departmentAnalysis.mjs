import { resolveCommercialOwnership } from "./ownershipResolver.mjs";
import {
  EXCLUDED_TEST_DOCUMENT_NUMBERS,
  excludedTestAudit,
  isExcludedTestDocument,
} from "./testDocumentRegistry.mjs";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export const TEST_DOCUMENTS = new Set(EXCLUDED_TEST_DOCUMENT_NUMBERS);

const DEPARTMENT_META = {
  service: { id: "service", name: "Servis", center: "Yatmarin", color: "#087f8c" },
  parts: { id: "parts", name: "Yedek Parça Satış", center: "Merkez Ofis", color: "#0a3972" },
  review: { id: "review", name: "İnceleme Gerekli", center: "—", color: "#d9730d" },
};

function number(value) {
  return Number(value || 0);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function key(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function isExcludedIncome(productCode) {
  return ["KOMISYON", "GD0187", "GD0079", "PDI"].includes(key(productCode));
}

function normalizeDepot(value) {
  const normalized = key(value);
  if (!normalized) return { code: "—", name: "Belirsiz" };
  if (normalized === "MRK" || normalized.includes("MERKEZ")) return { code: "MRK", name: "Merkez Depo" };
  if (normalized === "YTM" || normalized.includes("YATMARIN")) return { code: "YTM", name: "Yatmarin Depo" };
  return { code: String(value).trim(), name: String(value).trim() };
}

function resolveAttribution(economic, evidenceRows, actorEvents, identities) {
  const resolved = resolveCommercialOwnership({
    economic,
    lineage: evidenceRows,
    actorEvents,
    identities,
  });
  const sourceOrder = resolved.evidenceDocuments.find((row) => (
    number(row.documentType) === 14 && row.documentNo === resolved.sourceOrderNo
  ));
  const hasTestAncestor = resolved.evidenceDocuments.some((row) => (
    isExcludedTestDocument(row)
  ));
  const batchRisk = Boolean(economic.prepaidBatchRisk)
    || resolved.evidenceDocuments.some((row) => (
      number(row.documentType) === 91 && number(economic.documentType) === 85
    ));

  return {
    department: resolved.department,
    departmentName: DEPARTMENT_META[resolved.department].name,
    ownerCode: resolved.ownerCode,
    ownerName: resolved.ownerName,
    ownerActive: resolved.ownerActive,
    ownerLocation: resolved.ownerLocation,
    method: resolved.method,
    status: resolved.confidence,
    confidence: resolved.confidence,
    explicitDepartment: resolved.method === "macro-source-order",
    explicitOwner: ["macro-source-order", "supported-source-seller"].includes(resolved.method),
    sourceOrderNo: resolved.sourceOrderNo,
    sourceOrderDepth: sourceOrder ? number(sourceOrder.depth) : null,
    candidateDocumentNo: economic.candidateAttributionDocumentNo || null,
    candidateDocumentType: economic.candidateAttributionDocumentType || null,
    candidateField: economic.candidateAttributionField || null,
    fulfillmentDepot: {
      code: resolved.fulfillmentDepotCode || "—",
      name: resolved.fulfillmentDepotName,
    },
    crossDepot: resolved.crossDepot,
    hasTestAncestor,
    batchRisk,
    evidenceDocuments: resolved.evidenceDocuments,
    actorEvents: resolved.actorEvents,
    ownershipEvidence: resolved.evidence,
  };
}

function ledgerAttribution(economic) {
  const department = ["service", "parts"].includes(economic.department)
    ? economic.department
    : "review";
  const evidenceDocuments = Array.isArray(economic.evidenceDocuments)
    ? economic.evidenceDocuments.map((row) => ({ ...row }))
    : [];
  const actorEvents = Array.isArray(economic.actorEvents)
    ? economic.actorEvents.map((row) => ({ ...row }))
    : [];
  const sourceOrder = evidenceDocuments.find((row) => (
    number(row.documentType) === 14 && row.documentNo === economic.sourceOrderNo
  ));
  return {
    department,
    departmentName: DEPARTMENT_META[department].name,
    ownerCode: economic.commercialOwner || null,
    ownerName: economic.commercialOwnerName || "Belirsiz",
    ownerActive: economic.ownerActive ?? null,
    ownerLocation: economic.ownerLocation || "Belirsiz",
    method: economic.attributionMethod || "review",
    status: economic.attributionConfidence || "review",
    confidence: economic.attributionConfidence || "review",
    explicitDepartment: economic.attributionMethod === "macro-source-order",
    explicitOwner: ["macro-source-order", "supported-source-seller"].includes(
      economic.attributionMethod,
    ),
    sourceOrderNo: economic.sourceOrderNo || null,
    sourceOrderDepth: sourceOrder ? number(sourceOrder.depth) : null,
    candidateDocumentNo: economic.candidateDocumentNo || null,
    candidateDocumentType: economic.candidateDocumentType || null,
    candidateField: economic.candidateField || null,
    fulfillmentDepot: {
      code: economic.fulfillmentDepotCode || "—",
      name: economic.fulfillmentDepotName || normalizeDepot(
        economic.fulfillmentDepotCode,
      ).name,
    },
    crossDepot: Boolean(economic.crossDepot),
    hasTestAncestor: false,
    batchRisk: Boolean(economic.prepaidBatchRisk || economic.batchRisk),
    evidenceDocuments,
    actorEvents,
    ownershipEvidence: economic.ownershipEvidence
      ? { ...economic.ownershipEvidence }
      : {},
  };
}

function emptyMetrics(id, name) {
  return {
    id, name, grossSales: 0, returns: 0, discounts: 0, netSales: 0,
    cost: 0, uncoveredNetSales: 0, profit: 0, margin: 0,
    lineCount: 0, coveredLines: 0, documentCount: 0, customerCount: 0,
    crossDepotSales: 0, crossDepotDocuments: 0, confirmedSales: 0,
    inferredSales: 0, reviewSales: 0, costCoveragePct: 0,
    documents: new Set(), customers: new Set(), crossDepotDocumentKeys: new Set(),
  };
}

function addMetric(target, row) {
  target.grossSales += row.grossSales;
  target.returns += row.returns;
  target.discounts += row.discounts;
  target.netSales += row.netSales;
  target.cost += row.cost;
  target.uncoveredNetSales += row.uncoveredNetSales;
  target.lineCount += 1;
  target.coveredLines += row.costCovered ? 1 : 0;
  target.documents.add(row.documentKey);
  if (row.customerCode) target.customers.add(row.customerCode);
  if (row.crossDepot) {
    target.crossDepotSales += row.netSales;
    target.crossDepotDocumentKeys.add(row.documentKey);
  }
  if (row.attributionStatus === "confirmed") target.confirmedSales += row.netSales;
  else if (row.attributionStatus === "inferred") target.inferredSales += row.netSales;
  else target.reviewSales += row.netSales;
}

function finalizeMetric(metric) {
  const profit = metric.netSales - metric.cost - metric.uncoveredNetSales;
  return {
    ...metric,
    documentCount: metric.documents.size,
    customerCount: metric.customers.size,
    crossDepotDocuments: metric.crossDepotDocumentKeys.size,
    profit,
    margin: metric.netSales ? profit / metric.netSales * 100 : 0,
    costCoveragePct: metric.lineCount ? metric.coveredLines / metric.lineCount * 100 : 0,
    documents: undefined,
    customers: undefined,
    crossDepotDocumentKeys: undefined,
  };
}

function configuredRate(productCode, rates) {
  const code = key(productCode);
  if (code === key("İŞÇİLİK")) return number(rates.labor ?? 0) / 100;
  if (code === "SRF" || code === "BARNACLE") return number(rates.srf ?? 100) / 100;
  if (code === "TSR") return number(rates.tsr ?? 100) / 100;
  if (code === "YOL") return number(rates.road ?? 100) / 100;
  return null;
}

function configuredCostMethod(productCode) {
  const code = key(productCode);
  if (code === key("İŞÇİLİK")) return "configuredLabor";
  if (code === "SRF" || code === "BARNACLE") return "configuredSrf";
  if (code === "TSR") return "configuredTsr";
  if (code === "YOL") return "configuredRoad";
  return null;
}

function topGroups(rows, selector, limit = 8) {
  const grouped = new Map();
  for (const row of rows) {
    const selected = selector(row);
    if (!selected?.id) continue;
    const item = grouped.get(selected.id) || { ...selected, netSales: 0, profit: 0, documentKeys: new Set(), crossDepotSales: 0 };
    item.netSales += row.netSales;
    item.profit += row.profit;
    item.crossDepotSales += row.crossDepot ? row.netSales : 0;
    item.documentKeys.add(row.documentKey);
    grouped.set(selected.id, item);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, documentCount: item.documentKeys.size, documentKeys: undefined }))
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, limit);
}

export function buildDepartmentAnalysis({
  ledger = null, economics = [], lineage = [], actorEvents = [], pilotOrders = [], identities = {}, year,
  pilotCardCostRates = {}, costOverrides = [], requireApproval = true,
}) {
  const usesLedger = Boolean(ledger && Array.isArray(ledger.rows));
  const economicRows = usesLedger
    ? ledger.rows.filter((row) => !isExcludedIncome(row.productCode))
    : economics;
  const sourcePilotOrders = usesLedger ? ledger.pilotOrders || [] : pilotOrders;
  const lineageByRoot = new Map();
  for (const row of lineage) {
    const rootId = String(row.rootId);
    if (!lineageByRoot.has(rootId)) lineageByRoot.set(rootId, []);
    lineageByRoot.get(rootId).push(row);
  }
  const overrides = new Map(costOverrides
    .filter((item) => !requireApproval || item.status === "approved")
    .map((item) => [String(item.rowId), item]));
  let excludedTestLines = usesLedger ? number(ledger.quality?.excludedTestRows) : 0;
  const excludedTestRows = usesLedger
    ? (ledger.excludedTestRows || []).map((row) => ({ ...row }))
    : [];
  const normalized = [];

  for (const economic of economicRows) {
    const rootId = String(economic.rootId);
    const evidenceRows = lineageByRoot.get(rootId) || [];
    if (!usesLedger) {
      const exclusionAudit = excludedTestAudit(economic, evidenceRows);
      if (exclusionAudit) {
        excludedTestLines += 1;
        excludedTestRows.push(exclusionAudit);
        continue;
      }
    }
    const attribution = usesLedger
      ? ledgerAttribution(economic)
      : resolveAttribution(economic, evidenceRows, actorEvents, identities);
    const netSales = number(economic.signedNetSales);
    const override = overrides.get(rootId);
    const rate = configuredRate(economic.productCode, pilotCardCostRates);
    const evidenceCost = usesLedger
      ? nullableNumber(economic.lineCost)
      : nullableNumber(economic.resolvedCost);
    const cost = override
      ? number(economic.quantity) * number(override.unitCost) * (economic.isSale ? 1 : -1)
      : rate == null
        ? number(evidenceCost)
        : netSales * rate;
    const costCovered = Boolean(override || rate != null || evidenceCost != null);
    const uncoveredNetSales = costCovered ? 0 : netSales;
    const documentKey = `${economic.documentType}|${economic.documentNo}|${economic.customerCode}`;
    normalized.push({
      id: rootId,
      documentKey,
      documentType: number(economic.documentType),
      documentNo: economic.documentNo,
      documentDate: economic.documentDate,
      month: new Date(economic.documentDate).getMonth() + 1,
      customerCode: economic.customerCode,
      customerName: economic.customerName || economic.customerCode || "Belirsiz",
      productCode: economic.productCode,
      productName: economic.productName || economic.productCode || "Belirsiz",
      brandName: economic.brandName || "—",
      quantity: number(economic.quantity),
      grossSales: usesLedger && economic.isSale
        ? number(economic.grossAmount)
        : number(economic.grossSales),
      returns: usesLedger && !economic.isSale
        ? number(economic.netAmount)
        : number(economic.returns),
      discounts: usesLedger && economic.isSale
        ? number(economic.discountAmount)
        : number(economic.discounts),
      netSales,
      cost,
      uncoveredNetSales,
      profit: netSales - cost - uncoveredNetSales,
      costCovered,
      costMethod: override
        ? "manualDecision"
        : configuredCostMethod(economic.productCode) || economic.costMethod,
      revenueSource: economic.revenueSource || (economic.isSale ? "invoice" : "return"),
      department: attribution.department,
      departmentName: attribution.departmentName,
      commercialOwner: attribution.ownerCode,
      commercialOwnerName: attribution.ownerName,
      ownerActive: attribution.ownerActive,
      ownerLocation: attribution.ownerLocation,
      attributionMethod: attribution.method,
      attributionStatus: attribution.status,
      attributionConfidence: attribution.confidence,
      explicitDepartment: attribution.explicitDepartment,
      explicitOwner: attribution.explicitOwner,
      sourceOrderNo: attribution.sourceOrderNo,
      sourceOrderDepth: attribution.sourceOrderDepth,
      candidateDocumentNo: attribution.candidateDocumentNo,
      candidateDocumentType: attribution.candidateDocumentType,
      candidateField: attribution.candidateField,
      fulfillmentDepotCode: attribution.fulfillmentDepot.code,
      fulfillmentDepotName: attribution.fulfillmentDepot.name,
      crossDepot: attribution.crossDepot,
      batchRisk: attribution.batchRisk,
      evidenceDocuments: attribution.evidenceDocuments,
      actorEvents: attribution.actorEvents,
      ownershipEvidence: attribution.ownershipEvidence,
    });
  }

  const departmentMetrics = new Map([
    ["service", emptyMetrics("service", DEPARTMENT_META.service.name)],
    ["parts", emptyMetrics("parts", DEPARTMENT_META.parts.name)],
    ["review", emptyMetrics("review", DEPARTMENT_META.review.name)],
  ]);
  const monthMetrics = new Map();
  for (let month = 1; month <= 12; month += 1) {
    monthMetrics.set(month, {
      month, monthName: MONTH_NAMES[month - 1],
      service: emptyMetrics("service", DEPARTMENT_META.service.name),
      parts: emptyMetrics("parts", DEPARTMENT_META.parts.name),
      review: emptyMetrics("review", DEPARTMENT_META.review.name),
    });
  }
  for (const row of normalized) {
    addMetric(departmentMetrics.get(row.department), row);
    addMetric(monthMetrics.get(row.month)[row.department], row);
  }

  const departments = [...departmentMetrics.values()].map(finalizeMetric);
  const months = [...monthMetrics.values()].map((item) => ({
    month: item.month,
    monthName: item.monthName,
    service: finalizeMetric(item.service),
    parts: finalizeMetric(item.parts),
    review: finalizeMetric(item.review),
  }));
  const total = finalizeMetric(normalized.reduce((metric, row) => {
    addMetric(metric, row);
    return metric;
  }, emptyMetrics("all", "Toplam")));
  const confirmedAmount = normalized.filter((row) => row.attributionStatus === "confirmed").reduce((sum, row) => sum + row.netSales, 0);
  const inferredAmount = normalized.filter((row) => row.attributionStatus === "inferred").reduce((sum, row) => sum + row.netSales, 0);
  const explicitDepartmentAmount = normalized.filter((row) => row.explicitDepartment).reduce((sum, row) => sum + row.netSales, 0);
  const explicitOwnerAmount = normalized.filter((row) => row.explicitOwner).reduce((sum, row) => sum + row.netSales, 0);
  const sourceOrderAmount = normalized.filter((row) => row.sourceOrderNo).reduce((sum, row) => sum + row.netSales, 0);
  const batchRiskAmount = normalized.filter((row) => row.batchRisk).reduce((sum, row) => sum + row.netSales, 0);
  const reviewAmount = normalized.filter((row) => row.attributionStatus === "review").reduce((sum, row) => sum + row.netSales, 0);
  const hintedReviewAmount = normalized.filter((row) => row.attributionMethod === "b2b-candidate-hint").reduce((sum, row) => sum + row.netSales, 0);
  const realPilotOrders = sourcePilotOrders
    .filter((row) => !isExcludedTestDocument(row))
    .map((row) => {
      const attribution = resolveCommercialOwnership({
        economic: row,
        lineage: [row],
        actorEvents,
        identities,
      });
      const department = attribution.department;
      return {
        documentNo: row.documentNo,
        documentDate: row.documentDate,
        customerCode: row.customerCode,
        ownerCode: attribution.ownerCode,
        ownerName: attribution.ownerName,
        department,
        departmentName: DEPARTMENT_META[department].name,
        depot: normalizeDepot(row.depotCode),
        lineCount: number(row.lineCount),
        status: attribution.confidence === "confirmed" ? "ready" : "review",
      };
    });

  return {
    year,
    departments,
    months,
    totals: total,
    quality: {
      ...(usesLedger ? ledger.quality || {} : {}),
      attributionCoveragePct: total.netSales ? confirmedAmount / total.netSales * 100 : 0,
      inferredCoveragePct: total.netSales ? inferredAmount / total.netSales * 100 : 0,
      inferredAmount,
      explicitDepartmentCoveragePct: total.netSales ? explicitDepartmentAmount / total.netSales * 100 : 0,
      explicitOwnerCoveragePct: total.netSales ? explicitOwnerAmount / total.netSales * 100 : 0,
      sourceOrderCoveragePct: total.netSales ? sourceOrderAmount / total.netSales * 100 : 0,
      reviewAmount,
      unassignedReviewAmount: departments.find((item) => item.id === "review")?.netSales || 0,
      hintedReviewAmount,
      batchRiskAmount,
      excludedTestLines,
      testDocuments: [...TEST_DOCUMENTS],
      firstRealPilotDetected: realPilotOrders.length > 0,
    },
    topOwners: topGroups(normalized.filter((row) => row.attributionStatus !== "review" && !row.batchRisk), (row) => ({
      id: row.commercialOwner || row.commercialOwnerName,
      name: row.commercialOwnerName,
      code: row.commercialOwner,
      department: row.department,
      departmentName: row.departmentName,
      active: row.ownerActive,
      location: row.ownerLocation,
    }), 10),
    topProducts: topGroups(normalized, (row) => ({ id: row.productCode, name: row.productName, code: row.productCode, brand: row.brandName }), 10),
    topCustomers: topGroups(normalized, (row) => ({ id: row.customerCode, name: row.customerName, code: row.customerCode }), 10),
    depotMatrix: ["service", "parts", "review"].flatMap((department) => ["MRK", "YTM", "—"].map((depot) => {
      const rows = normalized.filter((row) => row.department === department && row.fulfillmentDepotCode === depot);
      return {
        department,
        departmentName: DEPARTMENT_META[department].name,
        depot,
        depotName: normalizeDepot(depot).name,
        netSales: rows.reduce((sum, row) => sum + row.netSales, 0),
        documentCount: new Set(rows.map((row) => row.documentKey)).size,
      };
    })),
    detailRows: normalized
      .slice()
      .sort((a, b) => new Date(b.documentDate) - new Date(a.documentDate) || b.netSales - a.netSales)
      .slice(0, 500),
    excludedTestRows: excludedTestRows.map((row) => ({
      ...row,
      economicDocument: row.economicDocument ? { ...row.economicDocument } : null,
      matchedDocument: row.matchedDocument ? { ...row.matchedDocument } : null,
      matchedDocuments: Array.isArray(row.matchedDocuments)
        ? row.matchedDocuments.map((item) => ({ ...item }))
        : [],
    })),
    quarantinedRows: usesLedger
      ? (ledger.quarantinedRows || []).map((row) => ({ ...row }))
      : [],
    reviewRequiredRows: usesLedger
      ? (ledger.reviewRequiredRows || []).map((row) => ({ ...row }))
      : [],
    pilotOrders: realPilotOrders.slice(0, 20),
  };
}
