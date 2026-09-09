export const DEFAULT_INVOICE_AUDIT_PAGE_SIZE = 100;
export const MAX_INVOICE_AUDIT_PAGE_SIZE = 500;
const MAX_SQL_INT = 2_147_483_647;

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

export function normalizeInvoiceAuditRequest(query = {}) {
  const rawPage = query.page;
  const rawPageSize = query.pageSize;
  const parsedPage = rawPage === undefined || rawPage === "" ? 1 : Number(rawPage);
  if (!Number.isSafeInteger(parsedPage) || parsedPage < 1) {
    return { valid: false, error: "invalid-page" };
  }
  const page = parsedPage;
  const pageSize = positiveInteger(
    query.pageSize,
    DEFAULT_INVOICE_AUDIT_PAGE_SIZE,
    MAX_INVOICE_AUDIT_PAGE_SIZE,
  );
  if (rawPageSize !== undefined && rawPageSize !== "" && (!Number.isSafeInteger(Number(rawPageSize)) || Number(rawPageSize) < 1)) {
    return { valid: false, error: "invalid-page-size" };
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > MAX_SQL_INT) {
    return { valid: false, error: "pagination-out-of-range" };
  }
  return {
    valid: true,
    page,
    pageSize,
    offset,
  };
}

export function buildCpmInvoiceAuditPayload({
  year,
  page,
  pageSize,
  totalRows,
  summaryRows = [],
  rows = [],
} = {}) {
  const safeTotalRows = Number.isFinite(Number(totalRows)) ? Number(totalRows) : null;
  return {
    year,
    mode: "live",
    evidence: {
      status: "candidate",
      official: false,
      sourceTable: "STKHAR",
      queryId: "invoice-audit-bounded-v1",
      limitation: "Ham belge tipi kanıtıdır; iade soy zinciri, WAC, kur ve ticari sahiplik çözümlemesi içermez.",
    },
    summary: Array.isArray(summaryRows) ? summaryRows : [],
    rows: Array.isArray(rows) ? rows : [],
    pagination: {
      page,
      pageSize,
      totalRows: safeTotalRows,
      totalPages: safeTotalRows === null ? null : Math.ceil(safeTotalRows / pageSize),
    },
  };
}
