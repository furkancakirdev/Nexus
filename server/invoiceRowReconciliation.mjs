const DEFAULT_DETAIL_LIMIT = 100;

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
}

function integer(value) {
  const normalized = text(value);
  if (normalized === null || !/^-?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function decimal(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^-?(?:\d+|\d+\.\d+)$/.test(normalized)) return null;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const compactWhole = whole.replace(/^0+(?=\d)/, "");
  const compactFraction = fraction.replace(/0+$/, "") || "0";
  return `${negative ? "-" : ""}${compactWhole}.${compactFraction}`;
}

function date(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function saleFlag(value) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
}

function rowId(row) {
  return text(row?.rootId ?? row?.sourceRowId ?? row?.ID);
}

function normalizeRow(row, side) {
  const normalized = {
    side,
    id: rowId(row),
    documentType: integer(row?.documentType ?? row?.EVRAKTIP),
    documentDate: date(row?.documentDate ?? row?.EVRAKTARIH),
    productCode: text(row?.productCode ?? row?.STKKOD ?? row?.MALKOD),
    quantity: decimal(row?.quantity ?? row?.MIKTAR),
    netAmount: decimal(row?.netAmount ?? row?.TUTAR),
    isSale: saleFlag(row?.isSale),
    originalRootId: text(row?.originalRootId),
    originalDocumentNo: text(row?.originalDocumentNo),
  };
  const identityInvalid = normalized.id === null
    || normalized.documentType === null
    || normalized.documentDate === null
    || normalized.productCode === null;
  const economicsInvalid = normalized.quantity === null
    || normalized.netAmount === null
    || normalized.isSale === null;
  return {
    ...normalized,
    validIdentity: !identityInvalid,
    validEconomics: !economicsInvalid,
    valid: !identityInvalid && !economicsInvalid,
    raw: row,
  };
}

function identityEqual(left, right) {
  return left.documentType === right.documentType
    && left.documentDate === right.documentDate
    && left.productCode === right.productCode;
}

function economicsEqual(left, right) {
  return left.quantity === right.quantity
    && left.netAmount === right.netAmount
    && left.isSale === right.isSale;
}

function isReturn(row) {
  return row.documentType === 18 || row.isSale === false;
}

function pushSample(target, value, limit) {
  if (target.length < limit) target.push(value);
}

function indexRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (row.id === null) continue;
    const bucket = byId.get(row.id) || [];
    bucket.push(row);
    byId.set(row.id, bucket);
  }
  return byId;
}

function differenceFields(left, right) {
  const fields = [];
  if (left.quantity !== right.quantity) fields.push("quantity");
  if (left.netAmount !== right.netAmount) fields.push("netAmount");
  if (left.isSale !== right.isSale) fields.push("isSale");
  return fields;
}

/**
 * CPM raw rows ile canonical ledger rowsını root/source ID seviyesinde karşılaştırır.
 * Bu yalnızca aday kanıttır; WAC, kâr, havuz veya canlıya geçiş kararı vermez.
 */
