/**
 * STKSYM devir özeti ile STKHAR açılış hareketini yalnızca tanı amacıyla
 * karşılaştırır. Bu modül WAC/readiness akışına bağlanmaz ve hiçbir kaynağı
 * değiştirmez.
 */

const value = (row, ...names) => {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null && String(row[name]).trim() !== "") return row[name];
  }
  return null;
};

const normalized = (input) => {
  const value = String(input ?? "").trim();
  return value ? value.toLocaleUpperCase("tr-TR") : null;
};
const numberValue = (input) => {
  if (input === null || input === undefined || String(input).trim() === "") return null;
  const number = Number(input);
  return Number.isFinite(number) ? number : null;
};

function fields(row) {
  const currencyNames = ["currency", "productCurrency", "DOVIZCINS", "FIYATDOVIZCINS"];
  return {
    product: normalized(value(row, "productCode", "STOKKODU", "STOKNO", "KOD")),
    depot: normalized(value(row, "depotCode", "DEPO", "DEPONO", "DEPOKODU")),
    date: normalized(value(row, "date", "movementDate", "openingDate", "sourceDate", "TARIH", "STARIH", "EVRAKTARIH")),
    evrak: normalized(value(row, "evrakNo", "documentNumber", "documentNo", "EVRAKNO", "BELGENO")),
    sirano: normalized(value(row, "sirano", "lineNumber", "lineNo", "SIRANO", "SATIRNO")),
    quantity: numberValue(value(row, "quantity", "MIKTAR", "MİKTAR")),
    unitCost: numberValue(value(row, "unitCostTryExVat", "unitCost", "BIRIMMALIYET", "BIRIMFIYAT", "unitPrice")),
    currency: normalized(value(row, ...currencyNames)),
    currencyProvided: currencyNames.some((name) => Object.prototype.hasOwnProperty.call(row || {}, name)),
  };
}

const naturalKey = (item) => [item.product, item.depot, item.date, item.evrak, item.sirano].join("|");
const baseKey = (item) => [item.product, item.depot, item.date].join("|");
const hasNaturalKey = (item) => [item.product, item.depot, item.date, item.evrak, item.sirano].every(Boolean);
const rowId = (row, fallback) => value(row, "id", "ID", "rowId") ?? fallback;
const hasCost = (item) => item.unitCost !== null && item.unitCost > 0;
const hasCurrency = (item) => item.currency !== null;
const openingRowInvalidReasons = (item) => [
  ...(!item.product ? ["missing-product"] : []),
  ...(!item.depot ? ["missing-depot"] : []),
  ...(!item.date ? ["missing-opening-date"] : []),
  ...(item.quantity === null || item.quantity <= 0 ? ["non-positive-quantity"] : []),
];
const hasMissingCostEvidence = (item) => !hasCost(item)
  || (item.currencyProvided && !hasCurrency(item));
const costsConflict = (left, right) => hasCost(left) && hasCost(right)
  && ((left.currency && right.currency && left.currency !== right.currency)
    || Math.abs(left.unitCost - right.unitCost) > 0.000001);
const missingReasons = (left, right) => [
  ...(!hasCost(left) || !hasCost(right) ? ["missing-unit-cost"] : []),
  ...((left.currencyProvided || right.currencyProvided) && (!hasCurrency(left) || !hasCurrency(right))
    ? ["missing-currency"] : []),
];

