import test from "node:test";
import assert from "node:assert/strict";
import { normalizeChecksumReference, validateRollbackMetadata } from "./releaseMetadata.mjs";

const checksumFile = "/home/serviceproadmin/apps/marlin-profit-sharing/backups/source-pre-task15.tgz.sha256";
const rollbackDigest = `sha256:${"b".repeat(64)}`;

test("normalizes a relative checksum reference beside its checksum file", () => {
  assert.equal(
    normalizeChecksumReference({
      checksumFilePath: checksumFile,
      checksumReference: "backups/source-pre-task15.tgz",
      checksumBasePath: "/home/serviceproadmin/apps/marlin-profit-sharing",
    }),
    "/home/serviceproadmin/apps/marlin-profit-sharing/backups/source-pre-task15.tgz",
  );
});

test("accepts rollback metadata linked to the previous release and separate from active image", () => {
  const result = validateRollbackMetadata({
    rollbackImageId: rollbackDigest,
    activeImageDigest: `sha256:${"a".repeat(64)}`,
    previousRelease: { imageDigest: rollbackDigest },
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("fails closed when rollback metadata is absent, active, or unlinked", () => {
  const result = validateRollbackMetadata({
    rollbackImageId: `sha256:${"a".repeat(64)}`,
    activeImageDigest: `sha256:${"a".repeat(64)}`,
    previousRelease: { imageDigest: rollbackDigest },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("rollback-image-matches-active"));
  assert.ok(result.errors.includes("rollback-image-unlinked"));
});
