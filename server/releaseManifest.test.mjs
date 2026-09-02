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
  cpm: { database: "Marlin_Uyg", company: "01" },
  ssh: { host: "192.168.12.11", hostKey: "SHA256:hostfingerprint" },
  tls: { caFile: "C:/secure/marlin-nexus-ca.pem" },
  previous: { releaseId: "nexus-previous", imageDigest: `sha256:${"b".repeat(64)}` },
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
});

test("rejects mutable or bypass-like release values", () => {
  const result = validateReleaseManifest({
    ...validManifest,
    imageDigest: "latest",
    tls: { caFile: "insecure" },
    ssh: { host: validManifest.ssh.host, hostKey: "" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("image-digest-invalid"));
  assert.ok(result.errors.includes("ssh-host-key-missing"));
});

test("rejects a missing or malformed Python-compatible SSH host key", () => {
  for (const hostKey of [undefined, "ssh-ed25519 256 SHA256:hostfingerprint", "unverified"]) {
    const result = validateReleaseManifest({
      ...validManifest,
      ssh: { host: validManifest.ssh.host, ...(hostKey === undefined ? {} : { hostKey }) },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("ssh-host-key-missing"));
  }
});