export function classifyOpeningEvidence({ symRows = [], harRows = [] } = {}) {
  const har = harRows.map((row, index) => ({ row, id: rowId(row, `har-${index + 1}`), ...fields(row) }));
  const usedHar = new Set();

  return symRows.map((row, index) => {
    const sym = { row, id: rowId(row, `sym-${index + 1}`), ...fields(row) };
    const symInvalidReasons = openingRowInvalidReasons(sym);
    const keyMatch = !symInvalidReasons.length && hasNaturalKey(sym) && har.find((candidate, candidateIndex) => !usedHar.has(candidateIndex)
      && !openingRowInvalidReasons(candidate).length
      && hasNaturalKey(candidate) && naturalKey(candidate) === naturalKey(sym));
    const exact = keyMatch && keyMatch.quantity === sym.quantity ? keyMatch : null;
    const sameBase = !symInvalidReasons.length && har.find((candidate, candidateIndex) => !usedHar.has(candidateIndex)
      && !openingRowInvalidReasons(candidate).length
      && baseKey(candidate) === baseKey(sym) && naturalKey(candidate) !== naturalKey(sym)
      && candidate.quantity !== null && candidate.quantity === sym.quantity);
    const conflict = !symInvalidReasons.length && har.find((candidate, candidateIndex) => !usedHar.has(candidateIndex)
      && !openingRowInvalidReasons(candidate).length
      && candidate.product === sym.product && baseKey(candidate) !== baseKey(sym)
      && candidate.quantity !== null && candidate.quantity === sym.quantity);
    const quantity = sameBase || (keyMatch && keyMatch.quantity !== sym.quantity ? keyMatch : null);
    const match = exact || quantity || conflict;
    const matchIndex = match ? har.indexOf(match) : -1;

    let classification = "unmatched";
    let reviewReason = symInvalidReasons.length ? "invalid-opening-identity" : "no-source-row-match";
    const quarantineReasons = match ? missingReasons(sym, match) : [];
    if (symInvalidReasons.length) quarantineReasons.push(...symInvalidReasons);
    if (match && quarantineReasons.length) {
      classification = "missing-cost-evidence";
      reviewReason = "missing-unit-cost";
    } else if (match && costsConflict(sym, match)) {
      classification = "cost-conflict";
      reviewReason = "cost-mismatch";
    } else if (exact) {
      classification = "exact-key";
      reviewReason = null;
    } else if (quantity) {
      classification = "quantity-only";
      reviewReason = "natural-key-not-matched";
    } else if (conflict) {
      classification = "document-date-depot-conflict";
      reviewReason = "natural-key-conflict";
    }
    if (matchIndex >= 0) usedHar.add(matchIndex);

    return {
      classification,
      official: classification === "exact-key",
      reviewReason,
      naturalKey: naturalKey(sym),
      sourceRowIds: { sym: [sym.id], har: match ? [match.id] : [] },
      quarantineReasons,
      sym: { productCode: sym.product, depotCode: sym.depot, date: sym.date, evrakNo: sym.evrak, sirano: sym.sirano, quantity: sym.quantity, unitCost: sym.unitCost, currency: sym.currency },
      har: match ? { productCode: match.product, depotCode: match.depot, date: match.date, evrakNo: match.evrak, sirano: match.sirano, quantity: match.quantity, unitCost: match.unitCost, currency: match.currency } : null,
    };
  });
}

/** Salt mevcut metadata üzerinden açılış tanısının güvenli özetini üretir. */
export function summarizeOpeningEvidenceDiagnostics(evidence = {}) {
  const source = evidence?.openingEvidenceDiagnostics;
  const empty = {
    status: "not-available",
    exactKeyCount: 0,
    quantityOnlyCount: 0,
    conflictCount: 0,
    missingCostCount: 0,
    costConflictCount: 0,
    unmatchedCount: 0,
    officialEligibleCount: 0,
    samples: [],
  };
  if (!source || typeof source !== "object") return empty;
  const count = (key) => Number.isFinite(Number(source[key])) && Number(source[key]) >= 0
    ? Math.trunc(Number(source[key])) : 0;
  return {
    status: ["available", "not-available"].includes(String(source.status)) ? String(source.status) : "not-available",
    exactKeyCount: count("exactKeyCount"),
    quantityOnlyCount: count("quantityOnlyCount"),
    conflictCount: count("conflictCount"),
    missingCostCount: count("missingCostCount"),
    costConflictCount: count("costConflictCount"),
    unmatchedCount: count("unmatchedCount"),
    officialEligibleCount: count("officialEligibleCount"),
    samples: sanitizeSamples(source.samples),
    ...(source.classificationCounts && typeof source.classificationCounts === "object"
      ? { classificationCounts: evidenceClassificationCounts(source.classificationCounts) }
      : {}),
  };
}

function sampleCostFields(sample) {
  return {
    symUnitCost: sample?.symUnitCost ?? null,
    harUnitCost: sample?.harUnitCost ?? null,
    symCurrency: sample?.symCurrency ?? null,
    harCurrency: sample?.harCurrency ?? null,
  };
}

function sanitizeSamples(samples) {
  if (!Array.isArray(samples)) return [];
  return prioritizeSamples(samples).map((sample) => ({
    symId: sample?.symId ?? null,
    harId: sample?.harId ?? null,
    productCode: sample?.productCode ?? null,
    depotCode: sample?.depotCode ?? null,
    date: sample?.date ?? null,
    symQuantity: sample?.symQuantity ?? null,
    harQuantity: sample?.harQuantity ?? null,
    harDocumentNo: sample?.harDocumentNo ?? null,
    harLineNo: sample?.harLineNo ?? null,
    harDate: sample?.harDate ?? null,
    harDepotCode: sample?.harDepotCode ?? null,
    ...sampleCostFields(sample),
    classification: sample?.classification ?? "unmatched",
    reviewReason: sample?.reviewReason ?? null,
  }));
}

