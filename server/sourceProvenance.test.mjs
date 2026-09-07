import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceProvenanceEvidence, buildSourceCoverageEvidence } from "./sourceProvenance.mjs";

const row = (id, overrides = {}) => ({
  rootId: id,
  documentType: 85,
  documentDate: "2026-01-02T00:00:00.000Z",
  productCode: "P-1",
  quantity: 2,
  netAmount: 100.1,
  isSale: true,
  ...overrides,
});

test("source provenance verifies shuffled rows with fixed-decimal economic identity", () => {
  const result = buildSourceProvenanceEvidence({
    sourceRows: [row(2, { netAmount: "50.10" }), row(1, { netAmount: 100 })],
    canonicalRows: [row(1, { netAmount: "100.00" }), row(2, { netAmount: 50.1 })],
    versions: {
      queryContractVersion: "source-v1",
      transformationVersion: "ledger-v1",
      exclusionsVersion: "exclusions-v1",
    },
  });

  assert.equal(result.status, "verified");
  assert.equal(result.reconciliation.missingCanonicalIds, 0);
  assert.equal(result.reconciliation.unexpectedCanonicalIds, 0);
  assert.equal(result.reconciliation.duplicateSourceIds, 0);
  assert.equal(result.reconciliation.duplicateCanonicalIds, 0);
  assert.equal(result.reconciliation.netDifferenceMinorUnits, 0);
  assert.equal(result.source.rowCount, 2);
  assert.equal(result.source.identityDigest, result.canonical.identityDigest);
  assert.equal(result.source.economicDigest, result.canonical.economicDigest);
});

test("source provenance reports missing, extra, duplicate, and economic mismatches separately", () => {
  const result = buildSourceProvenanceEvidence({
    sourceRows: [row(1), row(1, { netAmount: 99 }), row(2)],
    canonicalRows: [row(1, { netAmount: 101 }), row(3)],
  });

  assert.equal(result.status, "mismatch");
  assert.equal(result.reconciliation.duplicateSourceIds, 1);
  assert.equal(result.reconciliation.duplicateCanonicalIds, 0);
  assert.equal(result.reconciliation.missingCanonicalIds, 1);
  assert.equal(result.reconciliation.unexpectedCanonicalIds, 1);
  assert.notEqual(result.reconciliation.netDifferenceMinorUnits, 0);
});

test("source provenance fails closed for empty or malformed identity rows", () => {
  const result = buildSourceProvenanceEvidence({
    sourceRows: [row(null), row(2, { netAmount: null })],
    canonicalRows: [row(2)],
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.reconciliation.nullSourceIds, 1);
  assert.equal(result.reconciliation.malformedEconomicRows, 1);
});

test("source provenance includes contract versions in evidence", () => {
  const base = { sourceRows: [row(1)], canonicalRows: [row(1)] };
  const first = buildSourceProvenanceEvidence({
    ...base,
    versions: { queryContractVersion: "source-v1", transformationVersion: "ledger-v1", exclusionsVersion: "x1" },
  });
  const second = buildSourceProvenanceEvidence({
    ...base,
    versions: { queryContractVersion: "source-v2", transformationVersion: "ledger-v1", exclusionsVersion: "x1" },
  });

  assert.notEqual(first.source.evidenceVersion, second.source.evidenceVersion);
  assert.notEqual(first.source.identityDigest, second.source.identityDigest);
});

test("source coverage reports canonical IDs missing from or extra in the broad candidate set", () => {
  const coverage = buildSourceCoverageEvidence({
    canonicalRows: [{ rootId: 1 }, { rootId: 2 }],
    candidateRows: [{ sourceRowId: 1 }, { sourceRowId: 3 }],
  });
  assert.deepEqual(coverage, {
    status: "incomplete",
    canonicalRowCount: 2,
    candidateRowCount: 2,
    canonicalIdsMissingFromCandidates: 1,
    candidateIdsOutsideCanonical: 1,
  });
});
