import { posix as path } from "node:path";

function isImageDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value.trim());
}

export function normalizeChecksumReference({ checksumFilePath, checksumReference, checksumBasePath }) {
  if (typeof checksumFilePath !== "string" || typeof checksumReference !== "string") return null;
  const reference = checksumReference.trim();
  if (!reference) return null;
  if (path.isAbsolute(reference)) return path.normalize(reference);
  if (typeof checksumBasePath !== "string" || !checksumBasePath.trim()) return null;
  return path.normalize(path.resolve(checksumBasePath, reference));
}

export function validateRollbackMetadata({ rollbackImageId, activeImageDigest, previousRelease } = {}) {
  const errors = [];
  const rollback = String(rollbackImageId || "").trim();
  const active = String(activeImageDigest || "").trim();
  const previous = String(previousRelease?.imageDigest || "").trim();

  if (!isImageDigest(rollback)) errors.push("rollback-image-invalid");
  if (!isImageDigest(active)) errors.push("active-image-invalid");
  if (!isImageDigest(previous) || rollback !== previous) errors.push("rollback-image-unlinked");
  if (isImageDigest(rollback) && isImageDigest(active) && rollback === active) {
    errors.push("rollback-image-matches-active");
  }
  return { valid: errors.length === 0, errors };
}
