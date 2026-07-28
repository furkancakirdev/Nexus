import { resolveCommercialOwnership } from "./ownershipResolver.mjs";
import {
  excludedTestAudit,
  isExcludedTestDocument,
} from "./testDocumentRegistry.mjs";

export const FINAL_SALE_TYPES = new Set([17, 85, 91]);
export const FINAL_RETURN_TYPES = new Set([18]);

const LINEAGE_DOCUMENT_TYPES = new Set([13, 14, 15, 17, 18, 64, 85, 91]);
const TERMINAL_CONSUMPTION_LINEAGE_TYPE_VALUES = Object.freeze([13, 14, 15, 17, 64, 85, 91]);
const TERMINAL_CONSUMPTION_LINEAGE_TYPES = new Set(TERMINAL_CONSUMPTION_LINEAGE_TYPE_VALUES);
const FINANCIAL_FIELDS = [
  "quantity",
  "grossAmount",
  "discountAmount",
  "netAmount",
  "vatAmount",
  "invoiceTotalInclVat",
];
const FINAL_PURCHASE_TYPES = new Set([9, 609]);
const PURCHASE_EVIDENCE_FIELDS = [
  "purchaseType",
  "purchaseNo",
  "purchaseDate",
  "purchaseAccountCode",
  "purchasePartyName",
  "purchaseQuantity",
  "purchaseGrossAmount",
  "purchaseDiscountAmount",
  "purchaseNetAmount",
  "purchaseVatAmount",
  "purchaseEffectiveDiscountPct",
  "purchaseDocumentLineCount",
  "purchaseRemainingQuantity",
  "unitCost",
];

/**
 * @typedef {Object} CpmEconomicRow
 * @property {number|string} documentType
 * @property {string} documentNo
 * @property {string|number} [rootId]
 * @property {string} [customerCode]
 * @property {number|string} [lineNo]
 * @property {string} [productCode]
 * @property {number|string} [quantity]
 * @property {number|string} [grossAmount]
 * @property {number|string} [discountAmount]
 * @property {number|string} [netAmount]
 * @property {number|string} [vatAmount]
 * @property {number|string} [invoiceTotalInclVat]
 * @property {number|string} [sourceDocumentType]
 * @property {string} [sourceDocumentNo]
 * @property {string} [sourceCustomerCode]
 * @property {number|string} [sourceLineNo]
 * @property {string} [candidateAttributionActor]
 * @property {number|string} [candidateAttributionDocumentType]
 * @property {string} [candidateAttributionDocumentNo]
 * @property {string|Date} [candidateAttributionDocumentDate]
 * @property {string} [candidateAttributionField]
 */

/**
 * @typedef {Object} CpmPurchaseRow
 * @property {number|string} documentType
 * @property {string} documentNo
 * @property {string|Date} documentDate
 * @property {string} productCode
 * @property {number|string} quantity
 * @property {number|string} grossAmount
 * @property {number|string} discountAmount
 * @property {number|string} [netAmount]
 * @property {number|string} vatAmount
 * @property {number|string} documentLineCount
 * @property {boolean|number} active
 */

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function documentKey(documentType, documentNo, customerCode = "", lineNo = "") {
  return `${Number(documentType)}|${text(documentNo)}|${text(customerCode)}|${text(lineNo)}`;
}

function documentScopeKey(documentType, documentNo, customerCode = "") {
  return `${Number(documentType)}|${text(documentNo)}|${text(customerCode)}`;
}

function rowKey(row) {
  return documentKey(row.documentType, row.documentNo, row.customerCode, row.lineNo);
}

function sourceKey(row) {
  const sourceType = Number(row.sourceDocumentType);
  const sourceNo = text(row.sourceDocumentNo);
  if (!LINEAGE_DOCUMENT_TYPES.has(sourceType) || !sourceNo) return null;
  return documentKey(
    sourceType,
    sourceNo,
    row.sourceCustomerCode || row.customerCode,
    row.sourceLineNo,
  );
}

function rowDocumentScopeKey(row) {
  return documentScopeKey(row.documentType, row.documentNo, row.customerCode);
}

function sourceDocumentScopeKey(row) {
  const sourceType = Number(row.sourceDocumentType);
  const sourceNo = text(row.sourceDocumentNo);
  if (!LINEAGE_DOCUMENT_TYPES.has(sourceType) || !sourceNo) return null;
  return documentScopeKey(
    sourceType,
    sourceNo,
    text(row.sourceCustomerCode) || text(row.customerCode),
  );
}

function isValidEconomicRow(row) {
  return row && Number.isInteger(Number(row.documentType)) && text(row.documentNo) !== "";
}

function isAbsent(value) {
  return value === null || value === undefined;
}

function finiteNumber(value) {
  if (isAbsent(value) || (typeof value === "string" && value.trim() === "")) return null;
  try {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateFinancialRow(row) {
  const invalidFields = [];
  const values = {};

  const quantity = finiteNumber(row.quantity);
  if (quantity === null || quantity <= 0) invalidFields.push("quantity");
  else values.quantity = quantity;

  for (const field of ["grossAmount", "discountAmount", "vatAmount"]) {
    const parsed = finiteNumber(row[field]);
    if (parsed === null) invalidFields.push(field);
    else values[field] = parsed;
  }

  if (isAbsent(row.netAmount)) {
    if (values.grossAmount !== undefined && values.discountAmount !== undefined) {
      values.netAmount = values.grossAmount - values.discountAmount;
    } else {
      invalidFields.push("netAmount");
    }
  } else {
    const parsed = finiteNumber(row.netAmount);
    if (parsed === null) invalidFields.push("netAmount");
    else values.netAmount = parsed;
  }

  if (isAbsent(row.invoiceTotalInclVat)) {
    if (values.netAmount !== undefined && values.vatAmount !== undefined) {
      values.invoiceTotalInclVat = values.netAmount + values.vatAmount;
    } else {
      invalidFields.push("invoiceTotalInclVat");
    }
  } else {
    const parsed = finiteNumber(row.invoiceTotalInclVat);
    if (parsed === null) invalidFields.push("invoiceTotalInclVat");
    else values.invoiceTotalInclVat = parsed;
  }

  return {
    valid: invalidFields.length === 0,
    invalidFields,
    row: { ...row, ...values },
  };
}

function buildLineageGraph(economics, lineage) {
  const descendants = new Map();
  const ancestors = new Map();
  const types = new Map();
  const rowsByKey = new Map();

  const remember = (row) => {
    if (!row || !Number.isInteger(Number(row.documentType)) || !text(row.documentNo)) return;
    const key = rowKey(row);
    types.set(key, Number(row.documentType));
    if (!rowsByKey.has(key)) rowsByKey.set(key, []);
    const identity = text(row.rootId ?? row.lineageId);
    if (!rowsByKey.get(key).some((candidate) => identity
      ? text(candidate.rootId ?? candidate.lineageId) === identity
      : candidate === row)) rowsByKey.get(key).push(row);
  };

  const connect = (row) => {
    remember(row);
    const parent = sourceKey(row);
    if (!parent) return;
    types.set(parent, Number(row.sourceDocumentType));
    const child = rowKey(row);
    if (!descendants.has(parent)) descendants.set(parent, new Set());
    if (!ancestors.has(child)) ancestors.set(child, new Set());
    descendants.get(parent).add(child);
    ancestors.get(child).add(parent);
  };

  for (const row of economics) connect(row);
  for (const row of lineage) connect(row);
  return { descendants, ancestors, types, rowsByKey };
}

function findConnectedDocument(startKey, adjacency, types, acceptedTypes) {
  const queue = [...(adjacency.get(startKey) || [])];
  const visited = new Set([startKey]);
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    if (acceptedTypes.has(types.get(current))) return current;
    queue.push(...(adjacency.get(current) || []));
  }
  return null;
}

function findConnectedDocuments(startKey, adjacency, types, acceptedTypes) {
  const matches = new Set();
  const queue = [...(adjacency.get(startKey) || [])];
  const visited = new Set([startKey]);
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    if (acceptedTypes.has(types.get(current))) matches.add(current);
    queue.push(...(adjacency.get(current) || []));
  }
  return matches;
}

function addMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function buildDocumentScopeEvidence(evidenceRows, lineageRows) {
  const allRows = [...evidenceRows, ...lineageRows];
  const actualLineKeys = new Set();
  const rowsByLineKey = new Map();
  const documentChildren = new Map();
  const ambiguousChildren = new Map();

  for (const row of allRows) {
    if (!row || !Number.isInteger(Number(row.documentType)) || !text(row.documentNo)) continue;
    const key = rowKey(row);
    actualLineKeys.add(key);
    if (!rowsByLineKey.has(key)) rowsByLineKey.set(key, row);
  }

  for (const row of allRows) {
    const sourceDocument = sourceDocumentScopeKey(row);
    if (!sourceDocument) continue;
    const childKey = rowKey(row);
    addMapSet(documentChildren, sourceDocument, childKey);
    const parentKey = sourceKey(row);
    const hasSafeLineEdge = text(row.sourceLineNo) !== ""
      && text(row.lineNo) !== ""
      && parentKey
      && actualLineKeys.has(parentKey);
    if (!hasSafeLineEdge) addMapSet(ambiguousChildren, sourceDocument, childKey);
  }

  return { rowsByLineKey, documentChildren, ambiguousChildren };
}