export function reconcileInvoiceRows({ sourceRows, canonicalRows, detailLimit = DEFAULT_DETAIL_LIMIT } = {}) {
  if (!Array.isArray(sourceRows) || !Array.isArray(canonicalRows)) {
    return { status: "unavailable", reason: "source-or-canonical-rows-missing" };
  }
  const limit = Number.isSafeInteger(detailLimit) && detailLimit >= 0 ? detailLimit : DEFAULT_DETAIL_LIMIT;
  const source = sourceRows.map((row) => normalizeRow(row, "source"));
  const canonical = canonicalRows.map((row) => normalizeRow(row, "canonical"));
  const sourceById = indexRows(source);
  const canonicalById = indexRows(canonical);
  const sourceIds = new Set(sourceById.keys());
  const canonicalIds = new Set(canonicalById.keys());
  const samples = {
    reviewOnly: [],
    missing: [],
    extra: [],
    identityConflict: [],
    economicMismatch: [],
    returnLineage: [],
    matched: [],
  };
  const counts = {
    sourceRows: source.length,
    canonicalRows: canonical.length,
    matched: 0,
    returnLineage: 0,
    economicMismatch: 0,
    identityConflict: 0,
    missing: 0,
    extra: 0,
    reviewOnly: 0,
    nullOrMalformedSource: 0,
    nullOrMalformedCanonical: 0,
    duplicateSourceIds: 0,
    duplicateCanonicalIds: 0,
  };

  const review = (reason, row, side, malformed = true) => {
    counts.reviewOnly += 1;
    if (malformed && side === "source") counts.nullOrMalformedSource += 1;
    if (malformed && side === "canonical") counts.nullOrMalformedCanonical += 1;
    pushSample(samples.reviewOnly, { reason, side, rowId: row.id, raw: row.raw }, limit);
  };

  for (const row of source) {
    if (!row.valid) review(row.validIdentity ? "malformed-economics" : "invalid-identity", row, "source");
  }
  for (const row of canonical) {
    if (!row.valid) review(row.validIdentity ? "malformed-economics" : "invalid-identity", row, "canonical");
  }
  for (const [id, rows] of sourceById) {
    if (rows.length > 1) {
      counts.duplicateSourceIds += 1;
      for (const row of rows) review("duplicate-source-id", row, "source", false);
    }
  }
  for (const [id, rows] of canonicalById) {
    if (rows.length > 1) {
      counts.duplicateCanonicalIds += 1;
      for (const row of rows) review("duplicate-canonical-id", row, "canonical", false);
    }
  }

  for (const id of sourceIds) {
    if (!canonicalIds.has(id)) {
      const row = sourceById.get(id)[0];
      counts.missing += 1;
      pushSample(samples.missing, { id, source: row.raw }, limit);
      continue;
    }
    if (sourceById.get(id).length !== 1 || canonicalById.get(id).length !== 1) continue;
    const sourceRow = sourceById.get(id)[0];
    const canonicalRow = canonicalById.get(id)[0];
    if (!sourceRow.valid || !canonicalRow.valid) continue;
    if (!identityEqual(sourceRow, canonicalRow)) {
      counts.identityConflict += 1;
      pushSample(samples.identityConflict, {
        id,
        source: sourceRow.raw,
        canonical: canonicalRow.raw,
      }, limit);
      continue;
    }
    if (!economicsEqual(sourceRow, canonicalRow)) {
      counts.economicMismatch += 1;
      pushSample(samples.economicMismatch, {
        id,
        fields: differenceFields(sourceRow, canonicalRow),
        source: sourceRow.raw,
        canonical: canonicalRow.raw,
      }, limit);
      continue;
    }
    if (isReturn(sourceRow) || isReturn(canonicalRow)) {
      counts.returnLineage += 1;
      pushSample(samples.returnLineage, {
        id,
        reviewRequired: true,
        reason: "independent-source-does-not-prove-original-sale-lineage",
        source: sourceRow.raw,
        canonical: canonicalRow.raw,
      }, limit);
      continue;
    }
    counts.matched += 1;
    pushSample(samples.matched, { id }, limit);
  }

  for (const id of canonicalIds) {
    if (sourceIds.has(id)) continue;
    const row = canonicalById.get(id)[0];
    counts.extra += 1;
    pushSample(samples.extra, { id, canonical: row.raw }, limit);
  }

  const hasMismatch = counts.reviewOnly > 0 || counts.identityConflict > 0 || counts.economicMismatch > 0
    || counts.missing > 0 || counts.extra > 0;
  const status = hasMismatch ? "mismatch" : counts.returnLineage > 0 ? "review-required" : "verified";
  return {
    status,
    evidence: {
      official: false,
      status: "candidate",
      limitation: "Satır eşleşmesi CPM kaynak kanıtı ve canonical ledger kimliğiyle sınırlıdır; maliyet, kur, ticari sahiplik ve iade soy zinciri resmi olarak kanıtlanmaz.",
    },
    counts,
    samples,
  };
}
