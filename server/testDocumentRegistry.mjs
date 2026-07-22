export const EXCLUDED_TEST_DOCUMENT_NUMBERS = Object.freeze(["SSP-00979"]);

const EXCLUDED_DOCUMENT_SET = new Set(EXCLUDED_TEST_DOCUMENT_NUMBERS);

function normalizedDocumentNo(value) {
  return String(value ?? "").trim().toLocaleUpperCase("tr-TR");
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