function findFinalEvidence(groupRows, lineGraph, documentEvidence) {
  const exactFinalKeys = new Set();
  const ambiguousFinalKeys = new Set();
  const queue = groupRows.map((row) => ({ key: rowKey(row), ambiguous: false }));
  const visited = new Set();

  while (queue.length) {
    const state = queue.shift();
    const visitKey = `${state.key}|${state.ambiguous ? 1 : 0}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    if ([17, 85].includes(lineGraph.types.get(state.key))) {
      (state.ambiguous ? ambiguousFinalKeys : exactFinalKeys).add(state.key);
      continue;
    }

    for (const child of lineGraph.descendants.get(state.key) || []) {
      queue.push({ key: child, ambiguous: state.ambiguous });
    }

    const currentDocument = state.key.split("|").slice(0, 3).join("|");
    for (const child of documentEvidence.ambiguousChildren.get(currentDocument) || []) {
      queue.push({ key: child, ambiguous: true });
    }

    const currentRow = documentEvidence.rowsByLineKey.get(state.key);
    if (state.ambiguous && !text(currentRow?.lineNo)) {
      for (const child of documentEvidence.documentChildren.get(currentDocument) || []) {
        queue.push({ key: child, ambiguous: true });
      }
    }
  }

  return { exactFinalKeys, ambiguousFinalKeys };
}

function auditLine(row) {
  return {
    rootId: row?.rootId ?? row?.lineageId ?? null,
    documentNo: text(row?.documentNo),
    lineNo: row?.lineNo ?? null,
    productCode: text(row?.productCode),
    quantity: finiteNumber(row?.quantity),
    netAmount: finiteNumber(row?.netAmount),
  };
}

function reconciliationKey(row) {
  const productCode = text(row?.productCode);
  const quantity = finiteNumber(row?.quantity);
  const netAmount = finiteNumber(row?.netAmount);
  if (!productCode || quantity === null || netAmount === null) return null;
  return `${productCode}|${quantity}|${netAmount}`;
}

function sumFinite(items, field) {
  return items.reduce((total, item) => {
    const value = finiteNumber(item?.[field]);
    return value === null ? total : total + value;
  }, 0);
}

function dateValue(value) {
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?(Z|[+-]\d{2}:\d{2})?)?$/,
  );
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zoneText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() !== month - 1
    || calendarCheck.getUTCDate() !== day) return null;
  if (hourText !== undefined && (Number(hourText) > 23 || Number(minuteText) > 59
    || Number(secondText || 0) > 59)) return null;
  const deterministic = hourText === undefined
    ? `${normalized}T00:00:00.000Z`
    : (zoneText ? normalized : `${normalized}Z`);
  const parsed = new Date(deterministic).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function oneYearBefore(value) {
  const timestamp = dateValue(value);
  if (timestamp === null) return null;
  const parsed = new Date(timestamp);
  const originalMonth = parsed.getUTCMonth();
  parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
  if (parsed.getUTCMonth() !== originalMonth) parsed.setUTCDate(0);
  return parsed.getTime();
}

function purchaseValue(row, purchaseName, rowName, usesPurchaseSchema) {
  return usesPurchaseSchema ? row?.[purchaseName] : row?.[rowName];
}

function normalizePurchaseCandidate(row) {
  const usesPurchaseSchema = ["purchaseType", "purchaseNo", "purchaseDate"]
    .some((field) => Object.hasOwn(row || {}, field));
  const value = (purchaseName, rowName) => purchaseValue(
    row,
    purchaseName,
    rowName,
    usesPurchaseSchema,
  );
  const quantity = finiteNumber(value("purchaseQuantity", "quantity"));
  const grossAmount = finiteNumber(value("purchaseGrossAmount", "grossAmount"));
  const discountAmount = finiteNumber(value("purchaseDiscountAmount", "discountAmount"));
  const reportedNetAmount = value("purchaseNetAmount", "netAmount");
  const hasReportedNet = !isAbsent(reportedNetAmount)
    && !(typeof reportedNetAmount === "string" && reportedNetAmount.trim() === "");
  const suppliedNetAmount = finiteNumber(reportedNetAmount);
  const netAmount = grossAmount !== null && discountAmount !== null
    ? grossAmount - discountAmount
    : null;
  const reportedDiscountPct = value("purchaseEffectiveDiscountPct", "effectiveDiscountPct");
  const hasReportedDiscountPct = !isAbsent(reportedDiscountPct)
    && !(typeof reportedDiscountPct === "string" && reportedDiscountPct.trim() === "");
  const suppliedDiscountPct = finiteNumber(reportedDiscountPct);
  const effectiveDiscountPct = grossAmount !== null && grossAmount !== 0 && discountAmount !== null
    ? (100 * discountAmount) / grossAmount
    : 0;
  const inconsistentNet = hasReportedNet && (suppliedNetAmount === null || netAmount === null
    || Math.abs(suppliedNetAmount - netAmount) > 0.01);
  const inconsistentDiscountPct = hasReportedDiscountPct && (suppliedDiscountPct === null
    || Math.abs(suppliedDiscountPct - effectiveDiscountPct) > 0.01);

  return {
    source: row,
    purchaseType: Number(value("purchaseType", "documentType")),
    purchaseNo: text(value("purchaseNo", "documentNo")),
    purchaseDate: value("purchaseDate", "documentDate") ?? null,
    purchaseAccountCode: text(value("purchaseAccountCode", "accountCode")),
    purchasePartyName: text(value("purchasePartyName", "partyName")),
    purchaseQuantity: quantity,
    purchaseGrossAmount: grossAmount,
    purchaseDiscountAmount: discountAmount,
    purchaseNetAmount: netAmount,
    purchaseReportedNetAmount: reportedNetAmount ?? null,
    purchaseVatAmount: finiteNumber(value("purchaseVatAmount", "vatAmount")),
    purchaseEffectiveDiscountPct: effectiveDiscountPct,
    purchaseReportedDiscountPct: reportedDiscountPct ?? null,
    purchaseDocumentLineCount: finiteNumber(
      value("purchaseDocumentLineCount", "documentLineCount"),
    ),
    active: row?.active === true || Number(row?.active) === 1,
    productCode: text(row?.productCode),
    rootId: row?.rootId ?? row?.purchaseId ?? null,
    inconsistentNet,
    inconsistentDiscountPct,
  };
}

function purchaseDocumentIsReturn(candidate, returnDocuments) {
  return returnDocuments.has(candidate.purchaseNo)
    || returnDocuments.has(`${candidate.purchaseType}|${candidate.purchaseNo}`);
}

function stablePurchaseId(value) {
  const normalized = text(value).trim();
  if (/^[+-]?\d+$/.test(normalized)) {
    return { kind: 0, numeric: BigInt(normalized), text: normalized };
  }
  return { kind: 1, numeric: null, text: normalized };
}

function compareIdentity(left, right) {
  const leftId = stablePurchaseId(left.rootId);
  const rightId = stablePurchaseId(right.rootId);
  if (leftId.kind !== rightId.kind) return leftId.kind - rightId.kind;
  if (leftId.numeric !== null && rightId.numeric !== null) {
    if (leftId.numeric < rightId.numeric) return -1;
    if (leftId.numeric > rightId.numeric) return 1;
  }
  if (leftId.text < rightId.text) return -1;
  if (leftId.text > rightId.text) return 1;
  return 0;
}

function latestFirst(left, right) {
  return dateValue(right.purchaseDate) - dateValue(left.purchaseDate) || compareIdentity(right, left);
}

function earliestFirst(left, right) {
  return dateValue(left.purchaseDate) - dateValue(right.purchaseDate) || compareIdentity(left, right);
}

function isActiveMovement(row) {
  if (!Object.hasOwn(row || {}, "active")) return true;
  return row.active === true || Number(row.active) === 1;
}

function movementIdentity(row) {
  if (row?.rootId !== null && row?.rootId !== undefined && text(row.rootId)) return `root|${text(row.rootId)}`;
  return [
    Number(row?.documentType), text(row?.documentNo), text(row?.customerCode), text(row?.lineNo),
    text(row?.productCode), dateValue(row?.documentDate),
  ].join("|");
}

function terminalConsumptionRows(salesConsumption) {
  const identityRows = new Map();
  for (const movement of Array.isArray(salesConsumption) ? salesConsumption : []) {
    const type = Number(movement?.documentType);
    if (!movement || !isActiveMovement(movement) || !TERMINAL_CONSUMPTION_LINEAGE_TYPES.has(type)
      || dateValue(movement.documentDate) === null) continue;
    const identity = movementIdentity(movement);
    if (!identityRows.has(identity)) identityRows.set(identity, movement);
  }
  const evidenceRows = [...identityRows.values()];
  const terminalRows = evidenceRows.filter((movement) => {
    const quantity = finiteNumber(movement?.quantity);
    return FINAL_SALE_TYPES.has(Number(movement?.documentType))
      && quantity !== null
      && quantity > 0;
  });
  const retailResolution = resolveRetailEconomicExclusions(
    terminalRows.filter((row) => Number(row.documentType) === 91),
    evidenceRows,
    evidenceRows,
    terminalRows,
  );
  return terminalRows.filter((row) => !retailResolution.convertedRows.has(row)
    && !retailResolution.quarantinedRows.has(row));
}

function consumedQuantity(candidate, sale, terminalSales) {
  const purchaseDate = dateValue(candidate.purchaseDate);
  const saleDate = dateValue(sale?.documentDate);
  if (purchaseDate === null || saleDate === null) return 0;
  return terminalSales.reduce((total, movement) => {
    if (text(movement.productCode) !== candidate.productCode) return total;
    const movementDate = dateValue(movement.documentDate);
    const quantity = finiteNumber(movement.quantity);
    if (movementDate === null || quantity === null || quantity <= 0
      || movementDate <= purchaseDate || movementDate >= saleDate) return total;
    return total + quantity;
  }, 0);
}

function missingPurchaseEvidence(reason = "Dogrulanabilir aktif nihai alim faturasi bulunamadi.", extras = {}) {
  return {
    costMethod: "missingPurchase",
    purchaseType: null,
    purchaseNo: null,
    purchaseDate: null,
    purchaseAccountCode: null,
    purchasePartyName: null,
    purchaseQuantity: null,
    purchaseGrossAmount: null,
    purchaseDiscountAmount: null,
    purchaseNetAmount: null,
    purchaseVatAmount: null,
    purchaseEffectiveDiscountPct: null,
    purchaseDocumentLineCount: null,
    purchaseRemainingQuantity: null,
    unitCost: null,
    costValidationReason: reason,
    ...extras,
  };
}

function selectedPurchaseEvidence(candidate, costMethod, remainingQuantity) {
  if (!candidate) return missingPurchaseEvidence();
  const reasons = {
    bulkPurchase: "Satis oncesindeki bir yilda yeterli kalan stoga sahip iskontolu toplu alim faturasi kullanildi.",
    priorPurchase: "Satis tarihinden onceki son aktif nihai alim faturasi kullanildi.",
    nextPurchase: "Onceki alim bulunamadigi icin satis tarihinden sonraki ilk aktif nihai alim faturasi kullanildi.",
  };
  return {
    costMethod,
    purchaseType: candidate.purchaseType,
    purchaseNo: candidate.purchaseNo,
    purchaseDate: candidate.purchaseDate,
    purchaseAccountCode: candidate.purchaseAccountCode || null,
    purchasePartyName: candidate.purchasePartyName || null,
    purchaseQuantity: candidate.purchaseQuantity,
    purchaseGrossAmount: candidate.purchaseGrossAmount,
    purchaseDiscountAmount: candidate.purchaseDiscountAmount,
    purchaseNetAmount: candidate.purchaseNetAmount,
    purchaseVatAmount: candidate.purchaseVatAmount,
    purchaseEffectiveDiscountPct: candidate.purchaseEffectiveDiscountPct,
    purchaseDocumentLineCount: candidate.purchaseDocumentLineCount,
    purchaseRemainingQuantity: remainingQuantity,
    unitCost: candidate.purchaseNetAmount / candidate.purchaseQuantity,
    costValidationReason: reasons[costMethod],
  };
}

/**
 * Nihai satis icin denetlenebilir alim faturasi kanitini secer.
 * Girdi dizileri degistirilmez; CPM'e herhangi bir yazma islemi yapilmaz.
 *
 * @param {Object} input
 * @param {CpmEconomicRow} input.sale
 * @param {CpmPurchaseRow[]} [input.purchases]
 * @param {Set<string>|string[]} [input.returnDocuments]
 * @param {CpmEconomicRow[]} [input.salesConsumption]
 */
export function selectPurchaseEvidence({
  sale,
  purchases = [],
  returnDocuments = new Set(),
  salesConsumption = [],
} = {}) {
  const saleDate = dateValue(sale?.documentDate);
  const saleQuantity = finiteNumber(sale?.quantity);
  const productCode = text(sale?.productCode);
  const returnSet = returnDocuments instanceof Set
    ? new Set([...returnDocuments].map((value) => text(value)))
    : new Set((Array.isArray(returnDocuments) ? returnDocuments : []).map((value) => text(value)));
  if (saleDate === null || saleQuantity === null || saleQuantity <= 0 || !productCode) {
    return missingPurchaseEvidence("Satis tarihi, urun veya miktar bilgisi maliyet secimi icin gecersiz.");
  }

  const normalizedPurchases = (Array.isArray(purchases) ? purchases : []).map(normalizePurchaseCandidate);
  const candidateRejectionReasons = (candidate) => {
    const reasons = [];
    if (dateValue(candidate.purchaseDate) === null) reasons.push("invalid-purchase-date");
    if (candidate.purchaseQuantity === null || candidate.purchaseQuantity <= 0) {
      reasons.push("invalid-purchase-quantity");
    }
    if (candidate.purchaseGrossAmount === null) reasons.push("invalid-purchase-gross");
    if (candidate.purchaseDiscountAmount === null) reasons.push("invalid-purchase-discount");
    if (candidate.purchaseNetAmount !== null && candidate.purchaseNetAmount < 0) {
      reasons.push("invalid-purchase-net");
    }
    if (candidate.inconsistentNet) reasons.push("inconsistent-purchase-net");
    if (candidate.inconsistentDiscountPct) reasons.push("inconsistent-purchase-discount-pct");
    return reasons;
  };
  const consideredPurchases = normalizedPurchases.filter((candidate) =>
    FINAL_PURCHASE_TYPES.has(candidate.purchaseType)
      && candidate.active
      && candidate.productCode === productCode
      && candidate.purchaseNo
      && !purchaseDocumentIsReturn(candidate, returnSet));
  const purchaseRejections = new Map(consideredPurchases.map((candidate) => [
    candidate,
    candidateRejectionReasons(candidate),
  ]));
  const rejectedPurchases = consideredPurchases
    .filter((candidate) => purchaseRejections.get(candidate).length > 0)
    .map((candidate) => ({
      purchaseType: candidate.purchaseType,
      purchaseNo: candidate.purchaseNo,
      reason: purchaseRejections.get(candidate)[0],
      reasons: [...purchaseRejections.get(candidate)],
      reportedNetAmount: candidate.purchaseReportedNetAmount,
      reportedDiscountPct: candidate.purchaseReportedDiscountPct,
    }));
  const eligible = consideredPurchases.filter((candidate) =>
    purchaseRejections.get(candidate).length === 0);

  const lowerBulkDate = oneYearBefore(sale?.documentDate);
  const terminalSales = terminalConsumptionRows(salesConsumption);
  const withRemaining = eligible.map((candidate) => ({
    candidate,
    remainingQuantity: candidate.purchaseQuantity - consumedQuantity(
      candidate,
      sale,
      terminalSales,
    ),
  }));
  const bulk = withRemaining
    .filter(({ candidate, remainingQuantity }) => {
      const purchaseDate = dateValue(candidate.purchaseDate);
      return lowerBulkDate !== null
        && purchaseDate >= lowerBulkDate
        && purchaseDate <= saleDate
        && candidate.purchaseDocumentLineCount >= 10
        && candidate.purchaseEffectiveDiscountPct >= 15
        && remainingQuantity >= saleQuantity;
    })
    .sort((left, right) => latestFirst(left.candidate, right.candidate))[0];
  if (bulk) return selectedPurchaseEvidence(bulk.candidate, "bulkPurchase", bulk.remainingQuantity);

  const prior = withRemaining
    .filter(({ candidate }) => dateValue(candidate.purchaseDate) <= saleDate)
    .sort((left, right) => latestFirst(left.candidate, right.candidate))[0];
  if (prior) return selectedPurchaseEvidence(prior.candidate, "priorPurchase", prior.remainingQuantity);

  const next = withRemaining
    .filter(({ candidate }) => dateValue(candidate.purchaseDate) > saleDate)
    .sort((left, right) => earliestFirst(left.candidate, right.candidate))[0];
  return next
    ? selectedPurchaseEvidence(next.candidate, "nextPurchase", next.remainingQuantity)
    : missingPurchaseEvidence(
      rejectedPurchases.length
        ? (rejectedPurchases.every((candidate) => candidate.reasons.every((reason) =>
          ["inconsistent-purchase-net", "inconsistent-purchase-discount-pct"].includes(reason)))
          ? "Alim faturasi net tutar veya efektif iskonto kaniti tutarsiz oldugu icin karantinaya alindi."
          : "Alim faturasi kaniti gecersiz veya tutarsiz oldugu icin karantinaya alindi.")
        : undefined,
      rejectedPurchases.length ? { rejectedPurchases } : {},
    );
}

function resolveRetailEconomicExclusions(
  retailRows,
  evidenceRows,
  lineageRows = [],
  financialRows = evidenceRows,
) {
  const lineGraph = buildLineageGraph(evidenceRows, lineageRows);
  const documentEvidence = buildDocumentScopeEvidence(evidenceRows, lineageRows);
  const financialRowsByLineKey = new Map(financialRows.map((row) => [rowKey(row), row]));
  const retailGroups = new Map();

  for (const row of retailRows) {
    if (Number(row.documentType) !== 91) continue;
    const key = rowDocumentScopeKey(row);
    if (!retailGroups.has(key)) retailGroups.set(key, []);
    retailGroups.get(key).push(row);
  }

  const convertedRows = new Set();
  const reconciledRows = new Set();
  const quarantinedRows = new Set();
  const ambiguities = [];
  const reviewRequiredRows = [];
  const finalTypes = new Set([17, 85]);

  for (const groupRows of retailGroups.values()) {
    const finalEvidence = findFinalEvidence(groupRows, lineGraph, documentEvidence);
    if (finalEvidence.exactFinalKeys.size === 0 && finalEvidence.ambiguousFinalKeys.size === 0) continue;
    for (const exactFinalKey of finalEvidence.exactFinalKeys) {
      finalEvidence.ambiguousFinalKeys.delete(exactFinalKey);
    }

    let exactLinkedRetailRows = 0;
    for (const retailRow of groupRows) {
      const exactFinals = findConnectedDocuments(
        rowKey(retailRow),
        lineGraph.descendants,
        lineGraph.types,
        finalTypes,
      );
      if (exactFinals.size === 0) continue;
      convertedRows.add(retailRow);
      exactLinkedRetailRows += 1;
    }

    const unprovenRows = groupRows.filter((row) => !convertedRows.has(row));
    const ambiguousFinalRows = [...finalEvidence.ambiguousFinalKeys]
      .map((key) => financialRowsByLineKey.get(key) || documentEvidence.rowsByLineKey.get(key))
      .filter(Boolean);
    const sourceMatches = new Map();
    const finalMatches = new Map();

    // Eksik satir bagi yalniz karsilikli tekil urun, miktar ve net tutar eslesmesinde kanit sayilir.
    for (const sourceRow of unprovenRows) {
      const sourceMatchKey = reconciliationKey(sourceRow);
      if (!sourceMatchKey) continue;
      for (const finalRow of ambiguousFinalRows) {
        if (sourceMatchKey !== reconciliationKey(finalRow)) continue;
        addMapSet(sourceMatches, sourceRow, finalRow);
        addMapSet(finalMatches, finalRow, sourceRow);
      }
    }

    const reconciledFinalRows = new Set();
    for (const sourceRow of unprovenRows) {
      const candidates = sourceMatches.get(sourceRow);
      if (candidates?.size !== 1) continue;
      const [finalRow] = candidates;
      if (finalMatches.get(finalRow)?.size !== 1) continue;
      convertedRows.add(sourceRow);
      reconciledRows.add(sourceRow);
      reconciledFinalRows.add(finalRow);
    }

    const unresolvedFinalRows = ambiguousFinalRows.filter((row) => !reconciledFinalRows.has(row));
    if (unresolvedFinalRows.length === 0) continue;

    const affectedSourceRows = groupRows.filter((row) => !convertedRows.has(row));
    for (const sourceRow of affectedSourceRows) quarantinedRows.add(sourceRow);
    if (affectedSourceRows.length === 0) continue;

    const firstRetail = groupRows[0];
    const sourceDetails = affectedSourceRows.map(auditLine);
    const finalDetails = unresolvedFinalRows.map(auditLine);
    const ambiguity = {
      documentNo: text(firstRetail.documentNo),
      customerCode: text(firstRetail.customerCode),
      retailLineCount: groupRows.length,
      exactLinkedRetailRows,
      safelyReconciledRetailRows: [...reconciledRows].filter((row) => groupRows.includes(row)).length,
      quarantinedRetailRows: affectedSourceRows.length,
      retainedRetailRows: 0,
      method: "review-required-quarantine",
      matchReason: "document-descendant-without-safe-line-mapping",
      reconciliationReason: "no-unique-product-quantity-net-match",
      confirmedFinalAmount: sumFinite(finalDetails, "netAmount"),
      quarantinedSourceAmount: sumFinite(sourceDetails, "netAmount"),
      sourceRows: sourceDetails,
      connectedFinalRows: finalDetails,
    };
    ambiguities.push(ambiguity);
    for (const sourceRow of sourceDetails) {
      reviewRequiredRows.push({
        ...sourceRow,
        reviewStatus: "required",
        quarantineReason: "ambiguous-retail-lineage",
        matchReason: ambiguity.matchReason,
        reconciliationReason: ambiguity.reconciliationReason,
        connectedFinalRows: finalDetails.map((row) => ({ ...row })),
      });
    }
  }

  return { convertedRows, reconciledRows, quarantinedRows, ambiguities, reviewRequiredRows };
}

function documentNoFromKey(key) {
  return key ? key.split("|")[1] || null : null;
}

function normalizeEmbeddedPurchaseEvidence(row) {
  const candidate = normalizePurchaseCandidate({ ...row, active: true });
  const unitCost = candidate.purchaseQuantity > 0 && candidate.purchaseNetAmount !== null
    ? candidate.purchaseNetAmount / candidate.purchaseQuantity
    : null;
  if (!FINAL_PURCHASE_TYPES.has(candidate.purchaseType) || !candidate.purchaseNo || unitCost === null
    || candidate.purchaseGrossAmount === null || candidate.purchaseDiscountAmount === null
    || candidate.inconsistentNet || candidate.inconsistentDiscountPct) {
    const reason = candidate.inconsistentNet || candidate.inconsistentDiscountPct
      ? "Alim faturasi tutar kaniti tutarsiz oldugu icin karantinaya alindi."
      : row?.costValidationReason;
    return missingPurchaseEvidence(reason);
  }

  const costMethod = ["bulkPurchase", "priorPurchase", "nextPurchase", "originalSaleCost"]
    .includes(row?.costMethod)
    ? row.costMethod
    : "priorPurchase";
  const evidence = selectedPurchaseEvidence(
    candidate,
    costMethod === "originalSaleCost" ? "priorPurchase" : costMethod,
    finiteNumber(row?.purchaseRemainingQuantity),
  );
  return {
    ...evidence,
    costMethod,
    unitCost,
    costValidationReason: text(row?.costValidationReason) || (
      costMethod === "originalSaleCost"
        ? "Satis iadesi, bagli nihai satis faturasinin maliyet kanitini devraldi."
        : evidence.costValidationReason
    ),
  };
}

function purchaseEvidenceFrom(row) {
  return Object.fromEntries(PURCHASE_EVIDENCE_FIELDS.map((field) => [field, row?.[field] ?? null]));
}

function originalSaleForReturn(returnRow, salesRows) {
  if (finiteNumber(returnRow.originalCandidateCount) > 1) {
    return { status: "ambiguous", sale: null };
  }
  const stableCandidates = salesRows.filter((saleRow) =>
    Number(saleRow.documentType) === Number(returnRow.originalDocumentType)
    && (!text(returnRow.originalLineNo) || text(saleRow.lineNo) === text(returnRow.originalLineNo)));
  if (text(returnRow.originalRootId)) {
    const rootMatches = stableCandidates.filter((saleRow) =>
      text(saleRow.rootId) === text(returnRow.originalRootId));
    if (rootMatches.length > 1) return { status: "ambiguous", sale: null };
    if (rootMatches.length === 1) {
      const [rootMatch] = rootMatches;
      const metadataConflict = (returnRow.originalDocumentNo
        && rootMatch.documentNo !== returnRow.originalDocumentNo)
        || (returnRow.originalCustomerCode
          && rootMatch.customerCode !== returnRow.originalCustomerCode)
        || (returnRow.productCode && rootMatch.productCode !== returnRow.productCode);
      return metadataConflict
        ? { status: "ambiguous", sale: null }
        : { status: "matched", sale: rootMatch };
    }
  }
  const expectedCustomer = returnRow.originalCustomerCode || returnRow.customerCode;
  const candidates = stableCandidates.filter((saleRow) =>
    saleRow.documentNo === returnRow.originalDocumentNo
    && (!expectedCustomer || saleRow.customerCode === expectedCustomer)
    && (!returnRow.productCode || saleRow.productCode === returnRow.productCode)
  );
  if (!text(returnRow.originalRootId) && candidates.length === 1) {
    return { status: "matched", sale: candidates[0] };
  }
  if (candidates.length > 1 || (text(returnRow.originalRootId) && candidates.length > 0)) {
    return { status: "ambiguous", sale: null };
  }
  return { status: "missing", sale: null };
}

function applyReturnCostBasis(row, salesRows) {
  if (row.isSale) return { row, quarantine: null };
  const resolution = row.originalDocumentNo
    ? originalSaleForReturn(row, salesRows)
    : { status: "missing", sale: null };
  const originalSale = resolution.sale;
  if (originalSale?.unitCost !== null && originalSale?.unitCost !== undefined) {
    const unitCost = Number(originalSale.unitCost);
    return {
      row: {
        ...row,
        ...purchaseEvidenceFrom(originalSale),
        costMethod: "originalSaleCost",
        unitCost,
        lineCost: -row.quantity * unitCost,
        costReviewStatus: "verified",
        costValidationReason: "Satis iadesi, bagli nihai satis faturasinin maliyet kanitini devraldi.",
      },
      quarantine: null,
    };
  }
  if (resolution.status === "ambiguous") {
    const quarantineReason = "ambiguous-original-sale-cost";
    return {
      row: {
        ...row,
        ...missingPurchaseEvidence("Birden fazla asil satis satiri ayni kimlikle eslesti; maliyet karantinaya alindi."),
        lineCost: null,
        costReviewStatus: "quarantined",
      },
      quarantine: {
        rootId: row.rootId,
        documentType: row.documentType,
        documentNo: row.documentNo,
        customerCode: row.customerCode,
        lineNo: row.lineNo,
        quarantineReason,
        originalDocumentType: row.originalDocumentType,
        originalDocumentNo: row.originalDocumentNo,
        originalLineNo: row.originalLineNo,
      },
    };
  }
  const stableTraceIdentity = FINAL_SALE_TYPES.has(Number(row.originalDocumentType))
    && text(row.originalRootId)
    && text(row.originalLineNo)
    && finiteNumber(row.originalQuantity) > 0;
  if (stableTraceIdentity && row.costMethod === "originalSaleCost" && row.unitCost !== null) {
    return {
      row: {
        ...row,
        lineCost: -row.quantity * row.unitCost,
        costReviewStatus: "verified-trace",
      },
      quarantine: null,
    };
  }
  return {
    row: {
      ...row,
      ...missingPurchaseEvidence(
        row.originalDocumentNo
          ? "Bagli nihai satis faturasi bulundu ancak satis tarihindeki maliyet kaniti bulunamadi."
          : "Baglantisiz satis iadesi maliyet sahipligi icin inceleme gerektiriyor.",
      ),
      lineCost: null,
      costReviewStatus: "review",
    },
    quarantine: null,
  };
}

function identityFromKey(key, graph) {
  if (!key) return null;
  const candidates = graph.rowsByKey.get(key) || [];
  const unique = candidates.length === 1 ? candidates[0] : null;
  const [typeText, documentNo, customerCode, lineNo] = key.split("|");
  return {
    documentType: Number(typeText),
    documentNo,
    customerCode,
    lineNo: unique?.lineNo ?? (lineNo || null),
    rootId: unique?.rootId ?? unique?.lineageId ?? null,
    quantity: finiteNumber(unique?.quantity),
  };
}

function originalIdentity(row, graph, isSale) {
  if (isSale) return null;
  if (FINAL_SALE_TYPES.has(Number(row.originalDocumentType)) && text(row.originalDocumentNo)) {
    return {
      documentType: Number(row.originalDocumentType),
      documentNo: text(row.originalDocumentNo),
      customerCode: text(row.originalCustomerCode || row.sourceCustomerCode || row.customerCode),
      lineNo: row.originalLineNo ?? row.sourceLineNo ?? null,
      rootId: row.originalRootId ?? null,
      quantity: finiteNumber(row.originalQuantity),
    };
  }
  const directOriginalType = Number(row.sourceDocumentType);
  const key = FINAL_SALE_TYPES.has(directOriginalType)
    ? documentKey(
      directOriginalType,
      row.sourceDocumentNo,
      row.sourceCustomerCode || row.customerCode,
      row.sourceLineNo,
    )
    : findConnectedDocument(rowKey(row), graph.ancestors, graph.types, FINAL_SALE_TYPES);
  return identityFromKey(key, graph);
}

function normalizeEconomicRow(row, graph) {
  const documentType = Number(row.documentType);
  const grossAmount = number(row.grossAmount);
  const discountAmount = number(row.discountAmount);
  const netAmount = number(row.netAmount, grossAmount - discountAmount);
  const vatAmount = number(row.vatAmount);
  const invoiceTotalInclVat = number(row.invoiceTotalInclVat, netAmount + vatAmount);
  const isSale = !FINAL_RETURN_TYPES.has(documentType);
  const original = originalIdentity(row, graph, isSale);
  const purchaseEvidence = normalizeEmbeddedPurchaseEvidence(row);
  const lineCost = purchaseEvidence.unitCost === null
    ? null
    : (isSale ? 1 : -1) * number(row.quantity) * purchaseEvidence.unitCost;

  return {
    ...row,
    ...purchaseEvidence,
    documentType,
    documentNo: text(row.documentNo),
    customerCode: text(row.customerCode),
    grossAmount,
    discountAmount,
    netAmount,
    vatAmount,
    invoiceTotalInclVat,
    isSale,
    signedNetSales: isSale ? netAmount : -netAmount,
    signedVatAmount: isSale ? vatAmount : -vatAmount,
    signedInvoiceTotalInclVat: isSale ? invoiceTotalInclVat : -invoiceTotalInclVat,
    originalDocumentType: original?.documentType ?? null,
    originalDocumentNo: original?.documentNo ?? null,
    originalInvoiceNo: original?.documentNo ?? null,
    originalCustomerCode: original?.customerCode ?? null,
    originalLineNo: original?.lineNo ?? null,
    originalRootId: original?.rootId ?? null,
    originalQuantity: original?.quantity ?? null,
    lineCost,
  };
}

function ownershipFields(ownership) {
  const evidence = ownership.evidence || {};
  return {
    commercialOwner: ownership.ownerCode,
    commercialOwnerName: ownership.ownerName,
    ownerActive: ownership.ownerActive,
    ownerLocation: ownership.ownerLocation,
    department: ownership.department,
    attributionMethod: ownership.method,
    attributionConfidence: ownership.confidence,
    sourceOrderNo: ownership.sourceOrderNo,
    evidenceDocuments: ownership.evidenceDocuments,
    actorEvents: ownership.actorEvents,
    fulfillmentDepotCode: ownership.fulfillmentDepotCode,
    fulfillmentDepotName: ownership.fulfillmentDepotName,
    crossDepot: ownership.crossDepot,
    candidateActor: evidence.candidateOwnerCode || null,
    candidateDocumentType: evidence.candidateDocumentType ?? null,
    candidateDocumentNo: evidence.candidateDocumentNo || null,
    candidateDocumentDate: evidence.candidateDocumentDate || null,
    candidateField: evidence.candidateField || null,
    ownershipEvidence: evidence,
  };
}

function linkedReturnOwnership(row, original, directOwnership) {
  if (!original) return ownershipFields(directOwnership);
  const expectedDepot = original.department === "service"
    ? "YTM"
    : original.department === "parts" ? "MRK" : null;
  return {
    commercialOwner: original.commercialOwner,
    commercialOwnerName: original.commercialOwnerName,
    ownerActive: original.ownerActive,
    ownerLocation: original.ownerLocation,
    department: original.department,
    attributionMethod: "original-sale-owner",
    attributionConfidence: original.attributionConfidence,
    sourceOrderNo: original.sourceOrderNo,
    evidenceDocuments: original.evidenceDocuments.map((item) => ({ ...item })),
    actorEvents: original.actorEvents.map((item) => ({ ...item })),
    fulfillmentDepotCode: directOwnership.fulfillmentDepotCode,
    fulfillmentDepotName: directOwnership.fulfillmentDepotName,
    crossDepot: Boolean(
      expectedDepot
      && directOwnership.fulfillmentDepotCode
      && directOwnership.fulfillmentDepotCode !== expectedDepot,
    ),
    candidateActor: original.candidateActor || null,
    candidateDocumentType: original.candidateDocumentType ?? null,
    candidateDocumentNo: original.candidateDocumentNo || null,
    candidateDocumentDate: original.candidateDocumentDate || null,
    candidateField: original.candidateField || null,
    ownershipEvidence: {
      ...original.ownershipEvidence,
      inheritedFromRootId: row.originalRootId,
      inheritedFromDocumentNo: original.documentNo,
    },
  };
}

function priorPeriodOriginalOwnership(row, lineageRows, actorEvents, identities) {
  const originalRootId = text(row.originalRootId);
  if (!originalRootId) return null;
  const original = lineageRows.find((candidate) => {
    if (text(candidate?.lineageId ?? candidate?.ancestorId) !== originalRootId) return false;
    if (Number(candidate?.documentType) !== Number(row.originalDocumentType)) return false;
    if (text(candidate?.documentNo) !== text(row.originalDocumentNo)) return false;
    if (text(row.originalCustomerCode)
      && text(candidate?.customerCode) !== text(row.originalCustomerCode)) return false;
    if (text(row.originalLineNo) && text(candidate?.lineNo) !== text(row.originalLineNo)) return false;
    return true;
  });
  if (!original) return null;

  const ownership = resolveCommercialOwnership({
    economic: { ...original, rootId: row.rootId, depth: 0 },
    lineage: lineageRows,
    actorEvents,
    identities,
  });
  if (!ownership.ownerCode) return null;
  return { ...original, ...ownershipFields(ownership) };
}

/**
 * Bir CPM satirinin ekonomik olarak nihai olup olmadigini belirler.
 * Tip 91, yalnizca 17/85 alt belgesi yoksa ekonomik satirdir.
 *
 * @param {CpmEconomicRow} row
 * @param {CpmEconomicRow[]} downstreamRows
 */
export function isTerminalEconomicRow(row, downstreamRows = []) {
  const type = Number(row?.documentType);
  if (FINAL_RETURN_TYPES.has(type) || type === 17 || type === 85) return true;
  if (type !== 91) return false;
  const retailCustomer = text(row.customerCode);
  const retailLine = text(row.lineNo);
  const directDescendants = downstreamRows.filter((candidate) => {
    const sourceCustomer = text(candidate?.sourceCustomerCode) || text(candidate?.customerCode);
    const sameCustomer = !sourceCustomer || !retailCustomer || sourceCustomer === retailCustomer;
    return [17, 85].includes(Number(candidate?.documentType))
      && Number(candidate?.sourceDocumentType) === 91
      && text(candidate?.sourceDocumentNo) === text(row.documentNo)
      && sameCustomer;
  });
  if (retailLine && directDescendants.some((candidate) => {
    const sourceLine = text(candidate.sourceLineNo);
    return sourceLine && sourceLine === retailLine;
  })) return false;
  if (retailLine && directDescendants.length > 0
    && directDescendants.every((candidate) => text(candidate.sourceLineNo) !== "")) return true;

  const evidenceRows = [row, ...downstreamRows];
  const retailRows = evidenceRows.filter((candidate) => Number(candidate?.documentType) === 91);
  const resolution = resolveRetailEconomicExclusions(retailRows, evidenceRows);
  return !resolution.convertedRows.has(row) && !resolution.quarantinedRows.has(row);
}

/**
 * Ham CPM satirlarindan tek, nihai fatura tabanli ekonomik defter olusturur.
 * Girdi dizilerini ve satirlarini degistirmez.
 *
 * @param {Object} input
 * @param {CpmEconomicRow[]} [input.economics]
 * @param {Object[]} [input.lineage]
 * @param {Object[]} [input.actorEvents]
 * @param {Object[]} [input.pilotOrders]
 * @param {Record<string, Object>} [input.identities]
 */
export function buildFinalInvoiceLedger({
  economics = [],
  lineage = [],
  actorEvents = [],
  pilotOrders = [],
  identities = {},
} = {}) {
  const economicRows = Array.isArray(economics) ? economics : [];
  const lineageRows = Array.isArray(lineage) ? lineage : [];
  const eventRows = Array.isArray(actorEvents) ? actorEvents : [];
  const pilotRows = Array.isArray(pilotOrders) ? pilotOrders : [];
  const structurallyValidRows = economicRows.filter(isValidEconomicRow);
  const economicCandidateRows = structurallyValidRows.filter((row) =>
    FINAL_SALE_TYPES.has(Number(row.documentType)) || FINAL_RETURN_TYPES.has(Number(row.documentType)));
  const lineageByRoot = new Map();
  for (const lineageRow of lineageRows) {
    const rootId = text(lineageRow?.rootId);
    if (!lineageByRoot.has(rootId)) lineageByRoot.set(rootId, []);
    lineageByRoot.get(rootId).push(lineageRow);
  }
  const testExclusionsByRow = new Map(economicCandidateRows.flatMap((row) => {
    const audit = excludedTestAudit(row, lineageByRoot.get(text(row.rootId)) || []);
    return audit ? [[row, audit]] : [];
  }));
  const excludedTestRows = [...testExclusionsByRow.values()];
  const includedEconomicCandidateRows = economicCandidateRows
    .filter((row) => !testExclusionsByRow.has(row));
  const financialValidations = includedEconomicCandidateRows.map(validateFinancialRow);
  const financiallyValidRows = financialValidations
    .filter((validation) => validation.valid)
    .map((validation) => validation.row);
  const invalidFinancialRows = financialValidations.filter((validation) => !validation.valid);
  const graph = buildLineageGraph(structurallyValidRows, lineageRows);
  const provisionalRowsExcluded = structurallyValidRows.length - economicCandidateRows.length;
  const retailResolution = resolveRetailEconomicExclusions(
    financiallyValidRows.filter((row) => Number(row.documentType) === 91),
    structurallyValidRows,
    lineageRows,
    financiallyValidRows,
  );
  const terminalRows = financiallyValidRows.filter((row) =>
    !retailResolution.convertedRows.has(row) && !retailResolution.quarantinedRows.has(row));
  const convertedRetailRowsExcluded = retailResolution.convertedRows.size;

  const normalizedRows = terminalRows.map((row) => normalizeEconomicRow(row, graph));
  const normalizedSalesRows = normalizedRows.filter((row) => row.isSale);
  const returnCostResolutions = normalizedRows.map((row) => applyReturnCostBasis(row, normalizedSalesRows));
  const costRows = returnCostResolutions.map((resolution) => resolution.row);
  const directlyOwnedRows = costRows.map((row) => {
    const ownership = resolveCommercialOwnership({
      economic: row,
      lineage: lineageByRoot.get(text(row.rootId)) || [],
      actorEvents: eventRows,
      identities,
    });
    return { ...row, ...ownershipFields(ownership) };
  });
  const salesByRoot = new Map(directlyOwnedRows
    .filter((row) => row.isSale && text(row.rootId))
    .map((row) => [text(row.rootId), row]));
  const rows = directlyOwnedRows.map((row) => {
    if (row.isSale || !text(row.originalRootId)) return row;
    const rowLineage = lineageByRoot.get(text(row.rootId)) || [];
    const original = salesByRoot.get(text(row.originalRootId))
      || priorPeriodOriginalOwnership(row, rowLineage, eventRows, identities);
    if (!original) return row;
    const directOwnership = resolveCommercialOwnership({
      economic: row,
      lineage: rowLineage,
      actorEvents: eventRows,
      identities,
    });
    return { ...row, ...linkedReturnOwnership(row, original, directOwnership) };
  });
  const returnCostQuarantines = returnCostResolutions
    .map((resolution) => resolution.quarantine)
    .filter(Boolean);
  const salesRows = rows.filter((row) => row.isSale);
  const returnRows = rows.filter((row) => !row.isSale);
  const sum = (items, field) => items.reduce((total, row) => total + number(row[field]), 0);
  const invalidFinancialFieldCounts = Object.fromEntries(FINANCIAL_FIELDS.map((field) => [field, 0]));
  for (const validation of invalidFinancialRows) {
    for (const field of validation.invalidFields) invalidFinancialFieldCounts[field] += 1;
  }
  const quarantinedRows = invalidFinancialRows.map(({ row, invalidFields }) => ({
    rootId: row.rootId,
    documentType: Number(row.documentType),
    documentNo: text(row.documentNo),
    customerCode: text(row.customerCode),
    lineNo: row.lineNo,
    invalidFields: [...invalidFields],
  })).concat(returnCostQuarantines);
  const excludedPilotOrders = pilotRows
    .filter(isExcludedTestDocument)
    .map((row) => ({ ...row, reviewReason: "excluded-test-document", reviewStatus: "excluded" }));
  const includedPilotOrders = pilotRows.filter((row) => !isExcludedTestDocument(row));

  return {
    rows,
    totals: {
      grossSales: sum(salesRows, "grossAmount"),
      returns: sum(returnRows, "netAmount"),
      discounts: sum(salesRows, "discountAmount"),
      netSales: sum(rows, "signedNetSales"),
      vatAmount: sum(rows, "signedVatAmount"),
      invoiceTotalInclVat: sum(rows, "signedInvoiceTotalInclVat"),
      rowCount: rows.length,
    },
    quality: {
      candidateRows: economicRows.length,
      terminalRows: rows.length,
      invalidRowsExcluded: economicRows.length - structurallyValidRows.length + invalidFinancialRows.length,
      invalidStructuralRows: economicRows.length - structurallyValidRows.length,
      invalidFinancialRows: invalidFinancialRows.length,
      invalidQuantityRows: invalidFinancialRows.filter((validation) =>
        validation.invalidFields.includes("quantity")).length,
      invalidFinancialFieldCounts,
      provisionalRowsExcluded,
      convertedRetailRowsExcluded,
      reconciledRetailRowsExcluded: retailResolution.reconciledRows.size,
      ambiguousRetailDocuments: retailResolution.ambiguities.length,
      ambiguousRetailRowsExcluded: retailResolution.quarantinedRows.size,
      ambiguousRetailRowsQuarantined: retailResolution.quarantinedRows.size,
      ambiguousRetailNetAmount: sumFinite(retailResolution.reviewRequiredRows, "netAmount"),
      retailLineageAmbiguities: retailResolution.ambiguities.map((ambiguity) => ({ ...ambiguity })),
      linkedReturnRows: returnRows.filter((row) => row.originalInvoiceNo).length,
      unlinkedReturnRows: returnRows.filter((row) => !row.originalInvoiceNo).length,
      ambiguousReturnCostRows: returnCostQuarantines.length,
      excludedTestRows: excludedTestRows.length,
      lineageRows: lineageRows.length,
      actorEvents: eventRows.length,
    },
    quarantinedRows,
    reviewRequiredRows: retailResolution.reviewRequiredRows
      .map((row) => ({ ...row }))
      .concat(excludedTestRows.map((row) => ({ ...row }))),
    excludedTestRows: excludedTestRows.map((row) => ({
      ...row,
      economicDocument: { ...row.economicDocument },
      matchedDocument: { ...row.matchedDocument },
      matchedDocuments: row.matchedDocuments.map((item) => ({ ...item })),
    })),
    pilotOrders: includedPilotOrders.map((row) => ({ ...row })),
    excludedPilotOrders,
  };
}

export const finalInvoiceLedgerSql = `
SET NOCOUNT ON;

CREATE TABLE #incomingReturnDocuments (purchaseNo nvarchar(100) NOT NULL PRIMARY KEY);
INSERT INTO #incomingReturnDocuments (purchaseNo)
SELECT DISTINCT CAST(e.EVRAKNO AS nvarchar(100))
FROM EFAGLN e
WHERE e.EVRAKNO IS NOT NULL
  AND (
    CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%iade%'
    OR CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%return%'
  );

SELECT
  p.ID purchaseId,
  CASE WHEN TRY_CONVERT(decimal(38, 0), p.ID) IS NULL THEN 1 ELSE 0 END purchaseIdKind,
  TRY_CONVERT(decimal(38, 0), p.ID) purchaseNumericId,
  CAST(p.ID AS nvarchar(100)) COLLATE Latin1_General_100_BIN2 purchaseTextId,
  p.EVRAKTIP purchaseType,
  p.EVRAKNO purchaseNo,
  p.EVRAKTARIH purchaseDate,
  p.HESAPKOD purchaseAccountCode,
  supplier.UNVAN purchasePartyName,
  p.MALKOD productCode,
  CAST(p.MIKTAR AS decimal(28, 4)) purchaseQuantity,
  CAST(p.TUTAR AS decimal(28, 4)) purchaseGrossAmount,
  CAST(p.ISKONTO AS decimal(28, 4)) purchaseDiscountAmount,
  CAST(p.TUTAR - p.ISKONTO AS decimal(28, 4)) purchaseNetAmount,
  CAST(ISNULL(p.KDV, 0) AS decimal(28, 4)) purchaseVatAmount,
  CAST(CASE WHEN p.TUTAR = 0 THEN 0
    ELSE 100.0 * p.ISKONTO / p.TUTAR END AS decimal(18, 4)) purchaseEffectiveDiscountPct,
  COUNT_BIG(*) OVER (
    PARTITION BY p.SIRKETNO, p.EVRAKTIP, p.EVRAKNO, p.HESAPKOD, p.EVRAKTARIH
  ) purchaseDocumentLineCount
INTO #purchaseCandidates
FROM STKHAR p
LEFT JOIN CARKRT supplier ON supplier.SIRKETNO = p.SIRKETNO AND supplier.HESAPKOD = p.HESAPKOD
WHERE p.SIRKETNO = @company
  AND p.KAYITDURUM = 1
  AND p.EVRAKTIP IN (9,609)
  AND p.MIKTAR > 0
  AND p.TUTAR IS NOT NULL
  AND p.ISKONTO IS NOT NULL
  AND p.TUTAR - p.ISKONTO >= 0
  AND NOT EXISTS (
    SELECT 1 FROM #incomingReturnDocuments rejected WHERE rejected.purchaseNo = p.EVRAKNO
  );

CREATE INDEX IX_nexus_purchase_candidates
  ON #purchaseCandidates(productCode, purchaseDate, purchaseId);

;WITH activeConsumptionEvidence AS (
  SELECT
    movement.ID movementId,
    movement.EVRAKTIP documentType,
    movement.EVRAKNO documentNo,
    movement.HESAPKOD customerCode,
    movement.SIRANO [lineNo],
    movement.EVRAKTARIH documentDate,
    movement.MALKOD productCode,
    CAST(movement.MIKTAR AS decimal(28, 4)) quantity,
    CAST(ISNULL(movement.TUTAR, 0) - ISNULL(movement.ISKONTO, 0) AS decimal(28, 4)) netAmount,
    movement.SONKAYNAKEVRAKTIP sourceDocumentType,
    movement.SONKAYNAKEVRAKNO sourceDocumentNo,
    movement.SONKAYNAKHESAPKOD sourceCustomerCode,
    movement.SONKAYNAKSIRANO sourceLineNo
  FROM STKHAR movement
  WHERE movement.SIRKETNO = @company
    AND movement.KAYITDURUM = 1
    AND movement.EVRAKTIP IN (${TERMINAL_CONSUMPTION_LINEAGE_TYPE_VALUES.join(",")})
    AND movement.MIKTAR > 0
), retailConsumptionLineage AS (
  SELECT
    retail.movementId retailRootId,
    retail.movementId,
    retail.documentType,
    retail.documentNo,
    retail.customerCode,
    retail.[lineNo],
    retail.documentDate,
    retail.productCode,
    retail.quantity,
    retail.netAmount,
    retail.sourceDocumentType,
    retail.sourceDocumentNo,
    retail.sourceCustomerCode,
    retail.sourceLineNo,
    0 depth,
    CAST(0 AS bit) hasMissingSourceLine,
    CAST('|' + CAST(retail.movementId AS varchar(24)) + '|' AS varchar(900)) visited
  FROM activeConsumptionEvidence retail
  WHERE retail.documentType = 91
  UNION ALL
  SELECT
    lineage.retailRootId,
    downstream.movementId,
    downstream.documentType,
    downstream.documentNo,
    downstream.customerCode,
    downstream.[lineNo],
    downstream.documentDate,
    downstream.productCode,
    downstream.quantity,
    downstream.netAmount,
    downstream.sourceDocumentType,
    downstream.sourceDocumentNo,
    downstream.sourceCustomerCode,
    downstream.sourceLineNo,
    lineage.depth + 1,
    CAST(CASE WHEN lineage.hasMissingSourceLine = 1 OR downstream.sourceLineNo IS NULL
      THEN 1 ELSE 0 END AS bit),
    CAST(lineage.visited + CAST(downstream.movementId AS varchar(24)) + '|' AS varchar(900))
  FROM retailConsumptionLineage lineage
  JOIN activeConsumptionEvidence downstream
    ON downstream.sourceDocumentType = lineage.documentType
    AND downstream.sourceDocumentNo = lineage.documentNo
    AND COALESCE(NULLIF(downstream.sourceCustomerCode, ''), downstream.customerCode) = lineage.customerCode
    AND (downstream.sourceLineNo = lineage.[lineNo] OR downstream.sourceLineNo IS NULL)
  WHERE lineage.depth < 8
    AND CHARINDEX('|' + CAST(downstream.movementId AS varchar(24)) + '|', lineage.visited) = 0
), retailFinalEvidence AS (
  SELECT DISTINCT
    lineage.retailRootId,
    retail.documentNo retailDocumentNo,
    retail.customerCode retailCustomerCode,
    lineage.movementId finalMovementId,
    lineage.productCode finalProductCode,
    lineage.quantity finalQuantity,
    lineage.netAmount finalNetAmount,
    lineage.hasMissingSourceLine
  FROM retailConsumptionLineage lineage
  JOIN activeConsumptionEvidence retail ON retail.movementId = lineage.retailRootId
  WHERE lineage.depth > 0 AND lineage.documentType IN (17,85)
), exactFinalEvidence AS (
  SELECT * FROM retailFinalEvidence WHERE hasMissingSourceLine = 0
), missingFinalEvidence AS (
  SELECT candidate.*
  FROM retailFinalEvidence candidate
  WHERE candidate.hasMissingSourceLine = 1
    AND NOT EXISTS (
      SELECT 1
      FROM exactFinalEvidence exact
      WHERE exact.retailDocumentNo = candidate.retailDocumentNo
        AND exact.retailCustomerCode = candidate.retailCustomerCode
        AND exact.finalMovementId = candidate.finalMovementId
    )
), missingLineReconciliationCandidates AS (
  SELECT
    candidate.*,
    COUNT_BIG(*) OVER (PARTITION BY candidate.retailRootId) sourceCandidateCount,
    COUNT_BIG(*) OVER (
      PARTITION BY candidate.retailDocumentNo, candidate.retailCustomerCode, candidate.finalMovementId
    ) finalCandidateCount
  FROM missingFinalEvidence candidate
  JOIN activeConsumptionEvidence retail ON retail.movementId = candidate.retailRootId
    AND retail.productCode = candidate.finalProductCode
    AND retail.quantity = candidate.finalQuantity
    AND retail.netAmount = candidate.finalNetAmount
), reconciledRetailConsumption AS (
  SELECT DISTINCT retailRootId, retailDocumentNo, retailCustomerCode, finalMovementId
  FROM missingLineReconciliationCandidates
  WHERE sourceCandidateCount = 1 AND finalCandidateCount = 1
), convertedRetailConsumption AS (
  SELECT DISTINCT retailRootId FROM exactFinalEvidence
  UNION
  SELECT DISTINCT retailRootId FROM reconciledRetailConsumption
), unresolvedRetailDocuments AS (
  SELECT DISTINCT evidence.retailDocumentNo, evidence.retailCustomerCode
  FROM missingFinalEvidence evidence
  WHERE NOT EXISTS (
    SELECT 1
    FROM reconciledRetailConsumption reconciled
    WHERE reconciled.retailDocumentNo = evidence.retailDocumentNo
      AND reconciled.retailCustomerCode = evidence.retailCustomerCode
      AND reconciled.finalMovementId = evidence.finalMovementId
  )
), ambiguousRetailConsumption AS (
  SELECT DISTINCT retail.movementId retailRootId
  FROM activeConsumptionEvidence retail
  JOIN unresolvedRetailDocuments unresolved
    ON unresolved.retailDocumentNo = retail.documentNo
    AND unresolved.retailCustomerCode = retail.customerCode
  WHERE retail.documentType = 91
    AND NOT EXISTS (
      SELECT 1 FROM convertedRetailConsumption converted
      WHERE converted.retailRootId = retail.movementId
    )
), excludedRetailConsumption AS (
  SELECT retailRootId FROM convertedRetailConsumption
  UNION
  SELECT retailRootId FROM ambiguousRetailConsumption
), rankedTerminalSales AS (
  SELECT
    movement.ID movementId,
    movement.EVRAKTIP documentType,
    movement.EVRAKNO documentNo,
    movement.HESAPKOD customerCode,
    movement.SIRANO [lineNo],
    movement.EVRAKTARIH documentDate,
    movement.MALKOD productCode,
    CAST(movement.MIKTAR AS decimal(28, 4)) quantity,
    ROW_NUMBER() OVER (PARTITION BY movement.ID ORDER BY movement.ID) identityRank
  FROM STKHAR movement
  WHERE movement.SIRKETNO = @company
    AND movement.KAYITDURUM = 1
    AND movement.EVRAKTIP IN (17,85,91)
    AND movement.MIKTAR > 0
    AND (
      movement.EVRAKTIP <> 91
      OR NOT EXISTS (
        SELECT 1 FROM excludedRetailConsumption excluded WHERE excluded.retailRootId = movement.ID
      )
    )
)
SELECT movementId, documentType, documentNo, customerCode, [lineNo], documentDate, productCode, quantity
INTO #terminalSales
FROM rankedTerminalSales
WHERE identityRank = 1
OPTION (MAXRECURSION 100);

CREATE UNIQUE CLUSTERED INDEX IX_nexus_terminal_sales ON #terminalSales(movementId);
CREATE INDEX IX_nexus_terminal_sales_consumption ON #terminalSales(productCode, documentDate, movementId);

;WITH returnLineage AS (
  SELECT
    h.ID rootId,
    h.ID lineageId,
    h.EVRAKTIP documentType,
    h.EVRAKNO documentNo,
    h.EVRAKTARIH documentDate,
    h.HESAPKOD customerCode,
    h.SIRANO [lineNo],
    h.MALKOD productCode,
    h.MIKTAR quantity,
    h.SONKAYNAKEVRAKTIP sourceDocumentType,
    h.SONKAYNAKEVRAKNO sourceDocumentNo,
    h.SONKAYNAKHESAPKOD sourceCustomerCode,
    h.SONKAYNAKSIRANO sourceLineNo,
    0 depth,
    CAST('|' + CAST(h.ID AS varchar(24)) + '|' AS varchar(900)) visited
  FROM STKHAR h
  WHERE h.SIRKETNO = @company
    AND YEAR(h.EVRAKTARIH) = @year
    AND h.KAYITDURUM = 1
    AND h.EVRAKTIP = 18
  UNION ALL
  SELECT
    lineage.rootId,
    source.ID,
    source.EVRAKTIP,
    source.EVRAKNO,
    source.EVRAKTARIH,
    source.HESAPKOD,
    source.SIRANO,
    source.MALKOD,
    source.MIKTAR,
    source.SONKAYNAKEVRAKTIP,
    source.SONKAYNAKEVRAKNO,
    source.SONKAYNAKHESAPKOD,
    source.SONKAYNAKSIRANO,
    lineage.depth + 1,
    CAST(lineage.visited + CAST(source.ID AS varchar(24)) + '|' AS varchar(900))
  FROM returnLineage lineage
  JOIN STKHAR source ON source.SIRKETNO = @company
    AND source.KAYITDURUM = 1
    AND source.EVRAKTIP = lineage.sourceDocumentType
    AND source.EVRAKNO = lineage.sourceDocumentNo
    AND source.HESAPKOD = COALESCE(NULLIF(lineage.sourceCustomerCode, ''), lineage.customerCode)
    AND source.SIRANO = lineage.sourceLineNo
  WHERE lineage.depth < 8
    AND lineage.sourceDocumentType IN (13,14,15,17,18,64,85,91)
    AND CHARINDEX('|' + CAST(source.ID AS varchar(24)) + '|', lineage.visited) = 0
), returnFinalCandidates AS (
  SELECT DISTINCT rootId, lineageId, documentType, documentNo, documentDate, customerCode,
    [lineNo], productCode, quantity, depth
  FROM returnLineage
  WHERE documentType IN (17,85,91)
), nearestReturnDepth AS (
  SELECT rootId, MIN(depth) nearestDepth
  FROM returnFinalCandidates
  GROUP BY rootId
), rankedReturnSales AS (
  SELECT
    candidate.rootId,
    candidate.lineageId originalRootId,
    candidate.documentType originalDocumentType,
    candidate.documentNo originalDocumentNo,
    candidate.documentDate originalSaleDate,
    candidate.customerCode originalCustomerCode,
    candidate.[lineNo] originalLineNo,
    candidate.productCode originalProductCode,
    candidate.quantity originalQuantity,
    COUNT_BIG(*) OVER (PARTITION BY candidate.rootId) originalCandidateCount,
    ROW_NUMBER() OVER (PARTITION BY candidate.rootId ORDER BY candidate.lineageId DESC) evidenceRank
  FROM returnFinalCandidates candidate
  JOIN nearestReturnDepth nearest ON nearest.rootId = candidate.rootId AND nearest.nearestDepth = candidate.depth
)
SELECT rootId, originalRootId, originalDocumentType, originalDocumentNo, originalSaleDate,
  originalCustomerCode, originalLineNo, originalProductCode, originalQuantity, originalCandidateCount
INTO #returnOriginalSales
FROM rankedReturnSales
WHERE evidenceRank = 1
OPTION (MAXRECURSION 100);

CREATE UNIQUE CLUSTERED INDEX IX_nexus_return_original_sales
  ON #returnOriginalSales(rootId);

SELECT
  h.ID rootId,
  h.EVRAKTIP documentType,
  h.EVRAKNO documentNo,
  h.EVRAKTARIH documentDate,
  h.HESAPKOD customerCode,
  c.UNVAN customerName,
  h.SIRANO [lineNo],
  h.MALKOD productCode,
  k.MALAD productName,
  k.MARKAAD brandName,
  h.MIKTAR quantity,
  CAST(ISNULL(h.TUTAR, 0) AS decimal(28, 4)) grossAmount,
  CAST(ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) discountAmount,
  CAST(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) netAmount,
  CAST(ISNULL(h.KDV, 0) AS decimal(28, 4)) vatAmount,
  CAST(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) + ISNULL(h.KDV, 0) AS decimal(28, 4)) invoiceTotalInclVat,
  CAST(CASE WHEN h.EVRAKTIP = 18 THEN 0 ELSE 1 END AS bit) isSale,
  h.DEPOKOD depotCode,
  h.MASRAFKOD departmentCode,
  ownerHint.actor candidateAttributionActor,
  ownerHint.fieldName candidateAttributionField,
  ownerHint.documentType candidateAttributionDocumentType,
  ownerHint.documentNo candidateAttributionDocumentNo,
  ownerHint.documentDate candidateAttributionDocumentDate,
  h.SONKAYNAKEVRAKTIP sourceDocumentType,
  h.SONKAYNAKEVRAKNO sourceDocumentNo,
  h.SONKAYNAKHESAPKOD sourceCustomerCode,
  h.SONKAYNAKSIRANO sourceLineNo,
  originalSale.originalDocumentType,
  originalSale.originalDocumentNo,
  originalSale.originalRootId,
  originalSale.originalCustomerCode,
  originalSale.originalLineNo,
  originalSale.originalQuantity,
  originalSale.originalCandidateCount,
  purchase.purchaseType,
  purchase.purchaseNo,
  purchase.purchaseDate,
  purchase.purchaseAccountCode,
  purchase.purchasePartyName,
  purchase.purchaseQuantity,
  purchase.purchaseGrossAmount,
  purchase.purchaseDiscountAmount,
  purchase.purchaseNetAmount,
  purchase.purchaseVatAmount,
  purchase.purchaseEffectiveDiscountPct,
  purchase.purchaseDocumentLineCount,
  purchase.purchaseRemainingQuantity,
  purchase.unitCost,
  CASE
    WHEN purchase.purchaseNo IS NULL THEN 'missingPurchase'
    WHEN h.EVRAKTIP = 18 AND originalSale.originalCandidateCount = 1 THEN 'originalSaleCost'
    ELSE purchase.selectionMethod
  END costMethod,
  CASE
    WHEN h.EVRAKTIP = 18 AND originalSale.originalCandidateCount > 1
      THEN 'Birden fazla asil satis satiri ayni iade ile eslesti; maliyet karantinaya alindi.'
    WHEN purchase.purchaseNo IS NULL AND h.EVRAKTIP = 18 AND originalSale.originalSaleDate IS NULL
      THEN 'Baglantisiz satis iadesi maliyet sahipligi icin inceleme gerektiriyor.'
    WHEN purchase.purchaseNo IS NULL
      THEN 'Dogrulanabilir aktif nihai alim faturasi bulunamadi.'
    WHEN h.EVRAKTIP = 18 AND originalSale.originalCandidateCount = 1
      THEN 'Satis iadesi, bagli nihai satis faturasinin maliyet kanitini devraldi.'
    WHEN purchase.selectionMethod = 'bulkPurchase'
      THEN 'Satis oncesindeki bir yilda yeterli kalan stoga sahip iskontolu toplu alim faturasi kullanildi.'
    WHEN purchase.selectionMethod = 'priorPurchase'
      THEN 'Satis tarihinden onceki son aktif nihai alim faturasi kullanildi.'
    ELSE 'Onceki alim bulunamadigi icin satis tarihinden sonraki ilk aktif nihai alim faturasi kullanildi.'
  END costValidationReason
INTO #economics
FROM STKHAR h
LEFT JOIN STKKRT k ON k.SIRKETNO = h.SIRKETNO AND k.MALKOD = h.MALKOD
LEFT JOIN CARKRT c ON c.SIRKETNO = h.SIRKETNO AND c.HESAPKOD = h.HESAPKOD
LEFT JOIN #returnOriginalSales originalSale ON originalSale.rootId = h.ID
OUTER APPLY (
  SELECT TOP (1)
    candidate.actor,
    candidate.fieldName,
    h2.EVRAKTIP documentType,
    h2.EVRAKNO documentNo,
    h2.EVRAKTARIH documentDate
  FROM STKHAR h2
  JOIN EVRBAS b2 ON b2.SIRKETNO = h2.SIRKETNO
    AND b2.EVRAKTIP = h2.EVRAKTIP
    AND b2.EVRAKNO = h2.EVRAKNO
    AND b2.HESAPKOD = h2.HESAPKOD
    AND b2.EVRAKTARIH = h2.EVRAKTARIH
    AND b2.KAYITDURUM = 1
  CROSS APPLY (
    SELECT TOP (1) actor.fieldName, actor.actor
    FROM (VALUES
      ('SATICINO', b2.SATICINO),
      ('EVRAKHAZIRLAYAN', b2.EVRAKHAZIRLAYAN),
      ('GIRENKULLANICI', b2.GIRENKULLANICI),
      ('DEGISTIRENKULLANICI', b2.DEGISTIRENKULLANICI)
    ) actor(fieldName, actor)
    WHERE NULLIF(LTRIM(RTRIM(actor.actor)), '') IS NOT NULL
      AND actor.actor NOT LIKE '%[0-9]%'
      AND actor.actor COLLATE Turkish_CI_AI NOT IN ('BIRCAN','SYSTEM','ADMIN','SA')
    ORDER BY CASE actor.fieldName
      WHEN 'SATICINO' THEN 0
      WHEN 'EVRAKHAZIRLAYAN' THEN 1
      WHEN 'GIRENKULLANICI' THEN 2
      ELSE 3
    END
  ) candidate
  WHERE h2.SIRKETNO = h.SIRKETNO
    AND h2.KAYITDURUM = 1
    AND h2.ID <> h.ID
    AND h2.HESAPKOD = h.HESAPKOD
    AND h2.MALKOD = h.MALKOD
    AND h2.EVRAKTIP IN (13,14,15,64,17,85,91)
    AND h2.EVRAKTARIH BETWEEN DATEADD(day, -180, h.EVRAKTARIH)
      AND DATEADD(day, 14, h.EVRAKTARIH)
  ORDER BY
    CASE WHEN h2.EVRAKTIP IN (13,14,15,64) THEN 0 ELSE 1 END,
    CASE WHEN h2.EVRAKTARIH <= h.EVRAKTARIH THEN 0 ELSE 1 END,
    ABS(DATEDIFF(day, h2.EVRAKTARIH, h.EVRAKTARIH)),
    h2.ID DESC
) ownerHint
OUTER APPLY (
  SELECT
    CASE WHEN h.EVRAKTIP = 18 THEN originalSale.originalSaleDate ELSE h.EVRAKTARIH END costDate,
    CASE WHEN h.EVRAKTIP = 18 THEN originalSale.originalProductCode ELSE h.MALKOD END costProductCode,
    CAST(CASE WHEN h.EVRAKTIP = 18 THEN originalSale.originalQuantity ELSE h.MIKTAR END AS decimal(28, 4)) costQuantity
  WHERE h.EVRAKTIP <> 18 OR originalSale.originalCandidateCount = 1
) costSubject
OUTER APPLY (
  SELECT TOP (1)
    p.*,
    CAST(p.purchaseQuantity - ISNULL(consumption.consumedQuantity, 0) AS decimal(28, 4)) purchaseRemainingQuantity
  FROM #purchaseCandidates p
  OUTER APPLY (
    SELECT SUM(CAST(movement.MIKTAR AS decimal(28, 4))) consumedQuantity
    FROM #terminalSales movement
    WHERE movement.productCode = p.productCode
      AND movement.documentDate > p.purchaseDate
      AND movement.documentDate < costSubject.costDate
  ) consumption
  WHERE p.productCode = costSubject.costProductCode
    AND p.purchaseDate BETWEEN DATEADD(year, -1, costSubject.costDate)
      AND costSubject.costDate
    AND p.purchaseDocumentLineCount >= 10
    AND p.purchaseEffectiveDiscountPct >= 15
    AND p.purchaseQuantity - ISNULL(consumption.consumedQuantity, 0) >= costSubject.costQuantity
  ORDER BY p.purchaseDate DESC, p.purchaseIdKind DESC,
    p.purchaseNumericId DESC, p.purchaseTextId DESC
) bulkPurchase
OUTER APPLY (
  SELECT TOP (1) p.*
  FROM #purchaseCandidates p
  WHERE p.productCode = costSubject.costProductCode
    AND p.purchaseDate <= costSubject.costDate
  ORDER BY p.purchaseDate DESC, p.purchaseIdKind DESC,
    p.purchaseNumericId DESC, p.purchaseTextId DESC
) priorPurchase
OUTER APPLY (
  SELECT TOP (1) p.*
  FROM #purchaseCandidates p
  WHERE p.productCode = costSubject.costProductCode
    AND p.purchaseDate > costSubject.costDate
  ORDER BY p.purchaseDate ASC, p.purchaseIdKind ASC,
    p.purchaseNumericId ASC, p.purchaseTextId ASC
) nextPurchase
OUTER APPLY (
  SELECT TOP (1) selected.*
  FROM (
    SELECT bulkPurchase.purchaseId, bulkPurchase.purchaseType, bulkPurchase.purchaseNo,
      bulkPurchase.purchaseDate, bulkPurchase.purchaseAccountCode, bulkPurchase.purchasePartyName,
      bulkPurchase.productCode, bulkPurchase.purchaseQuantity, bulkPurchase.purchaseGrossAmount,
      bulkPurchase.purchaseDiscountAmount, bulkPurchase.purchaseNetAmount, bulkPurchase.purchaseVatAmount,
      bulkPurchase.purchaseEffectiveDiscountPct, bulkPurchase.purchaseDocumentLineCount,
      bulkPurchase.purchaseRemainingQuantity, CAST('bulkPurchase' AS varchar(24)) selectionMethod,
      1 selectionOrder
    WHERE bulkPurchase.purchaseNo IS NOT NULL
    UNION ALL
    SELECT priorPurchase.purchaseId, priorPurchase.purchaseType, priorPurchase.purchaseNo,
      priorPurchase.purchaseDate, priorPurchase.purchaseAccountCode, priorPurchase.purchasePartyName,
      priorPurchase.productCode, priorPurchase.purchaseQuantity, priorPurchase.purchaseGrossAmount,
      priorPurchase.purchaseDiscountAmount, priorPurchase.purchaseNetAmount, priorPurchase.purchaseVatAmount,
      priorPurchase.purchaseEffectiveDiscountPct, priorPurchase.purchaseDocumentLineCount,
      CAST(NULL AS decimal(28, 4)), CAST('priorPurchase' AS varchar(24)), 2
    WHERE priorPurchase.purchaseNo IS NOT NULL
    UNION ALL
    SELECT nextPurchase.purchaseId, nextPurchase.purchaseType, nextPurchase.purchaseNo,
      nextPurchase.purchaseDate, nextPurchase.purchaseAccountCode, nextPurchase.purchasePartyName,
      nextPurchase.productCode, nextPurchase.purchaseQuantity, nextPurchase.purchaseGrossAmount,
      nextPurchase.purchaseDiscountAmount, nextPurchase.purchaseNetAmount, nextPurchase.purchaseVatAmount,
      nextPurchase.purchaseEffectiveDiscountPct, nextPurchase.purchaseDocumentLineCount,
      CAST(NULL AS decimal(28, 4)), CAST('nextPurchase' AS varchar(24)), 3
    WHERE nextPurchase.purchaseNo IS NOT NULL
  ) selected
  ORDER BY selected.selectionOrder
) selectedPurchase
OUTER APPLY (
  SELECT SUM(CAST(movement.MIKTAR AS decimal(28, 4))) consumedQuantity
  FROM #terminalSales movement
  WHERE movement.productCode = selectedPurchase.productCode
    AND movement.documentDate > selectedPurchase.purchaseDate
    AND movement.documentDate < costSubject.costDate
) selectedConsumption
OUTER APPLY (
  SELECT
    selectedPurchase.purchaseType,
    selectedPurchase.purchaseNo,
    selectedPurchase.purchaseDate,
    selectedPurchase.purchaseAccountCode,
    selectedPurchase.purchasePartyName,
    selectedPurchase.purchaseQuantity,
    selectedPurchase.purchaseGrossAmount,
    selectedPurchase.purchaseDiscountAmount,
    selectedPurchase.purchaseNetAmount,
    selectedPurchase.purchaseVatAmount,
    selectedPurchase.purchaseEffectiveDiscountPct,
    selectedPurchase.purchaseDocumentLineCount,
    CAST(selectedPurchase.purchaseQuantity - ISNULL(selectedConsumption.consumedQuantity, 0)
      AS decimal(28, 4)) purchaseRemainingQuantity,
    CAST(selectedPurchase.purchaseNetAmount / NULLIF(selectedPurchase.purchaseQuantity, 0) AS decimal(28, 6)) unitCost,
    selectedPurchase.selectionMethod
) purchase
WHERE h.SIRKETNO = @company
  AND YEAR(h.EVRAKTARIH) = @year
  AND h.KAYITDURUM = 1
  AND h.EVRAKTIP IN (17,85,91,18)
  AND h.MIKTAR > 0;

CREATE UNIQUE CLUSTERED INDEX IX_nexus_final_economics ON #economics(rootId);

/* recordset: 1 */
SELECT * FROM #economics ORDER BY documentDate, rootId;

;WITH lineage AS (
  SELECT
    e.rootId,
    h.ID lineageId,
    h.EVRAKTIP documentType,
    h.EVRAKNO documentNo,
    h.HESAPKOD customerCode,
    h.SIRANO [lineNo],
    h.EVRAKTARIH documentDate,
    h.DEPOKOD depotCode,
    h.MASRAFKOD departmentCode,
    h.SONKAYNAKEVRAKTIP sourceDocumentType,
    h.SONKAYNAKEVRAKNO sourceDocumentNo,
    h.SONKAYNAKHESAPKOD sourceCustomerCode,
    h.SONKAYNAKSIRANO sourceLineNo,
    0 depth,
    CAST('|' + CAST(h.ID AS varchar(24)) + '|' AS varchar(900)) visited
  FROM #economics e
  JOIN STKHAR h ON h.ID = e.rootId
  UNION ALL
  SELECT
    l.rootId,
    source.ID,
    source.EVRAKTIP,
    source.EVRAKNO,
    source.HESAPKOD,
    source.SIRANO,
    source.EVRAKTARIH,
    source.DEPOKOD,
    source.MASRAFKOD,
    source.SONKAYNAKEVRAKTIP,
    source.SONKAYNAKEVRAKNO,
    source.SONKAYNAKHESAPKOD,
    source.SONKAYNAKSIRANO,
    l.depth + 1,
    CAST(l.visited + CAST(source.ID AS varchar(24)) + '|' AS varchar(900))
  FROM lineage l
  JOIN STKHAR source ON source.SIRKETNO = @company
    AND source.KAYITDURUM = 1
    AND source.EVRAKTIP = l.sourceDocumentType
    AND source.EVRAKNO = l.sourceDocumentNo
    AND source.HESAPKOD = COALESCE(NULLIF(l.sourceCustomerCode, ''), l.customerCode)
    AND source.SIRANO = l.sourceLineNo
  WHERE l.depth < 8
    AND l.sourceDocumentType IN (13,14,15,17,18,64,85,91)
    AND CHARINDEX('|' + CAST(source.ID AS varchar(24)) + '|', l.visited) = 0
  UNION ALL
  SELECT
    l.rootId,
    downstream.ID,
    downstream.EVRAKTIP,
    downstream.EVRAKNO,
    downstream.HESAPKOD,
    downstream.SIRANO,
    downstream.EVRAKTARIH,
    downstream.DEPOKOD,
    downstream.MASRAFKOD,
    downstream.SONKAYNAKEVRAKTIP,
    downstream.SONKAYNAKEVRAKNO,
    downstream.SONKAYNAKHESAPKOD,
    downstream.SONKAYNAKSIRANO,
    l.depth + 1,
    CAST(l.visited + CAST(downstream.ID AS varchar(24)) + '|' AS varchar(900))
  FROM lineage l
  JOIN STKHAR downstream ON downstream.SIRKETNO = @company
    AND downstream.KAYITDURUM = 1
    AND downstream.EVRAKTIP IN (13,14,15,17,18,64,85,91)
    AND downstream.SONKAYNAKEVRAKTIP = l.documentType
    AND downstream.SONKAYNAKEVRAKNO = l.documentNo
    AND COALESCE(NULLIF(downstream.SONKAYNAKHESAPKOD, ''), downstream.HESAPKOD) = l.customerCode
    AND downstream.SONKAYNAKSIRANO = l.[lineNo]
  WHERE l.depth < 8
    AND CHARINDEX('|' + CAST(downstream.ID AS varchar(24)) + '|', l.visited) = 0
)
SELECT *
INTO #lineage
FROM lineage
OPTION (MAXRECURSION 100);

SELECT
  l.*,
  header.ID headerId,
  header.SATICINO commercialOwner,
  header.EVRAKHAZIRLAYAN preparerUser,
  header.GIRENKULLANICI entryUser,
  header.GIRENTARIH entryDate,
  header.DEGISTIRENKULLANICI modifierUser,
  header.DEGISTIRENTARIH modifiedDate
INTO #lineageHeaders
FROM #lineage l
OUTER APPLY (
  SELECT TOP (1) candidate.*
  FROM EVRBAS candidate
  WHERE candidate.SIRKETNO = @company
    AND candidate.KAYITDURUM = 1
    AND candidate.EVRAKTIP = l.documentType
    AND candidate.EVRAKNO = l.documentNo
    AND candidate.HESAPKOD = l.customerCode
    AND candidate.EVRAKTARIH = l.documentDate
  ORDER BY candidate.ID DESC
) header;

/* recordset: 2 */
SELECT
  l.rootId,
  l.lineageId,
  l.headerId,
  l.documentType,
  l.documentNo,
  l.customerCode,
  l.[lineNo],
  l.documentDate,
  l.depotCode,
  l.departmentCode,
  l.sourceDocumentType,
  l.sourceDocumentNo,
  l.sourceCustomerCode,
  l.sourceLineNo,
  l.depth,
  CASE WHEN l.sourceLineNo IS NULL THEN 'document' ELSE 'line' END lineageMatchScope,
  CASE WHEN l.sourceLineNo IS NULL THEN 'missing-source-line' ELSE 'exact-source-line' END lineageEvidenceReason,
  CONCAT(l.documentType, '|', l.documentNo, '|', l.customerCode) documentKey,
  l.commercialOwner,
  l.preparerUser,
  l.entryUser,
  l.entryDate,
  l.modifierUser,
  l.modifiedDate
FROM #lineageHeaders l
ORDER BY l.rootId, l.depth DESC, l.lineageId;

/* recordset: 3 */
SELECT
  event.rootId,
  event.lineageId,
  event.headerId,
  event.documentKey,
  event.documentType,
  event.documentNo,
  event.customerCode,
  event.actorCode,
  event.actorRole,
  event.sourceType,
  COUNT_BIG(*) actionCount,
  MIN(event.eventDate) firstSeen,
  MAX(event.eventDate) lastSeen
FROM (
  SELECT DISTINCT
    l.rootId,
    l.lineageId,
    l.headerId,
    CONCAT(l.documentType, '|', l.documentNo, '|', l.customerCode) documentKey,
    l.documentType,
    l.documentNo,
    l.customerCode,
    NULLIF(LTRIM(RTRIM(history.GIRENKULLANICI)), '') actorCode,
    CAST('history-entry' AS varchar(32)) actorRole,
    CAST('MIREVRBAS' AS varchar(16)) sourceType,
    history.GIRENTARIH eventDate
  FROM #lineageHeaders l
  JOIN MIREVRBAS history ON history.RECID = l.headerId
  WHERE NULLIF(LTRIM(RTRIM(history.GIRENKULLANICI)), '') IS NOT NULL
  UNION ALL
  SELECT DISTINCT
    l.rootId,
    l.lineageId,
    l.headerId,
    CONCAT(l.documentType, '|', l.documentNo, '|', l.customerCode),
    l.documentType,
    l.documentNo,
    l.customerCode,
    NULLIF(LTRIM(RTRIM(history.DEGISTIRENKULLANICI)), ''),
    'history-change',
    'MIREVRBAS',
    history.DEGISTIRENTARIH
  FROM #lineageHeaders l
  JOIN MIREVRBAS history ON history.RECID = l.headerId
  WHERE NULLIF(LTRIM(RTRIM(history.DEGISTIRENKULLANICI)), '') IS NOT NULL
  UNION ALL
  SELECT DISTINCT
    l.rootId,
    l.lineageId,
    l.headerId,
    CONCAT(l.documentType, '|', l.documentNo, '|', l.customerCode),
    l.documentType,
    l.documentNo,
    l.customerCode,
    NULLIF(LTRIM(RTRIM(approval.ONAYLAYANKULLANICI)), ''),
    CASE WHEN approval.SONLANDIR = 1 THEN 'terminal-approval' ELSE 'approval' END,
    'EVRONY',
    approval.ONAYTARIH
  FROM #lineageHeaders l
  JOIN EVRONY approval ON approval.SIRKETNO = @company
    AND approval.EVRAKTIP = l.documentType
    AND approval.EVRAKNO = l.documentNo
    AND approval.HESAPKOD = l.customerCode
  WHERE NULLIF(LTRIM(RTRIM(approval.ONAYLAYANKULLANICI)), '') IS NOT NULL
) event
WHERE event.actorCode IS NOT NULL
GROUP BY event.rootId, event.lineageId, event.headerId,
  event.documentKey, event.documentType, event.documentNo, event.customerCode,
  event.actorCode, event.actorRole, event.sourceType;

/* recordset: 4 */
SELECT
  b.EVRAKTIP documentType,
  b.EVRAKNO documentNo,
  b.HESAPKOD customerCode,
  b.EVRAKTARIH documentDate,
  b.SATICINO commercialOwner,
  b.EVRAKHAZIRLAYAN preparerUser,
  b.GIRENKULLANICI entryUser,
  b.DEGISTIRENKULLANICI modifierUser,
  COUNT_BIG(*) lineCount,
  MAX(NULLIF(LTRIM(RTRIM(h.MASRAFKOD)), '')) departmentCode,
  MAX(NULLIF(LTRIM(RTRIM(h.DEPOKOD)), '')) depotCode,
  CAST(1 AS bit) active,
  CAST(CASE WHEN b.EVRAKNO = 'SSP-00979' THEN 1 ELSE 0 END AS bit) isTest
FROM EVRBAS b
JOIN STKHAR h ON h.SIRKETNO = b.SIRKETNO
  AND h.EVRAKTIP = b.EVRAKTIP
  AND h.EVRAKNO = b.EVRAKNO
  AND h.HESAPKOD = b.HESAPKOD
  AND h.KAYITDURUM = 1
WHERE b.SIRKETNO = @company
  AND b.KAYITDURUM = 1
  AND b.EVRAKTIP = 14
  AND YEAR(b.EVRAKTARIH) = @year
GROUP BY b.EVRAKTIP, b.EVRAKNO, b.HESAPKOD, b.EVRAKTARIH,
  b.SATICINO, b.EVRAKHAZIRLAYAN, b.GIRENKULLANICI, b.DEGISTIRENKULLANICI
ORDER BY b.EVRAKTARIH DESC, b.EVRAKNO DESC;

DROP TABLE #lineageHeaders;
DROP TABLE #lineage;
DROP TABLE #economics;
`;
