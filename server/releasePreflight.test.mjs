import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReleasePreflight } from "./releasePreflight.mjs";

const manifest = {
  releaseId: "nexus-test",
  sourceCommit: "0123456789abcdef0123456789abcdef01234567",
  buildId: "nexus-test",
  buildVersion: "v2-test",
  imageDigest: `sha256:${"a".repeat(64)}`,
  composeConfigHash: `sha256:${"c".repeat(64)}`,
  artifactSha256: "d".repeat(64),
  cpm: { database: "Marlin_Uyg", company: "01" },
  ssh: { hostKey: "SHA256:hostfingerprint" },
  tls: { caFile: "C:/secure/marlin-nexus-ca.pem" },
  previous: { releaseId: "nexus-previous", imageDigest: `sha256:${"b".repeat(64)}`, artifactSha256: "e".repeat(64) },
};

const allChecks = {
  hostKeyVerified: true,
  tlsVerified: true,
  composeConfigHash: manifest.composeConfigHash,
  secretMountsReadOnly: true,
  stateBackupVerified: true,
  candidateVerified: true,
  readinessVerified: true,
  rollbackManifestPersisted: true,
  rollbackImageId: manifest.previous.imageDigest,
  activeImageDigest: manifest.imageDigest,
};

test("preflight passes only when manifest and every transport/runtime check pass", () => {
  assert.deepEqual(evaluateReleasePreflight({ manifest, checks: allChecks }), { valid: true, blockers: [] });
});

test("preflight fails closed for unverified host, TLS, state and candidate", () => {
  const result = evaluateReleasePreflight({
    manifest,
    checks: { ...allChecks, hostKeyVerified: false, tlsVerified: false, stateBackupVerified: false, candidateVerified: false },
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.blockers, [
    "ssh-host-key-unverified",
    "tls-unverified",
    "state-backup-unverified",
    "candidate-unverified",
  ]);
});

test("preflight detects a compose hash mismatch before cutover", () => {
  const result = evaluateReleasePreflight({ manifest, checks: { ...allChecks, composeConfigHash: `sha256:${"d".repeat(64)}` } });
  assert.equal(result.valid, false);
  assert.deepEqual(result.blockers, ["compose-config-hash-mismatch"]);
});

test("preflight rejects rollback metadata that is active or unlinked", () => {
  const result = evaluateReleasePreflight({
    manifest,
    checks: { ...allChecks, rollbackImageId: manifest.imageDigest },
  });
  assert.equal(result.valid, false);
  assert.ok(result.blockers.includes("rollback-image-matches-active"));
  assert.ok(result.blockers.includes("rollback-image-unlinked"));
});
