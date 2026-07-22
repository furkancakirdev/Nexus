export const FINAL_SALE_TYPES = new Set([17, 85, 91]);
export const FINAL_RETURN_TYPES = new Set([18]);

const LINEAGE_DOCUMENT_TYPES = new Set([13, 14, 15, 17, 18, 64, 85, 91]);
const FINANCIAL_FIELDS = [
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

  const remember = (row) => {
    if (!row || !Number.isInteger(Number(row.documentType)) || !text(row.documentNo)) return;
    types.set(rowKey(row), Number(row.documentType));
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
  return { descendants, ancestors, types };
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
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function oneYearBefore(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
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
  const suppliedNetAmount = finiteNumber(value("purchaseNetAmount", "netAmount"));
  const netAmount = suppliedNetAmount ?? (
    grossAmount !== null && discountAmount !== null ? grossAmount - discountAmount : null
  );
  const suppliedDiscountPct = finiteNumber(
    value("purchaseEffectiveDiscountPct", "effectiveDiscountPct"),
  );
  const effectiveDiscountPct = suppliedDiscountPct ?? (
    grossAmount !== null && grossAmount !== 0 && discountAmount !== null
      ? (100 * discountAmount) / grossAmount
      : 0
  );

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
    purchaseVatAmount: finiteNumber(value("purchaseVatAmount", "vatAmount")),
    purchaseEffectiveDiscountPct: effectiveDiscountPct,
    purchaseDocumentLineCount: finiteNumber(
      value("purchaseDocumentLineCount", "documentLineCount"),
    ),
    active: row?.active === true || row?.active === 1,
    productCode: text(row?.productCode),
    rootId: row?.rootId ?? row?.purchaseId ?? null,
  };
}

function purchaseDocumentIsReturn(candidate, returnDocuments) {
  return returnDocuments.has(candidate.purchaseNo)
    || returnDocuments.has(`${candidate.purchaseType}|${candidate.purchaseNo}`);
}

function compareIdentity(left, right) {
  return text(left.rootId).localeCompare(text(right.rootId), "tr");
}

function latestFirst(left, right) {
  return dateValue(right.purchaseDate) - dateValue(left.purchaseDate) || compareIdentity(right, left);
}

function earliestFirst(left, right) {
  return dateValue(left.purchaseDate) - dateValue(right.purchaseDate) || compareIdentity(left, right);
}

function consumedQuantity(candidate, sale, salesConsumption) {
  const purchaseDate = dateValue(candidate.purchaseDate);
  const saleDate = dateValue(sale?.documentDate);
  if (purchaseDate === null || saleDate === null) return 0;
  const seenMovements = new Set();

  return salesConsumption.reduce((total, movement) => {
    if (!movement || movement.active === false || text(movement.productCode) !== candidate.productCode) return total;
    const movementType = Number(movement.documentType);
    if (Number.isFinite(movementType)
      && !FINAL_SALE_TYPES.has(movementType)
      && !FINAL_RETURN_TYPES.has(movementType)) return total;
    if (text(movement.documentNo) === text(sale?.documentNo)
      && text(movement.lineNo) === text(sale?.lineNo)) return total;
    const movementDate = dateValue(movement.documentDate);
    const quantity = finiteNumber(movement.quantity);
    if (movementDate === null || quantity === null || quantity <= 0
      || movementDate <= purchaseDate || movementDate >= saleDate) return total;
    const movementKey = movement.rootId ?? documentKey(
      movement.documentType,
      movement.documentNo,
      movement.customerCode,
      movement.lineNo,
    );
    if (seenMovements.has(movementKey)) return total;
    seenMovements.add(movementKey);
    return total + (movement.isSale === false || FINAL_RETURN_TYPES.has(movementType) ? -quantity : quantity);
  }, 0);
}

function missingPurchaseEvidence(reason = "Dogrulanabilir aktif nihai alim faturasi bulunamadi.") {
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

  const eligible = (Array.isArray(purchases) ? purchases : [])
    .map(normalizePurchaseCandidate)
    .filter((candidate) => FINAL_PURCHASE_TYPES.has(candidate.purchaseType)
      && candidate.active
      && candidate.productCode === productCode
      && candidate.purchaseNo
      && dateValue(candidate.purchaseDate) !== null
      && candidate.purchaseQuantity > 0
      && candidate.purchaseNetAmount !== null
      && candidate.purchaseNetAmount >= 0
      && !purchaseDocumentIsReturn(candidate, returnSet));

  const lowerBulkDate = oneYearBefore(sale?.documentDate);
  const withRemaining = eligible.map((candidate) => ({
    candidate,
    remainingQuantity: candidate.purchaseQuantity - consumedQuantity(
      candidate,
      sale,
      Array.isArray(salesConsumption) ? salesConsumption : [],
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
    : missingPurchaseEvidence();
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
  const unitCost = finiteNumber(row?.unitCost)
    ?? (candidate.purchaseQuantity > 0 && candidate.purchaseNetAmount !== null
      ? candidate.purchaseNetAmount / candidate.purchaseQuantity
      : null);
  if (!FINAL_PURCHASE_TYPES.has(candidate.purchaseType) || !candidate.purchaseNo || unitCost === null) {
    return missingPurchaseEvidence(row?.costValidationReason);
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
  const sourceLineNo = text(returnRow.sourceLineNo);
  const candidates = salesRows.filter((saleRow) => saleRow.documentNo === returnRow.originalInvoiceNo
    && (!returnRow.customerCode || saleRow.customerCode === returnRow.customerCode)
    && (!returnRow.productCode || saleRow.productCode === returnRow.productCode));
  if (sourceLineNo) {
    const exactLine = candidates.find((saleRow) => text(saleRow.lineNo) === sourceLineNo);
    if (exactLine) return exactLine;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function applyReturnCostBasis(row, salesRows) {
  if (row.isSale) return row;
  const originalSale = row.originalInvoiceNo ? originalSaleForReturn(row, salesRows) : null;
  if (originalSale?.unitCost !== null && originalSale?.unitCost !== undefined) {
    const unitCost = Number(originalSale.unitCost);
    return {
      ...row,
      ...purchaseEvidenceFrom(originalSale),
      costMethod: "originalSaleCost",
      unitCost,
      lineCost: -number(row.quantity) * unitCost,
      costValidationReason: "Satis iadesi, bagli nihai satis faturasinin maliyet kanitini devraldi.",
    };
  }
  if (row.originalInvoiceNo && row.costMethod === "originalSaleCost" && row.unitCost !== null) return row;
  return {
    ...row,
    ...missingPurchaseEvidence(
      row.originalInvoiceNo
        ? "Bagli nihai satis faturasi bulundu ancak satis tarihindeki maliyet kaniti bulunamadi."
        : "Baglantisiz satis iadesi maliyet sahipligi icin inceleme gerektiriyor.",
    ),
    lineCost: null,
  };
}

function normalizeEconomicRow(row, graph) {
  const documentType = Number(row.documentType);
  const grossAmount = number(row.grossAmount);
  const discountAmount = number(row.discountAmount);
  const netAmount = number(row.netAmount, grossAmount - discountAmount);
  const vatAmount = number(row.vatAmount);
  const invoiceTotalInclVat = number(row.invoiceTotalInclVat, netAmount + vatAmount);
  const isSale = !FINAL_RETURN_TYPES.has(documentType);
  const directOriginalType = Number(row.sourceDocumentType);
  const originalKey = isSale || FINAL_SALE_TYPES.has(directOriginalType)
    ? null
    : findConnectedDocument(rowKey(row), graph.ancestors, graph.types, FINAL_SALE_TYPES);
  const originalInvoiceNo = isSale
    ? null
    : (FINAL_SALE_TYPES.has(directOriginalType) ? text(row.sourceDocumentNo) : documentNoFromKey(originalKey));
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
    originalInvoiceNo,
    lineCost,
  };
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
 */
export function buildFinalInvoiceLedger({
  economics = [],
  lineage = [],
  actorEvents = [],
  pilotOrders = [],
} = {}) {
  const economicRows = Array.isArray(economics) ? economics : [];
  const lineageRows = Array.isArray(lineage) ? lineage : [];
  const eventRows = Array.isArray(actorEvents) ? actorEvents : [];
  const pilotRows = Array.isArray(pilotOrders) ? pilotOrders : [];
  const structurallyValidRows = economicRows.filter(isValidEconomicRow);
  const economicCandidateRows = structurallyValidRows.filter((row) =>
    FINAL_SALE_TYPES.has(Number(row.documentType)) || FINAL_RETURN_TYPES.has(Number(row.documentType)));
  const financialValidations = economicCandidateRows.map(validateFinancialRow);
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
  const rows = normalizedRows.map((row) => applyReturnCostBasis(row, normalizedSalesRows));
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
  }));

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
      lineageRows: lineageRows.length,
      actorEvents: eventRows.length,
    },
    quarantinedRows,
    reviewRequiredRows: retailResolution.reviewRequiredRows.map((row) => ({ ...row })),
    pilotOrders: pilotRows.map((row) => ({ ...row })),
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
  p.EVRAKTIP purchaseType,
  p.EVRAKNO purchaseNo,
  p.EVRAKTARIH purchaseDate,
  p.HESAPKOD purchaseAccountCode,
  supplier.UNVAN purchasePartyName,
  p.MALKOD productCode,
  CAST(p.MIKTAR AS decimal(28, 4)) purchaseQuantity,
  CAST(ISNULL(p.TUTAR, 0) AS decimal(28, 4)) purchaseGrossAmount,
  CAST(ISNULL(p.ISKONTO, 0) AS decimal(28, 4)) purchaseDiscountAmount,
  CAST(ISNULL(p.TUTAR, 0) - ISNULL(p.ISKONTO, 0) AS decimal(28, 4)) purchaseNetAmount,
  CAST(ISNULL(p.KDV, 0) AS decimal(28, 4)) purchaseVatAmount,
  CAST(CASE WHEN ISNULL(p.TUTAR, 0) = 0 THEN 0
    ELSE 100.0 * ISNULL(p.ISKONTO, 0) / p.TUTAR END AS decimal(18, 4)) purchaseEffectiveDiscountPct,
  COUNT_BIG(*) OVER (
    PARTITION BY p.SIRKETNO, p.EVRAKTIP, p.EVRAKNO, p.HESAPKOD
  ) purchaseDocumentLineCount
INTO #purchaseCandidates
FROM STKHAR p
LEFT JOIN CARKRT supplier ON supplier.SIRKETNO = p.SIRKETNO AND supplier.HESAPKOD = p.HESAPKOD
WHERE p.SIRKETNO = @company
  AND p.KAYITDURUM = 1
  AND p.EVRAKTIP IN (9,609)
  AND p.MIKTAR > 0
  AND ISNULL(p.TUTAR, 0) - ISNULL(p.ISKONTO, 0) >= 0
  AND NOT EXISTS (
    SELECT 1 FROM #incomingReturnDocuments rejected WHERE rejected.purchaseNo = p.EVRAKNO
  );

CREATE INDEX IX_nexus_purchase_candidates
  ON #purchaseCandidates(productCode, purchaseDate, purchaseId);

;WITH returnLineage AS (
  SELECT
    h.ID rootId,
    h.ID lineageId,
    h.EVRAKTIP documentType,
    h.EVRAKTARIH documentDate,
    h.HESAPKOD customerCode,
    h.SIRANO lineNo,
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
    source.EVRAKTARIH,
    source.HESAPKOD,
    source.SIRANO,
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
), rankedReturnSales AS (
  SELECT rootId, documentDate originalSaleDate,
    ROW_NUMBER() OVER (PARTITION BY rootId ORDER BY depth, lineageId DESC) evidenceRank
  FROM returnLineage
  WHERE documentType IN (17,85,91)
)
SELECT rootId, originalSaleDate
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
  h.SIRANO lineNo,
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
  h.SONKAYNAKEVRAKTIP sourceDocumentType,
  h.SONKAYNAKEVRAKNO sourceDocumentNo,
  h.SONKAYNAKHESAPKOD sourceCustomerCode,
  h.SONKAYNAKSIRANO sourceLineNo,
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
    WHEN h.EVRAKTIP = 18 AND originalSale.originalSaleDate IS NOT NULL THEN 'originalSaleCost'
    ELSE purchase.selectionMethod
  END costMethod,
  CASE
    WHEN purchase.purchaseNo IS NULL AND h.EVRAKTIP = 18 AND originalSale.originalSaleDate IS NULL
      THEN 'Baglantisiz satis iadesi maliyet sahipligi icin inceleme gerektiriyor.'
    WHEN purchase.purchaseNo IS NULL
      THEN 'Dogrulanabilir aktif nihai alim faturasi bulunamadi.'
    WHEN h.EVRAKTIP = 18 AND originalSale.originalSaleDate IS NOT NULL
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
    p.*,
    CAST(p.purchaseQuantity - ISNULL(consumption.consumedQuantity, 0) AS decimal(28, 4)) purchaseRemainingQuantity
  FROM #purchaseCandidates p
  OUTER APPLY (
    SELECT SUM(CAST(movement.MIKTAR AS decimal(28, 4))) consumedQuantity
    FROM STKHAR movement
    WHERE movement.SIRKETNO = @company
      AND movement.KAYITDURUM = 1
      AND movement.MALKOD = p.productCode
      AND movement.EVRAKTIP IN (17,85,91)
      AND movement.EVRAKTARIH > p.purchaseDate
      AND movement.EVRAKTARIH < COALESCE(originalSale.originalSaleDate, h.EVRAKTARIH)
  ) consumption
  WHERE p.productCode = h.MALKOD
    AND p.purchaseDate BETWEEN DATEADD(year, -1, COALESCE(originalSale.originalSaleDate, h.EVRAKTARIH))
      AND COALESCE(originalSale.originalSaleDate, h.EVRAKTARIH)
    AND p.purchaseDocumentLineCount >= 10
    AND p.purchaseEffectiveDiscountPct >= 15
    AND p.purchaseQuantity - ISNULL(consumption.consumedQuantity, 0) >= ABS(h.MIKTAR)
  ORDER BY p.purchaseDate DESC, p.purchaseId DESC
) bulkPurchase
OUTER APPLY (
  SELECT TOP (1) p.*
  FROM #purchaseCandidates p
  WHERE p.productCode = h.MALKOD
    AND p.purchaseDate <= COALESCE(originalSale.originalSaleDate, h.EVRAKTARIH)
  ORDER BY p.purchaseDate DESC, p.purchaseId DESC
) priorPurchase
OUTER APPLY (
  SELECT TOP (1) p.*
  FROM #purchaseCandidates p
  WHERE p.productCode = h.MALKOD
    AND p.purchaseDate > COALESCE(originalSale.originalSaleDate, h.EVRAKTARIH)
  ORDER BY p.purchaseDate ASC, p.purchaseId ASC
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
  FROM STKHAR movement
  WHERE movement.SIRKETNO = @company
    AND movement.KAYITDURUM = 1
    AND movement.MALKOD = selectedPurchase.productCode
    AND movement.EVRAKTIP IN (17,85,91)
    AND movement.EVRAKTARIH > selectedPurchase.purchaseDate
    AND movement.EVRAKTARIH < COALESCE(originalSale.originalSaleDate, h.EVRAKTARIH)
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
  AND h.EVRAKTIP IN (17,85,91,18);

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
    h.SIRANO lineNo,
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
    AND downstream.SONKAYNAKSIRANO = l.lineNo
  WHERE l.depth < 8
    AND CHARINDEX('|' + CAST(downstream.ID AS varchar(24)) + '|', l.visited) = 0
)
SELECT *
INTO #lineage
FROM lineage
OPTION (MAXRECURSION 100);

/* recordset: 2 */
SELECT
  l.rootId,
  l.lineageId,
  l.documentType,
  l.documentNo,
  l.customerCode,
  l.lineNo,
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
  b.SATICINO commercialOwner,
  b.EVRAKHAZIRLAYAN preparerUser,
  b.GIRENKULLANICI entryUser,
  b.GIRENTARIH entryDate,
  b.DEGISTIRENKULLANICI modifierUser,
  b.DEGISTIRENTARIH modifiedDate
FROM #lineage l
OUTER APPLY (
  SELECT TOP (1) header.*
  FROM EVRBAS header
  WHERE header.SIRKETNO = @company
    AND header.KAYITDURUM = 1
    AND header.EVRAKTIP = l.documentType
    AND header.EVRAKNO = l.documentNo
    AND header.HESAPKOD = l.customerCode
  ORDER BY header.ID DESC
) b
ORDER BY l.rootId, l.depth DESC, l.lineageId;

/* recordset: 3 */
SELECT
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
    CONCAT(l.documentType, '|', l.documentNo, '|', l.customerCode) documentKey,
    l.documentType,
    l.documentNo,
    l.customerCode,
    NULLIF(LTRIM(RTRIM(history.GIRENKULLANICI)), '') actorCode,
    CAST('history-entry' AS varchar(32)) actorRole,
    CAST('MIREVRBAS' AS varchar(16)) sourceType,
    history.GIRENTARIH eventDate
  FROM #lineage l
  JOIN EVRBAS historyHeader ON historyHeader.SIRKETNO = @company
    AND historyHeader.KAYITDURUM = 1
    AND historyHeader.EVRAKTIP = l.documentType
    AND historyHeader.EVRAKNO = l.documentNo
    AND historyHeader.HESAPKOD = l.customerCode
  JOIN MIREVRBAS history ON history.RECID = historyHeader.ID
  WHERE NULLIF(LTRIM(RTRIM(history.GIRENKULLANICI)), '') IS NOT NULL
  UNION ALL
  SELECT DISTINCT
    CONCAT(l.documentType, '|', l.documentNo, '|', l.customerCode),
    l.documentType,
    l.documentNo,
    l.customerCode,
    NULLIF(LTRIM(RTRIM(history.DEGISTIRENKULLANICI)), ''),
    'history-change',
    'MIREVRBAS',
    history.DEGISTIRENTARIH
  FROM #lineage l
  JOIN EVRBAS historyHeader ON historyHeader.SIRKETNO = @company
    AND historyHeader.KAYITDURUM = 1
    AND historyHeader.EVRAKTIP = l.documentType
    AND historyHeader.EVRAKNO = l.documentNo
    AND historyHeader.HESAPKOD = l.customerCode
  JOIN MIREVRBAS history ON history.RECID = historyHeader.ID
  WHERE NULLIF(LTRIM(RTRIM(history.DEGISTIRENKULLANICI)), '') IS NOT NULL
  UNION ALL
  SELECT DISTINCT
    CONCAT(l.documentType, '|', l.documentNo, '|', l.customerCode),
    l.documentType,
    l.documentNo,
    l.customerCode,
    NULLIF(LTRIM(RTRIM(approval.ONAYLAYANKULLANICI)), ''),
    CASE WHEN approval.SONLANDIR = 1 THEN 'terminal-approval' ELSE 'approval' END,
    'EVRONY',
    approval.ONAYTARIH
  FROM #lineage l
  JOIN EVRONY approval ON approval.SIRKETNO = @company
    AND approval.EVRAKTIP = l.documentType
    AND approval.EVRAKNO = l.documentNo
    AND approval.HESAPKOD = l.customerCode
  WHERE NULLIF(LTRIM(RTRIM(approval.ONAYLAYANKULLANICI)), '') IS NOT NULL
) event
WHERE event.actorCode IS NOT NULL
GROUP BY event.documentKey, event.documentType, event.documentNo, event.customerCode,
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

DROP TABLE #lineage;
DROP TABLE #economics;
`;
