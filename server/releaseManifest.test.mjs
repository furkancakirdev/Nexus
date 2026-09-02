import test from "node:test";
import assert from "node:assert/strict";
import { validateReleaseManifest } from "./releaseManifest.mjs";

const validManifest = {
  releaseId: "nexus-20260901-120000",
  sourceCommit: "0123456789abcdef0123456789abcdef01234567",
  buildId: "nexus-20260901-120000",
  buildVersion: "v2-control-room-20260901-120000",
  imageDigest: `sha256:${"a".repeat(64)}`,
  composeConfigHash: `sha256:${"c".repeat(64)}`,
  artifactSha256: "d".repeat(64),
  cpm: { database: "Marlin_Uyg", company: "01" },
  ssh: { hostKey: "SHA256:hostfingerprint" },
  tls: { caFile: "C:/secure/marlin-nexus-ca.pem" },
  previous: { releaseId: "nexus-previous", imageDigest: `sha256:${"b".repeat(64)}`, artifactSha256: "e".repeat(64) },
};

test("validates an immutable release manifest", () => {
  const result = validateReleaseManifest(validManifest);
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("fails closed when identity, digest, target and TLS fields are missing", () => {
  const result = validateReleaseManifest({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("release-id-missing"));
  assert.ok(result.errors.includes("source-commit-invalid"));
  assert.ok(result.errors.includes("image-digest-invalid"));
  assert.ok(result.errors.includes("cpm-target-missing"));
  assert.ok(result.errors.includes("ssh-host-key-missing"));
  assert.ok(result.errors.includes("tls-ca-missing"));
  assert.ok(result.errors.includes("rollback-manifest-missing"));
  assert.ok(result.errors.includes("artifact-digest-invalid"));
  assert.ok(result.errors.includes("rollback-artifact-digest-missing"));
});

test("rejects missing artifact digests and whitespace-padded source or digest values", () => {
  const missing = validateReleaseManifest({
    ...validManifest,
    artifactSha256: undefined,
    previous: { ...validManifest.previous, artifactSha256: undefined },
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.includes("artifact-digest-invalid"));
  assert.ok(missing.errors.includes("rollback-artifact-digest-missing"));

  for (const field of ["sourceCommit", "imageDigest", "composeConfigHash", "artifactSha256"]) {
    const result = validateReleaseManifest({ ...validManifest, [field]: ` ${validManifest[field]} ` });
    assert.equal(result.valid, false, `${field} must not be trimmed`);
  }
  const previousResult = validateReleaseManifest({
    ...validManifest,
    previous: {
      ...validManifest.previous,
      imageDigest: ` ${validManifest.previous.imageDigest} `,
      artifactSha256: ` ${validManifest.previous.artifactSha256} `,
    },
  });
  assert.equal(previousResult.valid, false);
  assert.ok(previousResult.errors.includes("rollback-manifest-missing"));
  assert.ok(previousResult.errors.includes("rollback-artifact-digest-missing"));
});

test("rejects mutable or bypass-like release values", () => {
  const result = validateReleaseManifest({
    ...validManifest,
    imageDigest: "latest",
    tls: { caFile: "insecure" },
    ssh: { hostKey: "" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("image-digest-invalid"));
  assert.ok(result.errors.includes("ssh-host-key-missing"));
});

test("rejects numeric digest, CPM, and rollback contract values", () => {
  for (const field of ["sourceCommit", "imageDigest", "composeConfigHash", "artifactSha256"]) {
    const result = validateReleaseManifest({ ...validManifest, [field]: 123 });
    assert.equal(result.valid, false, `${field} must be an actual string`);
  }
  const cpmResult = validateReleaseManifest({ ...validManifest, cpm: { database: 123, company: "01" } });
  assert.ok(cpmResult.errors.includes("cpm-target-missing"));
  const tlsResult = validateReleaseManifest({ ...validManifest, tls: { caFile: 123 } });
  assert.ok(tlsResult.errors.includes("tls-ca-missing"));
  const sshResult = validateReleaseManifest({ ...validManifest, ssh: { hostKey: 123 } });
  assert.ok(sshResult.errors.includes("ssh-host-key-missing"));
  const rollbackResult = validateReleaseManifest({
    ...validManifest,
    previous: { releaseId: 123, imageDigest: 456, artifactSha256: 789 },
  });
  assert.ok(rollbackResult.errors.includes("rollback-manifest-missing"));
  assert.ok(rollbackResult.errors.includes("rollback-artifact-digest-missing"));
});

test("rejects a missing or malformed Python-compatible SSH host key", () => {
  for (const hostKey of [undefined, "ssh-ed25519 256 SHA256:hostfingerprint", "unverified"]) {
    const result = validateReleaseManifest({
      ...validManifest,
      ssh: { ...(hostKey === undefined ? {} : { hostKey }) },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("ssh-host-key-missing"));
  }
});
