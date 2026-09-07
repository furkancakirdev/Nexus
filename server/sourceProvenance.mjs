import { createHash } from "node:crypto";

const DEFAULT_VERSIONS = Object.freeze({
  queryContractVersion: "source-v1",
  transformationVersion: "ledger-v1",
  exclusionsVersion: "exclusions-v1",
});

function decimal(value, field) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^-?(?:\d+|\d+\.\d+)$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return `${whole.replace(/^(-?)0+(?=\d)/, "$1")}.${fraction.replace(/0+$/, "") || "0"}`;
}

function minorUnits(value) {
  const normalized = decimal(value, "amount");
  if (normalized === null) return null;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction] = unsigned.split(".");
  const units = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -units : units;
}

function rowId(row) {
  const value = row?.rootId ?? row?.sourceRowId ?? row?.ID;
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value).trim();
}

export function buildSourceCoverageEvidence({ canonicalRows, candidateRows } = {}) {
  if (!Array.isArray(canonicalRows) || !Array.isArray(candidateRows)) {
    return { status: "unavailable", reason: "coverage-rows-missing" };
  }
  const canonicalIds = new Set(canonicalRows.map(rowId).filter(Boolean));
  const candidateIds = new Set(candidateRows.map(rowId).filter(Boolean));
  const canonicalRowCount = canonicalRows.length;
  const candidateRowCount = candidateRows.length;
  const canonicalIdsMissingFromCandidates = [...canonicalIds]
    .filter((id) => !candidateIds.has(id)).length;
  const candidateIdsOutsideCanonical = [...candidateIds]
    .filter((id) => !canonicalIds.has(id)).length;
  const complete = canonicalIdsMissingFromCandidates === 0
    && candidateIdsOutsideCanonical === 0
    && canonicalRowCount === candidateRowCount;
  return {
    status: complete ? "complete" : "incomplete",
    canonicalRowCount,
    candidateRowCount,
    canonicalIdsMissingFromCandidates,
    candidateIdsOutsideCanonical,
  };
}

function identity(row) {
  return {
    id: rowId(row),
    documentType: row?.documentType ?? row?.EVRAKTIP ?? null,
    documentDate: row?.documentDate ?? row?.EVRAKTARIH ?? null,
    productCode: row?.productCode ?? row?.STKKOD ?? null,
  };
}

function economics(row) {
  return {
    ...identity(row),
    quantity: decimal(row?.quantity ?? row?.MIKTAR, "quantity"),
    netAmount: decimal(row?.netAmount ?? row?.TUTAR, "netAmount"),
    isSale: row?.isSale ?? null,
  };
}

function digest(prefix, values) {
  return createHash("sha256").update(`${prefix}\n${JSON.stringify(values)}`).digest("hex");
}

function describe(rows, versions) {
  const identities = rows.map(identity).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const economicRows = rows.map(economics).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return {
    rowCount: rows.length,
    identityDigest: digest("identity", [versions, identities]),
    economicDigest: digest("economic", [versions, economicRows]),
    evidenceVersion: digest("contract", [versions]),
  };
}

function counts(rows) {
  const ids = rows.map(rowId);
  const frequencies = new Map();
  for (const id of ids.filter(Boolean)) frequencies.set(id, (frequencies.get(id) || 0) + 1);
  return {
    ids,
    nullIds: ids.filter((id) => id === null).length,
    duplicates: [...frequencies.values()].filter((count) => count > 1).length,
  };
}

function signedMinorUnits(row) {
  const amount = minorUnits(row?.netAmount ?? row?.TUTAR);
  if (amount === null) return null;
  return row?.isSale === false ? -amount : amount;
}

export function buildSourceProvenanceEvidence({
  sourceRows,
  canonicalRows,
  versions = {},
  source = {},
} = {}) {
  if (!Array.isArray(sourceRows) || !Array.isArray(canonicalRows)) {
    return { status: "unavailable", reason: "source-or-canonical-rows-missing" };
  }

  const contractVersions = { ...DEFAULT_VERSIONS, ...versions };
  const sourceCounts = counts(sourceRows);
  const canonicalCounts = counts(canonicalRows);
  const sourceIds = new Set(sourceCounts.ids.filter(Boolean));
  const canonicalIds = new Set(canonicalCounts.ids.filter(Boolean));
  const missingCanonicalIds = [...sourceIds].filter((id) => !canonicalIds.has(id)).length;
  const unexpectedCanonicalIds = [...canonicalIds].filter((id) => !sourceIds.has(id)).length;
  const malformedEconomicRows = [...sourceRows, ...canonicalRows]
    .filter((row) => decimal(row?.quantity ?? row?.MIKTAR, "quantity") === null
      || decimal(row?.netAmount ?? row?.TUTAR, "netAmount") === null).length;
  const sourceMinor = sourceRows.reduce((sum, row) => sum + (signedMinorUnits(row) ?? 0n), 0n);
  const canonicalMinor = canonicalRows.reduce((sum, row) => sum + (signedMinorUnits(row) ?? 0n), 0n);
  const sourceEvidence = { ...describe(sourceRows, contractVersions), ...source };
  const canonicalEvidence = describe(canonicalRows, contractVersions);
  const reconciliation = {
    missingCanonicalIds,
    unexpectedCanonicalIds,
    duplicateSourceIds: sourceCounts.duplicates,
    duplicateCanonicalIds: canonicalCounts.duplicates,
    nullSourceIds: sourceCounts.nullIds,
    nullCanonicalIds: canonicalCounts.nullIds,
    malformedEconomicRows,
    netDifferenceMinorUnits: Number(sourceMinor - canonicalMinor),
  };
  const unavailable = sourceCounts.nullIds > 0 || canonicalCounts.nullIds > 0 || malformedEconomicRows > 0;
  const mismatch = missingCanonicalIds > 0 || unexpectedCanonicalIds > 0
    || sourceCounts.duplicates > 0 || canonicalCounts.duplicates > 0
    || reconciliation.netDifferenceMinorUnits !== 0
    || sourceEvidence.economicDigest !== canonicalEvidence.economicDigest;
  return {
    status: unavailable ? "unavailable" : mismatch ? "mismatch" : "verified",
    source: sourceEvidence,
    canonical: canonicalEvidence,
    reconciliation,
  };
}
