import { classifyOpeningEvidence, summarizeOpeningEvidenceRows } from "./openingEvidenceMatcher.mjs";

const text = (value) => value === null || value === undefined ? null : String(value).trim() || null;
const first = (row, names) => names.map((name) => row?.[name]).find((value) => value !== null && value !== undefined && String(value).trim() !== "") ?? null;
const number = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const date = (value) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const normalized = text(value);
  return normalized && /^\d{4}-\d{2}-\d{2}/.test(normalized) ? normalized.slice(0, 10) : null;
};

function limitValue(value) {
  const limit = value === undefined ? 20 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("sampleLimit 1 ile 100 arasında olmalıdır.");
  return limit;
}

function normalizeStkhAr(row, fallbackDocumentType = 82) {
  const grossAmount = number(first(row, ["grossAmount", "TUTAR"]));
  const discountAmount = number(first(row, ["discountAmount", "ISKONTO"]));
  return {
    id: first(row, ["id", "ID"]),
    productCode: text(first(row, ["productCode", "MALKOD"])),
    depotCode: text(first(row, ["depotCode", "DEPOKOD"])),
    movementDate: date(first(row, ["movementDate", "documentDate", "EVRAKTARIH"])),
    documentNumber: text(first(row, ["documentNumber", "documentNo", "EVRAKNO"])),
    lineNumber: number(first(row, ["lineNumber", "lineNo", "SIRANO"])),
    directionCode: first(row, ["directionCode", "GCKOD", "YON"]),
    quantity: number(first(row, ["quantity", "MIKTAR"])),
    grossAmount,
    discountAmount,
    netAmount: grossAmount === null || discountAmount === null ? null : grossAmount - discountAmount,
    documentType: number(first(row, ["documentType", "EVRAKTIP"])) ?? fallbackDocumentType,
    unitCostTryExVat: number(first(row, ["unitCostTryExVat", "unitCost", "unitPrice", "BIRIMFIYAT"])),
    currency: text(first(row, ["priceCurrency", "currency", "FIYATDOVIZCINS", "DOVIZCINS"])),
    priceCurrency: text(first(row, ["priceCurrency", "FIYATDOVIZCINS"])),
    transactionCurrency: text(first(row, ["transactionCurrency", "DOVIZCINS"])),
    costSourceCode: text(first(row, ["costSourceCode", "MALIYETKOD"])),
    costSourceLine: number(first(row, ["costSourceLine", "MALIYETSIRANO"])),
    sourceDocumentType: number(first(row, ["sourceDocumentType", "SONKAYNAKEVRAKTIP"])),
    sourceDocumentNumber: text(first(row, ["sourceDocumentNumber", "SONKAYNAKEVRAKNO"])),
    sourceLineNumber: number(first(row, ["sourceLineNumber", "SONKAYNAKSIRANO"])),
    sourceTable: "STKHAR",
  };
}

function normalizeStksym(row) {
  return {
    id: first(row, ["id", "ID"]),
    productCode: text(first(row, ["productCode", "MALKOD", "STOKKODU", "STOKNO", "MKOD", "KOD"])),
    depotCode: text(first(row, ["depotCode", "DEPOKOD", "DEPO", "DEPONO", "DEPOKODU"])),
    openingDate: date(first(row, ["openingDate", "sourceDate", "TARIH", "EVRAKTARIH"])),
    quantity: number(first(row, ["quantity", "MIKTAR", "MİKTAR"])),
    documentNumber: text(first(row, ["documentNumber", "evrakNo", "EVRAKNO", "BELGENO"])),
    lineNumber: number(first(row, ["lineNumber", "sirano", "SIRANO", "SATIRNO"])),
    documentType: number(first(row, ["documentType", "EVRAKTIP"])),
    sourceTable: "STKSYM",
    sourceKind: "DEVIR",
  };
}

function summarizeStkhAr(rows) {
  const count = (predicate) => rows.filter(predicate).length;
  const products = new Set(rows.map((row) => row.productCode).filter(Boolean));
  const depots = new Set(rows.map((row) => row.depotCode).filter(Boolean));
  const direction = (row) => String(row.directionCode ?? "");
  return {
    rowCount: rows.length,
    distinctProductCount: products.size,
    distinctDepotCount: depots.size,
    direction0Count: count((row) => direction(row) === "0"),
    direction1Count: count((row) => direction(row) === "1"),
    otherDirectionCount: count((row) => !["0", "1"].includes(direction(row))),
    positiveNetAmountCount: count((row) => row.netAmount > 0),
    zeroNetAmountCount: count((row) => row.netAmount === 0),
    negativeNetAmountCount: count((row) => row.netAmount < 0),
    nullProductCount: count((row) => !row.productCode),
    nullDepotCount: count((row) => !row.depotCode),
    nullDateCount: count((row) => !row.movementDate),
    nullDocumentCount: count((row) => !row.documentNumber),
    nullLineCount: count((row) => row.lineNumber === null),
    invalidQuantityCount: count((row) => row.quantity === null || row.quantity <= 0),
  };
}

