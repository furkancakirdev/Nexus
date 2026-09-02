import { validateReleaseManifest } from "./releaseManifest.mjs";

function isImageDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function validateRollbackMetadata({ rollbackImageId, activeImageDigest, previousRelease } = {}) {
  const errors = [];
  const rollback = rollbackImageId;
  const active = activeImageDigest;
  const previous = previousRelease?.imageDigest;

  if (!isImageDigest(rollback)) errors.push("rollback-image-invalid");
  if (!isImageDigest(active)) errors.push("active-image-invalid");
  if (!isImageDigest(previous) || rollback !== previous) errors.push("rollback-image-unlinked");
  if (isImageDigest(rollback) && isImageDigest(active) && rollback === active) {
    errors.push("rollback-image-matches-active");
  }
  return { valid: errors.length === 0, errors };
}

export function evaluateReleasePreflight({ manifest = {}, checks = {} } = {}) {
  const manifestResult = validateReleaseManifest(manifest);
  const blockers = [...manifestResult.errors];
  if (checks.hostKeyVerified !== true) blockers.push("ssh-host-key-unverified");
  if (checks.tlsVerified !== true) blockers.push("tls-unverified");
  if (checks.composeConfigHash !== manifest.composeConfigHash) blockers.push("compose-config-hash-mismatch");
  if (checks.secretMountsReadOnly !== true) blockers.push("secret-mounts-not-read-only");
  if (checks.stateBackupVerified !== true) blockers.push("state-backup-unverified");
  if (checks.candidateVerified !== true) blockers.push("candidate-unverified");
  if (checks.readinessVerified !== true) blockers.push("readiness-unverified");
  if (checks.rollbackManifestPersisted !== true) blockers.push("rollback-manifest-unpersisted");
  const rollbackResult = validateRollbackMetadata({
    rollbackImageId: checks.rollbackImageId,
    activeImageDigest: checks.activeImageDigest ?? manifest.imageDigest,
    previousRelease: manifest.previous,
  });
  blockers.push(...rollbackResult.errors);
  return { valid: blockers.length === 0, blockers };
}
