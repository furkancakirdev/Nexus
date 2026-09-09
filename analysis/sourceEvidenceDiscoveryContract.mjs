import { ALLOWED_SOURCE_TABLES, SOURCE_EVIDENCE_FIELDS } from "./sourceEvidenceDiscoverySql.mjs";

export const SAMPLE_LIMIT_MIN = 1;
export const SAMPLE_LIMIT_MAX = 20;

export function validateSampleLimit(sampleLimit) {
  if (typeof sampleLimit !== "number" || !Number.isInteger(sampleLimit) || sampleLimit < SAMPLE_LIMIT_MIN || sampleLimit > SAMPLE_LIMIT_MAX) {
    throw new TypeError("sampleLimit 1 ile 20 arasında tam sayı olmalıdır.");
  }
  return sampleLimit;
}

function safeIdentity(value) {
  if (value === null || value === undefined || value === "") return { value: null, state: "ambiguous", reason: "identity-null-or-empty" };
  if (typeof value === "bigint") return { value: value.toString(), state: "candidate" };
  if (typeof value === "string") return { value, state: "candidate" };
  return { value: String(value), state: "ambiguous", reason: "identity-not-exact-text" };
}

function identityKey(row) {
  return [row.sourceTable, row.sourceRecordId, row.documentType, row.documentNumber, row.lineNumber].join("|");
}

export function inspectRows(sourceTable, rows) {
  const identityCandidates = [];
  const seen = new Set();
  const reviewRequiredReasons = [];
  const unavailableFields = [];
  const fieldNames = new Set(rows.flatMap((row) => Object.keys(row)));
  const proposedFields = SOURCE_EVIDENCE_FIELDS[sourceTable];

  if (!rows.length) reviewRequiredReasons.push("no-local-sample-rows");
  for (const field of proposedFields) if (!fieldNames.has(field)) unavailableFields.push(field);
  for (const row of rows) {
    const id = safeIdentity(row.sourceRecordId);
    const candidate = { sourceTable, sourceRecordId: id.value, identityState: id.state };
    if (id.reason) candidate.reviewRequiredReason = id.reason;
    const key = identityKey(candidate);
    if (seen.has(key)) {
      candidate.identityState = "ambiguous";
      candidate.reviewRequiredReason = "duplicate-source-identity";
    }
    seen.add(key);
    if (row.sourceRecordId === null || row.sourceRecordId === undefined || row.sourceRecordId === "") candidate.reviewRequiredReason = "null-source-identity";
    identityCandidates.push(candidate);
  }
  if (unavailableFields.length) reviewRequiredReasons.push("unsupported-or-missing-local-fields");
  if (identityCandidates.some((item) => item.identityState === "ambiguous")) reviewRequiredReasons.push("ambiguous-source-identity");
  return { identityCandidates, unavailableFields, reviewRequiredReasons };
}

export function buildDiscoveryContract({ results = {}, startedAt, finishedAt } = {}) {
  const metadataCandidates = [];
  const sourceIdentityCandidates = [];
  const coverage = {};
  const reviewRequiredReasons = new Set(["local-discovery-only", "live-cpm-schema-unverified", "official-gate-not-opened"]);
  for (const table of ALLOWED_SOURCE_TABLES) {
    const rows = Array.isArray(results[table]) ? results[table] : [];
    const inspected = inspectRows(table, rows);
    sourceIdentityCandidates.push(...inspected.identityCandidates);
    coverage[table] = { sampledRowCount: rows.length, unavailableFields: inspected.unavailableFields, status: rows.length ? "candidate" : "unavailable" };
    inspected.reviewRequiredReasons.forEach((reason) => reviewRequiredReasons.add(`${table}:${reason}`));
    if (table === "EVRBAS") metadataCandidates.push(...inspected.identityCandidates);
  }
  return {
    contractVersion: "source-evidence-discovery-v1",
    status: "review-required",
    metadataCandidates,
    sourceIdentityCandidates,
    coverage,
    freshness: { startedAt: startedAt ?? null, finishedAt: finishedAt ?? null, evidenceMode: "synthetic-or-injected-local-read", liveEvidence: false },
    reviewRequiredReasons: [...reviewRequiredReasons].sort(),
  };
}