function orderedSample(rows, limit, dateField) {
  return [...rows].sort((left, right) => [left[dateField], left.productCode, left.depotCode, left.documentNumber, left.lineNumber, left.id]
    .map((value) => String(value ?? "")).join("|").localeCompare(
      [right[dateField], right.productCode, right.depotCode, right.documentNumber, right.lineNumber, right.id]
        .map((value) => String(value ?? "")).join("|"),
    )).slice(0, limit);
}

function normalizeStksymStkhArMatchSummary(row) {
  if (!row || typeof row !== "object") return null;
  const fields = [
    "symRowCount",
    "sameProductDepotDateRowCount",
    "sameProductDepotDateQuantityRowCount",
    "uniqueQuantityMatchRowCount",
    "multiDirectionMatchRowCount",
    "unmatchedRowCount",
  ];
  return Object.fromEntries(fields.map((field) => [field, number(row[field]) ?? 0]));
}

function normalizeStksymStkhArDocumentMatchSummary(row) {
  if (!row || typeof row !== "object") return null;
  const fields = [
    "symRowCount",
    "missingDocumentKeyRowCount",
    "sameDocumentNumberRowCount",
    "sameDocumentLineRowCount",
    "uniqueDocumentLineMatchRowCount",
    "sameDocumentLineQuantityRowCount",
    "documentLineDirectionConflictRowCount",
    "documentLineUnmatchedRowCount",
  ];
  return Object.fromEntries(fields.map((field) => [field, number(row[field]) ?? 0]));
}

function normalizeStksymStkhArMatchReasonSummary(row) {
  if (!row || typeof row !== "object") return null;
  const fields = [
    "symRowCount", "missingProductCount", "missingDepotCount", "missingDateCount",
    "missingDocumentTypeCount", "missingDocumentNumberCount", "missingLineNumberCount",
    "sourceType82Count", "sourceType81Count", "sourceOtherDocumentTypeCount",
    "type82ProductMatchCount", "type82ProductDepotMatchCount", "type82ProductDepotDateMatchCount",
    "type82DocumentLineAnyDateMatchCount", "type82DocumentLineDateMatchCount", "type82DocumentLineDateQuantityMatchCount",
    "type81ProductMatchCount", "type81ProductDepotMatchCount", "type81ProductDepotDateMatchCount",
    "type81DocumentLineAnyDateMatchCount", "type81DocumentLineDateQuantityMatchCount",
    "type82ReasonNoProductMatchCount", "type82ReasonDepotMismatchCount", "type82ReasonDateMismatchCount",
    "type82ReasonDocumentLineMismatchCount", "type82ReasonQuantityMismatchCount",
  ];
  return Object.fromEntries(fields.map((field) => [field, number(row[field]) ?? 0]));
}

export function buildInventoryOpeningResearchPayload({ year, stkhArRows = [], stkhArSummary = null, stkhArType81Rows = [], stkhArType81Summary = null, stksymRows = [], stksymSummary = null, stksymStkhArMatchSummary = null, stksymStkhArDocumentMatchSummary = null, stksymStkhArMatchReasonSummary = null, sampleLimit } = {}) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new TypeError("Geçerli bir araştırma yılı zorunludur.");
  if (!Array.isArray(stkhArRows) || !Array.isArray(stkhArType81Rows) || !Array.isArray(stksymRows)) throw new TypeError("Araştırma satırları dizi olmalıdır.");
  const limit = limitValue(sampleLimit);
  const har82 = stkhArRows.map((row) => normalizeStkhAr(row, 82));
  const har81 = stkhArType81Rows.map((row) => normalizeStkhAr(row, 81));
  const har = [...har82, ...har81];
  const sym = stksymRows.map(normalizeStksym);
  const openingEvidence = summarizeOpeningEvidenceRows(classifyOpeningEvidence({ symRows: sym, harRows: har }));
  return {
    year, researchContractVersion: 1, status: "candidate", verified: false,
    eligibleForOfficialWac: false, readinessImpact: "none",
    reasonCodes: ["direction-semantics-unverified", "opening-lineage-unverified", "cost-semantics-unverified"],
    stkhArType82: { summary: stkhArSummary || summarizeStkhAr(har82), samples: orderedSample(har82, limit, "movementDate") },
    stkhArType81: { summary: stkhArType81Summary || summarizeStkhAr(har81), samples: orderedSample(har81, limit, "movementDate") },
    stksymDevir: {
      summary: stksymSummary || { rowCount: sym.length, distinctProductCount: new Set(sym.map((row) => row.productCode).filter(Boolean)).size },
      samples: orderedSample(sym, limit, "openingDate"),
    },
    openingEvidenceDiagnostics: {
      ...openingEvidence,
      scope: "sample",
      sampleLimit: limit,
      sampleRowCount: har.length + sym.length,
      stkhArDocumentTypeCounts: { "81": har81.length, "82": har82.length },
      sourceMatchSummary: normalizeStksymStkhArMatchSummary(stksymStkhArMatchSummary),
      sourceDocumentMatchSummary: normalizeStksymStkhArDocumentMatchSummary(stksymStkhArDocumentMatchSummary),
      sourceMatchReasonSummary: normalizeStksymStkhArMatchReasonSummary(stksymStkhArMatchReasonSummary),
    },
    officialEligibleCount: 0,
  };
}