function buildSamples(rows) {
  if (!Array.isArray(rows)) return [];
  return prioritizeSamples(rows).map((row) => ({
    symId: row?.sourceRowIds?.sym?.[0] ?? row?.symId ?? null,
    harId: row?.sourceRowIds?.har?.[0] ?? row?.harId ?? null,
    productCode: row?.sym?.productCode ?? row?.har?.productCode ?? row?.productCode ?? null,
    depotCode: row?.sym?.depotCode ?? row?.har?.depotCode ?? row?.symDepotCode ?? row?.harDepotCode ?? null,
    date: row?.sym?.date ?? row?.har?.date ?? row?.symDate ?? row?.harDate ?? null,
    symQuantity: row?.sym?.quantity ?? row?.symQuantity ?? null,
    harQuantity: row?.har?.quantity ?? row?.harQuantity ?? null,
    harDocumentNo: row?.har?.evrakNo ?? row?.harDocumentNo ?? row?.harEvrakNo ?? null,
    harLineNo: row?.har?.sirano ?? row?.harLineNo ?? row?.harSirano ?? null,
    harDate: row?.har?.date ?? row?.harDate ?? null,
    harDepotCode: row?.har?.depotCode ?? row?.harDepotCode ?? null,
    ...sampleCostFields({
      symUnitCost: row?.sym?.unitCost ?? row?.symUnitCost ?? null,
      harUnitCost: row?.har?.unitCost ?? row?.harUnitCost ?? null,
      symCurrency: row?.sym?.currency ?? row?.symCurrency ?? null,
      harCurrency: row?.har?.currency ?? row?.harCurrency ?? null,
    }),
    classification: row?.classification ?? "unmatched",
    reviewReason: row?.reviewReason ?? null,
  }));
}

const sampleClassPriority = [
  "exact-key",
  "quantity-only",
  "document-date-depot-conflict",
  "cost-conflict",
  "missing-cost-evidence",
  "unmatched",
];

/** Her tanı sınıfını mümkünse bir kez gösterir, kalan kotayı öncelik sırasıyla doldurur. */
function prioritizeSamples(rows) {
  const limited = rows.slice(0, 20);
  const selected = [];
  const selectedRows = new Set();
  for (const classification of sampleClassPriority) {
    const row = rows.find((candidate) => !selectedRows.has(candidate)
      && (candidate?.classification ?? "unmatched") === classification);
    if (row) {
      selected.push(row);
      selectedRows.add(row);
    }
  }
  for (const row of limited) {
    if (selected.length >= 20) break;
    if (!selectedRows.has(row)) {
      selected.push(row);
      selectedRows.add(row);
    }
  }
  return selected.slice(0, 20);
}

function evidenceClassificationCounts(input) {
  if (!input || typeof input !== "object") return {};
  return Object.fromEntries(Object.entries(input)
    .filter(([key, value]) => key && Number.isFinite(Number(value)) && Number(value) >= 0)
    .map(([key, value]) => [key, Math.trunc(Number(value))]));
}

/** Recordset 7 satırlarını yalnızca tanı özeti olarak sayar; resmi uygunluk daima sıfırdır. */
export function summarizeOpeningEvidenceRows(rows = []) {
  if (!Array.isArray(rows)) return summarizeOpeningEvidenceDiagnostics({});
  const classificationCounts = {};
  for (const row of rows) {
    const classification = String(row?.classification || "unmatched");
    classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;
  }
  return summarizeOpeningEvidenceDiagnostics({
    openingEvidenceDiagnostics: {
      status: rows.length ? "available" : "not-available",
      exactKeyCount: classificationCounts["exact-key"] || 0,
      quantityOnlyCount: classificationCounts["quantity-only"] || 0,
      conflictCount: classificationCounts["document-date-depot-conflict"] || 0,
      costConflictCount: classificationCounts["cost-conflict"] || 0,
      missingCostCount: classificationCounts["missing-cost-evidence"] || 0,
      unmatchedCount: classificationCounts.unmatched || 0,
      officialEligibleCount: 0,
      classificationCounts,
      samples: buildSamples(rows),
    },
  });
}

/**
 * Salt mevcut metadata üzerinden açılış tanısının güvenli özetini üretir.
 * STKSYM/STKHAR satırları yoksa hiçbir eşleşme varsaymaz ve açıkça kullanılamaz
 * sonucunu döndürür. Bu çıktı resmi WAC uygunluğu değildir.
 */
