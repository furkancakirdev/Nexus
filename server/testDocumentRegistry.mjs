export const EXCLUDED_TEST_DOCUMENT_NUMBERS = Object.freeze(["SSP-00979"]);

const EXCLUDED_DOCUMENT_SET = new Set(EXCLUDED_TEST_DOCUMENT_NUMBERS);

function normalizedDocumentNo(value) {
  return String(value ?? "").trim().toLocaleUpperCase("tr-TR");
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function enabledFlag(value) {
  return value === true || value === 1 || String(value ?? "").trim() === "1";
}

export function testDocumentExclusion(value) {
  const row = value && typeof value === "object" ? value : { documentNo: value };
  const documentNo = normalizedDocumentNo(row.documentNo);
  if (EXCLUDED_DOCUMENT_SET.has(documentNo)) {
    return { reason: "registry", normalizedDocumentNo: documentNo };
  }
  if (enabledFlag(row.isTest)) {
    return { reason: "test-flag", normalizedDocumentNo: documentNo || null };
  }
  return null;
}

export function isExcludedTestDocument(value) {
  return Boolean(testDocumentExclusion(value));
}

function documentIdentity(row, matchRole) {
  const exclusion = testDocumentExclusion(row);
  return {
    rootId: row?.rootId ?? null,
    lineageId: row?.lineageId ?? row?.ancestorId ?? null,
    headerId: row?.headerId ?? row?.recId ?? null,
    documentType: Number(row?.documentType),
    documentNo: text(row?.documentNo),
    customerCode: text(row?.customerCode),
    lineNo: row?.lineNo ?? null,
    documentDate: row?.documentDate ?? null,
    depth: number(row?.depth),
    matchRole,
    matchedVia: "documentNo",
    exclusionReason: exclusion?.reason || null,
    normalizedDocumentNo: exclusion?.normalizedDocumentNo || null,
  };
}

function sourceReferenceIdentity(row, matchRole) {
  const exclusion = testDocumentExclusion({ documentNo: row?.sourceDocumentNo });
  return {
    rootId: row?.rootId ?? null,
    lineageId: null,
    headerId: null,
    documentType: Number(row?.sourceDocumentType),
    documentNo: text(row?.sourceDocumentNo),
    customerCode: text(row?.sourceCustomerCode) || text(row?.customerCode),
    lineNo: row?.sourceLineNo ?? null,
    documentDate: null,
    depth: number(row?.depth) + 1,
    matchRole,
    matchedVia: "sourceDocumentNo",
    matchScope: text(row?.sourceLineNo) ? "line" : "document",
    exclusionReason: exclusion?.reason || null,
    normalizedDocumentNo: exclusion?.normalizedDocumentNo || null,
    referencedByDocument: documentIdentity(row, "reference-source"),
  };
}

function evidenceKey(row) {
  const reference = row.referencedByDocument;
  return [
    row.matchRole,
    row.documentType,
    row.normalizedDocumentNo,
    row.customerCode,
    text(row.lineNo),
    reference?.documentType ?? "",
    reference?.documentNo ?? "",
    reference?.lineNo ?? "",
  ].join("|");
}

function matchPriority(matchRole) {
  return {
    economic: 0,
    "lineage-ancestor": 1,
    "direct-source-reference": 2,
    "recursive-document-closure": 3,
  }[matchRole] ?? 9;
}

export function excludedTestAudit(economic, lineageRows = []) {
  const rows = Array.isArray(lineageRows) ? lineageRows : [];
  const documentCandidates = [
    { row: economic, matchRole: "economic" },
    ...rows.map((row) => ({ row, matchRole: "lineage-ancestor" })),
  ];
  const sourceCandidates = [
    { row: economic, matchRole: "direct-source-reference" },
    ...rows.map((row) => ({
      row,
      matchRole: number(row?.depth) > 0
        ? "recursive-document-closure"
        : "direct-source-reference",
    })),
  ];
  const evidence = [
    ...documentCandidates
      .filter(({ row }) => isExcludedTestDocument(row))
      .map(({ row, matchRole }) => documentIdentity(row, matchRole)),
    ...sourceCandidates
      .filter(({ row }) => testDocumentExclusion({ documentNo: row?.sourceDocumentNo }))
      .map(({ row, matchRole }) => sourceReferenceIdentity(row, matchRole)),
  ];
  const matchedDocuments = [...new Map(evidence.map((row) => [evidenceKey(row), row])).values()]
    .sort((left, right) => (
      matchPriority(left.matchRole) - matchPriority(right.matchRole)
      || right.depth - left.depth
      || left.documentNo.localeCompare(right.documentNo, "tr")
    ));
  if (matchedDocuments.length === 0) return null;

  return {
    rootId: economic?.rootId ?? null,
    documentType: Number(economic?.documentType),
    documentNo: text(economic?.documentNo),
    customerCode: text(economic?.customerCode),
    lineNo: economic?.lineNo ?? null,
    reviewReason: "excluded-test-document",
    reviewStatus: "excluded",
    economicDocument: {
      ...documentIdentity(economic, "economic"),
      productCode: text(economic?.productCode),
      quantity: economic?.quantity ?? null,
      grossAmount: economic?.grossAmount ?? economic?.grossSales ?? null,
      discountAmount: economic?.discountAmount ?? economic?.discounts ?? null,
      netAmount: economic?.netAmount ?? economic?.signedNetSales ?? null,
      vatAmount: economic?.vatAmount ?? null,
      invoiceTotalInclVat: economic?.invoiceTotalInclVat ?? null,
      lineCost: economic?.lineCost ?? economic?.resolvedCost ?? null,
    },
    matchedDocument: { ...matchedDocuments[0] },
    matchedDocuments: matchedDocuments.map((row) => ({ ...row })),
  };
}
