import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReleaseReadiness } from "./releaseReadiness.mjs";

test("readiness fails closed when inventory source is not verified", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: true,
    inventorySource: { status: "missing" },
    buildId: "test",
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("inventory-source-not-verified"));
});

test("readiness is ready only with verified source, read-only connection and build id", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: true,
    inventorySource: { status: "verified", financialStatus: "ready" },
    buildId: "2026.08.31-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
});

test("readiness blocks official finance when WAC coverage is insufficient", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: true,
    inventorySource: { status: "verified", financialStatus: "blocked", costCoveragePct: 29.1 },
    buildId: "2026.08.31-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("official-cost-coverage-insufficient"));
});

test("readiness blocks verified inventory when financial status is missing", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: true,
    inventorySource: { status: "verified" },
    buildId: "2026.08.31-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["official-cost-coverage-insufficient"]);
});

test("readiness blocks verified inventory when financial status is null", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: true,
    inventorySource: { status: "verified", financialStatus: null },
    buildId: "2026.08.31-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["official-cost-coverage-insufficient"]);
});

test("readiness blocks ambiguous opening evidence", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: true,
    inventorySource: { status: "verified", financialStatus: "ready", evidence: { openingEvidenceStatus: "ambiguous" } },
    buildId: "2026.08.31-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("inventory-opening-evidence-ambiguous"));
});

test("readiness rejects writable or unidentified runtime", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: false,
    inventorySource: { status: "verified", financialStatus: "ready" },
    buildId: "",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["read-only-boundary-failed", "build-id-missing"]);
});

test("readiness separates the explicitly accepted CPM extra-permission risk", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: false,
    acceptedRisks: ["cpm-extra-permissions"],
    inventorySource: { status: "verified", financialStatus: "ready" },
    buildId: "2026.09.01-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.acceptedRisks, ["cpm-extra-permissions"]);
});

test("readiness keeps the CPM permission risk hard-blocking when it is not explicitly accepted", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: false,
    inventorySource: { status: "verified", financialStatus: "ready" },
    buildId: "2026.09.01-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["read-only-boundary-failed"]);
  assert.deepEqual(result.acceptedRisks, []);
});

test("readiness keeps provenance hard-blocking until exact values and source coverage are complete", () => {
  const result = evaluateReleaseReadiness({
    connected: true,
    readOnly: true,
    sourceProvenance: { status: "verified", coverage: { status: "incomplete" } },
    inventorySource: { status: "verified", financialStatus: "ready" },
    buildId: "2026.09.02-test",
    buildVersion: "2.0.0",
    buildCommit: "abc123",
    imageDigest: "sha256:abc",
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["source-provenance-unverified"]);
});

test("readiness accepts the nested provenance evidence contract when complete", () => {
  const result = evaluateReleaseReadiness({
    runtime: { connected: true, readOnly: true, readOnlyEvidence: "verified", buildId: "b1" },
    inventorySource: { status: "verified", financialStatus: "ready" },
    sourceProvenance: { evidence: { status: "verified" }, coverage: { status: "complete" } },
  });
  assert.equal(result.blockers.includes("source-provenance-unverified"), false);
});
