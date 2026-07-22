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

/**
 * @typedef {Object} CpmEconomicRow
 * @property {number|string} documentType
 * @property {string} documentNo
 * @property {string} [customerCode]
 * @property {number|string} [grossAmount]
 * @property {number|string} [discountAmount]
 * @property {number|string} [netAmount]
 * @property {number|string} [vatAmount]
 * @property {number|string} [invoiceTotalInclVat]
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

function buildEconomicDocumentGraph(economics, lineage) {
  const descendants = new Map();
  const types = new Map();

  const connect = (row) => {
    if (!row || !Number.isInteger(Number(row.documentType)) || !text(row.documentNo)) return;
    const child = rowDocumentScopeKey(row);
    types.set(child, Number(row.documentType));
    const parent = sourceDocumentScopeKey(row);
    if (!parent) return;
    types.set(parent, Number(row.sourceDocumentType));
    if (!descendants.has(parent)) descendants.set(parent, new Set());
    descendants.get(parent).add(child);
  };

  for (const row of economics) connect(row);
  for (const row of lineage) connect(row);
  return { descendants, types };
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

function compareRetailRows(left, right) {
  const leftLine = text(left.lineNo);
  const rightLine = text(right.lineNo);
  const leftNumber = leftLine === "" ? Number.POSITIVE_INFINITY : Number(leftLine);
  const rightNumber = rightLine === "" ? Number.POSITIVE_INFINITY : Number(rightLine);
  const leftIsNumber = Number.isFinite(leftNumber);
  const rightIsNumber = Number.isFinite(rightNumber);
  if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
  if (leftLine !== rightLine) return leftLine < rightLine ? -1 : 1;
  const leftRoot = text(left.rootId);
  const rightRoot = text(right.rootId);
  if (leftRoot === rightRoot) return 0;
  return leftRoot < rightRoot ? -1 : 1;
}

function indexDocumentLineEvidence(rows) {
  const evidence = new Map();
  for (const row of rows) {
    if (!row || !Number.isInteger(Number(row.documentType)) || !text(row.documentNo)) continue;
    const scopeKey = rowDocumentScopeKey(row);
    if (!evidence.has(scopeKey)) evidence.set(scopeKey, new Set());
    evidence.get(scopeKey).add(rowKey(row));
  }
  return evidence;
}

function resolveRetailEconomicExclusions(retailRows, evidenceRows, lineageRows = []) {
  const lineGraph = buildLineageGraph(evidenceRows, lineageRows);
  const documentGraph = buildEconomicDocumentGraph(evidenceRows, lineageRows);
  const lineEvidence = indexDocumentLineEvidence([...evidenceRows, ...lineageRows]);
  const retailGroups = new Map();

  for (const row of retailRows) {
    if (Number(row.documentType) !== 91) continue;
    const key = rowDocumentScopeKey(row);
    if (!retailGroups.has(key)) retailGroups.set(key, []);
    retailGroups.get(key).push(row);
  }

  const excludedRows = new Set();
  const ambiguities = [];
  const finalTypes = new Set([17, 85]);

  for (const [retailDocumentKey, groupRows] of retailGroups) {
    const finalDocuments = findConnectedDocuments(
      retailDocumentKey,
      documentGraph.descendants,
      documentGraph.types,
      finalTypes,
    );
    if (finalDocuments.size === 0) continue;

    const finalLineKeys = new Set();
    for (const finalDocument of finalDocuments) {
      const documentLines = lineEvidence.get(finalDocument);
      if (documentLines?.size) {
        for (const lineKey of documentLines) finalLineKeys.add(lineKey);
      } else {
        finalLineKeys.add(`${finalDocument}|`);
      }
    }

    const exactFinalLineKeys = new Set();
    let exactLinkedRetailRows = 0;
    for (const retailRow of groupRows) {
      const exactFinals = findConnectedDocuments(
        rowKey(retailRow),
        lineGraph.descendants,
        lineGraph.types,
        finalTypes,
      );
      if (exactFinals.size === 0) continue;
      excludedRows.add(retailRow);
      exactLinkedRetailRows += 1;
      for (const finalLineKey of exactFinals) exactFinalLineKeys.add(finalLineKey);
    }

    const unmatchedFinalLines = [...finalLineKeys].filter((key) => !exactFinalLineKeys.has(key));
    if (unmatchedFinalLines.length === 0) continue;

    // Satir kaniti eksikse her final satiri icin en dusuk 91 satirini deterministik olarak temsilci seceriz.
    const fallbackCandidates = groupRows
      .filter((row) => !excludedRows.has(row))
      .sort(compareRetailRows);
    const fallbackExcludedRows = Math.min(unmatchedFinalLines.length, fallbackCandidates.length);
    for (const row of fallbackCandidates.slice(0, fallbackExcludedRows)) excludedRows.add(row);

    const firstRetail = groupRows[0];
    ambiguities.push({
      documentNo: text(firstRetail.documentNo),
      customerCode: text(firstRetail.customerCode),
      retailLineCount: groupRows.length,
      finalDescendantLineCount: finalLineKeys.size,
      exactLinkedRetailRows,
      fallbackExcludedRows,
      retainedRetailRows: groupRows.length - exactLinkedRetailRows - fallbackExcludedRows,
      method: "document-descendant-fallback",
    });
  }

  return { excludedRows, ambiguities };
}

function documentNoFromKey(key) {
  return key ? key.split("|")[1] || null : null;
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

  return {
    ...row,
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
  const { excludedRows } = resolveRetailEconomicExclusions(retailRows, evidenceRows);
  return !excludedRows.has(row);
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
  );
  const terminalRows = financiallyValidRows.filter((row) => !retailResolution.excludedRows.has(row));
  const convertedRetailRowsExcluded = retailResolution.excludedRows.size;

  const rows = terminalRows.map((row) => normalizeEconomicRow(row, graph));
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
      ambiguousRetailDocuments: retailResolution.ambiguities.length,
      ambiguousRetailRowsExcluded: retailResolution.ambiguities.reduce(
        (total, ambiguity) => total + ambiguity.fallbackExcludedRows,
        0,
      ),
      retailLineageAmbiguities: retailResolution.ambiguities.map((ambiguity) => ({ ...ambiguity })),
      linkedReturnRows: returnRows.filter((row) => row.originalInvoiceNo).length,
      unlinkedReturnRows: returnRows.filter((row) => !row.originalInvoiceNo).length,
      lineageRows: lineageRows.length,
      actorEvents: eventRows.length,
    },
    quarantinedRows,
    pilotOrders: pilotRows.map((row) => ({ ...row })),
  };
}

export const finalInvoiceLedgerSql = `
SET NOCOUNT ON;

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
  purchase.purchaseDocumentLineCount
INTO #economics
FROM STKHAR h
LEFT JOIN STKKRT k ON k.SIRKETNO = h.SIRKETNO AND k.MALKOD = h.MALKOD
LEFT JOIN CARKRT c ON c.SIRKETNO = h.SIRKETNO AND c.HESAPKOD = h.HESAPKOD
OUTER APPLY (
  SELECT TOP (1)
    p.EVRAKTIP purchaseType,
    p.EVRAKNO purchaseNo,
    p.EVRAKTARIH purchaseDate,
    p.HESAPKOD purchaseAccountCode,
    supplier.UNVAN purchasePartyName,
    p.MIKTAR purchaseQuantity,
    CAST(ISNULL(p.TUTAR, 0) AS decimal(28, 4)) purchaseGrossAmount,
    CAST(ISNULL(p.ISKONTO, 0) AS decimal(28, 4)) purchaseDiscountAmount,
    CAST(ISNULL(p.TUTAR, 0) - ISNULL(p.ISKONTO, 0) AS decimal(28, 4)) purchaseNetAmount,
    CAST(ISNULL(p.KDV, 0) AS decimal(28, 4)) purchaseVatAmount,
    CAST(CASE WHEN ISNULL(p.TUTAR, 0) = 0 THEN 0
      ELSE 100.0 * ISNULL(p.ISKONTO, 0) / p.TUTAR END AS decimal(18, 4)) purchaseEffectiveDiscountPct,
    purchaseDocument.purchaseDocumentLineCount
  FROM STKHAR p
  LEFT JOIN CARKRT supplier ON supplier.SIRKETNO = p.SIRKETNO AND supplier.HESAPKOD = p.HESAPKOD
  CROSS APPLY (
    SELECT COUNT_BIG(*) purchaseDocumentLineCount
    FROM STKHAR purchaseLine
    WHERE purchaseLine.SIRKETNO = p.SIRKETNO
      AND purchaseLine.EVRAKTIP = p.EVRAKTIP
      AND purchaseLine.EVRAKNO = p.EVRAKNO
      AND purchaseLine.HESAPKOD = p.HESAPKOD
      AND purchaseLine.KAYITDURUM = 1
  ) purchaseDocument
  WHERE p.SIRKETNO = h.SIRKETNO
    AND p.KAYITDURUM = 1
    AND p.EVRAKTIP IN (9,609)
    AND p.MALKOD = h.MALKOD
    AND p.MIKTAR > 0
    AND p.EVRAKTARIH <= h.EVRAKTARIH
  ORDER BY p.EVRAKTARIH DESC, p.ID DESC
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
