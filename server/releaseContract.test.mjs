import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeInfo, buildReadinessPayload } from "./releaseContract.mjs";

test("runtime info keeps build identity and does not infer effective read-only", () => {
  const result = buildRuntimeInfo({
    env: {
      BUILD_ID: "nexus-test",
      NEXUS_BUILD_VERSION: "v2-test",
      NEXUS_BUILD_COMMIT: "abc123",
      NEXUS_IMAGE_DIGEST: "sha256:image",
      NEXUS_ARTIFACT_SHA256: "artifact-sha256",
      CPM_SQL_DATABASE: "Marlin_Uyg",
      CPM_SQL_COMPANY: "01",
    },
  });
  assert.deepEqual(result.buildId, "nexus-test");
  assert.deepEqual(result.buildCommit, "abc123");
  assert.equal(result.imageDigest, "sha256:image");
  assert.equal(result.artifactSha256, "artifact-sha256");
  assert.equal(result.readOnly, false);
  assert.equal(result.readOnlyEvidence, "unverified");
  assert.deepEqual(result.acceptedRisks, []);
});

test("runtime info carries explicit accepted risk configuration without changing read-only evidence", () => {
  const result = buildRuntimeInfo({
    env: {
      BUILD_ID: "nexus-test",
      NEXUS_BUILD_VERSION: "v2-test",
      NEXUS_BUILD_COMMIT: "abc123",
      NEXUS_ACCEPTED_RISKS: "cpm-extra-permissions",
    },
  });
  assert.equal(result.readOnly, false);
  assert.equal(result.readOnlyEvidence, "unverified");
  assert.deepEqual(result.acceptedRisks, ["cpm-extra-permissions"]);
});

test("readiness fails closed when effective permission evidence is absent", () => {
  const result = buildReadinessPayload({
    runtime: {
      connected: true,
      readOnly: false,
      buildId: "nexus-test",
      buildVersion: "v2-test",
      buildCommit: "abc123",
      imageDigest: "sha256:abc",
    },
    inventorySource: { status: "verified", financialStatus: "blocked" },
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("read-only-boundary-failed"));
  assert.ok(result.blockers.includes("official-cost-coverage-insufficient"));
});

test("readiness payload exposes accepted CPM risk separately from hard blockers", () => {
  const result = buildReadinessPayload({
    runtime: {
      connected: true,
      readOnly: false,
      acceptedRisks: ["cpm-extra-permissions"],
      buildId: "nexus-test",
      buildVersion: "v2-test",
      buildCommit: "abc123",
      imageDigest: "sha256:abc",
    },
    inventorySource: { status: "verified" },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.acceptedRisks, ["cpm-extra-permissions"]);
  assert.equal(result.runtime.readOnly, false);
  assert.equal(result.runtime.readOnlyEvidence, "unverified");
});

test("release runtime contract maps Docker-provided build identity metadata", () => {
  const result = buildRuntimeInfo({
    env: {
      BUILD_ID: "nexus-test",
      NEXUS_BUILD_VERSION: "v2-test",
      NEXUS_BUILD_COMMIT: "abc123",
      NEXUS_IMAGE_DIGEST: "sha256:image",
      NEXUS_ARTIFACT_SHA256: "artifact-sha256",
    },
  });
  assert.deepEqual(
    {
      buildId: result.buildId,
      buildVersion: result.buildVersion,
      buildCommit: result.buildCommit,
      imageDigest: result.imageDigest,
      artifactSha256: result.artifactSha256,
    },
    {
      buildId: "nexus-test",
      buildVersion: "v2-test",
      buildCommit: "abc123",
      imageDigest: "sha256:image",
      artifactSha256: "artifact-sha256",
    },
  );
});
